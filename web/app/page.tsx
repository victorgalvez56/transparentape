"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Obra } from "@/lib/types";
import {
  CountryView,
  DEFAULT_COUNTRY,
  availableCountriesWithCount,
  getCountryView,
} from "@/lib/countries";
import ObrasListPanel from "@/components/ObrasListPanel";
import ObraDetailPanel from "@/components/ObraDetailPanel";
import ForensicsPanel from "@/components/ForensicsPanel";
import ColdOpen from "@/components/ColdOpen";
import Topbar from "@/components/Topbar";
import CountryChips from "@/components/CountryChips";
import CustomCursor from "@/components/CustomCursor";

const MapGlobe = dynamic(() => import("@/components/MapGlobe"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-black text-white/40 text-sm">
      Cargando mapa…
    </div>
  ),
});

interface Stats {
  total_obras: number;
  total_red_flags: number;
  with_coords: number;
  total_monto: number;
  source: string;
}

export default function HomePage() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [source, setSource] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Obra | null>(null);
  const [showForensics, setShowForensics] = useState(false);
  const [showColdOpen, setShowColdOpen] = useState<boolean | null>(null);
  const [userCountry, setUserCountry] = useState<CountryView | null>(null);
  const [regionLabel, setRegionLabel] = useState<string>("Perú");
  const [view, setView] = useState<"globe" | "list">("globe");
  const [filterCountry, setFilterCountry] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<CountryView | null>(null);
  /**
   * mapPhase: timeline de la animacion inicial
   * - "cold": ColdOpen overlay activo
   * - "global": ColdOpen termino, vista del planeta entero, pausa 1.5s
   * - "country": flyTo al pais del user, usuario toma control
   */
  const [mapPhase, setMapPhase] = useState<"cold" | "global" | "country">(
    "cold"
  );

  // Reset cold open con ?reset=1
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "1") {
      sessionStorage.removeItem("coldOpenSeen");
      window.history.replaceState({}, "", window.location.pathname);
    }
    const shouldShowCold = sessionStorage.getItem("coldOpenSeen") !== "1";
    setShowColdOpen(shouldShowCold);
    // Si ya vio cold open en esta sesion, igual hacemos pausa global → country
    if (!shouldShowCold) setMapPhase("global");
  }, []);

  // Phase transition: global → country despues de pausa 1.5s
  useEffect(() => {
    if (mapPhase !== "global") return;
    const t = setTimeout(() => setMapPhase("country"), 1500);
    return () => clearTimeout(t);
  }, [mapPhase]);

  // Stats globales — corre rápido, alimenta cold open + HUD
  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Detección del país del usuario (Cloudflare → accept-language → default PE)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/geo")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.country) setUserCountry(data.country);
      })
      .catch(() => {
        if (!cancelled) setUserCountry(DEFAULT_COUNTRY);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch obras con coordenadas — para el mapa
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/obras?limit=2800&with_coords=true").then((r) => r.json()),
      fetch("/api/obras?country=CL&limit=2000&with_coords=true").then((r) => r.json()),
    ])
      .then(([pe, cl]) => {
        if (cancelled) return;
        const clIds = new Set((cl.obras ?? []).map((o: Obra) => o.id));
        const merged = [
          ...(cl.obras ?? []),
          ...(pe.obras ?? []).filter((o: Obra) => !clIds.has(o.id)),
        ];
        setObras(merged);
        setSource(pe.source ?? "");
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Derived: lista de países con count y obras filtradas
  const countriesWithCount = availableCountriesWithCount(obras);
  const visibleObras = filterCountry
    ? obras.filter((o) => o.country?.toUpperCase() === filterCountry)
    : obras;

  const handleSelectCountry = (code: string | null) => {
    setFilterCountry(code);
    if (code) {
      const cv = getCountryView(code);
      setFlyTarget({ ...cv });
    } else {
      // "Todos" — zoom out a vista global
      setFlyTarget({ code: "WORLD", name: "Vista global", center: [0, 5], zoom: 1.5 });
    }
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden globe-bg">
      {showColdOpen && (
        <ColdOpen
          total={stats?.total_monto}
          onDone={() => {
            sessionStorage.setItem("coldOpenSeen", "1");
            setShowColdOpen(false);
            // Triggers: pausa global → country (con flyTo) — Phase 5
            setMapPhase("global");
          }}
        />
      )}

      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          view === "globe" ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <MapGlobe
          obras={visibleObras}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          flyToCountry={
            // Solo volar al pais del user cuando entramos a fase "country".
            // Durante "global" la camara se queda en vista mundial (1.5s pausa).
            // Si el user clickea un chip (flyTarget), siempre prevalece.
            flyTarget ?? (mapPhase === "country" ? userCountry : null)
          }
          onViewChange={setRegionLabel}
        />
      </div>

      {!showColdOpen && (
        <>
          <Topbar
            obrasCount={visibleObras.length}
            redFlagsCount={
              filterCountry
                ? visibleObras.filter((o) => o.is_red_flag).length
                : stats?.total_red_flags ?? 0
            }
            source={stats?.source ?? source}
            regionLabel={regionLabel}
            view={view}
            onToggleView={() => setView((v) => (v === "globe" ? "list" : "globe"))}
          />
          <CountryChips
            countries={countriesWithCount}
            selectedCode={filterCountry}
            onSelect={handleSelectCountry}
          />
        </>
      )}

      {loading && (
        <div className="absolute bottom-4 left-4 z-10 bg-[var(--ink-1)]/80 backdrop-blur-md border border-[var(--rule)] px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--fg-dim)] font-mono">
          Cargando obras…
        </div>
      )}

      <ObrasListPanel
        obras={visibleObras}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        total={visibleObras.length}
        source={stats?.source ?? source}
        fullWidth={view === "list"}
        detailSlot={
          selected && !showForensics ? (
            <ObraDetailPanel
              obra={selected}
              onClose={() => setSelected(null)}
              onInvestigar={() => setShowForensics(true)}
              embedded
            />
          ) : null
        }
      />

      {selected && showForensics && (
        <ForensicsPanel
          obra={selected}
          onClose={() => setShowForensics(false)}
        />
      )}

      <CustomCursor />
    </main>
  );
}
