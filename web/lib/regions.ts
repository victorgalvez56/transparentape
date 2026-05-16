/**
 * Detección jerárquica de ubicación según el viewport del mapa.
 *
 * Jerarquía (de más específico a más general):
 *   1. Distrito       (polígonos exactos, los 1834 del Perú)
 *   2. Provincia      (polígonos exactos, las 197 del Perú)
 *   3. Departamento   (polígonos exactos, los 25 del Perú)
 *   4. País           (bbox + "menor área gana")
 *   5. Región         (bbox + cardinal)
 *   6. Continente / Global
 */

import {
  findOrNearestFeature,
  getPeruDists,
  getPeruProvs,
  getPeruDepts,
} from "./geo";

export type BBox = { w: number; s: number; e: number; n: number };

export interface ViewBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ViewCenter {
  lng: number;
  lat: number;
}

interface CountryDef {
  code: string;
  name: string;
  bbox: BBox;
}

interface RegionDef {
  name: string;
  bbox: BBox;
  center: ViewCenter;
}

const COUNTRIES: CountryDef[] = [
  { code: "PE", name: "Perú", bbox: { w: -81.5, s: -18.5, e: -68.5, n: 0 } },
  { code: "CO", name: "Colombia", bbox: { w: -79, s: -4, e: -66.8, n: 13 } },
  { code: "EC", name: "Ecuador", bbox: { w: -81, s: -5, e: -75, n: 2 } },
  { code: "CL", name: "Chile", bbox: { w: -76, s: -56, e: -66, n: -17 } },
  { code: "AR", name: "Argentina", bbox: { w: -74, s: -55, e: -53, n: -21 } },
  { code: "BR", name: "Brasil", bbox: { w: -74, s: -34, e: -34, n: 5 } },
  { code: "BO", name: "Bolivia", bbox: { w: -69.5, s: -23, e: -57.5, n: -9.5 } },
  { code: "PY", name: "Paraguay", bbox: { w: -62.7, s: -27.7, e: -54.2, n: -19 } },
  { code: "UY", name: "Uruguay", bbox: { w: -58.5, s: -35, e: -53, n: -30 } },
  { code: "VE", name: "Venezuela", bbox: { w: -73.4, s: 0.5, e: -60, n: 12.5 } },
  { code: "GY", name: "Guyana", bbox: { w: -61.4, s: 1, e: -56.5, n: 8.5 } },
  { code: "SR", name: "Surinam", bbox: { w: -58.1, s: 1.8, e: -54, n: 6 } },
  { code: "MX", name: "México", bbox: { w: -117, s: 14.5, e: -86.7, n: 32.7 } },
  { code: "GT", name: "Guatemala", bbox: { w: -92.3, s: 13.7, e: -88.2, n: 17.8 } },
  { code: "SV", name: "El Salvador", bbox: { w: -90.1, s: 13.1, e: -87.7, n: 14.5 } },
  { code: "HN", name: "Honduras", bbox: { w: -89.4, s: 13, e: -83.1, n: 16.5 } },
  { code: "NI", name: "Nicaragua", bbox: { w: -87.7, s: 10.7, e: -83.1, n: 15 } },
  { code: "CR", name: "Costa Rica", bbox: { w: -85.9, s: 8, e: -82.5, n: 11.2 } },
  { code: "PA", name: "Panamá", bbox: { w: -83, s: 7.2, e: -77.1, n: 9.7 } },
  { code: "CU", name: "Cuba", bbox: { w: -85, s: 19.8, e: -74, n: 23.3 } },
  { code: "DO", name: "Rep. Dominicana", bbox: { w: -72, s: 17.6, e: -68.3, n: 19.9 } },
  { code: "PR", name: "Puerto Rico", bbox: { w: -67.3, s: 17.9, e: -65.6, n: 18.6 } },
  { code: "US", name: "Estados Unidos", bbox: { w: -125, s: 24.5, e: -66.9, n: 49.4 } },
  { code: "CA", name: "Canadá", bbox: { w: -141, s: 41.7, e: -52.6, n: 70 } },
  { code: "ES", name: "España", bbox: { w: -9.5, s: 36, e: 4.3, n: 43.8 } },
];

