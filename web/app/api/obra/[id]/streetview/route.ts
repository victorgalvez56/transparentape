import { NextResponse } from "next/server";
import { getObraById, getObraByOcid } from "@/lib/obras-query";
import { getStreetViewForLocation } from "@/app/api/streetview/route";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

// Same caching policy as /api/streetview: edge-cached for a day, served
// stale for a week while revalidating. Only applied to 200 responses.
const CACHE_HEADER = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};

type SvSide = { url: string; date: string | null } | null;

// getStreetViewForLocation returns "unknown" when Google omits the date.
function normalizeDate(d: string | null | undefined): string | null {
  return !d || d === "unknown" ? null : d;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const isNumeric = /^\d+$/.test(id);

  try {
    const obra = isNumeric
      ? await getObraById(Number(id))
      : await getObraByOcid(id);

    if (!obra) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (obra.lat == null || obra.lng == null) {
      return NextResponse.json(
        { error: "no_coords", id: obra.id, ocid: obra.ocid },
        { status: 422 }
      );
    }

    // Cache hit — both URLs already persisted. No Google call, DB only.
    // Stored dates aren't kept, so date is null; history is inferred from
    // the two pano URLs differing (different pano => real before/after).
    if (obra.streetview_before && obra.streetview_after) {
      const before: SvSide = { url: obra.streetview_before.trim(), date: null };
      const after: SvSide = { url: obra.streetview_after.trim(), date: null };
      return NextResponse.json(
        {
          id: obra.id,
          ocid: obra.ocid,
          lat: obra.lat,
          lng: obra.lng,
          before,
          after,
          has_history: obra.streetview_before !== obra.streetview_after,
          cached: true,
        },
        { headers: CACHE_HEADER }
      );
    }

    // Cache miss (or only one URL stored) — hit Google Street View.
    let sv: Awaited<ReturnType<typeof getStreetViewForLocation>>;
    try {
      sv = await getStreetViewForLocation(obra.lat, obra.lng);
    } catch {
      sv = null;
    }
    if (!sv) {
      return NextResponse.json({ error: "sv_failed" }, { status: 502 });
    }

    // Persist URLs only — never touches ai_score / ai_description. Always
    // keyed by numeric id even when the obra was resolved by ocid.
    await query(
      `UPDATE obras SET streetview_before = $1, streetview_after = $2 WHERE id = $3`,
      [sv.before.url.trim(), sv.after.url.trim(), obra.id]
    );

    const before: SvSide = {
      url: sv.before.url.trim(),
      date: normalizeDate(sv.before.date),
    };
    const after: SvSide = {
      url: sv.after.url.trim(),
      date: normalizeDate(sv.after.date),
    };

    return NextResponse.json(
      {
        id: obra.id,
        ocid: obra.ocid,
        lat: obra.lat,
        lng: obra.lng,
        before,
        after,
        has_history: sv.hasHistory,
        cached: false,
      },
      { headers: CACHE_HEADER }
    );
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
