import { NextRequest, NextResponse } from "next/server";
import { listObras } from "@/lib/obras-query";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const filters = {
    country: sp.get("country"),
    city: sp.get("city"),
    region: sp.get("region"),
    distrito: sp.get("distrito"),
    year: sp.get("year") ? Number(sp.get("year")) : null,
    red_flag: sp.get("red_flag") === "true" ? true : null,
    contratista: sp.get("contratista"),
    q: sp.get("q"),
    with_coords: sp.get("with_coords") !== "false",
    limit: Math.min(parseInt(sp.get("limit") ?? "1000", 10) || 1000, 5000),
  };

  try {
    const obras = await listObras(filters);
    return NextResponse.json({ source: "supabase", obras });
  } catch (e) {
    console.error("[api/obras] db error:", e);
    return NextResponse.json(
      { source: "error", error: e instanceof Error ? e.message : "unknown", obras: [] },
      { status: 500 }
    );
  }
}
