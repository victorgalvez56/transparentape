/**
 * Proyección de lng/lat (Perú) → x/z del piso del Audit Room.
 *
 * El piso es un plano de 80m × 100m que representa la geografía de Perú
 * proyectada con sus límites reales. Lima cae cerca del centro-oeste.
 *
 * Bounds aproximados de Perú:
 * - Longitud: -82° (oeste, costa Pacífico) a -68° (este, frontera Brasil)
 * - Latitud:  -19° (sur, frontera Chile) a 0° (norte, frontera Ecuador)
 */

const LNG_MIN = -82;
const LNG_MAX = -68;
const LAT_MIN = -19;
const LAT_MAX = 0;

const FLOOR_WIDTH = 80; // metros en X (este-oeste)
const FLOOR_DEPTH = 100; // metros en Z (norte-sur)

export function projectToFloor(
  lng: number,
  lat: number
): [number, number] {
  // X: longitud → este(+) / oeste(-)
  const u = (lng - LNG_MIN) / (LNG_MAX - LNG_MIN); // 0..1
  const x = (u - 0.5) * FLOOR_WIDTH;
  // Z: latitud → norte(-) / sur(+) — three.js mira al -Z por default,
  // así que poner el norte en -Z hace que el jugador "mire al norte"
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

/** Posición de Lima en el piso, para spawn del jugador. */
export const LIMA_POSITION: [number, number] = projectToFloor(-77.05, -12.05);

/** Bounds geográficos para ocultar columnas fuera de Perú. */
export const PERU_BOUNDS = {
  lngMin: LNG_MIN,
  lngMax: LNG_MAX,
  latMin: LAT_MIN,
  latMax: LAT_MAX,
};
