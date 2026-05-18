/**
 * Place + company classifier used by intent.ts, tools.ts, and core.ts.
 *
 * Two-tier source for the place dictionary:
 *
 *   1. **DB-backed index (primary).** A lazy cache pulls every distinct
 *      `buyer_region` + `buyer_locality` value from the `obras` table and
 *      keeps them in memory for 4 hours. This means the agent automatically
 *      learns new districts/provinces as the ETL feeds them, works across
 *      any country (PE/CL/CO/MX/AR/BR/...) without code changes, and never
 *      falls behind reality. ~1ms lookup once warmed; warm itself is one
 *      DB query under 200ms typically.
 *
 *   2. **Seed allowlist (cold-start + offline fallback).** A small
 *      hardcoded set covers the most common LATAM places. Used when the
 *      DB cache is not yet warm or when the host is offline (test
 *      runner). Keeps the classifier deterministic during boot.
 *
 * Two related problems this solves:
 *
 *   - False-positive `q` searches. "obras grandes" → buildSearchQuery →
 *     "grandes" → ILIKE %grandes% on region/locality → zero rows. We drop
 *     `q` entirely when the cleaned phrase doesn't look like a real
 *     place AND doesn't look like a company name.
 *
 *   - Mixed geo + company queries. "obras de Cosapi en Lima" → buildSearch
 *     returns "Cosapi en Lima" → ILIKE %Cosapi en Lima% matches nothing.
 *     classifyQuery() pulls "Lima" into q_geo and leaves "Cosapi" as
 *     q_supplier so the WHERE clause filters each column with the right
 *     token.
 */

import { query, hasDatabase } from "../db";

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

// Peruvian DB stores buyer_region at PROVINCE level, not department. A user
// who asks "obras en Áncash" expects to see Huaraz/Santa/Huari/etc — every
// province inside that department. Without this map the ILIKE %ancash%
// matches zero rows even though 8K+ obras sit in those provinces. Keys
// are ASCII-normalised lowercase; values are the canonical UPPERCASE
// province names as they appear in `buyer_region`.
export const PE_DEPT_PROVINCES: Record<string, string[]> = {
  ancash: ["HUARI", "SANTA", "HUARAZ", "YUNGAY", "CASMA", "SIHUAS", "CARHUAZ", "MARISCAL LUZURIAGA", "HUAYLAS", "POMABAMBA", "BOLOGNESI", "RECUAY", "AIJA", "ANTONIO RAYMONDI", "OCROS", "ASUNCION"],
  cusco: ["CUSCO", "LA CONVENCION", "CALCA", "CANCHIS", "QUISPICANCHI", "ANTA", "ESPINAR", "URUBAMBA", "CHUMBIVILCAS", "PAUCARTAMBO", "PARURO", "ACOMAYO", "CANAS"],
  cajamarca: ["CAJAMARCA", "JAEN", "CHOTA", "SAN MARCOS", "CUTERVO", "HUALGAYOC", "CELENDIN", "SAN IGNACIO", "CONTUMAZA", "SAN MIGUEL", "SANTA CRUZ", "SAN PABLO", "CAJABAMBA"],
  junin: ["HUANCAYO", "JAUJA", "TARMA", "CHANCHAMAYO", "SATIPO", "CONCEPCION", "CHUPACA", "YAULI", "JUNIN"],
  ayacucho: ["HUAMANGA", "CANGALLO", "HUANCA SANCOS", "HUANTA", "LA MAR", "LUCANAS", "PARINACOCHAS", "PAUCAR DEL SARA SARA", "SUCRE", "VICTOR FAJARDO", "VILCAS HUAMAN"],
  apurimac: ["ABANCAY", "ANDAHUAYLAS", "ANTABAMBA", "AYMARAES", "COTABAMBAS", "CHINCHEROS", "GRAU"],
  huanuco: ["HUANUCO", "AMBO", "DOS DE MAYO", "HUACAYBAMBA", "HUAMALIES", "LEONCIO PRADO", "MARAÑON", "PACHITEA", "PUERTO INCA", "LAURICOCHA", "YAROWILCA"],
  huancavelica: ["HUANCAVELICA", "ACOBAMBA", "ANGARAES", "CASTROVIRREYNA", "CHURCAMPA", "HUAYTARA", "TAYACAJA"],
  "la libertad": ["TRUJILLO", "ASCOPE", "BOLIVAR", "CHEPEN", "JULCAN", "OTUZCO", "PACASMAYO", "PATAZ", "SANCHEZ CARRION", "SANTIAGO DE CHUCO", "GRAN CHIMU", "VIRU"],
  lambayeque: ["CHICLAYO", "FERREÑAFE", "LAMBAYEQUE"],
  loreto: ["MAYNAS", "ALTO AMAZONAS", "LORETO", "MARISCAL RAMON CASTILLA", "REQUENA", "UCAYALI", "DATEM DEL MARAÑON", "PUTUMAYO"],
  "madre de dios": ["TAMBOPATA", "MANU", "TAHUAMANU"],
  moquegua: ["MARISCAL NIETO", "GENERAL SANCHEZ CERRO", "ILO"],
  pasco: ["PASCO", "DANIEL ALCIDES CARRION", "OXAPAMPA"],
  piura: ["PIURA", "AYABACA", "HUANCABAMBA", "MORROPON", "PAITA", "SECHURA", "SULLANA", "TALARA"],
  puno: ["PUNO", "AZANGARO", "CARABAYA", "CHUCUITO", "EL COLLAO", "HUANCANE", "LAMPA", "MELGAR", "MOHO", "SAN ANTONIO DE PUTINA", "SAN ROMAN", "SANDIA", "YUNGUYO"],
  "san martin": ["MOYOBAMBA", "BELLAVISTA", "EL DORADO", "HUALLAGA", "LAMAS", "MARISCAL CACERES", "PICOTA", "RIOJA", "SAN MARTIN", "TOCACHE"],
  tacna: ["TACNA", "CANDARAVE", "JORGE BASADRE", "TARATA"],
  tumbes: ["TUMBES", "CONTRALMIRANTE VILLAR", "ZARUMILLA"],
  ucayali: ["CORONEL PORTILLO", "ATALAYA", "PADRE ABAD", "PURUS"],
  amazonas: ["CHACHAPOYAS", "BAGUA", "BONGARA", "CONDORCANQUI", "LUYA", "RODRIGUEZ DE MENDOZA", "UTCUBAMBA"],
  arequipa: ["AREQUIPA", "CAMANA", "CARAVELI", "CASTILLA", "CAYLLOMA", "CONDESUYOS", "ISLAY", "LA UNION"],
  ica: ["ICA", "CHINCHA", "NAZCA", "PALPA", "PISCO"],
};

