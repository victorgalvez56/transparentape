/**
 * DB-backed cache of company / entity names that the agent is *allowed*
 * to mention in suggestions and fallback prompts.
 *
 * Why this exists: before this cache the adaptive-fallback LLM would
 * hallucinate famous corruption-case names ("¿investigar Odebrecht?")
 * that don't exist in our DB. Clicking the suggestion produced zero
 * rows and a confused user. This module is the source of truth for
 * "names you can safely name" — every suggestion that includes an
 * empresa pulls from here, and the LLM is given the list as an
 * allowlist so it stops inventing names.
 *
 * Refresh model mirrors places.ts:
 *   - Lazy warm on first call, fire-and-forget.
 *   - TTL 4h; on expiry the next call re-warms in the background.
 *   - Offline / DB-down → cache stays empty, callers fall back to
 *     generic non-empresa suggestions.
 */
import { query, hasDatabase } from "../db";

export interface CompanyEntry {
  name: string;
  obras: number;
  ruc?: string | null;
}

export interface EntityEntry {
  name: string;
  obras: number;
}

interface CountryBucket {
  topFlagged: CompanyEntry[];      // supplier_name | red flag obras
  topInhabilitados: CompanyEntry[]; // sanctioned + still active
  topEntidades: EntityEntry[];      // buyer_name top
}

let cache: Map<string, CountryBucket> | null = null;
let loadedAt = 0;
let warmingPromise: Promise<void> | null = null;
const TTL_MS = 4 * 60 * 60 * 1000;
const COUNTRIES = ["PE", "CL", "CO", "MX", "AR", "BR"];

export function warmCompanyCache(): Promise<void> {
  if (warmingPromise) return warmingPromise;
  if (cache && Date.now() - loadedAt < TTL_MS) return Promise.resolve();
  if (!hasDatabase()) return Promise.resolve();

  warmingPromise = (async () => {
    try {
      const next = new Map<string, CountryBucket>();
      for (const c of COUNTRIES) {
        const [flagged, inhab, entidades] = await Promise.all([
          query<{ supplier_name: string; obras: string; supplier_ruc: string | null }>(
            `SELECT supplier_name, supplier_ruc, COUNT(*) AS obras
             FROM obras WHERE country = $1 AND is_red_flag = TRUE
               AND supplier_name IS NOT NULL
             GROUP BY supplier_name, supplier_ruc
             ORDER BY COUNT(*) DESC
             LIMIT 10`,
            [c]
          ),
          query<{ supplier_name: string; obras: string; supplier_ruc: string | null }>(
            `SELECT o.supplier_name, o.supplier_ruc, COUNT(*) AS obras
             FROM obras o
             JOIN red_flags rf ON o.supplier_ruc = rf.ruc AND rf.vigente = TRUE
             WHERE o.country = $1 AND o.supplier_name IS NOT NULL
             GROUP BY o.supplier_name, o.supplier_ruc
             ORDER BY COUNT(*) DESC
             LIMIT 6`,
            [c]
          ),
          query<{ buyer_name: string; obras: string }>(
            `SELECT buyer_name, COUNT(*) AS obras
             FROM obras WHERE country = $1 AND buyer_name IS NOT NULL
             GROUP BY buyer_name
             ORDER BY COUNT(*) DESC
             LIMIT 8`,
            [c]
          ),
        ]);
        next.set(c, {
          topFlagged: flagged.map((r) => ({ name: r.supplier_name, obras: Number(r.obras), ruc: r.supplier_ruc })),
          topInhabilitados: inhab.map((r) => ({ name: r.supplier_name, obras: Number(r.obras), ruc: r.supplier_ruc })),
          topEntidades: entidades.map((r) => ({ name: r.buyer_name, obras: Number(r.obras) })),
        });
      }
      cache = next;
      loadedAt = Date.now();
    } catch (e) {
      console.error("[companies] warm failed:", e instanceof Error ? e.message : e);
    } finally {
      warmingPromise = null;
    }
  })();
  return warmingPromise;
}

function getBucket(country: string): CountryBucket | null {
  return cache?.get(country) ?? null;
}

/** Returns top red-flagged contratistas for the country, or [] if cache cold. */
export function topFlaggedContratistas(country: string, limit = 6): CompanyEntry[] {
  void warmCompanyCache();
  return (getBucket(country)?.topFlagged ?? []).slice(0, limit);
}

/** Returns sanctioned contratistas that still have active contracts. */
export function topInhabilitadosVigentes(country: string, limit = 4): CompanyEntry[] {
  void warmCompanyCache();
  return (getBucket(country)?.topInhabilitados ?? []).slice(0, limit);
}

/** Returns top buying entities (ministerios, gobiernos regionales). */
export function topEntidades(country: string, limit = 5): EntityEntry[] {
  void warmCompanyCache();
  return (getBucket(country)?.topEntidades ?? []).slice(0, limit);
}

/** Returns a flat list of empresa names safe to mention in prompts. */
export function allowlistEmpresas(country: string): string[] {
  void warmCompanyCache();
  const b = getBucket(country);
  if (!b) return [];
  const set = new Set<string>();
  b.topFlagged.forEach((c) => set.add(c.name));
  b.topInhabilitados.forEach((c) => set.add(c.name));
  return [...set];
}

/** Returns top entidad names (buyer_name) for prompts. */
export function allowlistEntidades(country: string): string[] {
  void warmCompanyCache();
  return (getBucket(country)?.topEntidades ?? []).map((e) => e.name);
}
