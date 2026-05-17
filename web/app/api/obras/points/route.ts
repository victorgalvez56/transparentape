import { NextRequest, NextResponse } from "next/server";
import { listObraPoints } from "@/lib/obras-query";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Todas las obras geocodificadas (proyección ligera) para el globo + lista.
 * Sin el cap de 5000 de /api/obras. ?country=CL opcional.
 */
export async function GET(req: NextRequest) {
  const country = req.nextUrl.searchParams.get("country");
  try {
    const obras = await listObraPoints(country);
    return NextResponse.json({
      source: "supabase",
      count: obras.length,
      obras,
    });
  } catch (e) {
    console.error("[api/obras/points] db error:", e);
    return NextResponse.json(
      {
        source: "error",
        error: e instanceof Error ? e.message : "unknown",
        obras: [],
      },
      { status: 500 }
    );
  }
}