// Returns the array of province names for a department query, or null if
// the input is not a recognised PE department. Caller decides whether to
// fan out the SQL filter or fall back to single-ILIKE behaviour.
export function expandPeDepartment(q: string): string[] | null {
  const key = q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return PE_DEPT_PROVINCES[key] ?? null;
}

// CL data quirk: `buyer_locality` is NULL on all 1157 rows. The comuna is
// embedded inside `buyer_name` (e.g. "I MUNICIPALIDAD DE QUILLON | ..."),
// so the DB-backed warmPlaceCache extracts it from buyer_name on warm.
// This seed only needs to cover cold-start so the test runner + offline
// classifier still route Chilean place words to q_geo. The 16 regions
// (canonical short form) all live inside `buyer_region` already as
// ILIKE substrings — "santiago" matches "Región Metropolitana de Santiago".
const PLACES_CL = [
  // 16 regions (short form — ILIKEs match longer canonical region names)
  "santiago", "metropolitana", "valparaiso", "biobio", "bio bio",
  "araucania", "maule", "los lagos", "los rios", "coquimbo", "antofagasta",
  "atacama", "tarapaca", "arica", "magallanes", "aysen", "nuble", "ohiggins",
  "libertador",
  // Top comunas (cold-start seed; the warm cache extends this from DB)
  "vina del mar", "concepcion", "temuco", "la serena", "rancagua",
  "iquique", "puerto montt", "valdivia", "osorno", "chillan", "talca",
  "copiapo", "calama", "punta arenas",
  // Santiago metro comunas (frecuentes en queries)
  "maipu", "providencia", "las condes", "vitacura", "nunoa", "la florida",
  "puente alto", "san bernardo", "pudahuel", "renca", "quilicura",
  "huechuraba", "estacion central", "la reina", "penalolen", "macul",
  "el bosque", "la pintana", "san miguel", "san joaquin", "independencia",
  "recoleta", "conchali", "lo barnechea", "lo prado", "cerrillos",
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
  // Delay/schedule vocabulary — these belong to OBRAS_RETRASADAS, not
  // q_supplier. Without them, "obras con más retrasos en Lima" leaks
  // stripped="mas retrasos" into q_supplier and returns zero rows.
  "mas", "menos", "muchos", "muchas", "pocos", "pocas",
  "retraso", "retrasos", "atraso", "atrasos", "demora", "demoras",
  "retrasado", "retrasada", "retrasados", "retrasadas",
  "atrasado", "atrasada", "atrasados", "atrasadas",
  "paralizado", "paralizada", "paralizados", "paralizadas",
  "estancado", "estancada", "estancados", "estancadas",
  "demorado", "demorada", "demorados", "demoradas",
]);

