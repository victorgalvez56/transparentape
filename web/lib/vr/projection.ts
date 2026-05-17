/**
 * Proyección de lng/lat (LATAM) → x/z del piso del Audit Room.
 *
 * El piso del VR es un plano de 100m × 60m centrado en el origen.
 * Mapeamos el bbox de LATAM aprox [-120, -55] → [-34, 32] a esa escala.
 *
 * Centro del piso = aprox sobre Perú para que el visitante PE arranque ahí.
 */

const LNG_MIN = -120;
const LNG_MAX = -34;
const LAT_MIN = -55;
const LAT_MAX = 32;

const FLOOR_WIDTH = 100; // metros en X
const FLOOR_DEPTH = 60; // metros en Z

export function projectToFloor(
  lng: number,
  lat: number
): [number, number] {
  // X: longitud → este(+) / oeste(-)
  const u = (lng - LNG_MIN) / (LNG_MAX - LNG_MIN); // 0..1
  const x = (u - 0.5) * FLOOR_WIDTH;
  // Z: latitud → norte(-) / sur(+) (Three.js +Z mira hacia el sur del mapa)
  const v = (lat - LAT_MIN) / (LAT_MAX - LAT_MIN); // 0..1
  const z = -(v - 0.5) * FLOOR_DEPTH;
  return [x, z];
}

/** Calcula altura de la columna basada en el monto (log scale). */
export function montoToHeight(monto: number | null | undefined): number {
  if (!monto || monto <= 0) return 0.2; // mínimo visible
  return Math.max(0.2, Math.log10(monto + 1) * 0.5);
}

export const FLOOR_DIMENSIONS = {
  width: FLOOR_WIDTH,
  depth: FLOOR_DEPTH,
};
