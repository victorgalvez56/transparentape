import { query, queryOne } from "../db";
import { expandPeDepartment } from "./places";

// Builds a Postgres WHERE fragment that matches an obra's geo against
// either a single ILIKE pattern OR — when the input is a PE department —
// an `IN (...)` over its provinces. `obras.buyer_region` stores
// PROVINCES, so "Áncash" must fan out to HUARI/SANTA/HUARAZ/etc; falling
// back to ILIKE %ancash% returns zero rows. Returns the fragment plus
// the parameter values to push and the count of new placeholders used.
//
// Always emits at least one placeholder; callers should append the
// fragment with no leading `AND`. The bound parameters use ::text
// casts on Postgres array literals where IN (...) is used.
function buildGeoFilter(
  geo: string,
  country: string,
  startPos: number,
  colPrefix = ""
): { sql: string; values: unknown[]; consumed: number } {
  const reg = `${colPrefix}buyer_region`;
  const loc = `${colPrefix}buyer_locality`;
  const buyer = `${colPrefix}buyer_name`;
  // Department fan-out only for PE — other countries don't have the
  // same locality-vs-region quirk in this DB right now.
  const provs = country === "PE" ? expandPeDepartment(geo) : null;
  if (provs && provs.length) {
    // Use IN with an ANY-array for explicit equality on province names,
    // plus ILIKE on locality so user-typed text like "huarmey" still
    // catches obras outside their canonical province grouping.
    return {
      sql: `(${reg} = ANY($${startPos}::text[]) OR ${loc} ILIKE $${startPos + 1})`,
      values: [provs, `%${geo}%`],
      consumed: 2,
    };
  }
  // CL quirk: buyer_locality is NULL for every row in this ETL, and the
  // comuna is embedded in buyer_name as "MUNICIPALIDAD DE <COMUNA>".
  // So we widen the geo filter to also match buyer_name — letting users
  // search by comuna ("obras en Maipú") even though buyer_locality is
  // empty. buyer_region still matches the 16 short-form regions via
  // substring ("Santiago" → "Región Metropolitana de Santiago").
  if (country === "CL") {
    return {
      sql: `(${reg} ILIKE $${startPos} OR ${buyer} ILIKE $${startPos})`,
      values: [`%${geo}%`],
      consumed: 1,
    };
  }
  return {
    sql: `(${reg} ILIKE $${startPos} OR ${loc} ILIKE $${startPos})`,
    values: [`%${geo}%`],
    consumed: 1,
  };
}

export type Country = "PE" | "CL" | string;

export interface ObraResumen {
  id: number;
  ocid: string;
  titulo: string;
  region: string | null;
  localidad: string | null;
  contratista: string | null;
  ruc: string | null;
  monto: number | null;
  is_red_flag: boolean;
  red_flag_types: string[] | null;
  procurement_method: string | null;
  source_year: number | null;
  country: string;
  // Optional INFOBRAS fields — populated by getObraResumen via LEFT JOIN
  // when the obra has an `infobras_code` link. Always undefined/null on
  // list queries that don't join (buscarObras, ranking variants, etc.).
  avance_fisico_pct?: number | null;
  fecha_fin_programada?: string | null;
  fecha_fin_real?: string | null;
  n_modificaciones_plazo?: number | null;
  supervisor_nombre?: string | null;
  dias_retraso?: number | null;
}

export interface ObraCercana extends ObraResumen {
  distancia_km: number;
}

export interface ContratistaStat {
  supplier_name: string;
  supplier_ruc: string;
  obras: number;
  monto_total: number | null;
  tiene_alerta: boolean;
}

export interface EntidadStat {
  buyer_name: string;
  obras: number;
  obras_alertadas: number;
  monto_total: number | null;
}

export interface MontoRiesgo {
  obras: number;
  monto_total: number;
  country: string;
}

