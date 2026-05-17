import { query, queryOne } from "../db";

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

// ─── Obras ────────────────────────────────────────────────────────────────────

export interface BuscarObrasFilters {
  country?: Country;
  year?: number;
  red_flag?: boolean;
  contratista?: string;
  ruc?: string;
  procurement_method?: string;
  q?: string; // searches title, supplier, locality, and region — no hardcoded lists
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
  if (f.q) {
    // Search across all relevant text columns including region and locality
    parts.push(
      `(tender_description ILIKE $${i} OR tender_title ILIKE $${i} OR ` +
      `supplier_name ILIKE $${i} OR buyer_region ILIKE $${i} OR buyer_locality ILIKE $${i})`
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
  return queryOne<ObraResumen>(
    `SELECT ${OBRA_COLS} FROM obras WHERE id = $1`,
    [id]
  );
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
  limit = 5
): Promise<ContratistaStat[]> {
  if (por === "alertas") {
    return query<ContratistaStat>(
      `SELECT supplier_name, supplier_ruc,
              COUNT(*) AS obras,
              ROUND(SUM(COALESCE(contract_amount, award_amount, tender_amount))) AS monto_total,
              TRUE AS tiene_alerta
       FROM obras
       WHERE country = $1 AND is_red_flag = TRUE AND supplier_name IS NOT NULL
       GROUP BY supplier_name, supplier_ruc
       ORDER BY obras DESC
       LIMIT $2`,
      [country, limit]
    );
  }
  return query<ContratistaStat>(
    `SELECT supplier_name, supplier_ruc,
            COUNT(*) AS obras,
            ROUND(SUM(COALESCE(contract_amount, award_amount, tender_amount))) AS monto_total,
            BOOL_OR(is_red_flag) AS tiene_alerta
     FROM obras
     WHERE country = $1 AND supplier_name IS NOT NULL AND
           COALESCE(contract_amount, award_amount, tender_amount) IS NOT NULL
     GROUP BY supplier_name, supplier_ruc
     ORDER BY monto_total DESC NULLS LAST
     LIMIT $2`,
    [country, limit]
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

// ─── Inhabilitados vigentes ────────────────────────────────────────────────────

export async function inhabilitadosVigentes(country: Country, limit = 8) {
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
     WHERE o.country = $1 AND o.supplier_name IS NOT NULL
     GROUP BY o.supplier_name, o.supplier_ruc
     ORDER BY obras DESC
     LIMIT $2`,
    [country, limit]
  );
}

// ─── Adjudicación directa con alertas ─────────────────────────────────────────

export async function adjudicacionDirectaAlertas(country: Country, limit = 5) {
  return query<ObraResumen>(
    `SELECT ${OBRA_COLS}
     FROM obras
     WHERE country = $1 AND procurement_method = 'direct' AND is_red_flag = TRUE
     ORDER BY COALESCE(contract_amount, award_amount, tender_amount) DESC NULLS LAST
     LIMIT $2`,
    [country, limit]
  );
}

// ─── Entidades compradoras ────────────────────────────────────────────────────

export async function rankingEntidades(country: Country, limit = 5): Promise<EntidadStat[]> {
  return query<EntidadStat>(
    `SELECT buyer_name,
            COUNT(*) AS obras,
            COUNT(*) FILTER (WHERE is_red_flag = TRUE) AS obras_alertadas,
            ROUND(SUM(COALESCE(contract_amount, award_amount, tender_amount))) AS monto_total
     FROM obras
     WHERE country = $1 AND buyer_name IS NOT NULL
     GROUP BY buyer_name
     ORDER BY obras DESC
     LIMIT $2`,
    [country, limit]
  );
}

// ─── Riesgo global ────────────────────────────────────────────────────────────

export async function montoEnRiesgo(country: Country): Promise<MontoRiesgo> {
  const r = await queryOne<{ obras: string; monto: string }>(
    `SELECT COUNT(*) AS obras,
            ROUND(COALESCE(SUM(COALESCE(contract_amount, award_amount, tender_amount)), 0)) AS monto
     FROM obras WHERE country = $1 AND is_red_flag = TRUE`,
    [country]
  );
  return {
    obras: Number(r?.obras ?? 0),
    monto_total: Number(r?.monto ?? 0),
    country,
  };
}

// ─── Stats por país ────────────────────────────────────────────────────────────

export async function statsPorPais(country: Country) {
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
     FROM obras WHERE country = $1`,
    [country]
  );
}
