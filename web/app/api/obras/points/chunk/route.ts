import { NextRequest, NextResponse } from "next/server";
import {
  listObraPointsPriority,
  listObraPointsAfter,
} from "@/lib/obras-query";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Carga PROGRESIVA del mapa/lista. Endpoint NUEVO — /api/obras/points
 * queda intacto como fallback.
 *
 *   ?priority=1            → top ~2000 (red flags + montos altos), rápido.
 *                            Para el primer paint inmediato y relevante.
 *   ?after=<id>&limit=N    → siguiente página por keyset sobre id (PK).
 *
 * El cliente pide priority primero, luego pagina con after= hasta
 * done:true, deduplicando por id. El set final equivale a /api/obras/points.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const country = sp.get("country");
  try {
    if (sp.get("priority") === "1") {
      const limit = Number(sp.get("limit") ?? 2000) || 2000;
      const obras = await listObraPointsPriority(limit, country);
      return NextResponse.json({
        source: "supabase",
        mode: "priority",
        count: obras.length,
        obras,
      });
    }

    const after = Number(sp.get("after") ?? 0) || 0;
    const limit = Number(sp.get("limit") ?? 8000) || 8000;
    const obras = await listObraPointsAfter(after, limit, country);
    const lastId = obras.length ? obras[obras.length - 1].id : after;
    return NextResponse.json({
      source: "supabase",
      mode: "page",
      count: obras.length,
      nextCursor: lastId,
      done: obras.length < limit,
      obras,
    });
  } catch (e) {
    console.error("[api/obras/points/chunk] db error:", e);
    return NextResponse.json(
      {
        source: "error",
        error: e instanceof Error ? e.message : "unknown",
        obras: [],
        done: true,
      },
      { status: 500 }
    );
  }
}