// Obra row extended with INFOBRAS schedule data. Only ~165 obras (out of
// ~70K) have a non-null infobras_code linking them, so most callers get
// these fields back as NULL.
export interface ObraRetrasada extends ObraResumen {
  avance_fisico_pct: number | null;
  fecha_fin_programada: string | null;
  fecha_fin_real: string | null;
  n_modificaciones_plazo: number | null;
  dias_retraso: number | null;
  supervisor_nombre: string | null;
  /** Parsed OCDS contract_end. Surfaced as fallback "plan" date when the
   *  obra has no INFOBRAS schedule data (Path A coverage). */
  contract_end_date: string | null;
  contract_status: string | null;
}

// Optional INFOBRAS fields surfaced in detail views. All null when the
// obra has no `infobras_code` link — getObraResumen LEFT JOINs the table
// so the base obra row is always returned.
export interface ObraInfobras {
  avance_fisico_pct: number | null;
  fecha_fin_programada: string | null;
  fecha_fin_real: string | null;
  n_modificaciones_plazo: number | null;
  supervisor_nombre: string | null;
  dias_retraso: number | null;
}

// One side of a side-by-side regional comparison. Returned by
// compararRegiones for each region the user named in their query.
export interface ComparativaItem {
  region: string;          // user-typed label, preserved for display
  total: number;
  alertas: number;
  pct_alertas: number;     // 0..100
  monto_total: number;
  retrasadas: number;
  top_contratista: string | null;
  top_entidad: string | null;
}

// ─── Obras ────────────────────────────────────────────────────────────────────

export interface BuscarObrasFilters {
  country?: Country;
  year?: number;
  red_flag?: boolean;
  contratista?: string;
  ruc?: string;
  procurement_method?: string;
  /** Legacy fuzzy search — ILIKE %q% on buyer_region OR buyer_locality OR supplier_name. */
  q?: string;
  /** Geographic-only filter — ILIKE %q_geo% on buyer_region OR buyer_locality. */
  q_geo?: string;
  /** Supplier-only filter — ILIKE %q_supplier% on supplier_name. */
  q_supplier?: string;
  /** Sector filter — ILIKE %q_sector% on tender_description (saneamiento, salud, vial, etc.). */
  q_sector?: string;
  limit?: number;
}

const OBRA_COLS = `
  id, ocid,
  COALESCE(tender_description, tender_title) AS titulo,
  buyer_region AS region,
  buyer_locality AS localidad,
  supplier_name AS contratista,
  supplier_ruc AS ruc,
  COALESCE(contract_amount, award_amount, tender_amount) AS monto,
  is_red_flag, red_flag_types, procurement_method, source_year, country
`;

export async function buscarObras(f: BuscarObrasFilters): Promise<ObraResumen[]> {
  const parts: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (f.country)   { parts.push(`country = $${i++}`); vals.push(f.country); }
  if (f.year)      { parts.push(`source_year = $${i++}`); vals.push(f.year); }
  if (f.red_flag === true)  parts.push(`is_red_flag = TRUE`);
  if (f.red_flag === false) parts.push(`(is_red_flag IS NULL OR is_red_flag = FALSE)`);
  if (f.contratista) { parts.push(`supplier_name ILIKE $${i++}`); vals.push(`%${f.contratista}%`); }
  if (f.ruc)         { parts.push(`supplier_ruc = $${i++}`); vals.push(f.ruc); }
  if (f.procurement_method) { parts.push(`procurement_method = $${i++}`); vals.push(f.procurement_method); }
  // Typed filters take precedence over the legacy fuzzy q. q_geo / q_supplier
  // can coexist ("Cosapi en Lima"), q_sector also stacks ("saneamiento en
  // Piura" → q_geo=piura + q_sector=saneamiento → AND-ed).
  if (f.q_geo) {
    const g = buildGeoFilter(f.q_geo, f.country ?? "PE", i);
    parts.push(g.sql);
    vals.push(...g.values);
    i += g.consumed;
  }
  if (f.q_supplier) {
    parts.push(`supplier_name ILIKE $${i++}`);
    vals.push(`%${f.q_supplier}%`);
  }
  if (f.q_sector) {
    parts.push(`tender_description ILIKE $${i++}`);
    vals.push(`%${f.q_sector}%`);
  }
  if (f.q && !f.q_geo && !f.q_supplier && !f.q_sector) {
    // Legacy fallback when caller didn't classify — keeps existing callers
    // (web UI, older WhatsApp atajos) working without code changes. For CL
    // we substitute buyer_locality (always NULL there) with buyer_name so
    // the comuna embedded in "MUNICIPALIDAD DE X" still gets hit.
    const localityCol = f.country === "CL" ? "buyer_name" : "buyer_locality";
    parts.push(
      `(buyer_region ILIKE $${i} OR ${localityCol} ILIKE $${i} OR supplier_name ILIKE $${i})`
    );
    vals.push(`%${f.q}%`);
    i++;
  }

  const where = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  const limit = Math.min(f.limit ?? 5, 20);

  return query<ObraResumen>(
    `SELECT ${OBRA_COLS}
     FROM obras ${where}
     ORDER BY is_red_flag DESC NULLS LAST, COALESCE(contract_amount, award_amount, tender_amount) DESC NULLS LAST
     LIMIT ${limit}`,
    vals
  );
}

