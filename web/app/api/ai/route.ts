import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { queryOne, query } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

type ObraRow = {
  id: number;
  lat: number | null;
  lng: number | null;
  tender_description: string | null;
  contract_amount: number | null;
  ai_score: number | null;
  ai_description: string | null;
  streetview_before: string | null;
  streetview_after: string | null;
  country: string;
};

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

const KEY = process.env.GOOGLE_MAPS_KEY!;
const SV_BASE = "https://maps.googleapis.com/maps/api/streetview";

async function fetchPanoId(lat: number, lng: number): Promise<string | null> {
  const res = await fetch(`${SV_BASE}/metadata?location=${lat},${lng}&radius=100&source=outdoor&key=${KEY}`);
  if (!res.ok) return null;
  const d = await res.json();
  return d.status === "OK" ? d.pano_id : null;
}

function svUrl(pano: string): string {
  return `${SV_BASE}?pano=${pano}&size=800x450&fov=90&pitch=0&key=${KEY}`;
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  }
}

async function scoreWithVision(imageB64: string, description: string): Promise<{ score: number; summary: string }> {
  const msg = await getAnthropic().messages.create({
    model: "claude-opus-4-7",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: imageB64 },
          },
          {
            type: "text",
            text: `Esta imagen es de una obra pública: "${description}".
Evalúa en una escala de 0 a 100 si la imagen muestra evidencia de que la obra fue ejecutada correctamente:
- 0–30: Sin evidencia de obra / abandono / zona sin intervención visible
- 31–60: Deterioro notorio / obra incompleta / calidad cuestionable
- 61–100: Obra visible y en buen estado

Responde ÚNICAMENTE con JSON: {"score": <número>, "summary": "<máx 80 caracteres en español>"}`,
          },
        ],
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { score: 50, summary: "Sin análisis disponible" };
  try {
    return JSON.parse(match[0]);
  } catch {
    return { score: 50, summary: "Sin análisis disponible" };
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  const force = sp.get("force") === "1";

  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  if (!KEY || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "API keys not configured" }, { status: 500 });
  }

  const obra = await queryOne<ObraRow>(
    `SELECT id, lat, lng, tender_description, contract_amount, ai_score, ai_description,
            streetview_before, streetview_after, country
     FROM obras WHERE id = $1`,
    [Number(id)]
  );
  if (!obra) return NextResponse.json({ error: "obra not found" }, { status: 404 });

  // Return cached result if already scored and not forcing refresh
  if (!force && obra.ai_score !== null) {
    return NextResponse.json({
      cached: true,
      ai_score: obra.ai_score,
      ai_description: obra.ai_description,
      streetview_after: obra.streetview_after,
    });
  }

  if (!obra.lat || !obra.lng) {
    return NextResponse.json({ error: "obra has no coordinates" }, { status: 422 });
  }

  // Fetch panorama
  const pano = await fetchPanoId(obra.lat, obra.lng);
  if (!pano) {
    return NextResponse.json({ error: "no street view found near this location" }, { status: 404 });
  }

  const imageUrl = svUrl(pano);
  const imageB64 = await fetchImageAsBase64(imageUrl);
  if (!imageB64) {
    return NextResponse.json({ error: "failed to fetch street view image" }, { status: 502 });
  }

  const { score, summary } = await scoreWithVision(imageB64, obra.tender_description ?? "Obra pública");

  // Persist result
  await query(
    `UPDATE obras SET ai_score = $1, ai_description = $2, streetview_after = $3 WHERE id = $4`,
    [score, summary, imageUrl, obra.id]
  );

  return NextResponse.json(
    {
      cached: false,
      ai_score: score,
      ai_description: summary,
      streetview_after: imageUrl,
      pano_id: pano,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
