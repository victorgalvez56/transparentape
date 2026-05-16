import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { listObras } from "@/lib/obras-query";
import { Obra, riesgoDeObra } from "@/lib/types";
import { fmtSolesLong, displayTitle } from "@/lib/format";

export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const expected = process.env.AGENT_API_SECRET;
  if (!expected) return true;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return got === expected;
}

function summarize(o: Obra) {
  const r = riesgoDeObra(o);
  return {
    id: o.id,
    ocid: o.ocid,
    riesgo: r,
    emoji: r === "alto" ? "🔴" : r === "medio" ? "🟡" : "🟢",
    titulo: displayTitle(o),
    distrito: o.buyer_locality,
    region: o.buyer_region,
    monto: o.contract_amount ?? o.award_amount ?? o.tender_amount,
    monto_fmt: fmtSolesLong(
      o.contract_amount ?? o.award_amount ?? o.tender_amount
    ),
    contratista: o.supplier_name,
    ruc: o.supplier_ruc,
    alerta: o.is_red_flag
      ? `Contratista figura en ${(o.red_flag_types ?? [])
          .join(", ")
          .replace(/_/g, " ")}`
      : null,
    link_web: `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/obras/${o.ocid}`,
  };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const filters = {
    distrito: sp.get("distrito"),
    region: sp.get("region"),
    year: sp.get("year") ? Number(sp.get("year")) : null,
    red_flag: sp.get("red_flag") === "true" ? true : null,
    contratista: sp.get("contratista"),
    q: sp.get("q"),
    limit: Math.min(Math.max(parseInt(sp.get("limit") ?? "3", 10) || 3, 1), 10),
  };
  const sort = sp.get("sort") ?? "riesgo";

  const t0 = Date.now();
  let list = await listObras({ ...filters, limit: 200, with_coords: false });

  if (sort === "monto") {
    list.sort(
      (a, b) =>
        (b.contract_amount ?? b.award_amount ?? 0) -
        (a.contract_amount ?? a.award_amount ?? 0)
    );
  } else if (sort === "reciente") {
    list.sort(
      (a, b) =>
        (new Date(b.date_published ?? 0).getTime() || 0) -
        (new Date(a.date_published ?? 0).getTime() || 0)
    );
  } else {
    list.sort(
      (a, b) => Number(b.is_red_flag ?? false) - Number(a.is_red_flag ?? false)
    );
  }

  const top = list.slice(0, filters.limit).map(summarize);
  const ms = Date.now() - t0;

  // best-effort log
  query(
    `INSERT INTO agent_logs(endpoint, params, n_resultados, latencia_ms) VALUES ($1, $2, $3, $4)`,
    [
      "/api/agent/obras",
      JSON.stringify(Object.fromEntries(sp.entries())),
      top.length,
      ms,
    ]
  ).catch(() => {});

  return NextResponse.json({ count: top.length, obras: top, ms });
}
