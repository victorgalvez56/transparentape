/**
 * Shared place + company allowlist used by intent.ts, tools.ts, and core.ts.
 *
 * Two related problems this solves:
 *
 *   1. False-positive `q` searches. "obras grandes" → buildSearchQuery →
 *      "grandes" → ILIKE %grandes% on region/locality → zero rows. The
 *      allowlist drops `q` entirely when the cleaned phrase doesn't look
 *      like a real place AND doesn't look like a company name.
 *
 *   2. Mixed geo + company queries. "obras de Cosapi en Lima" → buildSearch
 *      returns "Cosapi en Lima" → ILIKE %Cosapi en Lima% matches nothing.
 *      classifyQuery() pulls "Lima" into q_geo and leaves "Cosapi" as
 *      q_supplier so the WHERE clause filters each column with the right
 *      token.
 *
 * The list is intentionally compact — major PE departments + capitals plus
 * a thin slice of CL/CO/MX/AR/BR landmarks. Extending it is cheap; missing
 * a place just degrades to the legacy `q` behaviour which still works for
 * users who type lowercase known company names.
 */

const PLACES_PE = [
  // Departments
  "lima", "cusco", "arequipa", "trujillo", "chiclayo", "piura", "iquitos",
  "ica", "tacna", "puno", "huancayo", "callao", "ayacucho", "cajamarca",
  "huanuco", "junin", "loreto", "moquegua", "pasco", "tumbes", "ucayali",
  "amazonas", "apurimac", "ancash", "huancavelica", "lambayeque",
  "la libertad", "madre de dios", "san martin",
  // Lima districts / sub-areas frequently used in queries
  "miraflores", "san isidro", "barranco", "surco", "san borja",
  "lima norte", "lima sur", "lima este", "lima centro",
  "san juan de lurigancho", "comas", "ate", "villa el salvador",
];

const PLACES_CL = [
  "santiago", "valparaiso", "vina del mar", "concepcion", "antofagasta",
  "temuco", "la serena", "rancagua", "iquique", "arica", "puerto montt",
  "biobio", "maule", "araucania", "los lagos", "coquimbo", "atacama",
  "magallanes", "tarapaca", "ohiggins", "nuble",
];

const PLACES_CO = [
  "bogota", "medellin", "cali", "barranquilla", "cartagena", "bucaramanga",
  "santa marta", "ibague", "cucuta", "manizales", "pereira", "armenia",
  "antioquia", "cundinamarca", "valle del cauca", "atlantico", "santander",
  "bolivar", "magdalena", "norte de santander",
];

const PLACES_MX = [
  "cdmx", "ciudad de mexico", "guadalajara", "monterrey", "jalisco",
  "nuevo leon", "puebla", "estado de mexico", "tijuana", "queretaro",
  "leon", "veracruz", "merida", "oaxaca",
];

const PLACES_AR = [
  "buenos aires", "cordoba", "rosario", "mendoza", "la plata", "mar del plata",
  "tucuman", "salta", "san juan", "neuquen",
];

const PLACES_BR = [
  "sao paulo", "rio de janeiro", "belo horizonte", "brasilia", "salvador",
  "fortaleza", "curitiba", "porto alegre", "recife", "manaus",
];

const ALL_PLACES = [
  ...PLACES_PE,
  ...PLACES_CL,
  ...PLACES_CO,
  ...PLACES_MX,
  ...PLACES_AR,
  ...PLACES_BR,
].sort((a, b) => b.length - a.length); // longer matches win (e.g. "lima norte" before "lima")

// Multi-word stopwords typed by users that look like a noun but are not
// places. Without this list, "obras grandes" would route to q_supplier=
// "grandes" and return zero rows. Add new entries here as they surface.
const NOISE_WORDS = new Set([
  "grande", "grandes", "pequeño", "pequeña", "pequenos", "pequenas",
  "nuevo", "nueva", "nuevos", "nuevas",
  "viejo", "vieja", "antiguo", "antigua",
  "mejor", "mejores", "peor", "peores",
  "importante", "importantes", "principal", "principales",
  "obra", "obras", "proyecto", "proyectos",
  "todas", "todos", "varias", "varios",
]);

// Sector words → q_sector. These map to tender_description ILIKE %word%
// (semantic search, not place). User says "obras de saneamiento" — the
// match is "construcción sistema de saneamiento ..." in the description,
// NOT a region/locality column. Listed lowercase + ASCII-normalized.
const SECTOR_WORDS = new Set([
  "saneamiento", "agua", "alcantarillado", "desague", "desagüe",
  "salud", "hospital", "hospitales", "posta", "centro de salud", "essalud",
  "educacion", "colegio", "colegios", "escuela", "escuelas", "universidad",
  "transporte", "carretera", "carreteras", "via", "vias", "vial", "puente", "puentes",
  "vivienda", "viviendas", "habitacional",
  "electrificacion", "electricidad", "energia", "energetico",
  "pavimentacion", "asfaltado", "veredas",
  "irrigacion", "riego", "agricultura", "agropecuario",
  "telecomunicaciones", "fibra", "internet",
  "seguridad", "comisaria", "comisarias", "penal", "carcel",
  "deporte", "deportivo", "estadio", "loza",
  "cultura", "cultural", "museo", "biblioteca",
  "turismo", "turistico",
  "saneamiento basico", "agua potable",
]);

