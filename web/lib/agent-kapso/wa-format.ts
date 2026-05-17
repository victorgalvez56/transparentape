import type { ObraResumen, ObraCercana, ContratistaStat, BuscarObrasFilters, ObraRetrasada } from "./queries";
import { FECHA_DATOS } from "./config";

export const COUNTRY_NAMES: Record<string, string> = {
  PE: "Perú 🇵🇪",
  CL: "Chile 🇨🇱",
  CO: "Colombia 🇨🇴",
  MX: "México 🇲🇽",
  AR: "Argentina 🇦🇷",
  BR: "Brasil 🇧🇷",
};

const CURRENCY: Record<string, string> = {
  PE: "S/",
  CL: "CLP$",
  CO: "COP$",
  MX: "MXN$",
  AR: "ARS$",
  BR: "R$",
};

// Countries with known sparse monto data in current DB
const THIN_DATA_COUNTRIES = new Set(["CL", "CO", "MX", "AR", "BR"]);

function fmt(monto: number | null | undefined, country = "PE"): string {
  if (!monto) return "sin monto";
  const sym = CURRENCY[country] ?? "$";
  if (monto >= 1_000_000_000) return `${sym} ${(monto / 1_000_000_000).toFixed(1)}B`;
  if (monto >= 1_000_000)     return `${sym} ${(monto / 1_000_000).toFixed(1)}M`;
  if (monto >= 1_000)         return `${sym} ${(monto / 1_000).toFixed(0)}K`;
  return `${sym} ${monto.toLocaleString()}`;
}

