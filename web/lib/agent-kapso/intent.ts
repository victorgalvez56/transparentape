import type { Country } from "./session";
import type { BuscarObrasFilters } from "./queries";
import { classifyQuery } from "./places";

// Intents kept as regex fast-path are limited to high-confidence patterns
// (greetings, gratitude, country switch, ordinal/ID detail, proximity,
// search-obras with explicit "obras|proyectos|..." keyword, and explicit
// "investigar X"). Verbs like "ranking", "stats", "inhabilitados",
// "monto en riesgo", "adjudicación directa" no longer have a regex
// shortcut — they fall through to PREGUNTA_LIBRE → LLM router → TOOL_CALL.
// This is what unlocks carry-forward: "obras en Piura" → "y el ranking?"
// now reaches the tool layer with full chat history, instead of being
// short-circuited to a national ranking.
export type Intent =
  | "CAMBIAR_PAIS"
  | "BUSCAR_OBRAS"
  | "BUSCAR_CERCANOS"
  | "VER_DETALLE"
  | "CONTEXTO_DETALLE"
  | "INVESTIGAR_CONTRATISTA"
  | "AYUDA"
  | "AGRADECIMIENTO"
  | "PREGUNTA_LIBRE";

export interface ParsedIntent {
  intent: Intent;
  country?: Country;
  filters?: BuscarObrasFilters;
  obraId?: number;
  contextPosition?: number; // 1-based index into session.lastResultIds; -1 = last
  contextCount?: number;    // when >1, return a slice (los primeros 3 / los ultimos 5)
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

// Bare digits no longer count as ordinals — must be prefixed with "#",
// an article ("el/la"), or a context word ("obra/opción/item/número").
// Prevents "5+5" or "tengo 3 hijos" from being parsed as ordinal positions.
// Index-only inputs ("1", "2") are still handled by resolveIndexFromText
// in the webhook when lastSuggestions are present.
const ORDINAL_CTX = "(?:el|la|obra|opci[oó]n|item|n[uú]mero)";
const ORDINAL_MAP: [RegExp, number][] = [
  [new RegExp(`\\b(?:el\\s+)?primer[ao]\\b|\\b#1\\b|\\b${ORDINAL_CTX}\\s+1\\b|\\buno\\b`, "i"), 1],
  [new RegExp(`\\b(?:el\\s+)?segund[ao]\\b|\\b#2\\b|\\b${ORDINAL_CTX}\\s+2\\b|\\bdos\\b`, "i"), 2],
  [new RegExp(`\\b(?:el\\s+)?tercer[ao]\\b|\\b#3\\b|\\b${ORDINAL_CTX}\\s+3\\b|\\btres\\b`, "i"), 3],
  [new RegExp(`\\b(?:el\\s+)?cuart[ao]\\b|\\b#4\\b|\\b${ORDINAL_CTX}\\s+4\\b|\\bcuatro\\b`, "i"), 4],
  [new RegExp(`\\b(?:el\\s+)?quint[ao]\\b|\\b#5\\b|\\b${ORDINAL_CTX}\\s+5\\b|\\bcinco\\b`, "i"), 5],
  [/\b[uú]ltim[ao]\b/i, -1],
];

function extractContextPosition(text: string): number | null {
  for (const [re, pos] of ORDINAL_MAP) {
    if (re.test(text)) return pos;
  }
  return null;
}

// Plural ordinal: "los primeros 3", "primeras 3 obras", "3 primeros",
// "los últimos 5", "ultimas 2". Returns the head/tail direction (1 / -1)
// plus how many to slice. Range capped at 10 — anything larger is
// probably not an ordinal reference at all.
function extractPluralOrdinal(text: string): { pos: 1 | -1; count: number } | null {
  const m = text.match(
    /\b(?:los\s+|las\s+)?(?:(primer|ultim)[oa]s\s+(\d{1,2})|(\d{1,2})\s+(primer|ultim)[oa]s)\b/i
  );
  if (!m) return null;
  const direction = (m[1] || m[4]).toLowerCase();
  const count = parseInt(m[2] || m[3], 10);
  if (!Number.isFinite(count) || count < 2 || count > 10) return null;
  return { pos: direction.startsWith("primer") ? 1 : -1, count };
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
// RUC strict: 11 digits (Peru standard). Phone numbers (9 digits) won't match.
// Explicit "ruc:" keyword still accepts 8-12 to support Chile RUT (CL) etc.
const RUC_RE = /\b(\d{11})\b/;
const RUC_KW_RE = /\bruc\s*:?\s*(\d{8,12})\b/i;
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
  // Accepts repeated greetings ("hola hola hola"), 👋 emoji alone, and
  // emoji + word combinations so the onboarding flow still kicks in for
  // common warm-up patterns.
  if (
    /^\s*(?:(?:hola|holi|hey|hi|👋|buenos?\s+dias?|buenas?\s+tardes?|buenas?\s+noches?|buenas?|saludos?|que\s+tal|como\s+estas?|ayuda|comandos|\?{2,}|que\s+puedes(?:\s+\w+)?|que\s+haces|que\s+sabes|inicio|empezar|start|menu)\s*[!.?,]*\s*)+$/i.test(
      tn
    )
  ) {
    return { intent: "AYUDA", country };
  }

  // ── Proximity ──
  if (/\bcerca(n[ao]s?)?\b|\bproxim[ao]s?\b|\bmas\s+cercana\b|\bmi\s+ubicacion\b|\bcercania\b/i.test(tn)) {
    return { intent: "BUSCAR_CERCANOS", country };
  }

  // ── Context detail (plural): "los primeros 3", "ultimas 2" ──
  // Check before singular ordinal because "primeros 3" would otherwise
  // match `\bprimer[ao]\b` and lose the count.
  const plural = extractPluralOrdinal(tn);
  if (plural) {
    return {
      intent: "CONTEXTO_DETALLE",
      country,
      contextPosition: plural.pos,
      contextCount: plural.count,
    };
  }

  // ── Context detail (singular): "el primero", "#5", "uno", "más detalle" ──
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
  // Try explicit "ruc:" keyword first (accepts 8-12 digits for non-PE),
  // fall back to bare 11-digit PE RUC if intent keyword is present.
  const rucKwMatch = tn.match(RUC_KW_RE);
  if (rucKwMatch) {
    return { intent: "INVESTIGAR_CONTRATISTA", country, ruc: rucKwMatch[1] };
  }
  const rucMatch = tn.match(RUC_RE);
  if (rucMatch && /\bcontratista\b|\bempresa\b|\bruc\b|\binvestigar?\b/i.test(tn)) {
    return { intent: "INVESTIGAR_CONTRATISTA", country, ruc: rucMatch[1] };
  }
  if (/\binvestigar?\b/i.test(tn)) {
    // Use original t for name to preserve case/accents in DB ILIKE.
    // Strip URLs and cap length to prevent garbage from leaking into ILIKE.
    let name = t.match(/investiga[r]?\s+(.+)/i)?.[1]?.trim();
    if (name) {
      name = name.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
      if (name.length > 60) name = name.slice(0, 60);
    }
    return { intent: "INVESTIGAR_CONTRATISTA", country, contratista: name || undefined };
  }

  // (sunset) inhabilitados / adjudicación directa / ranking entidades /
  // ranking contratistas / monto en riesgo / stats — these used to live
  // here as fast-path regex. They were brittle (paraphrases missed, carry-
  // forward broken — "y el ranking?" after "obras en Piura" returned a
  // national ranking) so they now fall through to PREGUNTA_LIBRE and let
  // the LLM router pick the matching tool from `tools.ts` with the chat
  // history visible.

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
    const cleanedQ = buildSearchQuery(t, year);
    if (cleanedQ) {
      // Route the cleaned phrase into typed buckets: known place → q_geo,
      // known company suffix or single proper noun → q_supplier, mixed
      // ("Cosapi en Lima") → both. Noise like "grandes" returns {} so we
      // skip q entirely and the search degrades to country-wide top
      // instead of an ILIKE %grandes% that returns zero rows.
      const classified = classifyQuery(cleanedQ);
      if (classified.q_geo) filters.q_geo = classified.q_geo;
      if (classified.q_supplier) filters.q_supplier = classified.q_supplier;
    }
    return { intent: "BUSCAR_OBRAS", country, filters };
  }

  return { intent: "PREGUNTA_LIBRE", country };
}
