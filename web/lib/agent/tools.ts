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
  getObraResumen,
  type Country,
} from "@/lib/agent-kapso/queries";
import {
  fmtObras,
  fmtStats,
  fmtRankingContratistas,
  fmtRankingEntidades,
  fmtAdjudicacionDirecta,
  fmtInvestigacion,
  fmtInhabilitados,
  fmtMontoEnRiesgo,
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
      "Lista obras públicas filtradas por región/ciudad (q), año, alertas o método de contratación. Default 5 resultados ordenados por alertas y monto.",
    parameters: {
      q: "string opcional — nombre de región/provincia/distrito (ej: 'Piura', 'Lima Norte')",
      year: "número opcional — año del registro (ej: 2024)",
      red_flag: "boolean opcional — true para solo obras con alerta",
      procurement_method: "string opcional — 'direct' para adjudicación directa",
    },
    async run(args, ctx) {
      const filters = {
        country: ctx.country,
        q: asString(args.q),
        year: asNumber(args.year),
        red_flag: asBool(args.red_flag),
        procurement_method: asString(args.procurement_method),
        limit: 5,
      };
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
    description: "Resumen estadístico de obras del país en curso: total, alertas, monto total.",
    parameters: {},
    async run(_args, ctx) {
      const stats = await statsPorPais(ctx.country);
      if (!stats) return { data: null, formatted: "No hay datos disponibles para ese país." };
      return { data: stats, formatted: fmtStats({ ...stats, country: ctx.country }) };
    },
  },
  {
    name: "ranking_contratistas",
    description:
      "Top contratistas por monto total adjudicado o por número de alertas de riesgo. Si el usuario pidió una región/provincia previamente, pasa `q` para filtrar el ranking geográficamente.",
    parameters: {
      por: "string opcional — 'monto' (default) o 'alertas'",
      q: "string opcional — región/provincia/distrito para limitar el ranking (ej: 'Piura')",
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
    description: "Top entidades compradoras (ministerios, gobiernos regionales) con mayor número de obras.",
    parameters: {},
    async run(_args, ctx) {
      const data = await rankingEntidades(ctx.country, 5);
      return { data, formatted: fmtRankingEntidades(data, ctx.country) };
    },
  },
  {
    name: "adjudicacion_directa",
    description: "Obras adjudicadas directamente (sin licitación competitiva) que además tienen alerta de riesgo.",
    parameters: {},
    async run(_args, ctx) {
      const data = await adjudicacionDirectaAlertas(ctx.country, 5);
      return { data, formatted: fmtAdjudicacionDirecta(data, ctx.country), obraIds: data.map((o) => o.id) };
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
    description: "Lista de contratistas con sanción vigente que aún operan o tienen contratos activos.",
    parameters: {},
    async run(_args, ctx) {
      const data = await inhabilitadosVigentes(ctx.country, 8);
      return { data, formatted: fmtInhabilitados(data, ctx.country) };
    },
  },
  {
    name: "monto_en_riesgo",
    description: "Monto total acumulado de contratos marcados con alerta de riesgo en el país.",
    parameters: {},
    async run(_args, ctx) {
      const data = await montoEnRiesgo(ctx.country);
      return { data, formatted: fmtMontoEnRiesgo(data) };
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
