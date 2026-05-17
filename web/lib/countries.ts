/**
 * Coordenadas centrales y zoom recomendado por país (ISO 3166-1 alpha-2).
 * Usado para hacer easeTo del globo tras detectar la ubicación del usuario.
 */

export interface CountryView {
  code: string;
  name: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
}

const COUNTRIES: Record<string, CountryView> = {
  PE: { code: "PE", name: "Perú", center: [-75.0, -10.0], zoom: 5.2 },
  CO: { code: "CO", name: "Colombia", center: [-73.5, 4.5], zoom: 5.0 },
  CL: { code: "CL", name: "Chile", center: [-71.0, -36.0], zoom: 4.2 },
  MX: { code: "MX", name: "México", center: [-102.5, 23.5], zoom: 4.4 },
  AR: { code: "AR", name: "Argentina", center: [-63.6, -34.0], zoom: 3.8 },
  BR: { code: "BR", name: "Brasil", center: [-53.0, -10.0], zoom: 3.6 },
  EC: { code: "EC", name: "Ecuador", center: [-78.5, -1.5], zoom: 6.0 },
  BO: { code: "BO", name: "Bolivia", center: [-65.0, -16.5], zoom: 5.2 },
  PY: { code: "PY", name: "Paraguay", center: [-58.5, -23.5], zoom: 5.6 },
  UY: { code: "UY", name: "Uruguay", center: [-55.8, -32.8], zoom: 6.4 },
  VE: { code: "VE", name: "Venezuela", center: [-66.0, 7.0], zoom: 5.0 },
  GT: { code: "GT", name: "Guatemala", center: [-90.0, 15.5], zoom: 6.4 },
  SV: { code: "SV", name: "El Salvador", center: [-88.9, 13.8], zoom: 7.4 },
  HN: { code: "HN", name: "Honduras", center: [-86.5, 14.7], zoom: 6.4 },
  NI: { code: "NI", name: "Nicaragua", center: [-85.2, 12.9], zoom: 6.4 },
  CR: { code: "CR", name: "Costa Rica", center: [-84.0, 9.9], zoom: 7.0 },
  PA: { code: "PA", name: "Panamá", center: [-80.0, 8.5], zoom: 6.6 },
  CU: { code: "CU", name: "Cuba", center: [-78.0, 21.5], zoom: 5.6 },
  DO: { code: "DO", name: "República Dominicana", center: [-70.5, 18.7], zoom: 7.0 },
  PR: { code: "PR", name: "Puerto Rico", center: [-66.5, 18.2], zoom: 8.0 },
  ES: { code: "ES", name: "España", center: [-3.7, 40.2], zoom: 5.0 },
  US: { code: "US", name: "Estados Unidos", center: [-97.0, 39.0], zoom: 3.2 },
};

export const DEFAULT_COUNTRY: CountryView = COUNTRIES.PE;

/**
 * Vista regional Perú-Chile combinada — los dos países con presencia
 * fuerte de datos OCDS. Sirve como vista inicial estilo codex-globe
 * antes de que el usuario seleccione un país específico.
 */
export const PE_CL_VIEW: CountryView = {
  code: "PE_CL",
  name: "Perú · Chile",
  center: [-74, -22],
  zoom: 3.2,
};

export const ALL_COUNTRIES: CountryView[] = Object.values(COUNTRIES);

export function getCountryView(code: string | null | undefined): CountryView {
  if (!code) return DEFAULT_COUNTRY;
  const upper = code.toUpperCase().slice(0, 2);
  return COUNTRIES[upper] ?? DEFAULT_COUNTRY;
}

/**
 * Cuenta obras por país, devuelve solo los países con presencia
 * ordenados por count descendente. Los que están en COUNTRIES pero
 * sin obras quedan disponibles pero con count 0.
 */
export function availableCountriesWithCount<
  T extends { country?: string | null | undefined }
>(obras: T[]): Array<CountryView & { count: number }> {
  const counts = new Map<string, number>();
  for (const o of obras) {
    if (!o.country) continue;
    const code = o.country.toUpperCase();
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  // Países con presencia primero, ordenados por count DESC
  const present = [...counts.entries()]
    .filter(([code]) => COUNTRIES[code])
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ ...COUNTRIES[code], count }));
  // Países sin obras pero conocidos van al final con count 0
  const presentCodes = new Set(present.map((c) => c.code));
  const empty = ALL_COUNTRIES.filter((c) => !presentCodes.has(c.code)).map(
    (c) => ({ ...c, count: 0 })
  );
  return [...present, ...empty];
}
