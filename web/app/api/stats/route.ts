import { NextResponse } from "next/server";
import { getCountryStats } from "@/lib/obras-query";

export const runtime = "nodejs";
export const revalidate = 300; // 5 min cache

export async function GET() {
  try {
    const stats = await getCountryStats();
    return NextResponse.json({ source: "supabase", ...stats });
  } catch (e) {
    return NextResponse.json(
      { source: "error", error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
