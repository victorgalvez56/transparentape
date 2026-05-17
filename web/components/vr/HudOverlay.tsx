"use client";

import type { VRObra } from "@/lib/vr/obras-source";
import { formatMontoCompact, truncate } from "@/lib/vr/format";

interface Props {
  loading: boolean;
  totalObras: number;
  hovered: number | null;
  selected: number | null;
  obras: VRObra[];
  onCloseSelected: () => void;
}

/**
 * HUD DOM con info de la sesión + obra apuntada/seleccionada.
 * Reemplaza a las labels 3D que tenian bug con drei Text en M5 Metal.
 */
export default function HudOverlay({
  loading,
  totalObras,
  hovered,
  selected,
  obras,
  onCloseSelected,
}: Props) {
  const hoveredObra = hovered != null ? obras.find((o) => o.id === hovered) : null;
  const selectedObra =
    selected != null ? obras.find((o) => o.id === selected) : null;
  const activeObra = selectedObra ?? hoveredObra;
  const isSelectedVisible = Boolean(selectedObra);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
      {/* Header */}
      <header className="flex items-baseline justify-between px-6 py-5">
        <div className="flex items-baseline gap-3">
          <span
            className="text-[20px] leading-none font-medium tracking-tight text-white"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            Transparentape
            <span className="text-[var(--brand)]">.</span>
          </span>
          <span
            className="text-[10px] uppercase tracking-[0.25em] text-[var(--fg-faint)]"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Audit Room · Peru 3D
          </span>
        </div>
        <a
          href="/"
          className="pointer-events-auto text-[10px] uppercase tracking-[0.2em] text-white/60 hover:text-white"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          ← Volver al mapa
        </a>
      </header>

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border border-[var(--brand)] animate-ping" />
              <div className="absolute inset-3 rounded-full bg-[var(--brand)]/80" />
            </div>
            <p
              className="text-[11px] uppercase tracking-[0.3em] text-white"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Cargando obras públicas
            </p>
          </div>
        </div>
      )}

      {/* Counter top-left */}
      {!loading && totalObras > 0 && (
        <div
          className="absolute top-20 left-6 text-[10px] uppercase tracking-[0.22em] text-white/45"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {totalObras.toLocaleString("es-PE")} obras renderizadas
        </div>
      )}

      {/* Panel obra hovered/selected — bottom-left */}
      {activeObra && (
        <ObraInfo
          obra={activeObra}
          isLocked={isSelectedVisible}
          onClose={onCloseSelected}
        />
      )}

      {/* Hint inferior */}
      <div className="mt-auto pb-6 flex flex-col items-center gap-2">
        <p
          className="text-[10px] uppercase tracking-[0.28em] text-white/40 max-w-md text-center"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Drag para rotar · Scroll para zoom · Click columna para detalle ·{" "}
          <span className="text-[var(--alarm)]">rojo = alerta OECE</span>
        </p>
      </div>
    </div>
  );
}

function ObraInfo({
  obra,
  isLocked,
  onClose,
}: {
  obra: VRObra;
  isLocked: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="pointer-events-auto absolute bottom-20 left-6 max-w-md bg-black/85 border border-white/10 backdrop-blur px-5 py-4"
      style={{ fontFamily: "var(--font-mono), monospace" }}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <span
          className={`text-[9px] uppercase tracking-[0.28em] ${
            obra.is_red_flag ? "text-[var(--alarm)]" : "text-[var(--brand)]"
          }`}
        >
          {isLocked ? "Seleccionada" : "Hover"} · obra {obra.id}
        </span>
        {isLocked && (
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white text-[14px] leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
        )}
      </div>
      <p
        className="text-[13px] leading-snug text-white mb-2"
        style={{ fontFamily: "var(--font-body), sans-serif" }}
      >
        {truncate(obra.tender_title, 120)}
      </p>
      <div className="flex items-baseline gap-3 mb-1">
        <span
          className={`text-[16px] ${
            obra.is_red_flag ? "text-[var(--alarm)]" : "text-[var(--brand)]"
          }`}
        >
          {formatMontoCompact(obra.monto)}
        </span>
        {obra.buyer_locality && (
          <span className="text-[10px] uppercase tracking-[0.18em] text-white/50">
            {obra.buyer_locality}
          </span>
        )}
      </div>
      {obra.supplier_name && (
        <p className="text-[11px] text-white/55 leading-snug">
          {truncate(obra.supplier_name, 80)}
        </p>
      )}
      {obra.is_red_flag && (
        <p className="mt-2 text-[10px] uppercase tracking-[0.22em] text-[var(--alarm)]">
          Alerta OECE · proveedor sancionado
        </p>
      )}
    </div>
  );
}