// Returns true if `s` is either in NOISE_WORDS as a whole OR every
// whitespace-separated token is. "mas retrasos" → both tokens noise →
// drop. "valle del colca" → "valle"/"colca" not noise → keep.
function isAllNoise(s: string): boolean {
  if (NOISE_WORDS.has(s)) return true;
  const toks = s.split(/\s+/).filter(Boolean);
  if (toks.length < 2) return false;
  return toks.every((t) => NOISE_WORDS.has(t));
}

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

// ── DB-backed place index ─────────────────────────────────────────────────────
//
// Lazy cache of every distinct buyer_region + buyer_locality currently in the
// obras table, keyed by normalised string. Multi-country by construction —
// CO/MX/AR/BR places appear automatically as soon as their ETL loads data.
// Lifecycle:
//   - First call to findPlace() fires warmPlaceCache() (non-blocking).
//   - While the warm runs, findPlace falls back to the seed list.
//   - After warm completes, all subsequent calls hit the in-memory map.
//   - After PLACE_CACHE_TTL_MS the next call re-warms in the background.
// Failure modes:
//   - DATABASE_URL absent (offline test runner) → warm short-circuits,
//     cache stays null, seed is the only source. Tests still pass.
//   - DB error during warm → silently caught, retried next call.

interface PlaceCacheEntry {
  /** Normalised key (lowercase, no diacritics). */
  key: string;
  /** Original casing as stored in DB. */
  display: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** Where the name came from in the obras schema. */
  kind: "region" | "locality";
  /** Number of obras rows referencing this name — used to break ties. */
  usage: number;
}

let placeCache: { map: Map<string, PlaceCacheEntry>; keysByLen: string[] } | null = null;
let placeCacheLoadedAt = 0;
let placeCacheWarmingPromise: Promise<void> | null = null;
const PLACE_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const PLACE_CACHE_MAX_ROWS = 20000;

/**
 * Warms the place cache from `obras`. Fire-and-forget — callers do not
 * await; findPlace just checks whether the cache is ready and falls back
 * to the seed list when it isn't.
 */
export function warmPlaceCache(): Promise<void> {
  if (placeCacheWarmingPromise) return placeCacheWarmingPromise;
  if (placeCache && Date.now() - placeCacheLoadedAt < PLACE_CACHE_TTL_MS) {
    return Promise.resolve();
  }
  if (!hasDatabase()) return Promise.resolve();

  placeCacheWarmingPromise = (async () => {
    try {
      const rows = await query<{ name: string; country: string; kind: string; n: string }>(
        `WITH names AS (
           SELECT buyer_region AS name, country, 'region' AS kind, COUNT(*) AS n
           FROM obras
           WHERE buyer_region IS NOT NULL AND length(buyer_region) >= 3
           GROUP BY buyer_region, country
           UNION ALL
           SELECT buyer_locality AS name, country, 'locality' AS kind, COUNT(*) AS n
           FROM obras
           WHERE buyer_locality IS NOT NULL AND length(buyer_locality) >= 3
           GROUP BY buyer_locality, country
           -- CL specific: buyer_locality is NULL on every row in this ETL,
           -- but the comuna is embedded inside buyer_name as
           -- "[I/ILUSTRE] MUNICIPALIDAD DE <COMUNA>". Extract the comuna
           -- so "obras en Maipú" resolves through the same q_geo path
           -- as PE provinces, without hardcoding the ~346 comunas.
           UNION ALL
           SELECT
             TRIM(REGEXP_REPLACE(buyer_name,
               '^[^|]*MUNICIPALIDAD\\s+DE\\s+([^|]+?)(\\s*\\|.*)?$',
               '\\1', 'i')) AS name,
             country,
             'locality' AS kind,
             COUNT(*) AS n
           FROM obras
           WHERE country = 'CL'
             AND buyer_name ~* 'MUNICIPALIDAD\\s+DE\\s+'
           GROUP BY 1, country
         )
         SELECT name, country, kind, n
         FROM names
         WHERE length(name) >= 3
         ORDER BY n DESC
         LIMIT $1`,
        [PLACE_CACHE_MAX_ROWS]
      );
      const map = new Map<string, PlaceCacheEntry>();
      for (const r of rows) {
        const key = normalize(r.name);
        if (key.length < 3) continue;
        const usage = Number(r.n) || 0;
        const existing = map.get(key);
        // Keep the highest-usage entry for the same normalised key (handles
        // the case where the same town name appears in multiple countries).
        if (!existing || usage > existing.usage) {
          map.set(key, {
            key,
            display: r.name,
            country: r.country,
            kind: (r.kind === "region" ? "region" : "locality"),
            usage,
          });
        }
      }
      const keysByLen = [...map.keys()].sort((a, b) => b.length - a.length);
      placeCache = { map, keysByLen };
      placeCacheLoadedAt = Date.now();
    } catch (e) {
      console.error("[places] warmPlaceCache failed:", e);
    } finally {
      placeCacheWarmingPromise = null;
    }
  })();
  return placeCacheWarmingPromise;
}

