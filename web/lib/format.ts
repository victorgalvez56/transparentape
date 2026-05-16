export function fmtSoles(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `S/ ${(n / 1_000).toFixed(0)}K`;
  return `S/ ${n.toFixed(0)}`;
}

export function fmtSolesShort(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n.toFixed(0)}`;
}

export function fmtSolesLong(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 0,
  }).format(n);
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
