import { NextRequest, NextResponse } from "next/server";
import { getObraById, getObraByOcid } from "@/lib/obras-query";
import { Obra, riesgoDeObra } from "@/lib/types";
import { fmtSolesLong, fmtFecha, displayTitle } from "@/lib/format";

export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const expected = process.env.AGENT_API_SECRET;
  if (!expected) return true;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return got === expected;
}

function ficha(o: Obra) {
  const r = riesgoDeObra(o);
  return {
    id: o.id,
    ocid: o.ocid,
    riesgo: r,
    emoji: r === "alto" ? "🔴" : r === "medio" ? "🟡" : "🟢",
    titulo: displayTitle(o),
    distrito: o.buyer_locality,
    region: o.buyer_region,
    comprador: o.buyer_name,
    contratista: o.supplier_name,
    ruc: o.supplier_ruc,
    monto_referencial: fmtSolesLong(o.tender_amount),
    monto_adjudicado: fmtSolesLong(o.award_amount),
    monto_contrato: fmtSolesLong(o.contract_amount),
    estado_contrato: o.contract_status,
    periodo: `${fmtFecha(o.contract_start)} → ${fmtFecha(o.contract_end)}`,
    n_adendas: o.n_amendments ?? 0,
    metodo: o.procurement_method,
    alertas: o.is_red_flag
      ? (o.red_flag_types ?? []).map((t) => t.replace(/_/g, " "))
      : [],
    analisis_ia: o.ai_description,
    score_ia: o.ai_score,
    link_web: `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/obras/${o.ocid}`,
  };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  const ocid = sp.get("ocid");
  if (!id && !ocid) {
    return NextResponse.json({ error: "missing_id_or_ocid" }, { status: 400 });
  }

  const obra = id ? await getObraById(Number(id)) : await getObraByOcid(ocid!);
  if (!obra) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ obra: ficha(obra) });
}
