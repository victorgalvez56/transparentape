"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Obra, riesgoDeObra } from "@/lib/types";
import { CountryView } from "@/lib/countries";
import { detectLocation } from "@/lib/regions";
import {
  preloadGeoJSON,
  getPeruDepts,
  getPeruProvs,
  getPeruDists,
} from "@/lib/geo";

interface Props {
  obras: Obra[];
  selectedId: number | null;
  onSelect: (o: Obra) => void;
  flyToCountry?: CountryView | null;
  onViewChange?: (label: string) => void;
}

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/**
 * Devuelve padding para encuadrar el área visible — excluye sidebar derecha
 * (~448px en >=md, 0 en mobile) y deja espacio arriba para el HUD.
 */
function getMapPadding() {
  if (typeof window === "undefined") {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
  const sidebar = window.innerWidth >= 768 ? 448 : 0;
  return { top: 80, bottom: 40, left: 40, right: sidebar };
}

/**
 * Padding para flyTo a marker seleccionado.
 * Define el rectángulo "visible" excluyendo los overlays (panel detalle
 * bottom-left, sidebar right, HUD top). MapLibre centra el destino en el
 * centro de ese rectángulo, garantizando que el halo del marker quede
 * en la franja libre entre overlays.
 *
 * Más predecible que `offset` cuando hay pitch alto.
 */
function getMarkerFlyToPadding() {
  if (typeof window === "undefined") {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
  const w = window.innerWidth;
  if (w < 768) {
    return { top: 80, bottom: 40, left: 20, right: 20 };
  }
  // El panel detalle está en bottom-LEFT, no bloquea verticalmente la zona
  // a su derecha. Por eso el padding bottom es solo un margen mínimo:
  // el centro vertical del área visible queda alineado con el centro
  // del viewport (no en el top como antes).
  const sidebarW = 448;
  const panelLeft = 24;
  const panelWidth = 560;
  return {
    top: 80, // HUD
    right: sidebarW + 40, // sidebar + margen
    left: panelLeft + panelWidth + 40, // hasta el final del panel + margen
    bottom: 60, // solo margen del bottom edge (panel está a la izquierda)
  };
}

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

export default function MapGlobe({
  obras,
  selectedId,
  onSelect,
  flyToCountry,
  onViewChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const obrasById = useRef<Map<number, Obra>>(new Map());
  const countryFlewToRef = useRef<string | null>(null);
  const onViewChangeRef = useRef<typeof onViewChange>(onViewChange);
  const emitViewRef = useRef<(() => void) | null>(null);
  // Tracking shot orbital — rotación de bearing tras flyTo
  const orbitalRafRef = useRef<number>(0);
  const orbitalActiveRef = useRef(false);
  const orbitalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startOrbitalRef = useRef<(() => void) | null>(null);
  const cancelOrbitalRef = useRef<(() => void) | null>(null);
  // Flag persistente — true tras el PRIMER load del style.
  // No usamos map.isStyleLoaded() porque retorna false transitoriamente
  // después de setProjection() y el evento `load` solo dispara una vez.
  const mapReadyRef = useRef(false);
  // DEBUG overlay state (quitar cuando todo esté validado)
  const [dbg, setDbg] = useState({
    zoom: 0,
    lng: 0,
    lat: 0,
    caches: "n/n/n",
    orbital: false,
    label: "—",
    obras: 0,
    byId: 0,
    obraLat: "—",
    obraLng: "—",
    effectRuns: 0,
    flyToCalls: 0,
    lastErr: "—",
  });
  const effectRunsRef = useRef(0);
  const flyToCallsRef = useRef(0);
  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  useEffect(() => {
    obrasById.current = new Map(obras.map((o) => [o.id, o]));
    setDbg((d) => ({ ...d, obras: obras.length, byId: obrasById.current.size }));
  }, [obras]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Precargar polígonos en background. La re-emisión post-load se dispara
    // más abajo, una vez que `emitView` está declarado.
    const geoReady = preloadGeoJSON();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [-75.0, -10.5],
      zoom: 4.6,
      pitch: 25,
      attributionControl: false,
    });
    // Emit del label de región — disparado por `idle` event
    // (idle = map estable + tiles cargados + sin animaciones pendientes)
    const emitView = (force = false) => {
      if (!force && orbitalActiveRef.current) return; // skip durante orbital (override con force=true)
      const cb = onViewChangeRef.current;
      if (!cb) return;
      const c = map.getCenter();
      const zoom = map.getZoom();
      const label = detectLocation(zoom, { lng: c.lng, lat: c.lat });
      cb(label);
      // DEBUG
      setDbg((d) => ({
        ...d,
        zoom: Math.round(zoom * 10) / 10,
        lng: Math.round(c.lng * 1000) / 1000,
        lat: Math.round(c.lat * 1000) / 1000,
        caches: `${getPeruDepts() ? "D" : "·"}${getPeruProvs() ? "P" : "·"}${getPeruDists() ? "L" : "·"}`,
        orbital: orbitalActiveRef.current,
        label,
      }));
    };
    const emitViewIdle = () => emitView(false);
    map.on("idle", emitViewIdle);
    emitViewRef.current = () => emitView(false);

    // Cuando los polígonos terminan de cargar, FORCE-re-emitir aunque el orbital
    // esté activo — corregimos el label de "Perú" que quedó cuando los caches eran null.
    geoReady.then(() => {
      if (mapRef.current) emitView(true);
    });

    // (QUITADO map.setPadding global — interfería con map.flyTo.
    //  El padding ahora se pasa inline en cada easeTo/flyTo que lo necesite.)
    map.once("load", () => {
      emitView(); // primera emisión cuando el style está listo
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
    let selPhase = 0;
    let outerPhase = 0;
    const pulse = () => {
      // Pulse de red_flags
      phase = (phase + 1) % 90;
      const t = phase / 90;
      if (map.getLayer("obras-pulse")) {
        map.setPaintProperty("obras-pulse", "circle-radius", 8 + 18 * t);
        map.setPaintProperty("obras-pulse", "circle-stroke-opacity", 0.6 * (1 - t));
      }
      // Halo INTERIOR pulsante — rápido y brillante
      selPhase = (selPhase + 1) % 90;
      const st = selPhase / 90;
      if (map.getLayer("obras-selected-pulse")) {
        map.setPaintProperty("obras-selected-pulse", "circle-radius", 18 + 22 * st);
        map.setPaintProperty(
          "obras-selected-pulse",
          "circle-stroke-opacity",
          0.95 * (1 - st)
        );
      }
      // Halo EXTERIOR pulsante — lento, ancho, sutil
      outerPhase = (outerPhase + 1) % 180;
      const ot = outerPhase / 180;
      if (map.getLayer("obras-selected-outer-pulse")) {
        map.setPaintProperty(
          "obras-selected-outer-pulse",
          "circle-radius",
          30 + 40 * ot
        );
        map.setPaintProperty(
          "obras-selected-outer-pulse",
          "circle-stroke-opacity",
          0.7 * (1 - ot)
        );
      }
      rafId = requestAnimationFrame(pulse);
    };

    // Tracking-shot orbital — definidas acá para acceso desde otros effects via ref
    const cancelOrbital = () => {
      orbitalActiveRef.current = false;
      if (orbitalRafRef.current) cancelAnimationFrame(orbitalRafRef.current);
      if (orbitalTimerRef.current) clearTimeout(orbitalTimerRef.current);
      orbitalTimerRef.current = null;
    };
    const startOrbital = () => {
      cancelOrbital();
      orbitalActiveRef.current = true;
      const duration = 7000;
      const startTime = performance.now();
      const startBearing = map.getBearing();
      const tick = (now: number) => {
        if (!orbitalActiveRef.current) return;
        const elapsed = now - startTime;
        if (elapsed >= duration) {
          orbitalActiveRef.current = false;
          // emit final tras el orbital
          emitView();
          return;
        }
        map.setBearing(startBearing - 360 * (elapsed / duration));
        orbitalRafRef.current = requestAnimationFrame(tick);
      };
      orbitalRafRef.current = requestAnimationFrame(tick);
    };
    startOrbitalRef.current = startOrbital;
    cancelOrbitalRef.current = cancelOrbital;

    // Cancelar orbital al primer input del usuario
    const onUserInteract = () => cancelOrbital();
    map.on("mousedown", onUserInteract);
    map.on("wheel", onUserInteract);
    map.on("touchstart", onUserInteract);
    map.on("dragstart", onUserInteract);

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

      // Glow exterior — background blur del marker seleccionado
      map.addLayer({
        id: "obras-selected-glow",
        type: "circle",
        source: "obras",
        filter: ["==", ["get", "id"], -1],
        paint: {
          "circle-color": "#42dc3a",
          "circle-radius": 28,
          "circle-opacity": 0.25,
          "circle-blur": 1,
        },
      });

      // Halo exterior pulsante — frecuencia LENTA
      map.addLayer({
        id: "obras-selected-outer-pulse",
        type: "circle",
        source: "obras",
        filter: ["==", ["get", "id"], -1],
        paint: {
          "circle-color": "rgba(0,0,0,0)",
          "circle-radius": 30,
          "circle-stroke-color": "#42dc3a",
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0,
        },
      });

      // Halo interior pulsante — frecuencia RÁPIDA
      map.addLayer({
        id: "obras-selected-pulse",
        type: "circle",
        source: "obras",
        filter: ["==", ["get", "id"], -1],
        paint: {
          "circle-color": "rgba(0,0,0,0)",
          "circle-radius": 18,
          "circle-stroke-color": "#42dc3a",
          "circle-stroke-width": 3,
          "circle-stroke-opacity": 0,
        },
      });

      // Núcleo blanco brillante GRANDE con borde brand grueso
      map.addLayer({
        id: "obras-points-selected",
        type: "circle",
        source: "obras",
        filter: ["==", ["get", "id"], -1],
        paint: {
          "circle-color": "#ffffff",
          "circle-radius": 12,
          "circle-stroke-width": 4,
          "circle-stroke-color": "#42dc3a",
          "circle-opacity": 1,
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

      // Marcar el map como listo. Persiste para siempre — no se recetea
      // por setProjection o cambios transitorios de isStyleLoaded().
      mapReadyRef.current = true;
    });

    mapRef.current = map;

    // (resize listener simplificado — el padding se aplica inline ahora)
    const onResize = () => {
      try {
        map.resize();
      } catch {
        /* noop */
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelOrbital();
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
    if (mapReadyRef.current) apply();
    else map.once("load", apply);
  }, [obras]);

  // Ease suave al país detectado del usuario (después del cold open)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToCountry) return;
    if (countryFlewToRef.current === flyToCountry.code) return;
    countryFlewToRef.current = flyToCountry.code;
    const apply = () => {
      map.easeTo({
        center: flyToCountry.center,
        zoom: flyToCountry.zoom,
        padding: getMapPadding(),
        duration: 2400,
      });
    };
    if (mapReadyRef.current) apply();
    else map.once("load", apply);
  }, [flyToCountry]);

  // Actualizar selección + flyTo (con debug paso a paso)
  useEffect(() => {
    effectRunsRef.current++;
    const step = (s: string) =>
      setDbg((d) => ({ ...d, effectRuns: effectRunsRef.current, lastErr: s }));
    step("1:start sel=" + selectedId);

    const map = mapRef.current;
    if (!map) {
      step("2a:no-map");
      return;
    }
    step("2b:map-ok");

    const filt: ["==", ["get", string], number] = [
      "==",
      ["get", "id"],
      selectedId ?? -1,
    ];
    try {
      // Sync filter en LAS 4 LAYERS del highlight
      for (const lid of [
        "obras-selected-glow",
        "obras-selected-outer-pulse",
        "obras-selected-pulse",
        "obras-points-selected",
      ]) {
        if (map.getLayer(lid)) map.setFilter(lid, filt);
      }
      step("3:filters-ok");
    } catch (e) {
      step("3-err:" + String(e).slice(0, 30));
    }

    cancelOrbitalRef.current?.();

    if (selectedId == null) {
      step("4:no-sel");
      return;
    }

    const obrasMap = obrasById.current;
    const o = obrasMap.get(selectedId);
    setDbg((d) => ({
      ...d,
      byId: obrasMap.size,
      obraLat: o?.lat != null ? String(o.lat).slice(0, 9) : "—",
      obraLng: o?.lng != null ? String(o.lng).slice(0, 9) : "—",
    }));

    if (!o) {
      step("5a:obra-NOT-found byId=" + obrasMap.size);
      return;
    }
    if (o.lat == null || o.lng == null) {
      step("5b:obra-sin-coords");
      return;
    }
    step("6:about-to-flyTo");

    try {
      // CRÍTICO: cancelar cualquier animación previa
      map.stop();

      flyToCallsRef.current++;
      const targetLng = Number(o.lng);
      const targetLat = Number(o.lat);
      const targetZoom = 15;
      const targetPitch = 55;
      const targetBearing = -12;

      // flyTo cinematográfico — padding define el área visible
      // (entre panel detalle bottom-left y sidebar right)
      map.flyTo({
        center: [targetLng, targetLat],
        zoom: targetZoom,
        pitch: targetPitch,
        bearing: targetBearing,
        duration: 2000,
        essential: true,
        padding: getMarkerFlyToPadding(),
      });
      setDbg((d) => ({
        ...d,
        flyToCalls: flyToCallsRef.current,
        lastErr: "7:flyTo-called",
      }));

      // FALLBACK DE SEGURIDAD + force emit del label con valores target
      setTimeout(() => {
        const m = mapRef.current;
        if (!m) return;
        const dz = Math.abs(m.getZoom() - targetZoom);
        if (dz > 0.5) {
          m.easeTo({
            center: [targetLng, targetLat],
            zoom: targetZoom,
            pitch: targetPitch,
            bearing: targetBearing,
            duration: 0,
            padding: getMarkerFlyToPadding(),
          });
          setDbg((d) => ({ ...d, lastErr: "8:fallback-snap" }));
        } else {
          setDbg((d) => ({ ...d, lastErr: "8:flyTo-completed-ok" }));
        }
        // FORCE EMIT con los valores TARGET conocidos — independiente del
        // estado del map. Garantiza que el label muestre "Perú · Lima · Miraflores"
        // sin depender de idle event ni del getCenter()/getZoom() actuales.
        const cb = onViewChangeRef.current;
        if (cb) {
          cb(detectLocation(targetZoom, { lng: targetLng, lat: targetLat }));
        }
      }, 2400);
    } catch (e) {
      step("7-err:" + String(e).slice(0, 30));
      return;
    }

    if (orbitalTimerRef.current) clearTimeout(orbitalTimerRef.current);
    orbitalTimerRef.current = setTimeout(() => {
      startOrbitalRef.current?.();
    }, 2800);
  }, [selectedId]);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background: "#0a0a0a",
        }}
      />
    </>
  );
}
