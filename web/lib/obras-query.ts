import { query, queryOne } from "./db";
import type { Obra } from "./types";

export interface ObraFilters {
  country?: string | null;
  city?: string | null;
  region?: string | null;
  distrito?: string | null;
  year?: number | null;
  red_flag?: boolean | null;
  contratista?: string | null;
  q?: string | null;
  with_coords?: boolean | null;
  limit?: number;
}

type Row = Record<string, unknown>;

function rowToObra(r: Row): Obra {
  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };
  return {
    id: Number(r.id),
    ocid: String(r.ocid),
    source_year: (r.source_year as number | null) ?? null,
    country: (r.country as string) ?? "PE",
    city: (r.city as string) ?? "",
    buyer_id: (r.buyer_id as string | null) ?? null,
    buyer_name: (r.buyer_name as string | null) ?? null,
    buyer_region: (r.buyer_region as string | null) ?? null,
    buyer_locality: (r.buyer_locality as string | null) ?? null,
    buyer_street: (r.buyer_street as string | null) ?? null,
    tender_id: (r.tender_id as string | null) ?? null,
    tender_title: (r.tender_title as string | null) ?? null,
    tender_description: (r.tender_description as string | null) ?? null,
    item_classification: (r.item_classification as string | null) ?? null,
    procurement_method: (r.procurement_method as string | null) ?? null,
    tender_amount: toNum(r.tender_amount),
    date_published: (r.date_published as string | null) ?? null,
    award_date: (r.award_date as string | null) ?? null,
    award_amount: toNum(r.award_amount),
    supplier_id: (r.supplier_id as string | null) ?? null,
    supplier_name: (r.supplier_name as string | null) ?? null,
    supplier_ruc: (r.supplier_ruc as string | null) ?? null,
    contract_id: (r.contract_id as string | null) ?? null,
    contract_start: (r.contract_start as string | null) ?? null,
    contract_end: (r.contract_end as string | null) ?? null,
    contract_amount: toNum(r.contract_amount),
    contract_status: (r.contract_status as string | null) ?? null,
    n_amendments: (r.n_amendments as number | null) ?? 0,
    is_lima: (r.is_lima as boolean | null) ?? null,
    lat: toNum(r.lat),
    lng: toNum(r.lng),
    infobras_code: (r.infobras_code as string | null) ?? null,
    streetview_before: (r.streetview_before as string | null) ?? null,
    streetview_after: (r.streetview_after as string | null) ?? null,
    ai_score: (r.ai_score as number | null) ?? null,
    ai_description: (r.ai_description as string | null) ?? null,
    is_red_flag: (r.is_red_flag as boolean | null) ?? false,
    red_flag_types: (r.red_flag_types as string[] | null) ?? null,
  };
}

function buildWhere(f: ObraFilters): { sql: string; values: unknown[] } {
  const parts: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (f.country) {
    parts.push(`country = $${i++}`);
    values.push(f.country);
  }
  if (f.city) {
    parts.push(`LOWER(city) = LOWER($${i++})`);
    values.push(f.city);
  }
  if (f.region) {
    parts.push(`UPPER(buyer_region) = UPPER($${i++})`);
    values.push(f.region);
  }
  if (f.distrito) {
    parts.push(`UPPER(buyer_locality) LIKE UPPER($${i++})`);
    values.push(`%${f.distrito}%`);
  }
  if (f.year != null) {
    parts.push(`source_year = $${i++}`);
    values.push(f.year);
  }
  if (f.red_flag === true) parts.push(`is_red_flag = TRUE`);
  if (f.red_flag === false) parts.push(`(is_red_flag IS NULL OR is_red_flag = FALSE)`);
  if (f.contratista) {
    parts.push(`supplier_name ILIKE $${i++}`);
    values.push(`%${f.contratista}%`);
  }
  if (f.q) {
    parts.push(
      `(tender_title ILIKE $${i} OR tender_description ILIKE $${i} OR supplier_name ILIKE $${i} OR buyer_locality ILIKE $${i})`
    );
    values.push(`%${f.q}%`);
    i++;
  }
  if (f.with_coords) {
    parts.push(`lat IS NOT NULL AND lng IS NOT NULL`);
  }

  return {
    sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "",
    values,
  };
}

export async function listObras(filters: ObraFilters): Promise<Obra[]> {
  const { sql, values } = buildWhere(filters);
  const limit = Math.min(Math.max(filters.limit ?? 500, 1), 5000);
  const rows = await query<Row>(
    `SELECT * FROM obras ${sql} ORDER BY is_red_flag DESC NULLS LAST, contract_amount DESC NULLS LAST LIMIT ${limit}`,
    values
  );
  return rows.map(rowToObra);
}

export async function getObraById(id: number): Promise<Obra | null> {
  const r = await queryOne<Row>(`SELECT * FROM obras WHERE id = $1`, [id]);
  return r ? rowToObra(r) : null;
}

export async function getObraByOcid(ocid: string): Promise<Obra | null> {
  const r = await queryOne<Row>(`SELECT * FROM obras WHERE ocid = $1`, [ocid]);
  return r ? rowToObra(r) : null;
}

export interface CountryStats {
  total_obras: number;
  total_red_flags: number;
  with_coords: number;
  total_monto: number;
  years: { year: number; count: number }[];
}

export async function getCountryStats(): Promise<CountryStats> {
  const r = await queryOne<{
    total_obras: string;
    total_red_flags: string;
    with_coords: string;
    total_monto: string;
  }>(
    `SELECT
       COUNT(*) AS total_obras,
       COUNT(*) FILTER (WHERE is_red_flag) AS total_red_flags,
       COUNT(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL) AS with_coords,
       COALESCE(SUM(GREATEST(COALESCE(contract_amount, 0), COALESCE(award_amount, 0), COALESCE(tender_amount, 0))), 0) AS total_monto
     FROM obras`
  );
  const ys = await query<{ year: number; count: string }>(
    `SELECT source_year AS year, COUNT(*) AS count
     FROM obras WHERE source_year IS NOT NULL
     GROUP BY source_year ORDER BY source_year`
  );
  return {
    total_obras: Number(r?.total_obras ?? 0),
    total_red_flags: Number(r?.total_red_flags ?? 0),
    with_coords: Number(r?.with_coords ?? 0),
    total_monto: Number(r?.total_monto ?? 0),
    years: ys.map((y) => ({ year: Number(y.year), count: Number(y.count) })),
  };
}