export async function getObraResumen(id: number): Promise<ObraResumen | null> {
  // LEFT JOIN infobras_full so the detail view surfaces supervisor +
  // physical-progress + plazo data when available. Without a match, all
  // i.* fields come back NULL and fmtDetalle hides the INFOBRAS block.
  // Date arithmetic mirrors obrasRetrasadas() — same regex guard against
  // text dates that don't parse to DATE. On JOIN error (table missing
  // in a fresh DB) we fall back to the bare obras row so the detail view
  // still works end-to-end.
  try {
    return await queryOne<ObraResumen>(
      `WITH joined AS (
         SELECT
           o.id, o.ocid,
           COALESCE(o.tender_description, o.tender_title) AS titulo,
           o.buyer_region AS region,
           o.buyer_locality AS localidad,
           o.supplier_name AS contratista,
           o.supplier_ruc AS ruc,
           COALESCE(o.contract_amount, o.award_amount, o.tender_amount) AS monto,
           o.is_red_flag, o.red_flag_types, o.procurement_method, o.source_year, o.country,
           o.contract_status,
           i.avance_fisico_pct,
           i.fecha_fin_programada,
           i.fecha_fin_real,
           i.n_modificaciones_plazo,
           i.supervisor_nombre,
           CASE
             WHEN o.contract_end ~ '^\\d{4}-\\d{2}-\\d{2}' THEN o.contract_end::date
             WHEN o.contract_end ~ '^\\d{2}/\\d{2}/\\d{4}' THEN TO_DATE(o.contract_end, 'DD/MM/YYYY')
             ELSE NULL
           END AS contract_end_date,
           CASE
             WHEN i.fecha_fin_programada ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN TO_DATE(i.fecha_fin_programada, 'DD/MM/YYYY')
             WHEN i.fecha_fin_programada ~ '^\\d{4}-\\d{2}-\\d{2}'   THEN i.fecha_fin_programada::date
             ELSE NULL
           END AS parsed_plan,
           CASE
             WHEN i.fecha_fin_real ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN TO_DATE(i.fecha_fin_real, 'DD/MM/YYYY')
             WHEN i.fecha_fin_real ~ '^\\d{4}-\\d{2}-\\d{2}'   THEN i.fecha_fin_real::date
             ELSE NULL
           END AS parsed_real
         FROM obras o
         LEFT JOIN infobras_full i ON o.infobras_code = i.codigo_infobras::text
         WHERE o.id = $1
       )
       SELECT
         id, ocid, titulo, region, localidad, contratista, ruc, monto,
         is_red_flag, red_flag_types, procurement_method, source_year, country,
         avance_fisico_pct, fecha_fin_programada, fecha_fin_real,
         n_modificaciones_plazo, supervisor_nombre,
         CASE
           WHEN parsed_real IS NOT NULL AND parsed_plan IS NOT NULL THEN
             GREATEST((parsed_real - parsed_plan), 0)
           WHEN parsed_plan IS NOT NULL AND parsed_plan < CURRENT_DATE
                AND COALESCE(avance_fisico_pct, 0) < 100 THEN
             (CURRENT_DATE - parsed_plan)
           WHEN contract_end_date IS NOT NULL AND contract_end_date < CURRENT_DATE
                AND contract_status = 'active' THEN
             (CURRENT_DATE - contract_end_date)
           ELSE NULL
         END AS dias_retraso
       FROM joined`,
      [id]
    );
  } catch (e) {
    console.error("[getObraResumen] JOIN failed, falling back to plain SELECT:", e instanceof Error ? e.message : e);
    return queryOne<ObraResumen>(
      `SELECT ${OBRA_COLS} FROM obras WHERE id = $1`,
      [id]
    );
  }
}