function isSectorWord(s: string): string | null {
  const n = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (SECTOR_WORDS.has(n)) return n;
  // Multi-word: check first/last word against single-word sectors
  const words = n.split(/\s+/);
  for (const w of words) if (SECTOR_WORDS.has(w)) return w;
  return null;
}

// Heuristic: input has a capitalized proper noun (not just sentence start).
// Used as escape hatch for unknown places like "Valle del Colca" — if the
// user typed it with capitals it's almost certainly a real place name,
// even if it's not in ALL_PLACES.
function hasCapitalProperNoun(s: string): boolean {
  // Strip the first token (could be capitalized sentence start) and look
  // for any internal capitalised word.
  const tokens = s.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    if (i === 0 && tokens.length > 1) continue; // skip leading word
    if (/^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+/.test(tokens[i])) return true;
  }
  // Single-token input: only count if all-caps (3+) or capitalized 4+ chars
  if (tokens.length === 1) {
    return /^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]{3,}$/.test(tokens[0]) ||
      /^[A-ZÁÉÍÓÚÑÜ]{3,}$/.test(tokens[0]);
  }
  return false;
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Returns the longest place word found inside `q`, or null. */
export function findPlace(q: string): string | null {
  if (!q || q.length < 3) return null;
  const n = ` ${normalize(q)} `;
  for (const p of ALL_PLACES) {
    if (n.includes(` ${p} `) || n.includes(` ${p}.`) || n.includes(` ${p},`)) {
      return p;
    }
  }
  // Substring fallback for single-word inputs ("piura", "lima")
  const compact = normalize(q);
  for (const p of ALL_PLACES) {
    if (compact === p) return p;
  }
  return null;
}

export function looksLikePlace(q: string | undefined): boolean {
  return q ? findPlace(q) !== null : false;
}

// Company suffixes common in LATAM trade names. Word-boundary anchored
// so "sacaron" doesn't match.
const COMPANY_SUFFIX_RE =
  /\b(s\.?a\.?c\.?|s\.?a\.?s\.?|s\.?a\.?a\.?|sac|sas|saa|s\.?a\.?|inc|llc|ltd|ltda|eirl|srl|s\.?r\.?l\.?)\b/i;

export function looksLikeCompany(q: string | undefined): boolean {
  if (!q || q.length < 3) return false;
  return COMPANY_SUFFIX_RE.test(q);
}

/**
 * Splits a free-text search term into typed buckets.
 *
 *   "Cosapi en Lima"   → { q_geo: "lima", q_supplier: "cosapi" }
 *   "Piura"            → { q_geo: "piura" }
 *   "Cosapi SAC"       → { q_supplier: "Cosapi SAC" }
 *   "Odebrecht"        → { q_supplier: "Odebrecht" }
 *   "obras grandes"    → { }   (after stopword strip "grandes" is noise)
 *   "saneamiento"      → { q_text: "saneamiento" } (description hint)
 *
 * `q_text` is intentionally NOT consumed by buscarObras today (description
 * search has false-positive risk per existing comment), but tool authors
 * can pick it up later for tender_description ILIKE if desired.
 */
export function classifyQuery(q: string | undefined): {
  q_geo?: string;
  q_supplier?: string;
  q_sector?: string;
} {
  if (!q) return {};
  const trimmed = q.trim();
  if (trimmed.length < 2) return {};
  const n = normalize(trimmed);

  // 0. Sector word — semantic match against tender_description.
  //    Checked BEFORE the single-word supplier fallback so "saneamiento"
  //    routes to q_sector instead of q_supplier="saneamiento" → 0 rows.
  const sector = isSectorWord(trimmed);

  // 1. Place hit — may co-exist with sector ("saneamiento en Piura").
  const place = findPlace(trimmed);
  if (place) {
    // Strip the place word, plus prepositions around it, to leave a clean rest.
    const stripped = n
      .replace(new RegExp(`\\b${place}\\b`), " ")
      .replace(/\b(en|de|del|la|las|los|el|al)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const restIsSector = stripped && isSectorWord(stripped);
    if (restIsSector) return { q_geo: place, q_sector: restIsSector };
    if (stripped.length >= 3 && !NOISE_WORDS.has(stripped)) {
      return { q_geo: place, q_supplier: stripped };
    }
    return { q_geo: place };
  }

  // 2. Pure sector word (no place) — search by description only.
  if (sector) {
    return { q_sector: sector };
  }

  // 3. Explicit company suffix.
  if (looksLikeCompany(trimmed)) {
    return { q_supplier: trimmed };
  }

  // 4. Single-word non-noise → assume proper noun (company name typed
  //    lowercase: "odebrecht", "cosapi", "graña").
  if (/^[\p{L}'-]+$/u.test(n) && n.length >= 4 && !NOISE_WORDS.has(n)) {
    return { q_supplier: trimmed };
  }

  // 5. Multi-word with internal capitalisation → unknown place.
  //    Escape hatch for "Valle del Colca", "San Pedro de los Incas", etc.
  //    Pure lowercase noise like "obras grandes" falls through to drop.
  if (trimmed.includes(" ") && hasCapitalProperNoun(trimmed) && !NOISE_WORDS.has(n)) {
    return { q_geo: trimmed };
  }

  // 6. Multi-word noise — drop entirely so we don't ILIKE %grandes% and
  //    return zero rows. Caller falls back to country-wide search.
  return {};
}
