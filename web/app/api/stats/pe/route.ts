import { NextResponse } from "next/server";
import { getMontoPeru } from "@/lib/obras-query";

export const runtime = "nodejs";
export const revalidate = 300; // 5 min cache

/**
 * Cifra honesta en soles: monto SOLO Perú (PEN). Ruta nueva e
 * independiente de /api/stats (cuyo total_monto mezcla PEN+CLP).
 */
export async function GET() {
  try {
    const { monto_pe } = await getMontoPeru();
    return NextResponse.json({ source: "supabase", monto_pe });
  } catch (e) {
    return NextResponse.json(
      { source: "error", error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
