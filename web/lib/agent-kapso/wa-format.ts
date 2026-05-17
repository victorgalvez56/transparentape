import type { ObraResumen, ContratistaStat } from "./queries";

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
  if (monto >= 1_000_000) return `${sym} ${(monto / 1_000_000).toFixed(1)}M`;
  if (monto >= 1_000) return `${sym} ${(monto / 1_000).toFixed(0)}K`;
  return `${sym} ${monto.toLocaleString()}`;
}

function flagIcon(obra: ObraResumen): string {
  return obra.is_red_flag ? " ⚠️" : "";
}

function thinDataNote(country: string): string {
  if (!THIN_DATA_COUNTRIES.has(country)) return "";
  return "\n_ℹ️ Datos de monto y localidad limitados para este país en la BD actual._";
}

export function fmtObras(obras: ObraResumen[], country: string): string {
  if (!obras.length) return "No encontré obras con esos filtros.";
  const nation = COUNTRY_NAMES[country] ?? country;
  const lines = [`📋 *Obras en ${nation}:*\n`];
  obras.forEach((o, i) => {
    lines.push(
      `${i + 1}. *${o.titulo ?? "Sin título"}*${flagIcon(o)}\n` +
      `  💰 ${fmt(o.monto, country)} | 📍 ${o.region ?? "—"}${o.localidad ? ` · ${o.localidad}` : ""}\n` +
      `  Año: ${o.source_year ?? "—"} | ID: ${o.id}`
    );
  });
  lines.push("\n_Para más detalle: *detalle #ID* o *el primero*, *el segundo*...*_");
  lines.push(thinDataNote(country));
  return lines.join("\n");
}

export function fmtDetalle(o: ObraResumen, country = "PE"): string {
  const flags = o.red_flag_types?.length
    ? `\n⚠️ *Alertas:* ${o.red_flag_types.join(", ")}`
    : "";
  return (
    `📄 *${o.titulo ?? "Sin título"}*\n\n` +
    `💰 Monto: ${fmt(o.monto, country)}\n` +
    `📍 ${[o.region, o.localidad].filter(Boolean).join(" › ") || "—"}\n` +
    `🏗️ Contratista: ${o.contratista ?? "—"}\n` +
    `   RUC: ${o.ruc ?? "—"}\n` +
    `📅 Año: ${o.source_year ?? "—"} | Método: ${o.procurement_method ?? "—"}\n` +
    `🔖 OCID: ${o.ocid ?? "—"}` +
    flags
  );
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
    thinDataNote(s.country)
  );
}

export function fmtRankingContratistas(list: ContratistaStat[], country: string): string {
  if (!list.length) return "No hay contratistas con datos suficientes.";
  const nation = COUNTRY_NAMES[country] ?? country;
  const lines = [`🏆 *Top contratistas en ${nation}:*\n`];
  list.forEach((c, i) => {
    lines.push(
      `${i + 1}. *${c.supplier_name ?? "—"}*${c.tiene_alerta ? " ⚠️" : ""}\n` +
      `   ${c.obras} obras | ${fmt(c.monto_total, country)}`
    );
  });
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
      lines.push(`• ${o.titulo ?? "—"}${o.is_red_flag ? " ⚠️" : ""} — ${fmt(o.monto, country)}`);
    }
  }
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
  return lines.join("\n");
}

export function fmtAdjudicacionDirecta(obras: ObraResumen[], country: string): string {
  if (!obras.length) return "No se encontraron adjudicaciones directas con alertas.";
  const nation = COUNTRY_NAMES[country] ?? country;
  const lines = [`⚡ *Adjudicaciones directas con alerta en ${nation}:*\n`];
  obras.forEach((o, i) => {
    lines.push(
      `${i + 1}. *${o.titulo ?? "Sin título"}* ⚠️\n` +
      `   💰 ${fmt(o.monto, country)} | 📍 ${o.region ?? "—"} | ID: ${o.id}`
    );
  });
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
  return lines.join("\n");
}

export function fmtMontoEnRiesgo(data: { obras: number; monto_total: number; country: string }): string {
  const nation = COUNTRY_NAMES[data.country] ?? data.country;
  return (
    `🚨 *Monto en riesgo — ${nation}*\n\n` +
    `Obras con alerta: ${data.obras.toLocaleString()}\n` +
    `💰 Total comprometido: *${fmt(data.monto_total, data.country)}*\n\n` +
    `_Monto de contratos donde se detectaron red flags (adjudicación directa, inhabilitado, etc.)_`
  );
}

export const AYUDA_MSG = `🤖 *Transparentape — Agente de Obras Públicas*

Comandos disponibles:

🔍 *Buscar obras*
  _obras en Piura 2024_
  _licitaciones con alerta en Lima_

📄 *Ver detalle*
  _detalle #123_ · _el primero_ · _el segundo_

📊 *Estadísticas*
  _estadísticas Perú_ · _resumen Chile_
  _monto en riesgo Perú_

🏆 *Rankings*
  _ranking contratistas Perú_
  _ranking entidades Chile_
  _adjudicación directa Perú_

🔎 *Investigar empresa*
  _investigar 20123456789_
  _investigar Odebrecht_

🚫 *Inhabilitados*
  _inhabilitados Chile_

🌎 *Cambiar país*
  _Perú_ · _Chile_ · _Colombia_ · _México_

_Datos: OCDS · SEACE · Mercado Público_`;
