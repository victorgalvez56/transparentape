import type { Country } from "./session";
import type { BuscarObrasFilters } from "./queries";

export type Intent =
  | "CAMBIAR_PAIS"
  | "BUSCAR_OBRAS"
  | "BUSCAR_CERCANOS"
  | "VER_DETALLE"
  | "CONTEXTO_DETALLE"
  | "STATS"
  | "MONTO_EN_RIESGO"
  | "RANKING_CONTRATISTAS"
  | "RANKING_ENTIDADES"
  | "ADJUDICACION_DIRECTA"
  | "INVESTIGAR_CONTRATISTA"
  | "INHABILITADOS"
  | "AYUDA"
  | "AGRADECIMIENTO"
  | "PREGUNTA_LIBRE";

export interface ParsedIntent {
  intent: Intent;
  country?: Country;
  filters?: BuscarObrasFilters;
  obraId?: number;
  contextPosition?: number; // 1-based index into session.lastResultIds; -1 = last
  contratista?: string;
  ruc?: string;
}

// ── Text normalization ────────────────────────────────────────────────────────
// JS regex \b is ASCII-only. Without normalization, accented characters break
// word boundary matching: \bperu\b fails on "Perú" because ú is not \w.
// Strip combining diacritics + lowercase so all regex tests work uniformly.
// Original text is preserved for q/extraction; only matching uses normalized.

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ── Ordinal context ───────────────────────────────────────────────────────────