export async function buscarCercanas(
  lat: number,
  lng: number,
  country: Country,
  limit = 5
): Promise<ObraCercana[]> {
  return query<ObraCercana>(
    `SELECT ${OBRA_COLS},
            ROUND((sqrt(power(lat::numeric - $1, 2) + power(lng::numeric - $2, 2)) * 111)::numeric, 1) AS distancia_km
     FROM obras
     WHERE lat IS NOT NULL AND lng IS NOT NULL AND country = $3
     ORDER BY distancia_km ASC
     LIMIT $4`,
    [lat, lng, country, limit]
  );
}

export async function yearsDisponibles(country: Country): Promise<number[]> {
  const rows = await query<{ source_year: number }>(
    `SELECT DISTINCT source_year FROM obras WHERE country = $1 AND source_year IS NOT NULL ORDER BY source_year DESC LIMIT 5`,
    [country]
  );
  return rows.map((r) => r.source_year);
}

// ─── Contratistas ──────────────────────────────────────────────────────────────

export async function rankingContratistas(
  country: Country,
  por: "monto" | "alertas",
  limit = 5,
  q?: string
): Promise<ContratistaStat[]> {
  const geo = q?.trim();
  const params: unknown[] = [country, limit];
  let geoClause = "";
  if (geo) {
    const g = buildGeoFilter(geo, country, 3);
    geoClause = ` AND ${g.sql}`;
    params.push(...g.values);
  }

  if (por === "alertas") {
    return query<ContratistaStat>(
      `SELECT supplier_name, supplier_ruc,
              COUNT(*) AS obras,
              ROUND(SUM(COALESCE(contract_amount, award_amount, tender_amount))) AS monto_total,
              TRUE AS tiene_alerta
       FROM obras
       WHERE country = $1 AND is_red_flag = TRUE AND supplier_name IS NOT NULL${geoClause}
       GROUP BY supplier_name, supplier_ruc
       ORDER BY obras DESC
       LIMIT $2`,
      params
    );
  }
  return query<ContratistaStat>(
    `SELECT supplier_name, supplier_ruc,
            COUNT(*) AS obras,
            ROUND(SUM(COALESCE(contract_amount, award_amount, tender_amount))) AS monto_total,
            BOOL_OR(is_red_flag) AS tiene_alerta
     FROM obras
     WHERE country = $1 AND supplier_name IS NOT NULL AND
           COALESCE(contract_amount, award_amount, tender_amount) IS NOT NULL${geoClause}
     GROUP BY supplier_name, supplier_ruc
     ORDER BY monto_total DESC NULLS LAST
     LIMIT $2`,
    params
  );
}

export async function investigarContratista(
  rucONombre: string,
  country?: Country
): Promise<{
  obras: ObraResumen[];
  total_obras: number;
  monto_total: number | null;
  alertas: number;
  inhabilitado_vigente: boolean;
}> {
  const esPosibleRuc = /^\d{8,12}$/.test(rucONombre.trim());
  const parts: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (esPosibleRuc) {
    parts.push(`supplier_ruc = $${i++}`);
    vals.push(rucONombre.trim());
  } else {
    parts.push(`supplier_name ILIKE $${i++}`);
    vals.push(`%${rucONombre}%`);
  }
  if (country) { parts.push(`country = $${i++}`); vals.push(country); }

  const where = `WHERE ${parts.join(" AND ")}`;

  const [obras, stats, inhabilitado] = await Promise.all([
    query<ObraResumen>(
      `SELECT ${OBRA_COLS}
       FROM obras ${where} ORDER BY is_red_flag DESC, monto DESC NULLS LAST LIMIT 5`,
      vals
    ),
    queryOne<{ total: string; monto: string; alertas: string }>(
      `SELECT COUNT(*) AS total,
              ROUND(SUM(COALESCE(contract_amount, award_amount, tender_amount))) AS monto,
              COUNT(*) FILTER (WHERE is_red_flag = TRUE) AS alertas
       FROM obras ${where}`,
      vals
    ),
    esPosibleRuc
      ? queryOne<{ found: boolean }>(
          `SELECT TRUE AS found FROM red_flags WHERE ruc = $1 AND vigente = TRUE LIMIT 1`,
          [rucONombre.trim()]
        )
      : Promise.resolve(null),
  ]);

  return {
    obras,
    total_obras: Number(stats?.total ?? 0),
    monto_total: stats?.monto ? Number(stats.monto) : null,
    alertas: Number(stats?.alertas ?? 0),
    inhabilitado_vigente: inhabilitado?.found === true,
  };
}

