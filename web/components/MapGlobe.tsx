"use client";

import { useEffect, useRef } from "react";
import maplibregl, { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Obra, riesgoDeObra } from "@/lib/types";

interface Props {
  obras: Obra[];
  selectedId: number | null;
  onSelect: (o: Obra) => void;
}

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function toFeatureCollection(obras: Obra[]): GeoJSON.FeatureCollection {
  const features = obras
    .filter((o) => o.lat != null && o.lng != null)
    .map((o) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [Number(o.lng), Number(o.lat)],
      },
      properties: {
        id: o.id,
        ocid: o.ocid,
        title: o.tender_title ?? "",
        amount: o.contract_amount ?? o.award_amount ?? o.tender_amount ?? 0,
        is_red_flag: o.is_red_flag ?? false,
        riesgo: riesgoDeObra(o),
      },
    }));
  return { type: "FeatureCollection", features };
}

export default function MapGlobe({ obras, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const obrasById = useRef<Map<number, Obra>>(new Map());

  useEffect(() => {
    obrasById.current = new Map(obras.map((o) => [o.id, o]));
  }, [obras]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [-75.0, -10.5],
      zoom: 4.6,
      pitch: 25,
      attributionControl: false,
    });

    map.on("error", (e) => {
      // eslint-disable-next-line no-console
      console.error("[MapGlobe error]", e.error?.message ?? e);
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true }),
      "bottom-right"
    );
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    let rafId = 0;
    let phase = 0;
    const pulse = () => {
      phase = (phase + 1) % 90;
      const t = phase / 90;
      const r = 8 + 18 * t;
      const op = 0.6 * (1 - t);
      if (map.getLayer("obras-pulse")) {
        map.setPaintProperty("obras-pulse", "circle-radius", r);
        map.setPaintProperty("obras-pulse", "circle-stroke-opacity", op);
      }
      rafId = requestAnimationFrame(pulse);
    };

    map.on("load", () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any).setProjection({ type: "globe" });
      } catch {
        /* sin globe — sigue mercator */
      }

      map.addSource("obras", {
        type: "geojson",
        data: toFeatureCollection(obras),
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 38,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "obras",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#1e3a8a",
            10,
            "#3b82f6",
            50,
            "#60a5fa",
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            18,
            10,
            24,
            50,
            30,
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(255,255,255,0.6)",
          "circle-opacity": 0.85,
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "obras",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 13,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: "obras-pulse",
        type: "circle",
        source: "obras",
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["==", ["get", "is_red_flag"], true],
        ],
        paint: {
          "circle-color": "#ef4444",
          "circle-radius": 8,
          "circle-opacity": 0,
          "circle-stroke-color": "#ef4444",
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0.5,
        },
      });

      map.addLayer({
        id: "obras-points",
        type: "circle",
        source: "obras",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "riesgo"],
            "alto",
            "#ef4444",
            "medio",
            "#f59e0b",
            "#10b981",
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            4,
            10,
            7,
            14,
            11,
            18,
            16,
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(255,255,255,0.9)",
          "circle-opacity": 0.92,
        },
      });

      map.addLayer({
        id: "obras-points-selected",
        type: "circle",
        source: "obras",
        filter: ["==", ["get", "id"], -1],
        paint: {
          "circle-color": "#ffffff",
          "circle-radius": 16,
          "circle-stroke-width": 4,
          "circle-stroke-color": "#42dc3a",
          "circle-opacity": 0.4,
        },
      });

      map.on("mouseenter", "obras-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "obras-points", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", "clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "clusters", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "obras-points", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties?.id as number | undefined;
        if (id != null) {
          const o = obrasById.current.get(id);
          if (o) onSelect(o);
        }
      });

      map.on("click", "clusters", async (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const clusterId = f.properties?.cluster_id;
        const src = map.getSource("obras") as GeoJSONSource;
        try {
          const zoom = await src.getClusterExpansionZoom(clusterId);
          map.easeTo({
            center: (f.geometry as GeoJSON.Point).coordinates as [number, number],
            zoom,
          });
        } catch {
          /* noop */
        }
      });

      rafId = requestAnimationFrame(pulse);

      // Resize defensivo por si el container medía 0 al montar
      setTimeout(() => map.resize(), 100);
      setTimeout(() => map.resize(), 600);
    });

    mapRef.current = map;

    return () => {
      cancelAnimationFrame(rafId);
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          /* noop */
        }
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refrescar source cuando llegan obras nuevas
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("obras") as GeoJSONSource | undefined;
      if (src) src.setData(toFeatureCollection(obras));
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [obras]);

  // Actualizar selección + flyTo
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer("obras-points-selected")) return;
      map.setFilter("obras-points-selected", [
        "==",
        ["get", "id"],
        selectedId ?? -1,
      ]);
      if (selectedId != null) {
        const o = obrasById.current.get(selectedId);
        if (o?.lat != null && o.lng != null) {
          map.easeTo({
            center: [Number(o.lng), Number(o.lat)],
            zoom: Math.max(map.getZoom(), 13.5),
            duration: 1400,
          });
        }
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [selectedId]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        background: "#0a0a0a",
      }}
    />
  );
}