const ORDINAL_MAP: [RegExp, number][] = [
  [/\bel\s+primer[ao]?\b|\b#?1\b|\buno\b/i, 1],
  [/\bel\s+segund[ao]?\b|\b#?2\b|\bdos\b/i, 2],
  [/\bel\s+tercer[ao]?\b|\b#?3\b|\btres\b/i, 3],
  [/\bel\s+cuart[ao]?\b|\b#?4\b|\bcuatro\b/i, 4],
  [/\bel\s+quint[ao]?\b|\b#?5\b|\bcinco\b/i, 5],
  [/\bultim[ao]\b/i, -1],
];

function extractContextPosition(text: string): number | null {
  for (const [re, pos] of ORDINAL_MAP) {
    if (re.test(text)) return pos;
  }
  return null;
}

// ── Country detection ─────────────────────────────────────────────────────────

const COUNTRY_PATTERNS: [RegExp, Country][] = [
  [/\bper[uú]\b/i, "PE"],
  [/\bchile\b|\bchileno\b/i, "CL"],
  [/\bcolombia\b/i, "CO"],
  [/\bm[eé]xico\b|\bmexicano\b/i, "MX"],
  [/\bargentina\b/i, "AR"],
  [/\bbrasil\b/i, "BR"],
];

export function detectCountry(text: string): Country | null {
  for (const [re, code] of COUNTRY_PATTERNS) {
    if (re.test(text)) return code;
  }
  return null;
}

// ── Year extraction ───────────────────────────────────────────────────────────

const YEAR_RE = /\b(20\d{2})\b/;
const RUC_RE = /\b(\d{8,12})\b/;
const THIS_YEAR = new Date().getFullYear();

// Expects ASCII-normalized input ("año" → "ano")
function extractYear(text: string): number | undefined {
  const m = text.match(YEAR_RE);
  if (m) return parseInt(m[1]);
  if (/\beste\s+ano\b|\bano\s+actual\b|\bano\s+en\s+curso\b/i.test(text)) return THIS_YEAR;
  if (/\bano\s+pasado\b|\bano\s+anterior\b/i.test(text)) return THIS_YEAR - 1;
  return undefined;
}

// ── Free-text query builder ───────────────────────────────────────────────────
// Strip intent/filter keywords, leaving geographic + descriptive terms for DB search.
// No hardcoded place lists — the DB finds the match across all location columns.

// Prepositions like "de/del/de la" are intentionally kept — they're part of
// Latin American place names (Valle del Colca, San Juan de Lurigancho, etc.)
const STOPWORDS_RE = /\b(obras?|proyectos?|licitaci[oó]nes?|concursos?|contratos?|adjudicaci[oó]nes?|construcci[oó]n|alertas?|riesgos?|sospechosos?|este\s+año|año\s+pasado|año\s+anterior|año\s+actual|en\s+curso|cu[aá]les?|qu[eé]|cu[aá]ntos?|fueron|son\s+las|hay|existen?|tienen?|muestra|dame|dime|busca|busco|quiero|mostrar|necesito|saber|ver\s+las|ver\s+los|con\s+alerta|directas?|en|con|por|para|sin|sobre)\b/gi;

function buildSearchQuery(text: string, _year: number | undefined): string | undefined {
  // Normalize whitespace first so edge trims work correctly
  const step1 = text
    .replace(/\b20\d{2}\b/g, "")
    .replace(STOPWORDS_RE, "")
    .replace(/[¿¡!?.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Strip dangling articles/prepositions at edges only — NOT mid-string.
  // "Piura de" → "Piura"  but  "Valle del Colca" stays intact.
  const cleaned = step1
    .replace(/^(de[l]?|la|las|los|el|al|un|una)\s+/gi, "")
    .replace(/\s+(de[l]?|la|las|los|el|al|un|una)$/gi, "")
    .trim();

  if (!cleaned || cleaned.length < 2) return undefined;
  return cleaned.slice(0, 80);
}

// ── Main intent parser ────────────────────────────────────────────────────────

export function parseIntent(text: string, sessionCountry: Country): ParsedIntent {
  const t = text.trim();
  // tn = ASCII-normalized for regex matching (\b is ASCII-only in JS).
  // Original t is still used for q extraction so DB ILIKE preserves accents/case.
  const tn = normalize(t);

  // ── Country switch ──
  const newCountry = detectCountry(tn);
  if (newCountry && /\bcambiar?\b|\bseleccionar?\b|\bquiero.*pais\b/i.test(tn)) {
    return { intent: "CAMBIAR_PAIS", country: newCountry };
  }
  const ACTION_KEYWORDS = /\bestadisticas?\b|\bresumen\b|\branking\b|\bobras?\b|\binhabilitados?\b|\badjudicaci[oó]n\b|\bmonto\b|\binvestigar?\b|\bcontratistas?\b|\bentidades?\b|\balertas?\b/i;
  if (newCountry && tn.split(/\s+/).length <= 3 && !ACTION_KEYWORDS.test(tn)) {
    return { intent: "CAMBIAR_PAIS", country: newCountry };
  }

  const country: Country = newCountry ?? sessionCountry;

  // ── Gratitude / farewell → deterministic, no LLM ──
  if (/^\s*(gracias|thank[s]?|ok\s+gracias|okey|dale|entendido|perfecto|listo|claro|genial|excelente|buen[ií]simo|adios|hasta\s+luego|bye|chau[o]?|👍|🙏)\s*[!.?]*\s*$/i.test(tn)) {
    return { intent: "AGRADECIMIENTO", country };
  }

  // ── Greeting / help ──
  if (/^\s*(hola|holi|hey|hi|buenos?\s+dias?|buenas?\s+tardes?|buenas?\s+noches?|buenas?|saludos?|que\s+tal|como\s+estas?|ayuda|comandos|\?{2,}|que\s+puedes(?:\s+\w+)?|que\s+haces|que\s+sabes|inicio|empezar|start|menu)\s*[!.?,]*\s*$/i.test(tn)) {
    return { intent: "AYUDA", country };
  }

  // ── Proximity ──
  if (/\bcerca(n[ao]s?)?\b|\bproxim[ao]s?\b|\bmas\s+cercana\b|\bmi\s+ubicacion\b|\bcercania\b/i.test(tn)) {
    return { intent: "BUSCAR_CERCANOS", country };
  }

  // ── Context detail: "el primero", "#5", "uno", "más detalle" ──
  // Gate is presence of any ordinal — checked directly via extractContextPosition.
  // "más detalle/info" without ordinal → default to position 1 (first result).
  const pos = extractContextPosition(tn);
  if (pos !== null) {
    return { intent: "CONTEXTO_DETALLE", country, contextPosition: pos };
  }
  if (/\bmas\s+(detalle|info|informacion)\b/i.test(tn)) {
    return { intent: "CONTEXTO_DETALLE", country, contextPosition: 1 };
  }

  // ── Detail by ID ──
  const idMatch = tn.match(/\b(?:detalle|ver|obra|id)\s*[:#]?\s*(\d+)\b/i);
  if (idMatch) {
    return { intent: "VER_DETALLE", country, obraId: parseInt(idMatch[1]) };
  }

  // ── Investigate contractor ──
  const rucMatch = tn.match(RUC_RE);
  if (rucMatch && /\bcontratista\b|\bempresa\b|\bruc\b|\binvestigar?\b/i.test(tn)) {
    return { intent: "INVESTIGAR_CONTRATISTA", country, ruc: rucMatch[1] };
  }
  if (/\binvestigar?\b/i.test(tn)) {
    // Use original t for name to preserve case/accents in DB ILIKE
    const nameMatch = t.match(/investiga[r]?\s+(.+)/i);
    return { intent: "INVESTIGAR_CONTRATISTA", country, contratista: nameMatch?.[1]?.trim() };
  }

  // ── Inhabilitados ──
  if (/\binhabilitad[oa]s?\b|\bsancionad[oa]s?\b|\bpenalidad\b/i.test(tn)) {
    return { intent: "INHABILITADOS", country };
  }

  // ── Adjudicación directa (plural OK) ──
  if (/\badjudicaci(?:on|ones)\s+direct[ao]s?\b|\bcontrat[ao]s?\s+direct[ao]s?\b/i.test(tn)) {
    return { intent: "ADJUDICACION_DIRECTA", country };
  }

  // ── Ranking entidades ──
  if (/\branking\s+entidades?\b|\bentidades?\s+compradoras?\b|\btop\s+entidades?\b|\bmayores?\s+compradores?\b/i.test(tn)) {
    return { intent: "RANKING_ENTIDADES", country };
  }

  // ── Ranking contratistas ──
  if (/\branking\b|\bmayores?\s+contratistas?\b|\btop\b.*\bcontratistas?\b/i.test(tn)) {
    return { intent: "RANKING_CONTRATISTAS", country };
  }

  // ── Monto en riesgo ──
  if (/\bmonto\s+en\s+riesgo\b|\bcuanto\s+esta\s+en\s+riesgo\b|\bdinero\s+en\s+riesgo\b/i.test(tn)) {
    return { intent: "MONTO_EN_RIESGO", country };
  }

  // ── Stats ──
  if (/\bestadisticas?\b|\bresumen\b|\bcuantas?\s+obras\b|\bpanorama\b/i.test(tn)) {
    return { intent: "STATS", country };
  }

  // ── Buscar obras ──
  // Trigger: explicit obra keywords (all plural forms) OR a year extracted.
  // Geography goes into q — DB searches all location columns, no hardcoded lists.
  const year = extractYear(tn);
  if (
    /\bobras?\b|\bproyectos?\b|\bconcursos?\b|\blicitaciones?\b|\badjudicaciones?\b|\bcontratos?\b|\bconstruccion\b/i.test(tn) ||
    year !== undefined
  ) {
    const filters: BuscarObrasFilters = { country };
    if (year) filters.year = year;
    if (/\balerta[s]?\b|\brisk\b|\bflag\b|\bsospech[oa]\b/i.test(tn)) filters.red_flag = true;
    if (/\bdirect[ao]?\b/i.test(tn) && !/adjudicacion\s+directa/i.test(tn)) {
      filters.procurement_method = "direct";
    }
    const q = buildSearchQuery(t, year);
    if (q) filters.q = q;
    return { intent: "BUSCAR_OBRAS", country, filters };
  }

  return { intent: "PREGUNTA_LIBRE", country };
}
