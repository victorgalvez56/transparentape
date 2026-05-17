import type { ObraResumen, ObraCercana, ContratistaStat, BuscarObrasFilters } from "./queries";

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
  // q_geo/q_supplier take priority over legacy q for the place/empresa tag.
  const placeLabel = filters?.q_geo ?? filters?.q ?? "";
  const supplierLabel = filters?.q_supplier ?? filters?.contratista ?? "";
  const place = placeLabel ? `${placeLabel}, ` : "";
  const supplierTag = supplierLabel ? ` · empresa: ${supplierLabel}` : "";
  const yearTag = filters?.year ? ` · año ${filters.year}` : "";
  const flagTag = filters?.red_flag === true ? " con alertas" : "";
  const directTag = filters?.procurement_method === "direct" ? " (adj. directa)" : "";
  const count = obras.length;
  const header =
    `📋 *${count} obra${count > 1 ? "s" : ""} en ${place}${nation}${flagTag}${directTag}${yearTag}${supplierTag}*\n` +
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
  return lines.join("\n");
}

export function fmtDetalle(o: ObraResumen, country = "PE"): string {
  const flags = o.red_flag_types?.length
    ? `\n⚠️ *Alertas:* ${o.red_flag_types.join(", ")}`
    : "";
  return (
    `📄 *${cleanTitle(o.titulo)}*\n\n` +
    `💰 Monto: ${fmt(o.monto, country)}\n` +
    `📍 ${[o.region, o.localidad].filter(Boolean).join(" › ") || "—"}\n` +
    `🏗️ Contratista: ${o.contratista ?? "—"}\n` +
    `   RUC: ${o.ruc ?? "—"}\n` +
    `📅 Año: ${o.source_year ?? "—"} | Método: ${o.procurement_method ?? "—"}\n` +
    `🔖 OCID: ${o.ocid ?? "—"}` +
    flags +
    hint("_Escribe *ranking contratistas* o busca más obras._")
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
  return lines.join("\n");
}

export function fmtStats(s: {
  total: string;
  alertas: string;
  monto_total: string;
  country: string;
}): string {
  const nation = COUNTRY_NAMES[s.country] ?? s.country;
  const total = Number(s.total);
  const alertas = Number(s.alertas);
  const pct = total > 0 ? ((alertas / total) * 100).toFixed(1) : "0";
  return (
    `📊 *Estadísticas ${nation}*\n\n` +
    `Total obras: ${total.toLocaleString()}\n` +
    `⚠️ Con alerta: ${alertas.toLocaleString()} (${pct}%)\n` +
    `💰 Monto total: ${fmt(Number(s.monto_total), s.country)}` +
    thinDataNote(s.country) +
    hint("_Prueba: *ranking contratistas* · *monto en riesgo* · *obras en Lima*_")
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
  return lines.join("\n");
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
  return lines.join("\n");
}

export function fmtInhabilitados(
  list: { supplier_name: string; supplier_ruc: string; obras: number; monto_total: number | null }[],
  country: string
): string {
  if (!list.length) return "No se encontraron proveedores inhabilitados con contratos activos.";
  const nation = COUNTRY_NAMES[country] ?? country;
  const lines = [`🚫 *Inhabilitados con contratos en ${nation}:*\n`];
  for (const r of list) {
    lines.push(
      `• *${r.supplier_name}* (${r.supplier_ruc})\n  ${r.obras} obras | ${fmt(r.monto_total, country)}`
    );
  }
  lines.push(hint("_Escribe *investigar [RUC]* para ver detalle de uno._"));
  return lines.join("\n");
}

export function fmtAdjudicacionDirecta(obras: ObraResumen[], country: string): string {
  if (!obras.length) return "No se encontraron adjudicaciones directas con alertas.";
  const nation = COUNTRY_NAMES[country] ?? country;
  const lines = [`⚡ *Adjudicaciones directas con alerta en ${nation}:*\n`];
  obras.forEach((o, i) => {
    lines.push(
      `${i + 1}. *${cleanTitle(o.titulo)}* ⚠️\n` +
      `   💰 ${fmt(o.monto, country)} | 📍 ${o.region ?? "—"} | ID: ${o.id}`
    );
  });
  lines.push(hint(HINT_OBRAS));
  return lines.join("\n");
}

export function fmtRankingEntidades(
  list: { buyer_name: string; obras: number; obras_alertadas: number; monto_total: number | null }[],
  country: string
): string {
  if (!list.length) return "No hay entidades con datos suficientes.";
  const nation = COUNTRY_NAMES[country] ?? country;
  const lines = [`🏛️ *Top entidades compradoras en ${nation}:*\n`];
  list.forEach((e, i) => {
    lines.push(
      `${i + 1}. *${e.buyer_name ?? "—"}*\n` +
      `   ${e.obras} obras${e.obras_alertadas > 0 ? ` | ⚠️ ${e.obras_alertadas} alertas` : ""} | ${fmt(e.monto_total, country)}`
    );
  });
  lines.push(hint("_Escribe *adjudicación directa* para ver contratos sospechosos._"));
  return lines.join("\n");
}

export function fmtMontoEnRiesgo(data: { obras: number; monto_total: number; country: string }): string {
  const nation = COUNTRY_NAMES[data.country] ?? data.country;
  return (
    `🚨 *Monto en riesgo — ${nation}*\n\n` +
    `Obras con alerta: ${data.obras.toLocaleString()}\n` +
    `💰 Total comprometido: *${fmt(data.monto_total, data.country)}*\n\n` +
    `_Monto de contratos donde se detectaron red flags._` +
    hint("_Escribe *adjudicación directa* o *ranking contratistas* para ver quiénes._")
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
