"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Obra, riesgoDeObra } from "@/lib/types";
import { PE_CL_VIEW, CountryView, getCountryView } from "@/lib/countries";
import CustomCursor from "@/components/CustomCursor";
import DataLoader from "@/components/DataLoader";
import Tour from "@/components/Tour";
import ForensicsPanel from "@/components/ForensicsPanel";
import CodexObraDetailInline from "@/components/codex/CodexObraDetailInline";
import AgentWidget from "@/components/AgentWidget";
import CodexHeader from "@/components/codex/CodexHeader";
import CodexFilterBar, {
  PaisFiltro,
  RiesgoFiltro,
} from "@/components/codex/CodexFilterBar";
import CodexObraList from "@/components/codex/CodexObraList";
import CodexObraCard from "@/components/codex/CodexObraCard";
import CodexObraDetail from "@/components/codex/CodexObraDetail";
import CodexDashboard from "@/components/codex/CodexDashboard";

const MapGlobe = dynamic(() => import("@/components/MapGlobe"), {
  ssr: false,
  loading: () => (
    <div
      className="absolute inset-0 grid place-items-center text-xs"
      style={{ color: "var(--cx-faint)" }}
    >
      Cargando mapa…
    </div>
  ),
});

// useGSAP debe registrarse antes de cualquier código GSAP (cleanup automático).
gsap.registerPlugin(useGSAP);

const MAX_REGION_CHIPS = 28;
const RENDER_CAP = 600;

