/**
 * Formatters para los paneles VR — montos cortos, títulos truncados.
 */

export function formatMontoCompact(monto: number | null | undefined): string {
  if (!monto || monto <= 0) return "S/ —";
  if (monto >= 1e9) return `S/ ${(monto / 1e9).toFixed(2)}MM`;
  if (monto >= 1e6) return `S/ ${(monto / 1e6).toFixed(1)}M`;
  if (monto >= 1e3) return `S/ ${Math.round(monto / 1e3)}K`;
  return `S/ ${Math.round(monto)}`;
}

export function truncate(text: string | null | undefined, max = 60): string {
  if (!text) return "Sin título";
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}
