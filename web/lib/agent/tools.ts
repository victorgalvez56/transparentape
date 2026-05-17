/**
 * Shared tool registry for the LLM router.
 *
 * Each tool wraps a typed function from `agent-kapso/queries.ts` and
 * carries the formatter (from `agent-kapso/wa-format.ts`) used to render
 * its result for WhatsApp. The web client can ignore the formatter and
 * use the raw `data` directly.
 *
 * The router (`runChatPipeline`) is given the tool catalogue as plain JSON
 * — name + description + parameters schema — and must reply with
 *   { intent: "TOOL_CALL", tool: "...", args: {...} }
 * via the existing `response_format: json_object` path. This avoids
 * depending on Groq's native function-calling beta.
 */
import {
  buscarObras,
  statsPorPais,
  rankingContratistas,
  rankingEntidades,
  adjudicacionDirectaAlertas,
  investigarContratista,
  inhabilitadosVigentes,
  montoEnRiesgo,
  obrasRetrasadas,
  getObraResumen,
  type Country,
  type BuscarObrasFilters,
} from "@/lib/agent-kapso/queries";
import { classifyQuery } from "@/lib/agent-kapso/places";
import {
  fmtObras,
  fmtStats,
  fmtRankingContratistas,
  fmtRankingEntidades,
  fmtAdjudicacionDirecta,
  fmtInvestigacion,
  fmtInhabilitados,
  fmtMontoEnRiesgo,
  fmtRetrasadas,
  fmtDetalle,
} from "@/lib/agent-kapso/wa-format";

export interface ToolContext {
  country: Country;
}

export interface ToolResult {
  data: unknown;
  formatted: string;
  /** IDs of obras returned, if applicable — webhook stores in session for ordinal follow-ups. */
  obraIds?: number[];
}

export interface Tool {
  name: string;
  description: string;
  /** JSON-Schema-ish summary shown to the router. Kept minimal — LLM only needs argument names. */
  parameters: Record<string, string>;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}
function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
  return undefined;
}
function asBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}
function pickCountry(v: unknown, fallback: Country): Country {
  const s = asString(v)?.toUpperCase();
  if (s && /^[A-Z]{2}$/.test(s)) return s as Country;
  return fallback;
}

