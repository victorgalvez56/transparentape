"use client";

import { useEffect, useMemo, useState } from "react";
import { Line } from "@react-three/drei";
import { projectToFloor } from "@/lib/vr/projection";

type Position = [number, number, number];

interface GeoJSONFeature {
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  } | null;
}

interface GeoJSON {
  features: GeoJSONFeature[];
}

/**
 * Renderiza el outline de los departamentos de Perú sobre el piso.
 * El usuario camina sobre el "mapa real" — Lima donde es Lima, Cusco
 * donde es Cusco, las columnas crecen de sus coordenadas verdaderas.
 *
 * Línea verde glowing tipo blueprint editorial. La data viene del
 * GeoJSON de INEI que ya tenemos en /public/geo/.
 */
export default function PeruMap() {
  const [data, setData] = useState<GeoJSON | null>(null);

  useEffect(() => {
    fetch("/geo/peru-departamentos.geojson")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => console.warn("[PeruMap] no se pudo cargar GeoJSON:", e));
  }, []);

  const ringSets = useMemo<Position[][]>(() => {
    if (!data) return [];
    const rings: Position[][] = [];
    for (const feature of data.features) {
      const geom = feature.geometry;
      if (!geom) continue;
      const polygons =
        geom.type === "Polygon"
          ? [geom.coordinates as number[][][]]
          : (geom.coordinates as number[][][][]);
      for (const polygon of polygons) {
        for (const ring of polygon) {
          const points: Position[] = ring.map((coord) => {
            const [x, z] = projectToFloor(coord[0], coord[1]);
            return [x, 0.03, z] as Position;
          });
          rings.push(points);
        }
      }
    }
    return rings;
  }, [data]);

  if (ringSets.length === 0) return null;

  return (
    <>
      {ringSets.map((points, i) => (
        <Line
          key={i}
          points={points}
          color="#1f7a1c"
          lineWidth={1.4}
          transparent
          opacity={0.65}
        />
      ))}
    </>
  );
}