// All aggregate queries below accept an optional `q` that ILIKE-matches
// buyer_region OR buyer_locality. This is what makes carry-forward work
// after a region scoping turn: "obras en Piura" → "y el ranking?" can now
// re-filter on Piura at the SQL level instead of returning national data.

// ─── Inhabilitados vigentes ────────────────────────────────────────────────────

export async function inhabilitadosVigentes(country: Country, limit = 8, q?: string) {
  const geo = q?.trim();
  const params: unknown[] = [country, limit];
  let geoClause = "";
  if (geo) {
    const g = buildGeoFilter(geo, country, 3, "o.");
    geoClause = ` AND ${g.sql}`;
    params.push(...g.values);
  }
  return query<{
    supplier_name: string;
    supplier_ruc: string;
    obras: number;
    monto_total: number | null;
  }>(
    `SELECT o.supplier_name, o.supplier_ruc,
            COUNT(o.id) AS obras,
            ROUND(SUM(COALESCE(o.contract_amount, o.award_amount, o.tender_amount))) AS monto_total
     FROM obras o
     JOIN red_flags rf ON o.supplier_ruc = rf.ruc AND rf.vigente = TRUE
     WHERE o.country = $1 AND o.supplier_name IS NOT NULL${geoClause}
     GROUP BY o.supplier_name, o.supplier_ruc
     ORDER BY obras DESC
     LIMIT $2`,
    params
  );
}

// ─── Adjudicación directa con alertas ─────────────────────────────────────────

export async function adjudicacionDirectaAlertas(country: Country, limit = 5, q?: string) {
  const geo = q?.trim();
  const params: unknown[] = [country, limit];
  let geoClause = "";
  if (geo) {
    const g = buildGeoFilter(geo, country, 3);
    geoClause = ` AND ${g.sql}`;
    params.push(...g.values);
  }
  return query<ObraResumen>(
    `SELECT ${OBRA_COLS}
     FROM obras
     WHERE country = $1 AND procurement_method = 'direct' AND is_red_flag = TRUE${geoClause}
     ORDER BY COALESCE(contract_amount, award_amount, tender_amount) DESC NULLS LAST
     LIMIT $2`,
    params
  );
}

// ─── Entidades compradoras ────────────────────────────────────────────────────

export async function rankingEntidades(country: Country, limit = 5, q?: string): Promise<EntidadStat[]> {
  const geo = q?.trim();
  const params: unknown[] = [country, limit];
  let geoClause = "";
  if (geo) {
    const g = buildGeoFilter(geo, country, 3);
    geoClause = ` AND ${g.sql}`;
    params.push(...g.values);
  }
  return query<EntidadStat>(
    `SELECT buyer_name,
            COUNT(*) AS obras,
            COUNT(*) FILTER (WHERE is_red_flag = TRUE) AS obras_alertadas,
            ROUND(SUM(COALESCE(contract_amount, award_amount, tender_amount))) AS monto_total
     FROM obras
     WHERE country = $1 AND buyer_name IS NOT NULL${geoClause}
     GROUP BY buyer_name
     ORDER BY obras DESC
     LIMIT $2`,
    params
  );
}

// ─── Riesgo global ────────────────────────────────────────────────────────────

