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

// ── Ordinal context ───────────────────────────────────────────────────────────

const ORDINAL_MAP: [RegExp, number][] = [
  [/\bel\s+primer[ao]?\b|\b#?1\b|\buno\b/i, 1],
  [/\bel\s+segund[ao]?\b|\b#?2\b|\bdos\b/i, 2],
  [/\bel\s+tercer[ao]?\b|\b#?3\b|\btres\b/i, 3],
  [/\bel\s+cuart[ao]?\b|\b#?4\b|\bcuatro\b/i, 4],
  [/\bel\s+quint[ao]?\b|\b#?5\b|\bcinco\b/i, 5],
  [/\b[uú]ltim[ao]\b/i, -1],
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

function extractYear(text: string): number | undefined {
  const m = text.match(YEAR_RE);
  if (m) return parseInt(m[1]);
  if (/\beste\s+año\b|\baño\s+actual\b|\baño\s+en\s+curso\b/i.test(text)) return THIS_YEAR;
  if (/\baño\s+pasado\b|\baño\s+anterior\b/i.test(text)) return THIS_YEAR - 1;
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

  // ── Country switch ──
  const newCountry = detectCountry(t);
  if (newCountry && /\bcambiar?\b|\bseleccionar?\b|\bquiero.*pa[ií]s\b/i.test(t)) {
    return { intent: "CAMBIAR_PAIS", country: newCountry };
  }
  const ACTION_KEYWORDS = /\bestad[ií]sticas?\b|\bresumen\b|\branking\b|\bobras?\b|\binhabilitados?\b|\badjudicaci[oó]n\b|\bmonto\b|\binvestigar?\b|\bcontratistas?\b|\bentidades?\b|\balertas?\b/i;
  if (newCountry && t.split(/\s+/).length <= 3 && !ACTION_KEYWORDS.test(t)) {
    return { intent: "CAMBIAR_PAIS", country: newCountry };
  }

  const country: Country = newCountry ?? sessionCountry;

  // ── Gratitude / farewell → deterministic, no LLM ──
  if (/^\s*(gracias|thank[s]?|ok\s+gracias|okey|dale|entendido|perfecto|listo|claro|genial|excelente|bu[eé]n[ií]simo|adi[oó]s|hasta\s+luego|bye|chau[o]?|👍|🙏)\s*[!.?]*\s*$/i.test(t)) {
    return { intent: "AGRADECIMIENTO", country };
  }

  // ── Greeting / help ──
  if (/^\s*(hola|holi|hey|hi|buenos?\s+d[ií]as?|buenas?\s+tardes?|buenas?\s+noches?|buenas?|saludos?|qué\s+tal|como\s+est[aá]s?|ayuda|comandos|\?{2,}|qu[eé]\s+puedes|qu[eé]\s+haces|inicio|empezar|start|men[uú])\s*[!.?,]*\s*$/i.test(t)) {
    return { intent: "AYUDA", country };
  }

  // ── Proximity ──
  if (/\bcerca(n[ao]s?)?\b|\bpr[oó]xim[ao]s?\b|\bm[aá]s\s+cercana\b|\bm[ií]\s+ubicaci[oó]n\b|\bcercan[ií]a\b/i.test(t)) {
    return { intent: "BUSCAR_CERCANOS", country };
  }

  // ── Context detail: "el primero", "el segundo" ──
  if (/\bel\s+(primer|segund|tercer|cuart|quint|[uú]ltim)[ao]?\b|\bm[aá]s\s+(detalle|info)\b/i.test(t)) {
    const pos = extractContextPosition(t);
    if (pos !== null) return { intent: "CONTEXTO_DETALLE", country, contextPosition: pos };
  }

  // ── Detail by ID ──
  const idMatch = t.match(/\b(?:detalle|ver|obra|id)\s*[:#]?\s*(\d+)\b/i);
  if (idMatch) {
    return { intent: "VER_DETALLE", country, obraId: parseInt(idMatch[1]) };
  }

  // ── Investigate contractor ──
  const rucMatch = t.match(RUC_RE);
  if (rucMatch && /\bcontratista\b|\bempresa\b|\bruc\b|\binvestigar?\b/i.test(t)) {
    return { intent: "INVESTIGAR_CONTRATISTA", country, ruc: rucMatch[1] };
  }
  if (/\binvestigar?\b/i.test(t)) {
    const nameMatch = t.match(/investiga[r]?\s+(.+)/i);
    return { intent: "INVESTIGAR_CONTRATISTA", country, contratista: nameMatch?.[1]?.trim() };
  }

  // ── Inhabilitados ──
  if (/\binhabilitad[oa]s?\b|\bsancionad[oa]s?\b|\bpenalidad\b/i.test(t)) {
    return { intent: "INHABILITADOS", country };
  }

  // ── Adjudicación directa ──
  if (/\badjudicaci[oó]n\s+direct[ao]\b|\bcontrat[ao]s?\s+direct[ao]s?\b/i.test(t)) {
    return { intent: "ADJUDICACION_DIRECTA", country };
  }

  // ── Ranking entidades ──
  if (/\branking\s+entidades?\b|\bentidades?\s+compradoras?\b|\btop\s+entidades?\b|\bmayores?\s+compradores?\b/i.test(t)) {
    return { intent: "RANKING_ENTIDADES", country };
  }

  // ── Ranking contratistas ──
  if (/\branking\b|\bmayores?\s+contratistas?\b|\btop\b.*\bcontratistas?\b/i.test(t)) {
    return { intent: "RANKING_CONTRATISTAS", country };
  }

  // ── Monto en riesgo ──
  if (/\bmonto\s+en\s+riesgo\b|\bcuanto\s+est[aá]\s+en\s+riesgo\b|\bdinero\s+en\s+riesgo\b/i.test(t)) {
    return { intent: "MONTO_EN_RIESGO", country };
  }

  // ── Stats ──
  if (/\bestad[ií]sticas?\b|\bresumen\b|\bcuantas?\s+obras\b|\bpanorama\b/i.test(t)) {
    return { intent: "STATS", country };
  }

  // ── Buscar obras ──
  // Trigger: explicit obra keywords (all plural forms) OR a year extracted.
  // Geography goes into q — DB searches all location columns, no hardcoded lists.
  const year = extractYear(t);
  if (
    /\bobras?\b|\bproyectos?\b|\bconcursos?\b|\blicitaci[oó]nes?\b|\badjudicaci[oó]nes?\b|\bcontratos?\b|\bconstrucci[oó]n\b/i.test(t) ||
    year !== undefined
  ) {
    const filters: BuscarObrasFilters = { country };
    if (year) filters.year = year;
    if (/\balerta[s]?\b|\brisk\b|\bflag\b|\bsospech[oa]\b/i.test(t)) filters.red_flag = true;
    if (/\bdirect[ao]?\b/i.test(t) && !/adjudicaci[oó]n\s+directa/i.test(t)) {
      filters.procurement_method = "direct";
    }
    const q = buildSearchQuery(t, year);
    if (q) filters.q = q;
    return { intent: "BUSCAR_OBRAS", country, filters };
  }

  return { intent: "PREGUNTA_LIBRE", country };
}
