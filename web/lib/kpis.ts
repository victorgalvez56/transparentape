import { query, queryOne } from "./db";

/**
 * KPIs agregados sobre TODA la base (obras + red_flags + infobras_full).
 *
 * A diferencia de /api/obras/points (que el cliente carga para el globo y
 * topa en ~62k geo), esto corre los agregados en Postgres sobre las 71k
 * filas completas, así las cifras del panel son exactas y no dependen de
 * lo que alcanzó a cargar el navegador. Pensado para el tab "Panel" del
 * home: una sola foto, lista para el jurado.
 *
 * "monto" = GREATEST(contract, award, tender) — mismo criterio que
 * getCountryStats(), para que el total cuadre con el resto del producto.
 */

const MONTO = `GREATEST(COALESCE(contract_amount,0),COALESCE(award_amount,0),COALESCE(tender_amount,0))`;

export interface Kpis {
  generated_at: string;
  totals: {
    obras: number;
    monto_total: number;
    red_flags: number;
    monto_riesgo: number;
    pct_red_flags: number;
    pct_monto_riesgo: number;
    monto_promedio: number;
    suppliers: number;
    buyers: number;
    with_coords: number;
    pct_geo: number;
    with_panorama: number;
    sanction_records: number;
    sanctioned_rucs: number;
    sanctions_vigentes: number;
    infobras: number;
  };
  by_country: { country: string; n: number; red_flags: number; monto: number }[];
  years: { year: number; n: number; red_flags: number }[];
  top_regions: {
    region: string;
    n: number;
    red_flags: number;
    monto: number;
  }[];
  flagged_suppliers: {
    name: string;
    ruc: string | null;
    n: number;
    red_flags: number;
    monto: number;
  }[];
  flag_types: { tipo: string; n: number }[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function getKpis(): Promise<Kpis> {
  const [
    base,
    sanctions,
    infobras,
    byCountry,
    years,
    regions,
    suppliers,
    flagTypes,
  ] = await Promise.all([
    queryOne<Record<string, string>>(
      `SELECT
         COUNT(*)                                                AS obras,
         COUNT(*) FILTER (WHERE is_red_flag)                      AS red_flags,
         COUNT(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL) AS with_coords,
         COUNT(*) FILTER (WHERE has_panorama)                     AS with_panorama,
         COUNT(DISTINCT supplier_ruc)                             AS suppliers,
         COUNT(DISTINCT buyer_name)                               AS buyers,
         ROUND(SUM(${MONTO}))                                     AS monto_total,
         ROUND(SUM(${MONTO}) FILTER (WHERE is_red_flag))          AS monto_riesgo
       FROM obras`
    ),
    queryOne<Record<string, string>>(
      `SELECT COUNT(*)                          AS records,
              COUNT(DISTINCT ruc)               AS rucs,
              COUNT(*) FILTER (WHERE vigente)   AS vigentes
       FROM red_flags`
    ),
    queryOne<{ n: string }>(`SELECT COUNT(*) AS n FROM infobras_full`),
    query<Record<string, string>>(
      `SELECT country,
              COUNT(*)                            AS n,
              COUNT(*) FILTER (WHERE is_red_flag) AS red_flags,
              ROUND(SUM(${MONTO}))                AS monto
       FROM obras
       GROUP BY country
       ORDER BY n DESC`
    ),
    query<Record<string, string>>(
      `SELECT source_year                        AS year,
              COUNT(*)                            AS n,
              COUNT(*) FILTER (WHERE is_red_flag) AS red_flags
       FROM obras
       WHERE source_year IS NOT NULL
       GROUP BY source_year
       ORDER BY source_year`
    ),
    query<Record<string, string>>(
      `SELECT buyer_region                       AS region,
              COUNT(*)                            AS n,
              COUNT(*) FILTER (WHERE is_red_flag) AS red_flags,
              ROUND(SUM(${MONTO}))                AS monto
       FROM obras
       WHERE buyer_region IS NOT NULL
       GROUP BY buyer_region
       ORDER BY monto DESC NULLS LAST
       LIMIT 8`
    ),
    query<Record<string, string>>(
      `SELECT supplier_name                      AS name,
              supplier_ruc                        AS ruc,
              COUNT(*)                            AS n,
              COUNT(*) FILTER (WHERE is_red_flag) AS red_flags,
              ROUND(SUM(${MONTO}))                AS monto
       FROM obras
       WHERE supplier_name IS NOT NULL
       GROUP BY supplier_name, supplier_ruc
       HAVING COUNT(*) FILTER (WHERE is_red_flag) > 0
       ORDER BY monto DESC NULLS LAST
       LIMIT 8`
    ),
    query<Record<string, string>>(
      `SELECT tipo, COUNT(*) AS n
       FROM red_flags
       GROUP BY tipo
       ORDER BY n DESC`
    ),
  ]);

  const obras = num(base?.obras);
  const monto_total = num(base?.monto_total);
  const red_flags = num(base?.red_flags);
  const monto_riesgo = num(base?.monto_riesgo);
  const with_coords = num(base?.with_coords);

  return {
    generated_at: new Date().toISOString(),
    totals: {
      obras,
      monto_total,
      red_flags,
      monto_riesgo,
      pct_red_flags: obras ? (red_flags / obras) * 100 : 0,
      pct_monto_riesgo: monto_total ? (monto_riesgo / monto_total) * 100 : 0,
      monto_promedio: obras ? monto_total / obras : 0,
      suppliers: num(base?.suppliers),
      buyers: num(base?.buyers),
      with_coords,
      pct_geo: obras ? (with_coords / obras) * 100 : 0,
      with_panorama: num(base?.with_panorama),
      sanction_records: num(sanctions?.records),
      sanctioned_rucs: num(sanctions?.rucs),
      sanctions_vigentes: num(sanctions?.vigentes),
      infobras: num(infobras?.n),
    },
    by_country: byCountry.map((r) => ({
      country: String(r.country ?? "—"),
      n: num(r.n),
      red_flags: num(r.red_flags),
      monto: num(r.monto),
    })),
    years: years.map((r) => ({
      year: num(r.year),
      n: num(r.n),
      red_flags: num(r.red_flags),
    })),
    top_regions: regions.map((r) => ({
      region: String(r.region ?? "—"),
      n: num(r.n),
      red_flags: num(r.red_flags),
      monto: num(r.monto),
    })),
    flagged_suppliers: suppliers.map((r) => ({
      name: String(r.name ?? "—"),
      ruc: r.ruc ? String(r.ruc) : null,
      n: num(r.n),
      red_flags: num(r.red_flags),
      monto: num(r.monto),
    })),
    flag_types: flagTypes.map((r) => ({
      tipo: String(r.tipo ?? "—"),
      n: num(r.n),
    })),
  };
}