function search(o: Obra, lower: string): boolean {
  if (!lower) return true;
  return [
    o.tender_title,
    o.tender_description,
    o.buyer_name,
    o.supplier_name,
    o.buyer_locality,
    o.buyer_region,
    o.supplier_ruc,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(lower);
}

export default function CodexHomePage() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true); // true hasta el 1er paint
  const [streaming, setStreaming] = useState(true); // true mientras llega el resto
  const [loaded, setLoaded] = useState(0); // obras ya cargadas (progreso)
  const [dbStats, setDbStats] = useState<{
    total: number;
    geo: number;
    monto: number;
  } | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [view, setView] = useState<"globe" | "grid" | "panel">("globe");
  const [selected, setSelected] = useState<Obra | null>(null);
  const [showForensics, setShowForensics] = useState(false);
  const [mobileList, setMobileList] = useState(false);

  const [pais, setPais] = useState<PaisFiltro>("todos");
  const [region, setRegion] = useState<string | null>(null);
  const [riesgo, setRiesgo] = useState<RiesgoFiltro>("todas");
  const [soloRedFlags, setSoloRedFlags] = useState(false);
  const [q, setQ] = useState("");

  /**
   * mapPhase — animacion inicial del globo:
   * "global"  = vista mundo completa, pausa 1.5s
   * "country" = zoom directo al país del usuario (geoView: PE o CL)
   */
  const [mapPhase, setMapPhase] = useState<"global" | "country">("global");
  const [flyTarget, setFlyTarget] = useState<CountryView | null>(null);

  /**
   * geoView — país del usuario (PE o CL) detectado por /api/geo. El globo
   * hace UN solo zoom directo a ese país tras el cold open, en vez de la
   * vista lejana combinada PE_CL. Datos son PE/CL → CL: Chile; resto: Perú.
   */
  const [geoView, setGeoView] = useState<CountryView | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/geo")
      .then((r) => r.json())
      .then((d: { detected?: string }) => {
        if (cancelled) return;
        const code = String(d?.detected ?? "")
          .toUpperCase()
          .slice(0, 2);
        setGeoView(getCountryView(code === "CL" ? "CL" : "PE"));
      })
      .catch(() => {
        if (!cancelled) setGeoView(getCountryView("PE"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // global → country: volamos directo al país del usuario apenas /api/geo
  // resuelve (delay 0). Fallback corto (900ms) si geo tarda/falla, para que
  // el zoom siga siendo rápido. Sólo corre tras pasar el ColdOpen.
  useEffect(() => {
    if (mapPhase !== "global") return;
    const t = setTimeout(() => setMapPhase("country"), geoView ? 0 : 900);
    return () => clearTimeout(t);
  }, [mapPhase, geoView]);

  /**
   * ?reset=1 — limpia filtros y re-dispara el tour desde cero. El reset es
   * un evento puntual disparado por la URL, no un render normal.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") !== "1") return;
    sessionStorage.removeItem("tourSeen");
    window.history.replaceState({}, "", window.location.pathname);
    /* eslint-disable react-hooks/set-state-in-effect */
    setPais("todos");
    setRegion(null);
    setRiesgo("todas");
    setSoloRedFlags(false);
    setQ("");
    setSelected(null);
    setShowForensics(false);
    setFlyTarget(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Tema persistido
  useEffect(() => {
    const saved = localStorage.getItem("cx-theme");
    const next: "light" | "dark" =
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia?.("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(next);
  }, []);
  useEffect(() => {
    localStorage.setItem("cx-theme", theme);
  }, [theme]);

  // Totales reales de la base (para el header) — corre rápido
  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setDbStats({
          total: Number(d?.total_obras ?? 0),
          geo: Number(d?.with_coords ?? 0),
          monto: Number(d?.total_monto ?? 0),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Carga PROGRESIVA de las ~62k obras geocodificadas.
  //  1) /api/obras/points/chunk?priority=1 → top ~2000 (red flags + montos
  //     altos) para un primer paint inmediato y relevante (loading → false).
  //  2) Resto por keyset sobre id (?after=) en background, deduplicando por
  //     id; cada página actualiza el mapa/lista y el contador de progreso.
  // Endpoint NUEVO; /api/obras/points queda intacto como fallback.
  useEffect(() => {
    let cancelled = false;
    const byId = new Map<number, Obra>();

    const flush = () => {
      if (cancelled) return;
      setObras(Array.from(byId.values()));
      setLoaded(byId.size);
    };

    (async () => {
      try {
        const pr = await fetch("/api/obras/points/chunk?priority=1")
          .then((r) => r.json())
          .catch(() => null);
        if (cancelled) return;
        for (const o of (pr?.obras ?? []) as Obra[]) byId.set(o.id, o);
        flush();
        setLoading(false); // UI ya interactiva con lo más relevante

        let cursor = 0;
        let done = false;
        let guard = 0;
        while (!done && !cancelled && guard++ < 60) {
          const pg = await fetch(
            `/api/obras/points/chunk?after=${cursor}&limit=8000`
          )
            .then((r) => r.json())
            .catch(() => null);
          if (cancelled || !pg) break;
          const page = (pg.obras ?? []) as Obra[];
          for (const o of page) byId.set(o.id, o);
          flush();
          const next = Number(pg.nextCursor ?? cursor);
          done = Boolean(pg.done) || page.length === 0 || next <= cursor;
          cursor = next;
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setStreaming(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const paisCounts = useMemo<Record<PaisFiltro, number>>(
    () => ({
      todos: obras.length,
      PE: obras.filter((o) => o.country !== "CL").length,
      CL: obras.filter((o) => o.country === "CL").length,
    }),
    [obras]
  );

  const byPais = useMemo(
    () =>
      pais === "todos"
        ? obras
        : obras.filter((o) =>
            pais === "CL" ? o.country === "CL" : o.country !== "CL"
          ),
    [obras, pais]
  );

  const regions = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of byPais) {
      const r = o.buyer_region?.trim();
      if (r) m.set(r, (m.get(r) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_REGION_CHIPS)
      .map(([name, count]) => ({ name, count }));
  }, [byPais]);

  const scope = useMemo(
    () =>
      region ? byPais.filter((o) => o.buyer_region?.trim() === region) : byPais,
    [byPais, region]
  );

  const riesgoCounts = useMemo<Record<RiesgoFiltro, number>>(() => {
    const c = { todas: scope.length, alto: 0, medio: 0, bajo: 0 };
    for (const o of scope) c[riesgoDeObra(o)]++;
    return c;
  }, [scope]);

  const redFlagsCount = useMemo(
    () => scope.filter((o) => o.is_red_flag).length,
    [scope]
  );

  const filtered = useMemo(() => {
    const lower = q.trim().toLowerCase();
    return scope.filter((o) => {
      if (riesgo !== "todas" && riesgoDeObra(o) !== riesgo) return false;
      if (soloRedFlags && !o.is_red_flag) return false;
      return search(o, lower);
    });
  }, [scope, riesgo, soloRedFlags, q]);

  // Cap de render: el globo recibe `filtered` completo (muestrea adentro),
  // pero la lista/grid sólo pinta los primeros N para no congelar el DOM
  // con 62k nodos. La paginación real es un mejora posterior.
  const visible = useMemo(() => filtered.slice(0, RENDER_CAP), [filtered]);

  const grouped = useMemo(() => {
    const m = new Map<string, Obra[]>();
    for (const o of visible) {
      const key =
        o.buyer_region?.trim() ||
        (o.country === "CL" ? "Chile" : "Sin región");
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(o);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [visible]);

  const hasFilters =
    pais !== "todos" ||
    region !== null ||
    riesgo !== "todas" ||
    soloRedFlags ||
    q.trim() !== "";

  const clearFilters = () => {
    setPais("todos");
    setRegion(null);
    setRiesgo("todas");
    setSoloRedFlags(false);
    setQ("");
  };

  const toggleSelect = (o: Obra | null) => {
    setSelected((prev) => (prev && o && prev.id === o.id ? null : o));
    setMobileList(false);
  };

  // ── GSAP ──────────────────────────────────────────────────────────────
  // Convive con motion/react: GSAP hace la entrada + el stagger del grid;
  // motion sigue manejando el swap lista↔detalle del sidebar.
  const gsapRoot = useRef<HTMLElement>(null);

  // Entrada (una sola vez): header → filterbar → sidebar.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap
          .timeline({ defaults: { ease: "power3.out", duration: 0.6 } })
          .from("header", { y: -18, autoAlpha: 0 })
          .from(
            '[data-gsap="filterbar"]',
            { y: -12, autoAlpha: 0 },
            "-=0.35"
          )
          .from('[data-gsap="sidebar"]', { x: 28, autoAlpha: 0 }, "-=0.4");
      });
    },
    { scope: gsapRoot }
  );

  // Stagger del grid: re-corre al entrar a "grid" o al cambiar los grupos.
  useGSAP(
    () => {
      if (view !== "grid") return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from('[data-gsap="grid-group"]', {
          y: 20,
          autoAlpha: 0,
          duration: 0.5,
          ease: "power2.out",
          stagger: { amount: 0.4, from: "start" },
        });
      });
    },
    {
      scope: gsapRoot,
      dependencies: [view, grouped.length],
      revertOnUpdate: true,
    }
  );

  const filterBarEl = (
    <CodexFilterBar
      pais={pais}
      onPais={(p) => {
        setPais(p);
        setRegion(null);
        if (p === "PE") setFlyTarget(getCountryView("PE"));
        else if (p === "CL") setFlyTarget(getCountryView("CL"));
        else setFlyTarget(PE_CL_VIEW);
      }}
      paisCounts={paisCounts}
      region={region}
      onRegion={setRegion}
      regions={regions}
      riesgo={riesgo}
      onRiesgo={setRiesgo}
      riesgoCounts={riesgoCounts}
      soloRedFlags={soloRedFlags}
      onRedFlags={setSoloRedFlags}
      redFlagsCount={redFlagsCount}
    />
  );

  return (
    <main
      ref={gsapRoot}
      className={`cx-scope ${theme === "dark" ? "dark" : ""} h-dvh flex flex-col overflow-hidden`}
    >
      <CodexHeader
        obrasCount={filtered.length}
        redFlagsCount={redFlagsCount}
        regionLabel={region ?? (pais === "CL" ? "Chile" : "Perú")}
        view={view}
        onViewChange={setView}
        theme={theme}
        onThemeToggle={() =>
          setTheme((t) => (t === "dark" ? "light" : "dark"))
        }
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
      />

      {view === "panel" ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <CodexDashboard />
        </div>
      ) : view === "globe" ? (
        <div className="flex-1 min-h-0 relative">
          {/* Globo ocupa TODO el container — encima va overlay blur de filterbar + sidebar */}
          <div className="absolute inset-0">
            <MapGlobe
              key={`mg-${theme}`}
              obras={filtered}
              selectedId={selected?.id ?? null}
              onSelect={toggleSelect}
              themeOverride={theme}
              flyToCountry={
                flyTarget ??
                (mapPhase === "country" ? geoView ?? PE_CL_VIEW : null)
              }
            />
          </div>

          {/* FilterBar overlay — full width en mobile, hasta sidebar (lg:right-80) en desktop */}
          <div
            data-gsap="filterbar"
            data-tour="filters"
            className="absolute top-0 left-0 right-0 lg:right-80 z-10"
          >
            {filterBarEl}
          </div>

          {/* Sidebar overlay derecho — navigation stack: lista (foto 1) ↔ detalle embedded (foto 2) */}
          <aside
            data-gsap="sidebar"
            data-tour="list"
            className="absolute right-0 top-0 bottom-0 w-80 z-10 border-l hidden lg:block backdrop-blur-xl overflow-hidden"
            style={{
              borderColor: "var(--cx-border)",
              background: "var(--cx-bg-blur)",
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {selected && !showForensics ? (
                <motion.div
                  key="detail-view"
                  initial={{ x: 32, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 32, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 flex flex-col"
                >
                  {/* Header back — formato "← VOLVER AL ÍNDICE · N | CASO · year" */}
                  <div
                    className="flex items-center justify-between px-4 py-3 border-b shrink-0"
                    style={{ borderColor: "var(--cx-border)" }}
                  >
                    <button
                      onClick={() => setSelected(null)}
                      className="flex items-center gap-2 text-[11.5px] tracking-tight hover:opacity-80 transition font-medium"
                      style={{
                        color: "var(--cx-muted)",
                        fontFamily: "var(--font-body), system-ui, sans-serif",
                      }}
                    >
                      ← Volver al índice · {filtered.length}
                    </button>
                    <span
                      className="text-[11.5px] tracking-tight font-medium"
                      style={{
                        color: "var(--cx-muted)",
                        fontFamily: "var(--font-body), system-ui, sans-serif",
                      }}
                    >
                      Caso · {selected.source_year ?? "—"}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0">
                    <CodexObraDetailInline
                      obra={selected}
                      onInvestigar={() => setShowForensics(true)}
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="list-view"
                  initial={{ x: -32, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -32, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 flex flex-col"
                >
                  <CodexObraList
                    obras={visible}
                    selectedId={selected?.id ?? null}
                    onSelect={toggleSelect}
                    q={q}
                    onQ={setQ}
                    totalAll={filtered.length}
                    loading={loading}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </aside>

          {selected && showForensics && (
            <ForensicsPanel
              obra={selected}
              onClose={() => setShowForensics(false)}
            />
          )}

          <DataLoader
            show={streaming}
            loaded={loaded}
            total={dbStats?.geo ?? 0}
          />

          {/* Mobile: botón + overlay lista */}
          <div className="lg:hidden absolute bottom-4 left-0 right-0 flex justify-center z-20">
            <button
              onClick={() => setMobileList(true)}
              className="px-4 py-2 rounded-full text-xs font-medium border shadow-lg active:scale-95 transition-transform"
              style={{
                background: "var(--cx-card)",
                borderColor: "var(--cx-border)",
                color: "var(--cx-fg)",
              }}
            >
              {filtered.length} obras
            </button>
          </div>
          {mobileList && (
            <div
              className="lg:hidden absolute inset-0 z-30 flex flex-col"
              style={{ background: "var(--cx-bg)" }}
            >
              <div
                className="flex items-center justify-between px-3 py-2.5 border-b"
                style={{ borderColor: "var(--cx-border)" }}
              >
                <span className="text-sm font-semibold">
                  {filtered.length} obras
                </span>
                <button
                  onClick={() => setMobileList(false)}
                  className="text-xs"
                  style={{ color: "var(--cx-muted)" }}
                >
                  Cerrar
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <CodexObraList
                  obras={visible}
                  selectedId={selected?.id ?? null}
                  onSelect={toggleSelect}
                  q={q}
                  onQ={setQ}
                  totalAll={filtered.length}
                  loading={loading}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {filterBarEl}
          <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-6">
            {grouped.length === 0 && (
              <p
                className="py-16 text-center text-sm"
                style={{ color: "var(--cx-faint)" }}
              >
                {loading
                  ? "Cargando obras…"
                  : "Ninguna obra coincide con el filtro."}
              </p>
            )}
            {grouped.map(([group, members]) => (
              <div key={group} data-gsap="grid-group">
                <div className="flex items-center gap-2 mb-3">
                  <h2
                    className="text-xs sm:text-sm font-semibold tracking-tight"
                    style={{ color: "var(--cx-muted)" }}
                  >
                    {group}
                  </h2>
                  <span
                    className="text-xs"
                    style={{
                      color: "var(--cx-faint)",
                      fontFamily: "var(--font-mono), monospace",
                    }}
                  >
                    {members.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                  {members.map((o) => (
                    <CodexObraCard
                      key={o.id}
                      obra={o}
                      compact
                      selected={selected?.id === o.id}
                      onClick={() => toggleSelect(o)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {selected && (
            <div className="fixed inset-0 z-30 pointer-events-none">
              <div className="pointer-events-auto">
                <CodexObraDetail
                  obra={selected}
                  onClose={() => setSelected(null)}
                />
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      <Tour enabled={!loading && view === "globe"} />

      <AgentWidget />
      <CustomCursor />
    </main>
  );
}