export async function montoEnRiesgo(country: Country, q?: string): Promise<MontoRiesgo> {
  const geo = q?.trim();
  const params: unknown[] = [country];
  let geoClause = "";
  if (geo) {
    const g = buildGeoFilter(geo, country, 2);
    geoClause = ` AND ${g.sql}`;
    params.push(...g.values);
  }
  const r = await queryOne<{ obras: string; monto: string }>(
    `SELECT COUNT(*) AS obras,
            ROUND(COALESCE(SUM(COALESCE(contract_amount, award_amount, tender_amount)), 0)) AS monto
     FROM obras WHERE country = $1 AND is_red_flag = TRUE${geoClause}`,
    params
  );
  return {
    obras: Number(r?.obras ?? 0),
    monto_total: Number(r?.monto ?? 0),
    country,
  };
}

// ─── Obras retrasadas — JOIN obras ↔ infobras_full ────────────────────────────
//
// Tres componentes del retraso:
//   A. dias_retraso  → días entre fecha_fin_programada y CURRENT_DATE (o
//      fecha_fin_real cuando ya cerró tarde).
//   B. n_modificaciones_plazo → adendas de plazo; proxy de "vs cronograma
//      original" porque INFOBRAS no guarda la fecha original separada.
//   C. avance_fisico_pct < 100  → la obra realmente quedó pendiente.
//
// "Excesivo" se define como CUALQUIERA de:
//   - dias_retraso > 180 (6 meses) con avance < 100, o
//   - n_modificaciones_plazo >= 3, o
//   - cerró >365 días tarde (fecha_fin_real - fecha_fin_programada).
//
// Cobertura limitada: solo obras con obras.infobras_code IS NOT NULL
// (~165 / 70K). El formatter explicita esta limitación al usuario.
// Las fechas en infobras_full son TEXT; regex anti-cast-bomb antes de
// castear evita que statement_timeout=5s (Ola 1) mate la query por una
// fila con fecha mal-formada.
export async function obrasRetrasadas(
  country: Country,
  q?: string,
  limit = 5,
  year?: number
): Promise<ObraRetrasada[]> {
  const geo = q?.trim();
  // Build dynamic clauses + params. $1=country, $2=limit always, then geo / year.
  const params: unknown[] = [country, limit];
  let pos = 3;
  let geoClause = "";
  if (geo) {
    const g = buildGeoFilter(geo, country, pos, "o.");
    geoClause = ` AND ${g.sql}`;
    params.push(...g.values);
    pos += g.consumed;
  }
  let yearClause = "";
  if (year && Number.isFinite(year)) {
    yearClause = ` AND o.source_year = $${pos}`;
    params.push(year);
    pos++;
  }
  // Definition of "obra retrasada" — combines two data sources:
  //
  //   A. OCDS contract data (broad — 47K obras with contract_end + 10K
  //      with contract_status='active'). An obra is retrasada when the
  //      contract end-date passed >180d ago and the OCDS contract is
  //      still flagged active (i.e. nobody closed/terminated it).
  //
  //   B. INFOBRAS execution data (deep — 579 obras enriched). INFOBRAS
  //      stores dates as DD/MM/YYYY text. Three INFOBRAS paths:
  //        - plan vencido + avance físico < 100
  //        - 3+ modificaciones de plazo registradas
  //        - cierre real >365d después del plan
  //
  // dias_retraso prefers INFOBRAS (most precise) and falls back to OCDS
  // contract_end vs CURRENT_DATE. The LEFT JOIN keeps the row even when
  // INFOBRAS has no match — that's how Cusco/Trujillo obras (no
  // INFOBRAS link) still surface via path A.
  //
  // ${geoClause}${yearClause} are interpolated into the inner SELECT so
  // the geo/year filter narrows the join before the delay predicate.
  return query<ObraRetrasada>(
    `WITH joined AS (
       SELECT
         o.id, o.ocid,
         COALESCE(o.tender_description, o.tender_title) AS titulo,
         o.buyer_region AS region,
         o.buyer_locality AS localidad,
         o.supplier_name AS contratista,
         o.supplier_ruc AS ruc,
         COALESCE(o.contract_amount, o.award_amount, o.tender_amount) AS monto,
         o.is_red_flag, o.red_flag_types, o.procurement_method, o.source_year, o.country,
         o.contract_status,
         o.n_amendments,
         i.avance_fisico_pct,
         i.fecha_fin_programada,
         i.fecha_fin_real,
         i.n_modificaciones_plazo,
         i.supervisor_nombre,
         CASE
           WHEN o.contract_end ~ '^\\d{4}-\\d{2}-\\d{2}' THEN o.contract_end::date
           WHEN o.contract_end ~ '^\\d{2}/\\d{2}/\\d{4}' THEN TO_DATE(o.contract_end, 'DD/MM/YYYY')
           ELSE NULL
         END AS contract_end_date,
         CASE
           WHEN i.fecha_fin_programada ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN TO_DATE(i.fecha_fin_programada, 'DD/MM/YYYY')
           WHEN i.fecha_fin_programada ~ '^\\d{4}-\\d{2}-\\d{2}'   THEN i.fecha_fin_programada::date
           ELSE NULL
         END AS parsed_plan,
         CASE
           WHEN i.fecha_fin_real ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN TO_DATE(i.fecha_fin_real, 'DD/MM/YYYY')
           WHEN i.fecha_fin_real ~ '^\\d{4}-\\d{2}-\\d{2}'   THEN i.fecha_fin_real::date
           ELSE NULL
         END AS parsed_real
       FROM obras o
       LEFT JOIN infobras_full i ON o.infobras_code = i.codigo_infobras::text
       WHERE o.country = $1${geoClause}${yearClause}
     )
     SELECT
       id, ocid, titulo, region, localidad, contratista, ruc, monto,
       is_red_flag, red_flag_types, procurement_method, source_year, country,
       avance_fisico_pct, fecha_fin_programada, fecha_fin_real,
       n_modificaciones_plazo, supervisor_nombre,
       TO_CHAR(contract_end_date, 'YYYY-MM-DD') AS contract_end_date,
       contract_status,
       CASE
         WHEN parsed_real IS NOT NULL AND parsed_plan IS NOT NULL THEN
           GREATEST((parsed_real - parsed_plan), 0)
         WHEN parsed_plan IS NOT NULL AND parsed_plan < CURRENT_DATE
              AND COALESCE(avance_fisico_pct, 0) < 100 THEN
           (CURRENT_DATE - parsed_plan)
         WHEN contract_end_date IS NOT NULL AND contract_end_date < CURRENT_DATE
              AND contract_status = 'active' THEN
           (CURRENT_DATE - contract_end_date)
         ELSE 0
       END AS dias_retraso
     FROM joined
     WHERE
       -- A. OCDS: contrato activo con fecha fin vencida >180d
          (contract_end_date IS NOT NULL
            AND contract_end_date < (CURRENT_DATE - INTERVAL '180 days')
            AND contract_status = 'active')
       -- B. INFOBRAS: plan vencido + avance físico < 100
       OR (parsed_plan IS NOT NULL
            AND parsed_plan < (CURRENT_DATE - INTERVAL '180 days')
            AND COALESCE(avance_fisico_pct, 0) < 100)
       -- C. INFOBRAS: 3+ modificaciones de plazo
       OR COALESCE(n_modificaciones_plazo, 0) >= 3
       -- D. INFOBRAS: cerró >365d tarde
       OR (parsed_real IS NOT NULL AND parsed_plan IS NOT NULL
            AND (parsed_real - parsed_plan) > 365)
     ORDER BY dias_retraso DESC NULLS LAST,
              n_modificaciones_plazo DESC NULLS LAST,
              monto DESC NULLS LAST
     LIMIT $2`,
    params
  );
}

