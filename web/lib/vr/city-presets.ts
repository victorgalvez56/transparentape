import {
  GLOBE_RADIUS,
  lngLatToVec3,
  getNormal,
} from "./sphere-projection";

export interface CityPreset {
  key: string;
  label: string;
  /** Coords (lng, lat). Para "peru" usamos centro de Peru */
  lng: number;
  lat: number;
  /** Distancia desde la superficie del globo (m) */
  distance: number;
}

export const CITY_PRESETS: CityPreset[] = [
  // Vista global del planeta sobre Peru
  { key: "peru", label: "Perú", lng: -75, lat: -9.5, distance: 45 },
  // Ciudades — camara cerca de la superficie
  { key: "lima", label: "Lima", lng: -77.05, lat: -12.05, distance: 8 },
  { key: "cusco", label: "Cusco", lng: -71.97, lat: -13.52, distance: 8 },
  { key: "arequipa", label: "Arequipa", lng: -71.54, lat: -16.4, distance: 8 },
  { key: "trujillo", label: "Trujillo", lng: -79.03, lat: -8.11, distance: 8 },
  { key: "piura", label: "Piura", lng: -80.63, lat: -5.19, distance: 8 },
];

/**
 * Para cada preset: target = punto en superficie del globo,
 * camera = ese punto + normal * distance (offset radial hacia afuera).
 */
export function cameraForPreset(preset: CityPreset): {
  target: [number, number, number];
  position: [number, number, number];
} {
  const surface = lngLatToVec3(preset.lng, preset.lat, GLOBE_RADIUS);
  const normal = getNormal(preset.lng, preset.lat);
  const camera = surface
    .clone()
    .add(normal.clone().multiplyScalar(preset.distance));
  return {
    target: [surface.x, surface.y, surface.z],
    position: [camera.x, camera.y, camera.z],
  };
}
