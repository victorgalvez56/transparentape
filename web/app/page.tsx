"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Obra } from "@/lib/types";
import ObrasListPanel from "@/components/ObrasListPanel";
import ObraDetailPanel from "@/components/ObraDetailPanel";
import ForensicsPanel from "@/components/ForensicsPanel";
import ColdOpen from "@/components/ColdOpen";
import AuthorityHud from "@/components/AuthorityHud";
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

  // Reset cold open con ?reset=1
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "1") {
      sessionStorage.removeItem("coldOpenSeen");
      window.history.replaceState({}, "", window.location.pathname);
    }
    setShowColdOpen(sessionStorage.getItem("coldOpenSeen") !== "1");
  }, []);

  // Stats globales (para cold open + HUD) — corre primero, rápido
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

  // Fetch obras con coordenadas — para el mapa
  useEffect(() => {
    let cancelled = false;
    fetch("/api/obras?limit=3000&with_coords=true")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setObras(data.obras ?? []);
        setSource(data.source ?? "");
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Caso del día: tras cold open + obras cargadas, abrir 1 red_flag con mayor monto
  useEffect(() => {
    if (obras.length === 0 || selected || showColdOpen !== false) return;
    const t = setTimeout(() => {
      const candidato = [...obras]
        .filter((o) => o.is_red_flag && o.lat != null && o.lng != null)
        .sort(
          (a, b) =>
            (b.contract_amount ?? b.award_amount ?? 0) -
            (a.contract_amount ?? a.award_amount ?? 0)
        )[0];
      if (candidato) setSelected(candidato);
    }, 1800);
    return () => clearTimeout(t);
  }, [obras, selected, showColdOpen]);

  return (
    <main className="relative w-screen h-screen overflow-hidden globe-bg">
      {showColdOpen && (
        <ColdOpen
          total={stats?.total_monto}
          onDone={() => {
            sessionStorage.setItem("coldOpenSeen", "1");
            setShowColdOpen(false);
          }}
        />
      )}

      <MapGlobe
        obras={obras}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
      />

      {!showColdOpen && (
        <AuthorityHud
          obrasCount={stats?.total_obras ?? obras.length}
          redFlagsCount={stats?.total_red_flags ?? 0}
          source={stats?.source ?? source}
        />
      )}

      {loading && (
        <div className="absolute bottom-4 left-4 z-10 bg-[var(--ink-1)]/80 backdrop-blur-md border border-[var(--rule)] px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--fg-dim)] font-mono">
          Cargando obras…
        </div>
      )}

      <ObrasListPanel
        obras={obras}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        total={stats?.total_obras ?? obras.length}
        source={stats?.source ?? source}
      />

      {selected && !showForensics && (
        <ObraDetailPanel
          obra={selected}
          onClose={() => setSelected(null)}
          onInvestigar={() => setShowForensics(true)}
        />
      )}

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