// ─── Stats por país ────────────────────────────────────────────────────────────

export async function statsPorPais(country: Country, q?: string) {
  const geo = q?.trim();
  const params: unknown[] = [country];
  let geoClause = "";
  if (geo) {
    const g = buildGeoFilter(geo, country, 2);
    geoClause = ` AND ${g.sql}`;
    params.push(...g.values);
  }
  return queryOne<{
    total: string;
    alertas: string;
    con_monto: string;
    monto_total: string;
  }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_red_flag = TRUE) AS alertas,
            COUNT(*) FILTER (WHERE COALESCE(contract_amount, award_amount, tender_amount) IS NOT NULL) AS con_monto,
            ROUND(COALESCE(SUM(COALESCE(contract_amount, award_amount, tender_amount)), 0)) AS monto_total
     FROM obras WHERE country = $1${geoClause}`,
    params
  );
}

// ─── Comparativa entre regiones ───────────────────────────────────────────────
//
// Returns one ComparativaItem per region the caller passed, fanning the
// aggregate queries out via Promise.all. Each item runs four short
// queries against the obras table reusing the existing buildGeoFilter
// so PE departments expand to provinces automatically.
//
// Inputs are limited to 4 regions to keep response size small and DB
// load bounded; the formatter is also tuned for 2-3 columns.
export async function compararRegiones(
  country: Country,
  regiones: string[]
): Promise<ComparativaItem[]> {
  const clean = regiones
    .map((r) => r.trim())
    .filter((r, i, a) => r.length >= 2 && a.indexOf(r) === i)
    .slice(0, 4);
  if (!clean.length) return [];

  return Promise.all(clean.map(async (region) => {
    // 1. base stats — total, alertas, monto
    const baseParams: unknown[] = [country];
    const baseGeo = buildGeoFilter(region, country, 2);
    baseParams.push(...baseGeo.values);
    const base = await queryOne<{ total: string; alertas: string; monto: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE is_red_flag = TRUE) AS alertas,
              ROUND(COALESCE(SUM(COALESCE(contract_amount, award_amount, tender_amount)), 0)) AS monto
       FROM obras
       WHERE country = $1 AND ${baseGeo.sql}`,
      baseParams
    );

    // 2. top contratista (by obras count, restricted to region)
    const topContParams: unknown[] = [country];
    const topContGeo = buildGeoFilter(region, country, 2);
    topContParams.push(...topContGeo.values);
    const topCont = await queryOne<{ supplier_name: string }>(
      `SELECT supplier_name FROM obras
       WHERE country = $1 AND supplier_name IS NOT NULL AND ${topContGeo.sql}
       GROUP BY supplier_name
       ORDER BY COUNT(*) DESC
       LIMIT 1`,
      topContParams
    );

    // 3. top entidad compradora
    const topEntParams: unknown[] = [country];
    const topEntGeo = buildGeoFilter(region, country, 2);
    topEntParams.push(...topEntGeo.values);
    const topEnt = await queryOne<{ buyer_name: string }>(
      `SELECT buyer_name FROM obras
       WHERE country = $1 AND buyer_name IS NOT NULL AND ${topEntGeo.sql}
       GROUP BY buyer_name
       ORDER BY COUNT(*) DESC
       LIMIT 1`,
      topEntParams
    );

    // 4. retrasadas count — OCDS path is broad enough for a side-by-side
    //    metric; full INFOBRAS join would balloon the query and we only
    //    need a number here, not the rows.
    const retrasoParams: unknown[] = [country];
    const retrasoGeo = buildGeoFilter(region, country, 2);
    retrasoParams.push(...retrasoGeo.values);
    const retraso = await queryOne<{ n: string }>(
      `SELECT COUNT(*) AS n FROM obras
       WHERE country = $1
         AND contract_status = 'active'
         AND contract_end ~ '^\\d{4}-\\d{2}-\\d{2}'
         AND contract_end::date < (CURRENT_DATE - INTERVAL '180 days')
         AND ${retrasoGeo.sql}`,
      retrasoParams
    );

    const total = Number(base?.total ?? 0);
    const alertas = Number(base?.alertas ?? 0);
    return {
      region,
      total,
      alertas,
      pct_alertas: total > 0 ? Math.round((alertas / total) * 100) : 0,
      monto_total: Number(base?.monto ?? 0),
      retrasadas: Number(retraso?.n ?? 0),
      top_contratista: topCont?.supplier_name ?? null,
      top_entidad: topEnt?.buyer_name ?? null,
    };
  }));
}
