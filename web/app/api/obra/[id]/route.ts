import { NextRequest, NextResponse } from "next/server";
import { getObraById, getObraByOcid } from "@/lib/obras-query";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const isNumeric = /^\d+$/.test(id);

  try {
    const obra = isNumeric
      ? await getObraById(Number(id))
      : await getObraByOcid(id);
    if (!obra) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ source: "supabase", obra });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
