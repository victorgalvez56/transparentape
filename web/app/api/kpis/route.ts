import { NextResponse } from "next/server";
import { getKpis } from "@/lib/kpis";

export const runtime = "nodejs";
export const revalidate = 300; // 5 min cache — agregados de toda la base

export async function GET() {
  try {
    const kpis = await getKpis();
    return NextResponse.json({ source: "supabase", ...kpis });
  } catch (e) {
    return NextResponse.json(
      { source: "error", error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
