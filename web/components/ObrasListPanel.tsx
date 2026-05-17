"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Obra, riesgoDeObra } from "@/lib/types";
import { fmtSoles, truncar, displayTitle } from "@/lib/format";

interface Props {
  obras: Obra[];
  selectedId: number | null;
  onSelect: (o: Obra) => void;
  total: number;
  source?: string;
  /** Cuando true, ocupa todo el ancho (modo "Lista" del topbar) */
  fullWidth?: boolean;
  /** Si hay obra seleccionada → takeover full-height del sidebar */
  detailSlot?: React.ReactNode;
  /** Metadata de la obra seleccionada para el back-header */
  detailHeader?: { locality: string | null; year: number | null } | null;
  /** Vuelve al listado preservando filtros/busqueda */
  onBackToList?: () => void;
}

type Filtro = "todas" | "alto" | "medio" | "bajo";

const FECHA_EDICION = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date());

export default function ObrasListPanel({
  obras,
  selectedId,
  onSelect,
  total,
  source,
  fullWidth = false,
  detailSlot,
  detailHeader,
  onBackToList,
}: Props) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const scrollContainerRef = useRef<HTMLUListElement | null>(null);

  // Auto-scroll: cuando se selecciona una obra desde el mapa, llevarla al top del sidebar
  useEffect(() => {
    if (selectedId == null) return;
    const el = itemRefs.current.get(selectedId);
    const container = scrollContainerRef.current;
    if (!el || !container) return;
    // scrollIntoView con block: "start" hace que el item quede en el top
    const elTop = el.offsetTop - container.offsetTop;
    container.scrollTo({ top: elTop - 4, behavior: "smooth" });
  }, [selectedId]);

  const filtradas = useMemo(() => {
    const lower = q.trim().toLowerCase();
    return obras.filter((o) => {
      if (filtro !== "todas" && riesgoDeObra(o) !== filtro) return false;
      if (!lower) return true;
      const haystack = [
        o.tender_title,
        o.buyer_name,
        o.supplier_name,
        o.buyer_locality,
        o.supplier_ruc,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(lower);
    });
  }, [obras, q, filtro]);

  const isDemo = source === "mock";

  // Detail mode = takeover full-height del sidebar via crossfade
  const showDetail = Boolean(detailSlot);
  const localityLabel = detailHeader?.locality ?? "Caso";
  const yearLabel = detailHeader?.year ?? "—";

  return (
    <motion.aside
      initial={{ x: 30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`absolute top-[104px] right-0 z-10 bottom-0 flex flex-col bg-[var(--ink-1)]/85 backdrop-blur-xl border-l border-[var(--rule)] text-[var(--fg)] overflow-hidden ${
        fullWidth ? "left-0 w-auto" : "w-full max-w-md"
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {showDetail ? (
          <motion.div
            key="detail-view"
            initial={{ x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 32, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex flex-col"
          >
            {/* DETAIL HEADER — back arrow + breadcrumb */}
            <div className="px-5 pt-5 pb-3 border-b border-[var(--rule)] flex items-center justify-between">
              <button
                onClick={onBackToList}
                className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[var(--fg-dim)] hover:text-[var(--fg)] transition-colors"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                <span aria-hidden>←</span>
                Volver al Índice
                <span className="text-[var(--fg-faint)]">·</span>
                <span className="tabular-nums">{filtradas.length}</span>
              </button>
              <p
                className="text-[9px] uppercase tracking-[0.26em] text-[var(--fg-faint)]"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                {localityLabel} · {yearLabel}
              </p>
            </div>
            {/* DETAIL BODY (slot scroleable, ObraDetailPanel embedded) */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {detailSlot}
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
      {/* HEADER editorial */}
      <header className="px-6 pt-6 pb-4 border-b border-[var(--rule)]">
        <p
          className="text-[10px] uppercase tracking-[0.28em] text-[var(--fg-faint)]"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Edición · {FECHA_EDICION}
        </p>
        <h2
          className="mt-2 text-[28px] leading-none text-[var(--fg)] italic"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          Índice
        </h2>
        <p className="mt-3 text-sm text-[var(--fg-dim)] leading-snug max-w-xs">
          Cada línea es un contrato público con coordenadas, plata y nombre y apellido.
        </p>
        {isDemo && (
          <p
            className="mt-3 text-[10px] uppercase tracking-[0.2em] text-[var(--warn)]"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            ⚠ Demo · {total} casos ficticios
          </p>
        )}
      </header>

      {/* TABS estilo prensa */}
      <nav className="px-6 pt-4 flex gap-5 border-b border-[var(--rule)]">
        {(["todas", "alto", "medio", "bajo"] as Filtro[]).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`pb-3 text-[11px] uppercase tracking-[0.18em] transition ${
              filtro === f
                ? "text-[var(--fg)] border-b-2 border-[var(--brand)] -mb-[2px]"
                : "text-[var(--fg-faint)] hover:text-[var(--fg-dim)]"
            }`}
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            {f === "todas" ? "Todas" : `Riesgo ${f}`}
          </button>
        ))}
      </nav>

      {/* Buscador minimal — línea inferior única */}
      <div className="px-6 py-3 border-b border-[var(--rule)]">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar obra, distrito, contratista, RUC…"
          className="w-full bg-transparent border-0 border-b border-[var(--rule)] focus:border-[var(--brand)] focus:outline-none text-sm py-2 placeholder:text-[var(--fg-faint)] transition-colors"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        />
      </div>

      {/* LISTA */}
      <ul
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto divide-y divide-[var(--rule)]"
      >
        {filtradas.length === 0 && (
          <li className="p-8 text-center text-sm text-[var(--fg-faint)]">
            Ningún caso coincide con tu búsqueda.
          </li>
        )}
        {filtradas.map((o) => {
          const riesgo = riesgoDeObra(o);
          const isSel = o.id === selectedId;
          return (
            <li key={o.id}>
              <button
                ref={(el) => {
                  if (el) itemRefs.current.set(o.id, el);
                  else itemRefs.current.delete(o.id);
                }}
                onClick={() => onSelect(o)}
                className={`group w-full text-left px-6 py-4 transition-all relative hover:translate-x-[2px] ${
                  isSel
                    ? "bg-[var(--brand-deep)]/30"
                    : "hover:bg-[var(--ink-3)]"
                }`}
              >
                {/* Barra de riesgo lateral */}
                {riesgo === "alto" && (
                  <span className="absolute left-0 top-4 bottom-4 w-[2px] bg-[var(--alarm)]" />
                )}
                {riesgo === "medio" && (
                  <span className="absolute left-0 top-4 bottom-4 w-[2px] bg-[var(--warn)] opacity-60" />
                )}

                <div className="flex items-baseline justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[9px] uppercase tracking-[0.22em] text-[var(--fg-faint)]"
                      style={{ fontFamily: "var(--font-mono), monospace" }}
                    >
                      {o.buyer_locality ?? "—"} · {o.source_year ?? "—"}
                    </p>
                    <h3
                      className="mt-1 text-[16px] leading-[1.2] text-[var(--fg)] font-medium"
                      style={{ fontFamily: "var(--font-display), serif" }}
                    >
                      {truncar(displayTitle(o), 90)}
                    </h3>
                    {o.supplier_name && (
                      <p className="mt-1.5 text-[12px] text-[var(--fg-dim)] truncate">
                        {o.supplier_name}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className="text-[13px] tabular-nums text-[var(--fg)]"
                      style={{ fontFamily: "var(--font-mono), monospace" }}
                    >
                      {fmtSoles(o.contract_amount ?? o.award_amount)}
                    </p>
                    {o.is_red_flag && (
                      <p
                        className="text-[9px] uppercase tracking-wider text-[var(--alarm)] mt-1"
                        style={{ fontFamily: "var(--font-mono), monospace" }}
                      >
                        Alerta
                      </p>
                    )}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* FOOTER */}
      <footer
        className="px-6 py-3 border-t border-[var(--rule)] text-[10px] uppercase tracking-[0.22em] text-[var(--fg-faint)] text-center"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        Mostrando {filtradas.length} de {obras.length}
      </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
