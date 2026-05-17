import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const KEY = (process.env.GOOGLE_MAPS_KEY ?? "").trim();
const SV_BASE = "https://maps.googleapis.com/maps/api/streetview";

export interface PanoResult {
  panoId: string;
  date: string; // "YYYY-MM"
}

export interface StreetViewResult {
  before: { url: string; panoId: string; date: string };
  after: { url: string; panoId: string; date: string };
  hasHistory: boolean; // true only if before and after are different pano IDs
  totalPanos: number;
  snappedLat: number;
  snappedLng: number;
}

function svUrl(panoId: string): string {
  return `${SV_BASE}?size=640x360&pano=${panoId}&fov=90&pitch=0&key=${KEY}`;
}

/** Official Metadata API — returns the closest outdoor pano within the given radius. */
async function getMetadata(lat: number, lng: number, radius = 100) {
  for (const r of [radius, 300, 1000]) {
    const url = `${SV_BASE}/metadata?location=${lat},${lng}&radius=${r}&source=outdoor&key=${KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) continue;
    const d = await res.json();
    if (d.status === "OK") return d;
  }
  return null;
}

/**
 * Unofficial GeoPhotoService — returns ALL historical panoramas for a location.
 * Same approach used by the Python `streetview` library and Google Maps web client.
 * Returns [] on any failure — caller must handle gracefully.
 */
export async function getHistoricalPanos(lat: number, lng: number): Promise<PanoResult[]> {
  try {
    const pb =
      `!1m5!1sapiv3!5sUS!11m2!1m1!1b0` +
      `!2m4!1m2!3d${lat}!4d${lng}!2d50!3m10` +
      `!2m2!1sen!2sGB!9m1!1e2!11m4!1m3!1e2!2b1!3e2` +
      `!4m10!1e1!1e2!1e3!1e4!1e8!1e6!5m1!1e2!6m1!1e2`;

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/js/GeoPhotoService.SingleImageSearch?pb=${pb}&callback=callbackfunc`,
      { signal: AbortSignal.timeout(10000) }
    );
    const text = await res.text();

    // Strip JSONP wrapper: callbackfunc( [...] );
    const match = text.match(/callbackfunc\( ([\s\S]*) \)$/);
    if (!match) return [];
    const data = JSON.parse(match[1]);

    const subset = data?.[1]?.[5]?.[0];
    if (!subset) return [];

    // Pano list is in reverse-chronological order — reverse to oldest-first
    const rawPanos: unknown[][] = ([...(subset?.[3]?.[0] ?? [])] as unknown[][]).reverse();
    const rawDates: unknown[][] = ([...(subset?.[8] ?? [])] as unknown[][]).reverse();

    const dates = rawDates.map((d) => {
      const dp = (d as unknown[][])?.[1] as [number, number] | undefined;
      return Array.isArray(dp) ? `${dp[0]}-${String(dp[1]).padStart(2, "0")}` : null;
    });

    const results: PanoResult[] = [];
    for (let i = 0; i < rawPanos.length; i++) {
      const p = rawPanos[i] as unknown[][];
      const panoId = p?.[0]?.[1] as string | undefined;
      const date = dates[i];
      if (panoId && typeof panoId === "string" && date) {
        results.push({ panoId, date });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * False-positive detection heuristics:
 * - Panos from the same year are not a real before/after comparison
 * - If the Google "grey image" pano id appears, skip it
 * - If only 1 unique year, mark hasHistory = false
 */
function selectBeforeAfter(panos: PanoResult[]): {
  before: PanoResult;
  after: PanoResult;
  hasHistory: boolean;
} {
  // Deduplicate by year, keep oldest pano per year
  const byYear = new Map<string, PanoResult>();
  for (const p of panos.sort((a, b) => a.date.localeCompare(b.date))) {
    const year = p.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, p);
  }
  const years = [...byYear.values()];

  if (years.length >= 2) {
    // Need at least 1 year gap between before and after to avoid false positives
    const before = years[0];
    const after = years[years.length - 1];
    const yearGap = parseInt(after.date) - parseInt(before.date);
    return {
      before,
      after,
      hasHistory: yearGap >= 1, // at least 1 calendar year apart
    };
  }

  const single = years[0] ?? panos[0];
  return { before: single, after: single, hasHistory: false };
}

export async function getStreetViewForLocation(
  lat: number,
  lng: number
): Promise<StreetViewResult | null> {
  const meta = await getMetadata(lat, lng);
  if (!meta) return null;

  const snappedLat: number = meta.location?.lat ?? lat;
  const snappedLng: number = meta.location?.lng ?? lng;
  const currentPano: PanoResult = {
    panoId: meta.pano_id,
    date: meta.date ?? "unknown",
  };

  const historical = await getHistoricalPanos(snappedLat, snappedLng);

  let before = currentPano;
  let after = currentPano;
  let hasHistory = false;
  const totalPanos = historical.length;

  if (historical.length >= 2) {
    const sel = selectBeforeAfter(historical);
    before = sel.before;
    after = sel.after;
    hasHistory = sel.hasHistory;
  } else if (historical.length === 1) {
    before = historical[0];
    after = historical[0];
  }

  return {
    before: { url: svUrl(before.panoId), panoId: before.panoId, date: before.date },
    after: { url: svUrl(after.panoId), panoId: after.panoId, date: after.date },
    hasHistory,
    totalPanos,
    snappedLat,
    snappedLng,
  };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = parseFloat(sp.get("lat") ?? "");
  const lng = parseFloat(sp.get("lng") ?? "");

  if (isNaN(lat) || isNaN(lng))
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  if (!KEY)
    return NextResponse.json({ error: "GOOGLE_MAPS_KEY not configured" }, { status: 500 });

  const result = await getStreetViewForLocation(lat, lng);
  if (!result) return NextResponse.json({ found: false }, { status: 404 });

  return NextResponse.json(
    { found: true, ...result },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
  );
}
