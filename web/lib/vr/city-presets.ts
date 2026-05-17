import { projectToFloor } from "./projection";

export interface CityPreset {
  key: string;
  label: string;
  /** Posicion del target (lng, lat) o "peru" para vista global */
  lng?: number;
  lat?: number;
  /** Tipo de vista: "city" zoom cerca, "country" top-down vista de todo */
  view: "city" | "country";
}

export const CITY_PRESETS: CityPreset[] = [
  { key: "peru", label: "Perú", view: "country" },
  { key: "lima", label: "Lima", lng: -77.05, lat: -12.05, view: "city" },
  { key: "cusco", label: "Cusco", lng: -71.97, lat: -13.52, view: "city" },
  { key: "arequipa", label: "Arequipa", lng: -71.54, lat: -16.4, view: "city" },
  { key: "trujillo", label: "Trujillo", lng: -79.03, lat: -8.11, view: "city" },
  { key: "piura", label: "Piura", lng: -80.63, lat: -5.19, view: "city" },
];

/**
 * Devuelve la posicion target y la posicion de camara para volar al preset.
 */
export function cameraForPreset(preset: CityPreset): {
  target: [number, number, number];
  position: [number, number, number];
} {
  if (preset.view === "country") {
    // Top-down de Peru entero: target en centro del pais, camara alta
    return {
      target: [0, 0, 0],
      position: [0, 70, 5],
    };
  }
  // City view: target en la ciudad, camara cerca + elevada
  const [x, z] = projectToFloor(preset.lng!, preset.lat!);
  return {
    target: [x, 0.5, z],
    position: [x + 3, 4, z + 6],
  };
}