const REGIONS: RegionDef[] = [
  {
    name: "América del Sur",
    bbox: { w: -82, s: -56, e: -34, n: 13 },
    center: { lng: -60, lat: -15 },
  },
  {
    name: "Centroamérica",
    bbox: { w: -92.5, s: 7, e: -77, n: 18 },
    center: { lng: -85, lat: 13 },
  },
  {
    name: "Norteamérica",
    bbox: { w: -141, s: 14.5, e: -52, n: 70 },
    center: { lng: -100, lat: 40 },
  },
  {
    name: "Caribe",
    bbox: { w: -85, s: 10, e: -60, n: 27 },
    center: { lng: -73, lat: 18 },
  },
];

function bboxArea(b: BBox): number {
  return (b.e - b.w) * (b.n - b.s);
}

function contains(box: BBox, p: ViewCenter): boolean {
  return p.lng >= box.w && p.lng <= box.e && p.lat >= box.s && p.lat <= box.n;
}

function cardinal(regionCenter: ViewCenter, viewCenter: ViewCenter): string {
  const dy = viewCenter.lat - regionCenter.lat;
  const dx = viewCenter.lng - regionCenter.lng;
  if (Math.abs(dy) > Math.abs(dx)) return dy > 0 ? "Norte" : "Sur";
  return dx > 0 ? "Este" : "Oeste";
}

function findCountry(center: ViewCenter): string | null {
  const matches = COUNTRIES.filter((c) => contains(c.bbox, center));
  if (matches.length === 0) return null;
  matches.sort((a, b) => bboxArea(a.bbox) - bboxArea(b.bbox));
  return matches[0].name;
}

function findRegion(center: ViewCenter): string | null {
  const matches = REGIONS.filter((r) => contains(r.bbox, center));
  if (matches.length === 0) return null;
  matches.sort((a, b) => bboxArea(a.bbox) - bboxArea(b.bbox));
  const r = matches[0];
  return `${r.name} · ${cardinal(r.center, center)}`;
}

/**
 * Devuelve el label legible del viewport.
 *
 * Umbrales por ancho del viewport (en grados de longitud):
 *   < 0.5° → distrito    (Dep · Prov · Dist)
 *   < 3°   → provincia   (Dep · Prov)
 *   < 8°   → departamento (Perú · Dep)
 *   < 22°  → país
 *   < 70°  → región continental + cardinal
 *   < 130° → "América Latina"
 *   ≥ 130° → "Vista global"
 *
 * Para distritos/provincias usamos findOrNearestFeature: si el point cae
 * en un gap entre polígonos (frecuente en zonas urbanas densas), asigna
 * al feature más cercano dentro de un radio razonable.
 */
export function detectLocation(
  bounds: ViewBounds,
  center: ViewCenter
): string {
  const width = bounds.east - bounds.west;

  // 1. Distrito — 3 niveles: Dep · Prov · Dist
  if (width < 0.5) {
    const dist = findOrNearestFeature(
      getPeruDists(),
      center.lng,
      center.lat,
      0.15 // ~17km — solo nearest dentro de zona urbana
    );
    if (dist) {
      const parts = [dist.properties.dep, dist.properties.prov, dist.properties.name].filter(Boolean);
      return parts.join(" · ");
    }
  }

  // 2. Provincia — 2 niveles: Dep · Prov
  if (width < 3) {
    const prov = findOrNearestFeature(
      getPeruProvs(),
      center.lng,
      center.lat,
      0.5 // ~55km
    );
    if (prov) {
      const dep = prov.properties.dep;
      return dep ? `${dep} · ${prov.properties.name}` : prov.properties.name;
    }
  }

  // 3. Departamento — Perú · Dep
  if (width < 8) {
    const dep = findOrNearestFeature(
      getPeruDepts(),
      center.lng,
      center.lat,
      2.0 // ~220km — los depts son grandes
    );
    if (dep) return `Perú · ${dep.properties.name}`;
  }

  // 4. País
  if (width < 22) {
    const country = findCountry(center);
    if (country) return country;
  }

  // 5. Región
  if (width < 70) {
    const region = findRegion(center);
    if (region) return region;
  }

  // 6. Vista amplia
  if (width < 130) return "América Latina";
  return "Vista global";
}