/** Returns metadata about the matched place, or null. Cache-only. */
export function findPlaceInIndex(q: string): PlaceCacheEntry | null {
  if (!placeCache || !q || q.length < 3) return null;
  const padded = ` ${normalize(q)} `;
  // Longest-first scan handles "Lima Norte" before "Lima".
  for (const k of placeCache.keysByLen) {
    if (padded.includes(` ${k} `) || padded.includes(` ${k}.`) || padded.includes(` ${k},`)) {
      return placeCache.map.get(k) ?? null;
    }
  }
  const compact = normalize(q);
  return placeCache.map.get(compact) ?? null;
}

/** Returns the longest place word found inside `q`, or null. */
export function findPlace(q: string): string | null {
  if (!q || q.length < 3) return null;
  // Fire the warm in the background — first call kicks it off, subsequent
  // calls find the cache populated.
  void warmPlaceCache();
  // Prefer the DB-backed index when warm — covers any locality/province
  // currently present in the obras table (multi-country, no allowlist).
  const fromIndex = findPlaceInIndex(q);
  if (fromIndex) return fromIndex.key;
  // Fallback to the compact seed list (handles cold start + offline tests
  // + countries with no ETL data yet).
  const n = ` ${normalize(q)} `;
  for (const p of ALL_PLACES) {
    if (n.includes(` ${p} `) || n.includes(` ${p}.`) || n.includes(` ${p},`)) {
      return p;
    }
  }
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
  /** Ambiguous fallback — buscarObras ILIKEs all three columns (legacy). */
  q?: string;
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
    if (stripped.length >= 3 && !isAllNoise(stripped)) {
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

  // 4. Single-word non-noise — TRULY ambiguous (could be place OR company).
  //    "Cosapi" / "Odebrecht" / "Chota" / "Tarapoto" — without the DB
  //    index there's no way to tell. Return legacy `q` so buscarObras
  //    ILIKEs all three columns (buyer_region, buyer_locality, supplier_name).
  //    Cosapi matches supplier_name, Chota matches buyer_locality — both
  //    work, single SQL. Once the DB place-index is warm, case 1 above
  //    routes Chota straight to q_geo; this case is the cold-start path.
  if (/^[\p{L}'-]+$/u.test(n) && n.length >= 4 && !NOISE_WORDS.has(n)) {
    return { q: trimmed };
  }

  // 5. Multi-word with internal capitalisation → unknown place.
  //    Escape hatch for "Valle del Colca", "San Pedro de los Incas", etc.
  //    Pure lowercase noise like "obras grandes" falls through to drop.
  if (trimmed.includes(" ") && hasCapitalProperNoun(trimmed) && !isAllNoise(n)) {
    return { q_geo: trimmed };
  }

  // 6. Multi-word noise — drop entirely so we don't ILIKE %grandes% and
  //    return zero rows. Caller falls back to country-wide search.
  return {};
}
