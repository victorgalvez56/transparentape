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
  compararRegiones,
  type Country,
  type BuscarObrasFilters,
} from "@/lib/agent-kapso/queries";
import { classifyQuery } from "@/lib/agent-kapso/places";
import { lookupDefinition, fmtDefinition, listKnownTerms } from "@/lib/agent-kapso/definitions";
import { fetchStreetview, fetchAiAnalysis } from "@/lib/agent-kapso/streetview";
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
  fmtComparativa,
} from "@/lib/agent-kapso/wa-format";

export interface ToolContext {
  country: Country;
}

export type Attachment =
  | {
      type: "streetview";
      obra_id: number;
      before: { url: string; date: string | null } | null;
      after: { url: string; date: string | null } | null;
      has_history: boolean;
    }
  | {
      type: "ai_analysis";
      obra_id: number;
      score: number | null;
      description: string | null;
      before: { url: string; date: string | null } | null;
      after: { url: string; date: string | null } | null;
      has_history: boolean;
    };

export interface ToolResult {
  data: unknown;
  formatted: string;
  /** IDs of obras returned, if applicable — webhook stores in session for ordinal follow-ups. */
  obraIds?: number[];
  /** Structured payloads the web client renders inline (images, slider, score badge). */
  attachments?: Attachment[];
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
      "Lista obras públicas filtradas por lugar, empresa contratista, sector (saneamiento/salud/educación/transporte/etc.), año, alertas o método de contratación. Default 5 resultados ordenados por alertas y monto. Acepta `country_override` (ISO 2 letras) cuando el usuario pregunta por otro país sin cambiar la sesión.",
    parameters: {
      q: "string opcional — texto libre con lugar, sector y/o empresa (ej: 'Piura', 'saneamiento en Lima', 'Cosapi'). Se clasifica automáticamente.",
      q_geo: "string opcional — solo región/provincia/distrito si quieres restringir geo explícitamente",
      q_supplier: "string opcional — solo nombre de empresa contratista si quieres restringir por empresa",
      q_sector: "string opcional — sector (saneamiento, salud, educacion, vial, vivienda, etc.) — ILIKE en descripción de obra",
      year: "número opcional — año del registro (ej: 2024)",
      red_flag: "boolean opcional — true para solo obras con alerta",
      procurement_method: "string opcional — 'direct' para adjudicación directa",
      country_override: "string opcional — código ISO 2 letras si el usuario pide obras de otro país (ej: 'CL' para 'obras en Chile')",
    },
    async run(args, ctx) {
      const country = pickCountry(args.country_override, ctx.country);
      const filters: BuscarObrasFilters = {
        country,
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
          if (c.q) filters.q = c.q;
          // If classifyQuery returned {}, the raw was noise — leave q empty
          // so we return the top of the country instead of an ILIKE that
          // matches zero rows.
        }
      }
      const data = await buscarObras(filters);
      return {
        data,
        formatted: fmtObras(data, country, undefined, filters),
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
      "Top contratistas. Usa `por='alertas'` cuando el usuario menciona riesgo, corrupción, sanciones, 'que más roban', 'sospechosos', 'castigados'. Usa `por='monto'` (default) cuando habla de tamaño económico, 'los más grandes', 'mayor adjudicación'. Si la conversación ya tenía una región, pasa `q` para filtrar geográficamente. Acepta `country_override` para consultar otro país sin cambiar sesión.",
    parameters: {
      por: "string opcional — 'monto' (default, por tamaño económico) o 'alertas' (por número de red flags)",
      q: "string opcional — región/provincia/distrito para limitar el ranking",
      country_override: "string opcional — ISO 2 letras (ej: 'CL' para ranking de Chile)",
    },
    async run(args, ctx) {
      const country = pickCountry(args.country_override, ctx.country);
      const por = (asString(args.por) === "alertas" ? "alertas" : "monto") as "monto" | "alertas";
      const q = asString(args.q);
      const data = await rankingContratistas(country, por, 5, q);
      return { data, formatted: fmtRankingContratistas(data, country, q) };
    },
  },
  {
    name: "ranking_entidades",
    description: "Top entidades compradoras (ministerios, gobiernos regionales) con mayor número de obras. Acepta `q` para filtrar región y `country_override` para otro país.",
    parameters: {
      q: "string opcional — región/provincia/distrito",
      country_override: "string opcional — ISO 2 letras",
    },
    async run(args, ctx) {
      const country = pickCountry(args.country_override, ctx.country);
      const q = asString(args.q);
      const data = await rankingEntidades(country, 5, q);
      return { data, formatted: fmtRankingEntidades(data, country, q) };
    },
  },
  {
    name: "adjudicacion_directa",
    description: "Obras adjudicadas directamente (sin licitación competitiva) que además tienen alerta. Acepta `q` para filtrar región y `country_override` para otro país.",
    parameters: {
      q: "string opcional — región/provincia/distrito",
      country_override: "string opcional — ISO 2 letras",
    },
    async run(args, ctx) {
      const country = pickCountry(args.country_override, ctx.country);
      const q = asString(args.q);
      const data = await adjudicacionDirectaAlertas(country, 5, q);
      return { data, formatted: fmtAdjudicacionDirecta(data, country, q), obraIds: data.map((o) => o.id) };
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
    description: "Lista de contratistas con sanción vigente que aún tienen contratos activos. Acepta `q` para filtrar región y `country_override` para otro país.",
    parameters: {
      q: "string opcional — región/provincia/distrito",
      country_override: "string opcional — ISO 2 letras",
    },
    async run(args, ctx) {
      const country = pickCountry(args.country_override, ctx.country);
      const q = asString(args.q);
      const data = await inhabilitadosVigentes(country, 8, q);
      return { data, formatted: fmtInhabilitados(data, country, q) };
    },
  },
  {
    name: "monto_en_riesgo",
    description: "Monto total acumulado de contratos marcados con alerta de riesgo. Acepta `q` para limitar a una región y `country_override` para otro país.",
    parameters: {
      q: "string opcional — región/provincia/distrito",
      country_override: "string opcional — ISO 2 letras",
    },
    async run(args, ctx) {
      const country = pickCountry(args.country_override, ctx.country);
      const q = asString(args.q);
      const data = await montoEnRiesgo(country, q);
      return { data, formatted: fmtMontoEnRiesgo(data, q) };
    },
  },
  {
    name: "lookup_definition",
    description:
      "USA ESTE TOOL cuando el usuario pregunta qué es / qué significa / cómo se define / explica un término del lenguaje de contrataciones públicas. Ejemplos: 'qué es adjudicación directa', 'qué significa OCDS', 'explícame red flag', 'qué es un consorcio'. NO uses este tool para preguntas sobre obras específicas o contratistas — solo para definiciones de conceptos generales.",
    parameters: {
      term: "string requerido — término a definir (ej: 'adjudicación directa', 'OCDS', 'red flag')",
    },
    async run(args) {
      const term = asString(args.term);
      if (!term) {
        return {
          data: null,
          formatted:
            "Especifica el término a definir. Conozco: " +
            listKnownTerms().slice(0, 8).join(", ") +
            "...",
        };
      }
      const def = lookupDefinition(term);
      if (!def) {
        const sample = listKnownTerms().slice(0, 6).join(", ");
        return {
          data: null,
          formatted:
            `No tengo definición para "${term}".\n\nConozco términos como: ${sample}...\n\n` +
            `_Escribe "qué es <término>" para ver una definición._`,
        };
      }
      return { data: def, formatted: fmtDefinition(def) };
    },
  },
  {
    name: "comparar_regiones",
    description:
      "USA ESTE TOOL cuando el usuario quiere COMPARAR dos o más regiones, provincias o distritos lado a lado. Disparadores: 'compara X vs Y', 'X versus Y', 'X frente a Y', 'diferencia entre X y Y', 'compara obras de Lima y Cusco'. Devuelve obras totales, monto contratado, % alertas, retrasos, top contratista y top entidad para cada región. Acepta 2 a 4 regiones. NO uses este tool si el usuario menciona una sola región — usa buscar_obras o stats_pais.",
    parameters: {
      regiones: "string requerido — regiones separadas por coma o ' vs ' (ej: 'Lima, Cusco' o 'Arequipa vs Trujillo')",
    },
    async run(args, ctx) {
      // Accept array form (router emits this) or string form (regex
      // fast-path may pass a comma-joined list when the LLM is bypassed).
      let regiones: string[] = [];
      if (Array.isArray(args.regiones)) {
        regiones = (args.regiones as unknown[]).filter((x): x is string => typeof x === "string");
      } else {
        const s = asString(args.regiones);
        if (s) {
          regiones = s
            .split(/\s*,\s*|\s+(?:vs\.?|versus|frente\s+a|contra|y|con)\s+/i)
            .map((r) => r.trim())
            .filter((r) => r.length >= 2);
        }
      }
      regiones = regiones.slice(0, 4);
      if (regiones.length < 2) {
        return {
          data: null,
          formatted:
            "Necesito al menos dos regiones para comparar. Indícame ambas: por ejemplo, \"Lima frente a Cusco\".",
        };
      }
      try {
        const data = await compararRegiones(ctx.country, regiones);
        return { data, formatted: fmtComparativa(data, ctx.country) };
      } catch (e) {
        console.error("[tool comparar_regiones] DB error:", e instanceof Error ? e.message : e);
        return {
          data: null,
          formatted:
            "No pude armar la comparativa en este momento. Prueba con dos regiones más conocidas (por ejemplo, \"Lima vs Arequipa\").",
        };
      }
    },
  },
  {
    name: "obras_retrasadas",
    description:
      "USA ESTE TOOL cuando el usuario pregunta sobre retrasos, atrasos, demoras, paralizaciones, estancamientos o incumplimientos de plazo en obras públicas. Acepta tanto formas adjetivas ('obras retrasadas', 'obras atrasadas', 'obras paralizadas', 'obras estancadas', 'obras demoradas') como SUSTANTIVAS ('qué retrasos hay', 'cuánto atraso tiene', 'qué demoras', 'cuántas obras incumplen plazo'). También cuando pregunten 'que obras no cumplen el cronograma', 'cuánto se atrasaron', 'fuera de plazo', 'sobre plazo', 'sin avance', 'qué no avanza', 'qué no termina'. Define 'excesivo' como >180 días tarde con contrato activo, o 3+ modificaciones de plazo (INFOBRAS), o cierre >365 días después de la fecha programada. Cobertura amplia vía OCDS contract_end + status='active' (~10K obras), enriquecida con INFOBRAS (avance físico, supervisor) cuando disponible (~579 obras, solo PE). Acepta `q` para acotar región/ciudad, `year` para año y `country_override` para otro país.",
    parameters: {
      q: "string opcional — región/provincia/distrito para acotar",
      year: "número opcional — año del registro (ej: 2024)",
      country_override: "string opcional — ISO 2 letras",
    },
    async run(args, ctx) {
      const country = pickCountry(args.country_override, ctx.country);
      const q = asString(args.q);
      const year = asNumber(args.year);
      try {
        const data = await obrasRetrasadas(country, q, 5, year);
        return {
          data,
          formatted: fmtRetrasadas(data, country, q, year),
          obraIds: data.map((o) => o.id),
        };
      } catch (e) {
        // Query can fail when the infobras_full table is missing in a fresh
        // DB or when statement_timeout fires on a slow geo predicate. The
        // LEFT JOIN handles missing INFOBRAS rows gracefully, so this catch
        // is for hard DB errors only — keep the message specific so the
        // generic "problema técnico" adaptive fallback doesn't fire.
        console.error("[tool obras_retrasadas] DB error:", e instanceof Error ? e.message : e);
        return {
          data: null,
          formatted:
            "No pude consultar el cronograma de obras en este momento. " +
            "Prueba *obras con alertas* o *ranking contratistas* para otro ángulo.",
        };
      }
    },
  },
  {
    name: "streetview_obra",
    description:
      "USA ESTE TOOL cuando el usuario pide ver/mostrar la imagen, foto, Street View, o el antes-y-después de una OBRA ESPECÍFICA ya identificada. NO uses este tool para hacer análisis o veredicto — para eso usa `analizar_obra`. Requiere un `id` numérico de obra. El web cliente renderiza un comparador deslizante (antes/después) con las URLs devueltas. No corre Claude Vision — es rápido (~150ms cache hit, ~1.5s miss).",
    parameters: {
      id: "número requerido — ID numérico de la obra (de un buscar_obras previo)",
    },
    async run(args) {
      const id = asNumber(args.id);
      if (!id) return { data: null, formatted: "Falta el ID de la obra para mostrar Street View." };
      const sv = await fetchStreetview(id);
      if (!sv.ok) {
        if (sv.status === 404) return { data: null, formatted: "No encontré esa obra." };
        if (sv.status === 422) return { data: null, formatted: "Esa obra no tiene coordenadas registradas." };
        if (sv.status === 502) return { data: null, formatted: "Google no tiene Street View en esa ubicación." };
        return { data: null, formatted: "No pude obtener Street View en este momento." };
      }
      const d = sv.data;
      const text = d.has_history
        ? `📸 Comparativa Street View de la obra #${d.id}${d.before?.date ? ` (antes: ${d.before.date})` : ""}${d.after?.date ? ` (después: ${d.after.date})` : ""}.`
        : `📍 Vista actual de la obra #${d.id}${d.after?.date ? ` (${d.after.date})` : ""}. Sin histórico Street View en esta ubicación.`;
      return {
        data: d,
        formatted: text,
        obraIds: [d.id],
        attachments: [
          {
            type: "streetview",
            obra_id: d.id,
            before: d.before,
            after: d.after,
            has_history: d.has_history,
          },
        ],
      };
    },
  },
  {
    name: "analizar_obra",
    description:
      "USA ESTE TOOL cuando el usuario pide un ANÁLISIS, veredicto, opinión, comparativa o evidencia visual de una obra: 'analiza la obra #5', '¿se ejecutó realmente?', '¿hay evidencia?', '¿qué opinas de la obra?'. Corre Claude Vision sobre las imágenes Street View antes/después y devuelve un score (0-100) + descripción + URLs. Más lento (~4s) y costoso — NO lo uses si solo piden ver la imagen (para eso `streetview_obra`). Requiere `id` numérico.",
    parameters: {
      id: "número requerido — ID numérico de la obra",
    },
    async run(args) {
      const id = asNumber(args.id);
      if (!id) return { data: null, formatted: "Falta el ID de la obra para analizar." };
      const ai = await fetchAiAnalysis(id);
      if (!ai.ok) {
        if (ai.status === 404) return { data: null, formatted: "No encontré esa obra o no hay imágenes disponibles." };
        if (ai.status === 422) return { data: null, formatted: "Esa obra no tiene coordenadas o Street View útil." };
        return { data: null, formatted: "No pude completar el análisis con IA. Intenta de nuevo en un momento." };
      }
      const d = ai.data;
      const sv = d.streetview;
      const verdict =
        d.score == null ? "" : d.score <= 30 ? "🔴 RIESGO ALTO" : d.score <= 60 ? "🟡 DUDOSO" : "🟢 OK";
      const scorePart = d.score != null ? ` · ${verdict} (${d.score}/100)` : "";
      const text = d.description
        ? `🔍 Análisis IA de la obra #${id}${scorePart}\n\n"${d.description}"`
        : `Imágenes obtenidas para la obra #${id}, pero no hay análisis IA disponible (puede faltar la clave de Claude o el SV es de baja calidad).`;
      return {
        data: d,
        formatted: text,
        obraIds: [id],
        attachments: [
          {
            type: "ai_analysis",
            obra_id: id,
            score: d.score,
            description: d.description,
            before: sv.beforeUrl ? { url: sv.beforeUrl, date: sv.beforeDate } : null,
            after: { url: sv.afterUrl, date: sv.afterDate },
            has_history: sv.hasHistory,
          },
        ],
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
