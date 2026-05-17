import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

type RedFlagRow = {
  tipo: string;
  descripcion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  vigente: boolean | null;
  fuente: string | null;
};

type Severity = {
  score: number;
  level: "alta" | "media" | "baja";
  breakdown: { factor: string; points: number }[];
};

type TimelineEvent = {
  date: string | null;
  type: string;
  label: string;
  detail?: string;
  icon: string;
  severity: "info" | "warn" | "alert";
};

type ObraRow = {
  id: number;
  ocid: string;
  source_year: number;
  country: string;
  buyer_name: string | null;
  buyer_locality: string | null;
  buyer_region: string | null;
  tender_description: string | null;
  contract_amount: number | null;
  tender_amount: number | null;
  award_amount: number | null;
  supplier_name: string | null;
  supplier_ruc: string | null;
  procurement_method: string | null;
  n_amendments: number | null;
  ai_score: number | null;
  ai_description: string | null;
  is_red_flag: boolean | null;
  red_flag_types: string[] | null;
  contract_start: string | null;
  contract_end: string | null;
  award_date: string | null;
  date_published: string | null;
  streetview_before: string | null;
  streetview_after: string | null;
};

function computeSeverity(obra: ObraRow, flags: RedFlagRow[]): Severity {
  const breakdown: { factor: string; points: number }[] = [];
  let score = 0;

  if (obra.ai_score !== null && obra.ai_score !== undefined) {
    if (obra.ai_score <= 30) {
      score += 30;
      breakdown.push({ factor: `IA Vision ${obra.ai_score}/100 — sin evidencia de obra`, points: 30 });
    } else if (obra.ai_score <= 60) {
      score += 15;
      breakdown.push({ factor: `IA Vision ${obra.ai_score}/100 — deterioro notorio`, points: 15 });
    }
  }

  const sanciones = flags.filter((f) => f.tipo === "sancion_inhabilitacion");
  const judiciales = flags.filter((f) => f.tipo === "inhabilitacion_judicial");
  const penalidades = flags.filter((f) => f.tipo === "penalidad");

  if (judiciales.length > 0) {
    const pts = Math.min(20 + (judiciales.length - 1) * 5, 30);
    score += pts;
    breakdown.push({ factor: `${judiciales.length} inhabilitación(es) judicial(es)`, points: pts });
  }
  if (sanciones.length > 0) {
    const hasFraud = sanciones.some((f) => /falsos|adulterados|fraud/i.test(f.descripcion || ""));
    const base = hasFraud ? 25 : 15;
    const pts = Math.min(base + (sanciones.length - 1) * 5, 30);
    score += pts;
    breakdown.push({
      factor: hasFraud
        ? `${sanciones.length} sanción(es) OECE — incluye documentos falsos`
        : `${sanciones.length} sanción(es) OECE`,
      points: pts,
    });
  }
  if (penalidades.length > 0) {
    const pts = Math.min(penalidades.length * 4, 20);
    score += pts;
    breakdown.push({ factor: `${penalidades.length} penalidad(es) al contratista`, points: pts });
  }

  if (obra.procurement_method === "direct" || obra.procurement_method === "AS") {
    score += 15;
    breakdown.push({ factor: "Adjudicación directa — sin licitación pública", points: 15 });
  }

  const nAmend = obra.n_amendments || 0;
  if (nAmend > 0) {
    const pts = Math.min(nAmend * 5, 15);
    score += pts;
    breakdown.push({ factor: `${nAmend} adenda(s) al contrato original`, points: pts });
  }

  // Award vs tender delta
  const tender = obra.tender_amount ?? 0;
  const award = obra.award_amount ?? 0;
  if (tender > 0 && award > 0 && award / tender > 1.05) {
    const pct = ((award / tender - 1) * 100).toFixed(1);
    const pts = award / tender > 1.2 ? 15 : 8;
    score += pts;
    breakdown.push({ factor: `Adjudicación ${pct}% sobre referencial`, points: pts });
  }

  const amount = obra.contract_amount || obra.tender_amount || 0;
  if (amount >= 10_000_000) {
    score += 10;
    breakdown.push({ factor: `Monto alto — ${(amount / 1_000_000).toFixed(1)}M`, points: 10 });
  }

  score = Math.min(score, 100);
  const level: Severity["level"] = score >= 70 ? "alta" : score >= 40 ? "media" : "baja";
  return { score, level, breakdown };
}

