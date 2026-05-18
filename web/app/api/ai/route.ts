import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { queryOne, query } from "@/lib/db";
import { getStreetViewForLocation } from "@/app/api/streetview/route";

export const runtime = "nodejs";
export const revalidate = 0;

type ObraRow = {
  id: number;
  lat: number | null;
  lng: number | null;
  tender_description: string | null;
  supplier_name: string | null;
  contract_amount: number | null;
  tender_amount: number | null;
  source_year: number | null;
  buyer_locality: string | null;
  buyer_region: string | null;
  ai_score: number | null;
  ai_description: string | null;
  streetview_before: string | null;
  streetview_after: string | null;
  country: string;
};

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY ?? "").trim() });
  return _anthropic;
}

async function fetchBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  }
}

/**
 * False-positive guard: a grey "no imagery" Google SV response is ~5–8 KB.
 * Real street photos are generally >30 KB. We reject tiny images.
 */
function isTooSmall(b64: string): boolean {
  return b64.length < 8000; // < ~6 KB decoded
}

async function runVisionAnalysis(
  beforeB64: string,
  afterB64: string,
  obra: ObraRow,
  beforeDate: string,
  afterDate: string,
  hasHistory: boolean
): Promise<{ score: number; description: string }> {
  const monto = (obra.contract_amount ?? obra.tender_amount ?? 0).toLocaleString("es-PE");
  const location = obra.buyer_locality ?? obra.buyer_region ?? "Perú";

  const prompt = hasHistory
    ? `Eres un auditor de obras públicas. Analiza estas dos imágenes de Google Street View de la MISMA ubicación:
IMAGEN 1 = ANTES (${beforeDate}): estado previo a la obra
IMAGEN 2 = AHORA (${afterDate}): estado actual

Obra: ${(obra.tender_description ?? "").slice(0, 200)}
Contratista: ${obra.supplier_name ?? "N/D"}
Monto invertido: S/ ${monto}
Lugar: ${location}

¿Se ve evidencia de que la obra fue ejecutada? ¿Está en buen estado? ¿El gasto parece justificado?

IMPORTANTE — considera falsos positivos:
- Si las imágenes muestran la misma zona pero no hay cambio visible, di que no hay evidencia
- Si la imagen es gris o de baja calidad, menciona que la cobertura es limitada
- Evalúa honestamente aunque no haya diferencia clara

Responde SOLO con JSON válido:
{"score": <0-100>, "descripcion": "<máximo 2 oraciones en español>"}`
    : `Eres un auditor de obras públicas. Analiza esta imagen de Google Street View (${afterDate}):

Obra: ${(obra.tender_description ?? "").slice(0, 200)}
Contratista: ${obra.supplier_name ?? "N/D"}
Monto invertido: S/ ${monto}
Lugar: ${location}
Nota: No hay imagen histórica disponible, solo el estado actual.

¿Se ve evidencia de la obra ejecutada en esta ubicación? ¿Está en buen estado?

Responde SOLO con JSON válido:
{"score": <0-100>, "descripcion": "<máximo 2 oraciones en español>"}`;

  const content: Anthropic.MessageParam["content"] = hasHistory
    ? [
        { type: "text", text: "IMAGEN 1 — ANTES:" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: beforeB64 } },
        { type: "text", text: "IMAGEN 2 — AHORA:" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: afterB64 } },
        { type: "text", text: prompt },
      ]
    : [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: afterB64 } },
        { type: "text", text: prompt },
      ];

  const msg = await getAnthropic().messages.create({
    model: "claude-opus-4-7",
    max_tokens: 300,
    messages: [{ role: "user", content }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  const jsonStr = text.startsWith("```")
    ? text.split("```")[1].replace(/^json/, "").trim()
    : text;

  try {
    const parsed = JSON.parse(jsonStr.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return {
      score: Math.min(100, Math.max(0, parseInt(parsed.score ?? "50"))),
      description: (parsed.descripcion ?? parsed.description ?? "Sin análisis").slice(0, 300),
    };
  } catch {
    return { score: 50, description: "No se pudo parsear el análisis." };
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = Number(sp.get("id"));
  const force = sp.get("force") === "1";

  if (!id || isNaN(id))
    return NextResponse.json({ error: "missing id" }, { status: 400 });

  const obra = await queryOne<ObraRow>(
    `SELECT id, lat, lng, tender_description, supplier_name, contract_amount, tender_amount,
            source_year, buyer_locality, buyer_region, ai_score, ai_description,
            streetview_before, streetview_after, country
     FROM obras WHERE id = $1`,
    [id]
  );
  if (!obra) return NextResponse.json({ error: "obra not found" }, { status: 404 });

  // Return cached result when both SV URLs exist and differ (genuine comparison)
  const svCacheGood =
    obra.streetview_before &&
    obra.streetview_after &&
    obra.streetview_before !== obra.streetview_after;

  if (!force && obra.ai_description && svCacheGood) {
    return NextResponse.json({
      score: obra.ai_score,
      description: obra.ai_description,
      streetview: {
        beforeUrl: obra.streetview_before,
        afterUrl: obra.streetview_after,
        beforeDate: null,
        afterDate: null,
        hasHistory: true,
        cached: true,
      },
    });
  }

  if (!obra.lat || !obra.lng)
    return NextResponse.json({ error: "no_coordinates" }, { status: 422 });

  // Fetch Street View panoramas (current + historical)
  const sv = await getStreetViewForLocation(obra.lat, obra.lng);
  if (!sv)
    return NextResponse.json({ error: "no_streetview" }, { status: 404 });

  // No AI key — return Street View data only
  if (!process.env.ANTHROPIC_API_KEY?.startsWith("sk-ant-")) {
    return NextResponse.json({
      score: null,
      description: null,
      streetview: {
        beforeUrl: sv.before.url,
        afterUrl: sv.after.url,
        beforeDate: sv.before.date,
        afterDate: sv.after.date,
        hasHistory: sv.hasHistory,
        cached: false,
      },
    });
  }

  // Fetch images as base64 in parallel
  const [beforeB64, afterB64] = await Promise.all([
    fetchBase64(sv.before.url),
    fetchBase64(sv.after.url),
  ]);

  // False-positive guard: reject grey/missing imagery
  if (!afterB64 || isTooSmall(afterB64)) {
    return NextResponse.json({ error: "sv_image_too_small_or_missing" }, { status: 422 });
  }

  // If before image is bad but after is good, fall back to single-image mode
  const useHistory =
    sv.hasHistory && beforeB64 !== null && !isTooSmall(beforeB64);

  // AI vision is best-effort. The Google Street View before/after must render
  // even if Anthropic fails (no credit, rate limit, timeout). Previously a
  // thrown vision call 500'd the whole route and the slider never showed.
  let score: number | null = null;
  let description: string | null = null;
  try {
    const result = await runVisionAnalysis(
      useHistory ? beforeB64! : afterB64,
      afterB64,
      obra,
      sv.before.date,
      sv.after.date,
      useHistory
    );
    score = result.score;
    description = result.description;
  } catch (err) {
    console.error("[api/ai] vision analysis failed; returning Street View only:", err);
  }

  // Persist. Cache the Street View URLs even when AI failed (so the comparison
  // is instant next time) and never overwrite a prior successful analysis with
  // a null result.
  await query(
    `UPDATE obras
     SET ai_score         = COALESCE($1, ai_score),
         ai_description   = COALESCE($2, ai_description),
         streetview_after = $3,
         streetview_before = CASE
           WHEN $4::boolean AND $5 IS DISTINCT FROM $3 THEN $5
           ELSE COALESCE(streetview_before, $3)
         END
     WHERE id = $6`,
    [score, description, sv.after.url, useHistory, sv.before.url, obra.id]
  );

  return NextResponse.json(
    {
      score,
      description,
      streetview: {
        beforeUrl: useHistory ? sv.before.url : null,
        afterUrl: sv.after.url,
        beforeDate: useHistory ? sv.before.date : null,
        afterDate: sv.after.date,
        hasHistory: useHistory,
        totalPanos: sv.totalPanos,
        cached: false,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
