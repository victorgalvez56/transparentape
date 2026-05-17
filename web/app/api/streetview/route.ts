import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 86400; // 24h cache — panoramas don't change often

const KEY = process.env.GOOGLE_MAPS_KEY!;
const BASE = "https://maps.googleapis.com/maps/api";

// Returns the pano ID + capture date nearest to (lat, lng), or null if none within radius.
async function findPano(lat: number, lng: number, radius = 50): Promise<{ pano_id: string; date: string | null } | null> {
  const url = `${BASE}/streetview/metadata?location=${lat},${lng}&radius=${radius}&source=outdoor&key=${KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== "OK") return null;
  return { pano_id: data.pano_id, date: data.date ?? null };
}

// Builds a Street View Static image URL for a given pano.
function staticUrl(pano: string, w = 800, h = 450): string {
  return `${BASE}/streetview?pano=${pano}&size=${w}x${h}&fov=90&pitch=0&key=${KEY}`;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = parseFloat(sp.get("lat") ?? "");
  const lng = parseFloat(sp.get("lng") ?? "");
  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }
  if (!KEY) {
    return NextResponse.json({ error: "GOOGLE_MAPS_KEY not configured" }, { status: 500 });
  }

  // Try two radii: tight (50m) and loose (200m)
  const pano = (await findPano(lat, lng, 50)) ?? (await findPano(lat, lng, 200));
  if (!pano) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json(
    {
      found: true,
      pano_id: pano.pano_id,
      date: pano.date,
      image_url: staticUrl(pano.pano_id),
      embed_url: `https://www.google.com/maps/embed/v1/streetview?key=${KEY}&pano=${pano.pano_id}`,
    },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } }
  );
}