function buildTimeline(obra: ObraRow, flags: RedFlagRow[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (obra.date_published) {
    events.push({ date: obra.date_published, type: "tender_published", label: "Convocatoria publicada", icon: "📢", severity: "info" });
  }
  if (obra.award_date) {
    events.push({ date: obra.award_date, type: "award", label: "Adjudicación al contratista", detail: obra.supplier_name ?? undefined, icon: "🤝", severity: "info" });
  }
  if (obra.contract_start) {
    const monto = obra.contract_amount;
    events.push({
      date: obra.contract_start, type: "contract_signed",
      label: "Firma e inicio del contrato",
      detail: monto ? new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(monto) : undefined,
      icon: "✍️", severity: "info",
    });
  }

  for (const f of flags.slice(0, 6)) {
    if (!f.fecha_inicio) continue;
    events.push({
      date: f.fecha_inicio, type: "red_flag",
      label: f.tipo === "penalidad" ? "Penalidad al contratista" : "Sanción/inhabilitación al contratista",
      detail: f.descripcion ?? undefined,
      icon: "🚨", severity: "alert",
    });
  }

  if (obra.contract_end) {
    events.push({ date: obra.contract_end, type: "contract_end", label: "Fin programado del contrato", icon: "📅", severity: "info" });
  }

  if (obra.ai_score !== null && obra.ai_score !== undefined) {
    events.push({
      date: null, type: "ai_verdict",
      label: `Veredicto IA: ${obra.ai_score}/100`,
      detail: obra.ai_description ?? undefined,
      icon: "🤖",
      severity: obra.ai_score <= 30 ? "alert" : obra.ai_score <= 60 ? "warn" : "info",
    });
  }

  events.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  return events;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  // 1) Obra
  const obra = await queryOne<ObraRow>(
    `SELECT id, ocid, source_year, country, buyer_name, buyer_locality, buyer_region,
            tender_description, contract_amount, tender_amount, award_amount,
            supplier_name, supplier_ruc, procurement_method, n_amendments,
            ai_score, ai_description, is_red_flag, red_flag_types,
            contract_start, contract_end, award_date, date_published,
            streetview_before, streetview_after
     FROM obras WHERE id = $1`,
    [Number(id)]
  );
  if (!obra) return NextResponse.json({ error: "obra not found" }, { status: 404 });

  const ruc = obra.supplier_ruc;

  // 2) Red flags del contratista
  let flags: RedFlagRow[] = [];
  if (ruc) {
    const raw = await query<RedFlagRow>(
      `SELECT tipo, descripcion, fecha_inicio, fecha_fin, vigente, fuente
       FROM red_flags WHERE ruc = $1 LIMIT 100`,
      [ruc]
    );
    const seen = new Set<string>();
    flags = raw.filter((f) => {
      const key = `${f.tipo}|${(f.descripcion || "").trim()}|${f.fecha_inicio || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // 3) Red de contratista — otras obras del mismo RUC
  type OtraObra = { id: number; buyer_locality: string | null; tender_description: string | null; contract_amount: number | null; award_amount: number | null; ai_score: number | null; is_red_flag: boolean | null; source_year: number; country: string };
  let otherObras: OtraObra[] = [];
  let agg = { total_obras: 0, total_monto: 0, n_obras_with_flag: 0 };

  if (ruc) {
    otherObras = await query<OtraObra>(
      `SELECT id, buyer_locality, tender_description, contract_amount, award_amount, ai_score, is_red_flag, source_year, country
       FROM obras WHERE supplier_ruc = $1 AND id != $2
       ORDER BY contract_amount DESC NULLS LAST LIMIT 10`,
      [ruc, obra.id]
    );

    const aggRows = await query<{ contract_amount: number | null; award_amount: number | null; is_red_flag: boolean | null }>(
      `SELECT contract_amount, award_amount, is_red_flag FROM obras WHERE supplier_ruc = $1`,
      [ruc]
    );
    agg.total_obras = aggRows.length;
    agg.total_monto = aggRows.reduce((s, r) => s + (r.contract_amount ?? r.award_amount ?? 0), 0);
    agg.n_obras_with_flag = aggRows.filter((r) => r.is_red_flag).length;
  }

  // 4) Severity + timeline
  const severity = computeSeverity(obra, flags);
  const timeline = buildTimeline(obra, flags);

  // 5) Dataset badges
  const datasets = [
    { id: "ocds", name: "OCDS", hit: true, detail: obra.ocid },
    { id: "oece_sancion", name: "OECE Sanciones", hit: flags.some((f) => f.tipo === "sancion_inhabilitacion"), detail: `${flags.filter((f) => f.tipo === "sancion_inhabilitacion").length} sanción(es)` },
    { id: "oece_penalidad", name: "OECE Penalidades", hit: flags.some((f) => f.tipo === "penalidad"), detail: `${flags.filter((f) => f.tipo === "penalidad").length} penalidad(es)` },
    { id: "ai_vision", name: "Claude Vision", hit: obra.ai_score !== null, detail: obra.ai_score !== null ? `Score ${obra.ai_score}/100` : "Sin análisis" },
    { id: "streetview", name: "Street View", hit: !!(obra.streetview_before || obra.streetview_after), detail: obra.streetview_after ? "Antes + Ahora" : obra.streetview_before ? "Solo actual" : "Sin imágenes" },
  ];

  return NextResponse.json(
    {
      obra,
      contractor: {
        ruc,
        name: obra.supplier_name,
        total_obras: agg.total_obras,
        total_monto: agg.total_monto,
        n_obras_with_flag: agg.n_obras_with_flag,
        other_obras: otherObras,
      },
      red_flags: flags,
      severity,
      timeline,
      datasets,
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}
