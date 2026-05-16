"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Obra, riesgoDeObra } from "@/lib/types";
import { fmtSoles, truncar, displayTitle } from "@/lib/format";

interface Props {
  obras: Obra[];
  selectedId: number | null;
  onSelect: (o: Obra) => void;
  total: number;
  source?: string;
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
}: Props) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");

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

  return (
    <motion.aside
      initial={{ x: 30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="absolute top-0 right-0 z-10 h-full w-full max-w-md flex flex-col bg-[var(--ink-1)]/85 backdrop-blur-xl border-l border-[var(--rule)] text-white pt-16"
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
          className="mt-2 text-[28px] leading-none text-white italic"
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
                ? "text-white border-b-2 border-[var(--brand)] -mb-[2px]"
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
      <ul className="flex-1 overflow-y-auto divide-y divide-[var(--rule)]">
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
                onClick={() => onSelect(o)}
                className={`group w-full text-left px-6 py-4 transition-all relative hover:translate-x-[2px] ${
                  isSel
                    ? "bg-[var(--brand-deep)]/30"
                    : "hover:bg-white/[0.02]"
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
                      className="mt-1 text-[16px] leading-[1.2] text-white font-medium"
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
                      className="text-[13px] tabular-nums text-white"
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
    </motion.aside>
  );
}