// Title-case helper for places stored ALLCAPS in DB ("AREQUIPA" → "Arequipa",
// "ALTO SELVA ALEGRE" → "Alto Selva Alegre"). Used by retrasada/obra lists
// so the WhatsApp message reads naturally instead of shouting.
function capitalize(raw: string): string {
  return raw
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

// Contractor names from OCDS can run 100+ chars ("CONSORCIO: 1) FOO S.R.L. 2)
// BAR S.A.C. Y 3) BAZ"). Trim around the first separator so the WA card
// stays readable; the full name still lives in the detail view.
function shortContratista(raw: string): string {
  if (raw.length <= 60) return raw;
  // Cut on first colon, " - " or " Y " sequence common in consorcio names.
  const cut = raw.search(/[:\-—]|\s+Y\s+/);
  const head = cut > 10 ? raw.slice(0, cut) : raw.slice(0, 60);
  return head.trim().replace(/[,;:]\s*$/, "") + "…";
}

// Convert ALLCAPS tender descriptions to Title Case, strip surrounding quotes
export function cleanTitle(raw: string | null | undefined): string {
  if (!raw) return "Sin título";
  const stripped = raw.replace(/^["'"«»\s]+|["'"»\s]+$/g, "").trim();
  const words = stripped.split(/\s+/);
  const titled = words
    .map((w) => {
      if (w.length <= 2) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
  return titled.length > 85 ? titled.slice(0, 83) + "…" : titled;
}

function flagIcon(obra: { is_red_flag: boolean }): string {
  return obra.is_red_flag ? " ⚠️" : "";
}

function thinDataNote(country: string): string {
  if (!THIN_DATA_COUNTRIES.has(country)) return "";
  return "\n_ℹ️ Datos de monto y localidad limitados para este país._";
}

// ─── Contextual next-step hints ───────────────────────────────────────────────

const HINT_OBRAS = "_Responde *el primero*, *el segundo*... para ver detalles._";
const HINT_GENERAL = "_Escribe *ayuda* para ver todo lo que puedo hacer._";

function hint(text: string): string {
  return `\n\n${text}`;
}

// Cited under every data response so users + journalists know when the
// snapshot was taken and what sources back it. Bump FECHA_DATOS in
// config.ts after each ETL refresh.
const SOURCE_FOOTER = `\n\n_📊 Fuente: OCDS · OECE · datos al ${FECHA_DATOS}._`;

// ─── Formatters ───────────────────────────────────────────────────────────────

export function fmtObras(
  obras: ObraResumen[],
  country: string,
  yearSugerido?: number,
  filters?: BuscarObrasFilters
): string {
  if (!obras.length) {
    const sugerencia = yearSugerido
      ? `\n\n💡 No hay datos para ese año. Prueba: *obras ${yearSugerido}*`
      : "\n\n💡 Prueba con otra región o año. Ej: *obras en Lima 2023*";
    return "No encontré obras con esos filtros." + sugerencia;
  }
  const nation = COUNTRY_NAMES[country] ?? country;
  // Header explains *why* these N rows (criterio + filtros aplicados) so the
  // user never has to guess if it's a top-N, alerts-only, or arbitrary list.
  // q_geo/q_supplier/q_sector take priority over legacy q for header tags.
  const placeLabel = filters?.q_geo ?? filters?.q ?? "";
  const supplierLabel = filters?.q_supplier ?? filters?.contratista ?? "";
  const sectorLabel = filters?.q_sector ?? "";
  const place = placeLabel ? `${placeLabel}, ` : "";
  const sectorTag = sectorLabel ? ` · sector: ${sectorLabel}` : "";
  const supplierTag = supplierLabel ? ` · empresa: ${supplierLabel}` : "";
  const yearTag = filters?.year ? ` · año ${filters.year}` : "";
  const flagTag = filters?.red_flag === true ? " con alertas" : "";
  const directTag = filters?.procurement_method === "direct" ? " (adj. directa)" : "";
  const count = obras.length;
  const header =
    `📋 *${count} obra${count > 1 ? "s" : ""} en ${place}${nation}${flagTag}${directTag}${yearTag}${sectorTag}${supplierTag}*\n` +
    `_Ordenadas por ⚠️ alertas y 💰 mayor monto · máx 5._\n`;
  const lines = [header];
  const showContratista = Boolean(filters?.contratista || filters?.ruc || filters?.q_supplier);
  obras.forEach((o, i) => {
    const contratistaLine =
      showContratista && o.contratista ? `\n  🏗️ ${o.contratista}` : "";
    lines.push(
      `${i + 1}. *${cleanTitle(o.titulo)}*${flagIcon(o)}\n` +
      `  💰 ${fmt(o.monto, country)} | 📍 ${o.region ?? "—"}${o.localidad ? ` · ${o.localidad}` : ""}` +
      contratistaLine + `\n` +
      `  Año: ${o.source_year ?? "—"} | ID: ${o.id}`
    );
  });
  lines.push(hint(HINT_OBRAS));
  lines.push(thinDataNote(country));
  return lines.join("\n") + SOURCE_FOOTER;
}

// Map raw OCDS / DB values to citizen-readable Spanish. Keeps fmtDetalle
// honest: the user shouldn't have to decode "direct" or
// "sancion_inhabilitacion" to understand the obra.
const PROCUREMENT_LABEL: Record<string, string> = {
  direct: "adjudicación directa (sin concurso)",
  open: "licitación abierta",
  limited: "concurso limitado",
};
const RED_FLAG_LABEL: Record<string, string> = {
  sancion_inhabilitacion: "🚫 contratista sancionado por OECE",
  penalidad: "⚠️ obra con penalidad aplicada",
};

function humanizeProcurement(raw: string | null | undefined): string {
  if (!raw) return "—";
  return PROCUREMENT_LABEL[raw] ?? raw;
}
function humanizeFlags(flags: string[] | null | undefined): string {
  if (!flags?.length) return "";
  const labeled = flags.map((f) => RED_FLAG_LABEL[f] ?? f);
  return `\n${labeled.join("\n")}`;
}

// Renders supervisor + avance físico + plazo when the obra has INFOBRAS
// data. Hidden completely when every field is null/undefined, so non-PE
// obras (no INFOBRAS coverage) just get the base detail block.
function fmtInfobrasBlock(o: ObraResumen): string {
  const has =
    o.avance_fisico_pct != null ||
    o.supervisor_nombre ||
    o.fecha_fin_programada ||
    o.fecha_fin_real ||
    (o.n_modificaciones_plazo ?? 0) > 0 ||
    (o.dias_retraso ?? 0) > 0;
  if (!has) return "";
  const lines: string[] = [];
  if (o.avance_fisico_pct != null) {
    lines.push(`   ${progressBar(o.avance_fisico_pct)}`);
  }
  if (o.supervisor_nombre) {
    lines.push(`   👁️ Supervisor: ${o.supervisor_nombre}`);
  }
  if ((o.dias_retraso ?? 0) > 0) {
    lines.push(`   ⏰ *${o.dias_retraso} días tarde* vs cronograma`);
  }
  if ((o.n_modificaciones_plazo ?? 0) > 0) {
    const n = o.n_modificaciones_plazo!;
    lines.push(`   🔁 ${n} adenda${n > 1 ? "s" : ""} de plazo`);
  }
  if (o.fecha_fin_programada || o.fecha_fin_real) {
    const plan = fmtDate(o.fecha_fin_programada);
    const real = o.fecha_fin_real ? ` · real ${fmtDate(o.fecha_fin_real)}` : "";
    lines.push(`   📅 plan ${plan}${real}`);
  }
  return "\n\n*📊 Ejecución (INFOBRAS)*\n" + lines.join("\n");
}

export function fmtDetalle(o: ObraResumen, country = "PE"): string {
  // Public-share URL — points at the env-configured base URL so local /
  // staging deploys don't 404 onto prod.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://transparentape.app";
  const shareLink = o.ocid
    ? `\n🔗 ${baseUrl}/obras/${encodeURIComponent(o.ocid)}`
    : "";
  return (
    `📄 *${cleanTitle(o.titulo)}*\n\n` +
    `💰 Monto: ${fmt(o.monto, country)}\n` +
    `📍 ${[o.region, o.localidad].filter(Boolean).join(" › ") || "—"}\n` +
    `🏗️ Contratista: ${o.contratista ?? "—"}\n` +
    `   RUC: ${o.ruc ?? "—"}\n` +
    `📅 Año: ${o.source_year ?? "—"} · Modalidad: ${humanizeProcurement(o.procurement_method)}` +
    humanizeFlags(o.red_flag_types) +
    fmtInfobrasBlock(o) +
    shareLink +
    hint("_Escribe *ranking contratistas* o busca más obras._") +
    SOURCE_FOOTER
  );
}

export function fmtCercanas(obras: ObraCercana[], country = "PE"): string {
  if (!obras.length) return "No encontré obras con coordenadas cerca de tu ubicación.";
  const lines = [`📍 *Obras más cercanas a tu ubicación:*\n`];
  obras.forEach((o, i) => {
    const dist = o.distancia_km < 1
      ? `${Math.round(o.distancia_km * 1000)}m`
      : `${o.distancia_km.toFixed(1)}km`;
    lines.push(
      `${i + 1}. *${cleanTitle(o.titulo)}*${flagIcon(o)}\n` +
      `  📏 ${dist} | 💰 ${fmt(o.monto, country)}\n` +
      `  📍 ${o.localidad ?? o.region ?? "—"} | ID: ${o.id}`
    );
  });
  lines.push(hint(HINT_OBRAS));
  return lines.join("\n") + SOURCE_FOOTER;
}

export function fmtStats(
  s: {
    total: string;
    alertas: string;
    monto_total: string;
    country: string;
  },
  scope?: string
): string {
  const nation = COUNTRY_NAMES[s.country] ?? s.country;
  const total = Number(s.total);
  const alertas = Number(s.alertas);
  const pct = total > 0 ? ((alertas / total) * 100).toFixed(1) : "0";
  const where = scope ? `${scope}, ${nation}` : nation;
  return (
    `📊 *Estadísticas ${where}*\n\n` +
    `Total obras: ${total.toLocaleString()}\n` +
    `⚠️ Con alerta: ${alertas.toLocaleString()} (${pct}%)\n` +
    `💰 Monto total: ${fmt(Number(s.monto_total), s.country)}` +
    thinDataNote(s.country) +
    hint("_Prueba: *ranking contratistas* · *monto en riesgo* · *obras en Lima*_") +
    SOURCE_FOOTER
  );
}

export function fmtRankingContratistas(list: ContratistaStat[], country: string, q?: string): string {
  if (!list.length) {
    return q
      ? `No hay contratistas con datos suficientes en ${q}.`
      : "No hay contratistas con datos suficientes.";
  }
  const nation = COUNTRY_NAMES[country] ?? country;
  const scope = q?.trim() ? `${q} (${nation})` : nation;
  const lines = [`🏆 *Top contratistas en ${scope}:*\n`];
  list.forEach((c, i) => {
    lines.push(
      `${i + 1}. *${c.supplier_name ?? "—"}*${c.tiene_alerta ? " ⚠️" : ""}\n` +
      `   ${c.obras} obras | ${fmt(c.monto_total, country)}`
    );
  });
  lines.push(hint("_Escribe *investigar [empresa]* para ver sus obras._"));
  return lines.join("\n") + SOURCE_FOOTER;
}

export function fmtInvestigacion(
  data: {
    obras: ObraResumen[];
    total_obras: number;
    monto_total: number | null;
    alertas: number;
    inhabilitado_vigente: boolean;
  },
  country = "PE"
): string {
  const lines: string[] = [];
  if (data.inhabilitado_vigente) {
    lines.push("🚫 *INHABILITADO VIGENTE* — Este proveedor tiene sanción activa.\n");
  }
  lines.push(
    `📊 Total: ${data.total_obras} obras | Monto: ${fmt(data.monto_total, country)} | Alertas: ${data.alertas}\n`
  );
  if (data.obras.length) {
    lines.push("Últimas obras:");
    for (const o of data.obras.slice(0, 3)) {
      lines.push(`• ${cleanTitle(o.titulo)}${o.is_red_flag ? " ⚠️" : ""} — ${fmt(o.monto, country)}`);
    }
  }
  lines.push(hint("_Escribe *ranking contratistas* o *inhabilitados* para más._"));
  return lines.join("\n") + SOURCE_FOOTER;
}

export function fmtInhabilitados(
  list: { supplier_name: string; supplier_ruc: string; obras: number; monto_total: number | null }[],
  country: string,
  scope?: string
): string {
  if (!list.length) return "No se encontraron proveedores inhabilitados con contratos activos.";
  const nation = COUNTRY_NAMES[country] ?? country;
  const where = scope ? `${scope}, ${nation}` : nation;
  const lines = [`🚫 *Inhabilitados con contratos en ${where}:*\n`];
  for (const r of list) {
    lines.push(
      `• *${r.supplier_name}* (${r.supplier_ruc})\n  ${r.obras} obras | ${fmt(r.monto_total, country)}`
    );
  }
  lines.push(hint("_Escribe *investigar [RUC]* para ver detalle de uno._"));
  return lines.join("\n") + SOURCE_FOOTER;
}

export function fmtAdjudicacionDirecta(obras: ObraResumen[], country: string, scope?: string): string {
  if (!obras.length) return "No se encontraron adjudicaciones directas con alertas.";
  const nation = COUNTRY_NAMES[country] ?? country;
  const where = scope ? `${scope}, ${nation}` : nation;
  const lines = [`⚡ *Adjudicaciones directas con alerta en ${where}:*\n`];
  obras.forEach((o, i) => {
    lines.push(
      `${i + 1}. *${cleanTitle(o.titulo)}* ⚠️\n` +
      `   💰 ${fmt(o.monto, country)} | 📍 ${o.region ?? "—"} | ID: ${o.id}`
    );
  });
  lines.push(hint(HINT_OBRAS));
  return lines.join("\n") + SOURCE_FOOTER;
}

export function fmtRankingEntidades(
  list: { buyer_name: string; obras: number; obras_alertadas: number; monto_total: number | null }[],
  country: string,
  scope?: string
): string {
  if (!list.length) return "No hay entidades con datos suficientes.";
  const nation = COUNTRY_NAMES[country] ?? country;
  const where = scope ? `${scope}, ${nation}` : nation;
  const lines = [`🏛️ *Top entidades compradoras en ${where}:*\n`];
  list.forEach((e, i) => {
    lines.push(
      `${i + 1}. *${e.buyer_name ?? "—"}*\n` +
      `   ${e.obras} obras${e.obras_alertadas > 0 ? ` | ⚠️ ${e.obras_alertadas} alertas` : ""} | ${fmt(e.monto_total, country)}`
    );
  });
  lines.push(hint("_Escribe *adjudicación directa* para ver contratos sospechosos._"));
  return lines.join("\n") + SOURCE_FOOTER;
}

// ASCII progress bar — 10 cells. Used by retrasadas + avance.
function progressBar(pct: number | null | undefined): string {
  const p = Math.max(0, Math.min(100, Number(pct ?? 0)));
  const filled = Math.round(p / 10);
  return `${"▓".repeat(filled)}${"░".repeat(10 - filled)} ${p.toFixed(0)}%`;
}

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    const mi = Number(m[2]) - 1;
    return `${months[mi] ?? m[2]} ${m[1]}`;
  }
  // DD/MM/YYYY (peruvian INFOBRAS)
  const p = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (p) {
    const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    const mi = Number(p[2]) - 1;
    return `${months[mi] ?? p[2]} ${p[3]}`;
  }
  return raw;
}

// Citizen-friendly retraso duration. Pure day counts ("4465 días tarde")
// are hard to parse at a glance for a non-technical audience; convert to
// years+months for anything past one year, keep raw days for shorter
// delays so journalists can still cite a precise figure.
function fmtRetrasoDuracion(dias: number): string {
  if (dias < 30) return `${dias} día${dias === 1 ? "" : "s"} tarde`;
  if (dias < 365) {
    const meses = Math.round(dias / 30);
    return `~${meses} ${meses === 1 ? "mes" : "meses"} tarde (${dias} días)`;
  }
  let anios = Math.floor(dias / 365);
  let mesesResto = Math.round((dias % 365) / 30);
  // Rounding can push mesesResto to 12 ("11 años 12 meses" → "12 años")
  if (mesesResto >= 12) { anios += 1; mesesResto = 0; }
  if (mesesResto === 0) return `~${anios} año${anios > 1 ? "s" : ""} tarde (${dias} días)`;
  return `~${anios} año${anios > 1 ? "s" : ""} ${mesesResto} ${mesesResto === 1 ? "mes" : "meses"} tarde (${dias} días)`;
}

export function fmtRetrasadas(
  obras: ObraRetrasada[],
  country: string,
  scope?: string,
  year?: number
): string {
  if (!obras.length) {
    return (
      "🔍 No encontré obras retrasadas en ese filtro.\n\n" +
      "_Defino *retrasada* como: contrato activo vencido +180 días, " +
      "3 o más extensiones de plazo, o cierre +365 días tarde._"
    );
  }
  const nation = COUNTRY_NAMES[country] ?? country;
  const where = scope ? `${capitalize(scope)}, ${nation}` : nation;
  const yearTag = year ? ` · año ${year}` : "";
  const count = obras.length;
  const lines = [
    `🐢 *${count} obra${count > 1 ? "s" : ""} retrasada${count > 1 ? "s" : ""} en ${where}${yearTag}*`,
    `_Mostrando las ${count > 1 ? "más demoradas" : "más demorada"} por orden de antigüedad._\n`,
  ];
  obras.forEach((o, i) => {
    const dias = o.dias_retraso ?? 0;
    const adendas = o.n_modificaciones_plazo ?? 0;
    const flag = o.is_red_flag ? " ⚠️" : "";
    const avance = o.avance_fisico_pct != null
      ? `\n   ${progressBar(o.avance_fisico_pct)}`
      : "";
    const adendasLine = adendas > 0
      ? `\n   🔁 ${adendas} extensión${adendas > 1 ? "es" : ""} de plazo registrada${adendas > 1 ? "s" : ""}`
      : "";
    const supLine = o.supervisor_nombre
      ? `\n   👁️ Supervisor: ${o.supervisor_nombre}`
      : "";
    // Plan date prefers INFOBRAS fecha_fin_programada when available;
    // falls back to OCDS contract_end. Suppress the line entirely when
    // neither source has a date so we don't show "📅 plan —".
    const planSource = o.fecha_fin_programada || o.contract_end_date;
    let finReal = "";
    if (o.fecha_fin_real) {
      finReal = `\n   📅 Debía terminar ${fmtDate(o.fecha_fin_programada)} · cerró ${fmtDate(o.fecha_fin_real)}`;
    } else if (planSource) {
      finReal = `\n   📅 Debía terminar: ${fmtDate(planSource)}`;
    }
    const lugar = [o.localidad, o.region].filter(Boolean).map(s => capitalize(s as string)).join(", ") || "—";
    lines.push(
      `${i + 1}. *${cleanTitle(o.titulo)}*${flag}\n` +
      `   ⏰ ${fmtRetrasoDuracion(dias)}` +
      avance +
      adendasLine +
      `\n   💰 ${fmt(o.monto, country)} · 📍 ${lugar}` +
      (o.contratista ? `\n   🏗️ ${shortContratista(o.contratista)}` : "") +
      supLine +
      finReal +
      `\n   _Más info: escribe *detalle ${o.id}*_`
    );
  });
  lines.push(hint("_Responde *el primero*, *el segundo*... para ver una en detalle._"));
  return lines.join("\n") + SOURCE_FOOTER;
}

export function fmtMontoEnRiesgo(
  data: { obras: number; monto_total: number; country: string },
  scope?: string
): string {
  const nation = COUNTRY_NAMES[data.country] ?? data.country;
  const where = scope ? `${scope}, ${nation}` : nation;
  return (
    `🚨 *Monto en riesgo — ${where}*\n\n` +
    `Obras con alerta: ${data.obras.toLocaleString()}\n` +
    `💰 Total comprometido: *${fmt(data.monto_total, data.country)}*\n\n` +
    `_Monto de contratos donde se detectaron red flags._` +
    hint("_Escribe *adjudicación directa* o *ranking contratistas* para ver quiénes._") +
    SOURCE_FOOTER
  );
}

export const INTRO_MSG = `👋 Hola, soy *Transparentape* 🔍

Vigilo las obras públicas de Perú, Chile, Colombia y más países. Puedo mostrarte contratos, detectar señales de corrupción e investigar empresas contratistas — todo desde WhatsApp.

*¿Qué quieres hacer?*

🔍 _obras en Piura este año_
📊 _estadísticas Perú_
🏆 _ranking contratistas_
📍 _obras cerca de mí_ _(comparte ubicación)_
🔎 _investigar Odebrecht_
🚫 _inhabilitados Chile_

O escribe cualquier pregunta sobre contratos públicos.

_Datos: OCDS · SEACE · Mercado Público_`;

export const AYUDA_MSG = INTRO_MSG;
