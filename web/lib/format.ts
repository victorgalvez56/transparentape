/**
 * Moneda por país. Las obras son de Perú (PEN, S/) y Chile (CLP, $).
 * Mostrar todo en soles era el bug — el monto se formatea según o.country.
 */
export interface CurrencyInfo {
  symbol: string;
  code: "PEN" | "CLP";
  locale: string;
}

const CURRENCIES: Record<string, CurrencyInfo> = {
  PE: { symbol: "S/", code: "PEN", locale: "es-PE" },
  CL: { symbol: "$", code: "CLP", locale: "es-CL" },
};

/** Config de moneda para un país ISO-2. Default Perú. */
export function currencyFor(country?: string | null): CurrencyInfo {
  if (!country) return CURRENCIES.PE;
  return CURRENCIES[country.toUpperCase().slice(0, 2)] ?? CURRENCIES.PE;
}

/** Símbolo corto de la moneda del país: "S/" (Perú) · "$" (Chile/CLP). */
export function montoSymbol(country?: string | null): string {
  return currencyFor(country).symbol;
}

/**
 * Monto compacto con símbolo, según país:
 *   PE → "S/ 1.20M" · CL → "$ 1.50MM" (CLP).
 */
export function fmtMontoCompact(
  n: number | null | undefined,
  country?: string | null
): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const { symbol } = currencyFor(country);
  if (n >= 1_000_000_000)
    return `${symbol} ${(n / 1_000_000_000).toFixed(2)}MM`;
  if (n >= 1_000_000) return `${symbol} ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${symbol} ${(n / 1_000).toFixed(0)}K`;
  return `${symbol} ${n.toFixed(0)}`;
}

/** @deprecated usa fmtMontoCompact. Alias country-aware por compatibilidad. */
export function fmtSoles(
  n: number | null | undefined,
  country?: string | null
): string {
  return fmtMontoCompact(n, country);
}

/** Magnitud SIN símbolo ("1.20M" · "5K"). El símbolo va aparte vía montoSymbol(). */
export function fmtSolesShort(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}MM`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n.toFixed(0)}`;
}

/** Monto completo con formato de moneda local del país. */
export function fmtSolesLong(
  n: number | null | undefined,
  country?: string | null
): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const { code, locale } = currencyFor(country);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtMonto(
  n: number | null | undefined,
  country?: string | null
): string {
  return fmtSolesLong(n, country);
}

export function fmtFecha(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function truncar(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/**
 * Devuelve el mejor "título" legible para una obra.
 * En la DB de OCDS de Perú, tender_title suele ser un código (LP-SM-1-2021-...) y
 * tender_description es la descripción humana. Preferimos description y, si es muy
 * larga, la limpiamos.
 */
export function displayTitle(o: {
  tender_title: string | null;
  tender_description: string | null;
}): string {
  const desc = (o.tender_description ?? "").trim();
  const title = (o.tender_title ?? "").trim();
  if (desc && desc.length > 12) {
    // Quitar prefijo común "EJECUCION DE LA OBRA: " o "EJECUCION DE LA OBRA "
    return desc.replace(/^EJECUCI[OÓ]N\s+DE\s+LA\s+OBRA[:\s]+/i, "");
  }
  return title || "Sin título";
}