export const TOOLS: Tool[] = [
  {
    name: "buscar_obras",
    description:
      "Lista obras públicas filtradas por lugar, empresa contratista, sector (saneamiento/salud/educación/transporte/etc.), año, alertas o método de contratación. Default 5 resultados ordenados por alertas y monto.",
    parameters: {
      q: "string opcional — texto libre con lugar, sector y/o empresa (ej: 'Piura', 'saneamiento en Lima', 'Cosapi'). Se clasifica automáticamente.",
      q_geo: "string opcional — solo región/provincia/distrito si quieres restringir geo explícitamente",
      q_supplier: "string opcional — solo nombre de empresa contratista si quieres restringir por empresa",
      q_sector: "string opcional — sector (saneamiento, salud, educacion, vial, vivienda, etc.) — ILIKE en descripción de obra",
      year: "número opcional — año del registro (ej: 2024)",
      red_flag: "boolean opcional — true para solo obras con alerta",
      procurement_method: "string opcional — 'direct' para adjudicación directa",
    },
    async run(args, ctx) {
      const filters: BuscarObrasFilters = {
        country: ctx.country,
        year: asNumber(args.year),
        red_flag: asBool(args.red_flag),
        procurement_method: asString(args.procurement_method),
        limit: 5,
      };
      // Explicit q_geo / q_supplier / q_sector from the router win. Otherwise
      // run the free-text q through classifyQuery so "saneamiento en Lima"
      // splits into q_geo="lima" + q_sector="saneamiento", "Cosapi en Lima"
      // into q_geo="lima" + q_supplier="cosapi", etc.
      const qGeoArg = asString(args.q_geo);
      const qSupplierArg = asString(args.q_supplier);
      const qSectorArg = asString(args.q_sector);
      if (qGeoArg) filters.q_geo = qGeoArg;
      if (qSupplierArg) filters.q_supplier = qSupplierArg;
      if (qSectorArg) filters.q_sector = qSectorArg;
      if (!qGeoArg && !qSupplierArg && !qSectorArg) {
        const raw = asString(args.q);
        if (raw) {
          const c = classifyQuery(raw);
          if (c.q_geo) filters.q_geo = c.q_geo;
          if (c.q_supplier) filters.q_supplier = c.q_supplier;
          if (c.q_sector) filters.q_sector = c.q_sector;
          // If classifyQuery returned {}, the raw was noise — leave q empty
          // so we return the top of the country instead of an ILIKE that
          // matches zero rows.
        }
      }
      const data = await buscarObras(filters);
      return {
        data,
        formatted: fmtObras(data, ctx.country, undefined, filters),
        obraIds: data.map((o) => o.id),
      };
    },
  },
  {
    name: "ver_detalle",
    description: "Detalle completo de una obra por ID numérico.",
    parameters: { id: "número requerido — ID de la obra" },
    async run(args, ctx) {
      const id = asNumber(args.id);
      if (!id) return { data: null, formatted: "Falta el ID de la obra." };
      const o = await getObraResumen(id);
      if (!o) return { data: null, formatted: `No encontré la obra con ID ${id}.` };
      return { data: o, formatted: fmtDetalle(o, ctx.country), obraIds: [o.id] };
    },
  },
  {
    name: "stats_pais",
    description: "Resumen estadístico: total obras, alertas, monto total. Acepta `q` para limitar a una región y `country_override` para consultar otro país sin cambiar la sesión.",
    parameters: {
      q: "string opcional — región/provincia/distrito para acotar (ej: 'Piura')",
      country_override: "string opcional — código ISO 2 letras si el usuario pide stats de otro país (ej: 'CL' para 'stats de Chile')",
    },
    async run(args, ctx) {
      const country = pickCountry(args.country_override, ctx.country);
      const q = asString(args.q);
      const stats = await statsPorPais(country, q);
      if (!stats) return { data: null, formatted: "No hay datos disponibles para ese país." };
      return { data: stats, formatted: fmtStats({ ...stats, country }, q) };
    },
  },
  {
    name: "ranking_contratistas",
    description:
      "Top contratistas. Usa `por='alertas'` cuando el usuario menciona riesgo, corrupción, sanciones, 'que más roban', 'sospechosos', 'castigados'. Usa `por='monto'` (default) cuando habla de tamaño económico, 'los más grandes', 'mayor adjudicación'. Si la conversación ya tenía una región, pasa `q` para filtrar geográficamente.",
    parameters: {
      por: "string opcional — 'monto' (default, por tamaño económico) o 'alertas' (por número de red flags)",
      q: "string opcional — región/provincia/distrito para limitar el ranking",
    },
    async run(args, ctx) {
      const por = (asString(args.por) === "alertas" ? "alertas" : "monto") as "monto" | "alertas";
      const q = asString(args.q);
      const data = await rankingContratistas(ctx.country, por, 5, q);
      return { data, formatted: fmtRankingContratistas(data, ctx.country, q) };
    },
  },
  {
    name: "ranking_entidades",
    description: "Top entidades compradoras (ministerios, gobiernos regionales) con mayor número de obras. Acepta `q` para filtrar región.",
    parameters: {
      q: "string opcional — región/provincia/distrito",
    },
    async run(args, ctx) {
      const q = asString(args.q);
      const data = await rankingEntidades(ctx.country, 5, q);
      return { data, formatted: fmtRankingEntidades(data, ctx.country, q) };
    },
  },
  {
    name: "adjudicacion_directa",
    description: "Obras adjudicadas directamente (sin licitación competitiva) que además tienen alerta. Acepta `q` para filtrar región.",
    parameters: {
      q: "string opcional — región/provincia/distrito",
    },
    async run(args, ctx) {
      const q = asString(args.q);
      const data = await adjudicacionDirectaAlertas(ctx.country, 5, q);
      return { data, formatted: fmtAdjudicacionDirecta(data, ctx.country, q), obraIds: data.map((o) => o.id) };
    },
  },
  {
    name: "investigar_contratista",
    description: "Resumen de una empresa contratista: obras adjudicadas, monto total, alertas, estado inhabilitado.",
    parameters: {
      q: "string requerido — nombre o RUC de la empresa",
      country_override: "string opcional — código ISO 2 letras si distinto al país actual",
    },
    async run(args, ctx) {
      const q = asString(args.q);
      if (!q) return { data: null, formatted: "Escribe el RUC o nombre de la empresa." };
      const country = pickCountry(args.country_override, ctx.country);
      const data = await investigarContratista(q, country);
      return { data, formatted: fmtInvestigacion(data, country), obraIds: data.obras.map((o) => o.id) };
    },
  },
  {
    name: "inhabilitados",
    description: "Lista de contratistas con sanción vigente que aún tienen contratos activos. Acepta `q` para filtrar región.",
    parameters: {
      q: "string opcional — región/provincia/distrito",
    },
    async run(args, ctx) {
      const q = asString(args.q);
      const data = await inhabilitadosVigentes(ctx.country, 8, q);
      return { data, formatted: fmtInhabilitados(data, ctx.country, q) };
    },
  },
  {
    name: "monto_en_riesgo",
    description: "Monto total acumulado de contratos marcados con alerta de riesgo. Acepta `q` para limitar a una región.",
    parameters: {
      q: "string opcional — región/provincia/distrito",
    },
    async run(args, ctx) {
      const q = asString(args.q);
      const data = await montoEnRiesgo(ctx.country, q);
      return { data, formatted: fmtMontoEnRiesgo(data, q) };
    },
  },
  {
    name: "obras_retrasadas",
    description:
      "USA ESTE TOOL cuando el usuario pregunta sobre retrasos, atrasos, demoras, paralizaciones, estancamientos o incumplimientos de plazo en obras públicas. Acepta tanto formas adjetivas ('obras retrasadas', 'obras atrasadas', 'obras paralizadas', 'obras estancadas', 'obras demoradas') como SUSTANTIVAS ('qué retrasos hay', 'cuánto atraso tiene', 'qué demoras', 'cuántas obras incumplen plazo'). También cuando pregunten 'que obras no cumplen el cronograma', 'cuánto se atrasaron', 'fuera de plazo', 'sobre plazo', 'sin avance', 'qué no avanza', 'qué no termina'. Define 'excesivo' como >180 días tarde vs cronograma, o 3+ adendas de plazo, o cierre >365 días después de la fecha programada. IMPORTANTE: Cobertura limitada (~165 obras con datos INFOBRAS, no las 70K totales). Acepta `q` para acotar región/ciudad y `year` para acotar año.",
    parameters: {
      q: "string opcional — región/provincia/distrito para acotar",
      year: "número opcional — año del registro (ej: 2024)",
    },
    async run(args, ctx) {
      const q = asString(args.q);
      const year = asNumber(args.year);
      const data = await obrasRetrasadas(ctx.country, q, 5, year);
      return {
        data,
        formatted: fmtRetrasadas(data, ctx.country, q, year),
        obraIds: data.map((o) => o.id),
      };
    },
  },
];

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** Compact catalogue passed to the router prompt. */
export function toolsCatalogue(): string {
  return TOOLS.map(
    (t) =>
      `- ${t.name}: ${t.description}` +
      (Object.keys(t.parameters).length
        ? `\n    args: ${Object.entries(t.parameters)
            .map(([k, v]) => `${k} (${v})`)
            .join("; ")}`
        : "")
  ).join("\n");
}
