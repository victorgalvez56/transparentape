"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Obra, riesgoDeObra } from "@/lib/types";
import CodexHeader from "@/components/codex/CodexHeader";
import CodexFilterBar, {
  PaisFiltro,
  RiesgoFiltro,
} from "@/components/codex/CodexFilterBar";
import CodexObraList from "@/components/codex/CodexObraList";
import CodexObraCard from "@/components/codex/CodexObraCard";
import CodexObraDetail from "@/components/codex/CodexObraDetail";

const CodexGlobe = dynamic(() => import("@/components/codex/CodexGlobe"), {
  ssr: false,
  loading: () => (
    <div
      className="absolute inset-0 grid place-items-center text-xs"
      style={{ color: "var(--cx-faint)" }}
    >
      Cargando globo…
    </div>
  ),
});

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
  const [loading, setLoading] = useState(true);
  const [dbStats, setDbStats] = useState<{ total: number; geo: number } | null>(
    null
  );
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [view, setView] = useState<"globe" | "grid">("globe");
  const [selected, setSelected] = useState<Obra | null>(null);
  const [mobileList, setMobileList] = useState(false);

  const [pais, setPais] = useState<PaisFiltro>("todos");
  const [region, setRegion] = useState<string | null>(null);
  const [riesgo, setRiesgo] = useState<RiesgoFiltro>("todas");
  const [soloRedFlags, setSoloRedFlags] = useState(false);
  const [q, setQ] = useState("");

  // Tema persistido
  useEffect(() => {
    const saved = localStorage.getItem("cx-theme");
    const next: "light" | "dark" =
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia?.("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    // Sync inicial desde un sistema externo (localStorage / preferencia del SO).
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
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Carga TODAS las obras geocodificadas (~62k) vía endpoint ligero.
  // Sin el cap de 5000 de /api/obras.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/obras/points")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setObras((d?.obras ?? []) as Obra[]);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
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

  const nf = (n: number) => n.toLocaleString("es-PE");
  const statsLine = loading
    ? `cargando ${dbStats ? nf(dbStats.geo) + " obras geo…" : "datos…"}`
    : `${nf(filtered.length)}${
        dbStats ? ` / ${nf(dbStats.geo)} geo` : ""
      } · ${dbStats ? nf(dbStats.total) + " en base · " : ""}${redFlagsCount} alertas`;

  return (
    <main
      className={`cx-scope ${theme === "dark" ? "dark" : ""} h-dvh flex flex-col overflow-hidden`}
    >
      <CodexHeader
        stats={statsLine}
        view={view}
        onViewChange={setView}
        theme={theme}
        onThemeToggle={() =>
          setTheme((t) => (t === "dark" ? "light" : "dark"))
        }
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
      />

      <CodexFilterBar
        pais={pais}
        onPais={(p) => {
          setPais(p);
          setRegion(null);
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

      {view === "globe" ? (
        <div className="flex-1 flex min-h-0 relative">
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <CodexGlobe
              obras={filtered}
              selectedId={selected?.id ?? null}
              onSelect={toggleSelect}
              theme={theme}
            />
          </div>

          <aside
            className="w-80 border-l shrink-0 hidden lg:flex flex-col"
            style={{ borderColor: "var(--cx-border)" }}
          >
            <CodexObraList
              obras={visible}
              selectedId={selected?.id ?? null}
              onSelect={toggleSelect}
              q={q}
              onQ={setQ}
              totalAll={filtered.length}
            />
          </aside>

          {selected && (
            <CodexObraDetail
              obra={selected}
              onClose={() => setSelected(null)}
            />
          )}

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
                />
              </div>
            </div>
          )}
        </div>
      ) : (
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
              <div key={group}>
                <div className="flex items-center gap-2 mb-3">
                  <h2
                    className="text-xs sm:text-sm font-semibold uppercase tracking-wider"
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
      )}
    </main>
  );
}
