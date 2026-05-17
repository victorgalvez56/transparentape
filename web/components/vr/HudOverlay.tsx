"use client";

import type { VRObra } from "@/lib/vr/obras-source";
import { formatMontoCompact, truncate } from "@/lib/vr/format";
import type { CityPreset } from "@/lib/vr/city-presets";

interface Props {
  loading: boolean;
  totalObras: number;
  hovered: number | null;
  selected: number | null;
  obras: VRObra[];
  onCloseSelected: () => void;
  presets: CityPreset[];
  activePreset: string;
  onSelectPreset: (key: string) => void;
  onlyRedFlag: boolean;
  onToggleRedFlag: () => void;
  years: number[];
  yearFilter: number | null;
  onSelectYear: (y: number | null) => void;
  tourPlaying: boolean;
  onToggleTour: () => void;
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
  presets,
  activePreset,
  onSelectPreset,
  onlyRedFlag,
  onToggleRedFlag,
  years,
  yearFilter,
  onSelectYear,
  tourPlaying,
  onToggleTour,
}: Props) {
  // Stats live calculados de las obras renderizadas
  const stats = (() => {
    let total = 0;
    let alertas = 0;
    let huge = 0;
    for (const o of obras) {
      total += o.monto ?? 0;
      if (o.is_red_flag) alertas++;
      if ((o.monto ?? 0) >= 1e8) huge++;
    }
    return { total, alertas, huge };
  })();
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

      {/* Stats live + Toggle red flag — top-left */}
      {!loading && totalObras > 0 && (
        <div
          className="pointer-events-auto absolute top-20 left-6 flex flex-col gap-3"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          <div className="grid grid-cols-1 gap-1.5">
            <Stat label="obras renderizadas" value={totalObras.toLocaleString("es-PE")} />
            <Stat
              label="alertas OECE"
              value={stats.alertas.toLocaleString("es-PE")}
              tone="alarm"
            />
            <Stat
              label="megaproyectos > S/ 100M"
              value={stats.huge.toLocaleString("es-PE")}
              tone="brand"
            />
            <Stat
              label="presupuesto total"
              value={formatMontoCompact(stats.total).replace("S/ ", "S/ ")}
            />
          </div>
          <button
            onClick={onToggleRedFlag}
            className={`px-3 py-2 text-[10px] uppercase tracking-[0.18em] border transition ${
              onlyRedFlag
                ? "bg-[var(--alarm)] text-black border-[var(--alarm)]"
                : "text-white/70 border-white/15 hover:bg-white/5 hover:text-white"
            }`}
          >
            {onlyRedFlag ? "● mostrando solo alertas" : "○ filtrar solo alertas OECE"}
          </button>
          {/* Filtro de año */}
          {years.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-[0.22em] text-white/40">
                Año
              </span>
              <select
                value={yearFilter ?? ""}
                onChange={(e) =>
                  onSelectYear(e.target.value === "" ? null : Number(e.target.value))
                }
                className="bg-black/80 border border-white/15 text-white/80 text-[11px] tracking-[0.1em] px-2 py-1.5 focus:outline-none focus:border-[var(--brand)]"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                <option value="">Todos los años</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Camera presets — top-right */}
      <div
        className="pointer-events-auto absolute top-20 right-6 flex flex-col items-end gap-1"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        <span className="text-[9px] uppercase tracking-[0.28em] text-white/40 mb-1">
          Vista
        </span>
        {presets.map((p) => {
          const active = p.key === activePreset;
          return (
            <button
              key={p.key}
              onClick={() => onSelectPreset(p.key)}
              className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] border transition ${
                active
                  ? "bg-[var(--brand)] text-black border-[var(--brand)]"
                  : "text-white/70 border-white/15 hover:bg-white/5 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          );
        })}
        <button
          onClick={onToggleTour}
          className={`mt-1 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] border transition ${
            tourPlaying
              ? "bg-[var(--alarm)] text-black border-[var(--alarm)] animate-pulse"
              : "text-white/70 border-white/15 hover:bg-white/5 hover:text-white"
          }`}
        >
          {tourPlaying ? "■ Detener tour" : "▶ Auto-tour"}
        </button>
      </div>

      {/* Panel obra hovered/selected — bottom-left */}
      {activeObra && (
        <ObraInfo
          obra={activeObra}
          isLocked={isSelectedVisible}
          onClose={onCloseSelected}
        />
      )}

      {/* Color legend bottom-right */}
      {!loading && (
        <div
          className="absolute bottom-20 right-6 bg-black/70 border border-white/10 backdrop-blur px-4 py-3"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          <p className="text-[9px] uppercase tracking-[0.28em] text-white/45 mb-2">
            Color · monto
          </p>
          <LegendDot color="#ef4444" label="alerta OECE" />
          <LegendDot color="#fbbf24" label="> S/ 100M" />
          <LegendDot color="#42dc3a" label="10-100M" />
          <LegendDot color="#1f7a1c" label="1-10M" />
          <LegendDot color="#3a4d3a" label="< 1M" />
          <p className="text-[9px] uppercase tracking-[0.22em] text-white/35 mt-2 pt-2 border-t border-white/10">
            altura = log(monto)
          </p>
        </div>
      )}

      {/* Hint inferior + hotkeys */}
      <div className="mt-auto pb-6 flex flex-col items-center gap-2">
        <p
          className="text-[10px] uppercase tracking-[0.28em] text-white/40 max-w-2xl text-center"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Drag rotar · Scroll zoom · Click columna detalle ·{" "}
          <kbd className="px-1.5 py-0.5 bg-white/10 text-white/70 text-[9px]">1-6</kbd>{" "}
          ciudades ·{" "}
          <kbd className="px-1.5 py-0.5 bg-white/10 text-white/70 text-[9px]">R</kbd>{" "}
          alertas ·{" "}
          <kbd className="px-1.5 py-0.5 bg-white/10 text-white/70 text-[9px]">Esc</kbd>{" "}
          cerrar
        </p>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="inline-block w-2.5 h-2.5 rounded-sm"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}88` }}
      />
      <span className="text-[10px] uppercase tracking-[0.16em] text-white/65">
        {label}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "alarm" | "brand";
}) {
  const colorClass =
    tone === "alarm"
      ? "text-[var(--alarm)]"
      : tone === "brand"
      ? "text-[var(--brand)]"
      : "text-white";
  return (
    <div className="flex items-baseline gap-2">
      <span className={`text-[15px] tabular-nums ${colorClass}`}>{value}</span>
      <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
        {label}
      </span>
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
      <a
        href={`/vr/obra/${obra.ocid}`}
        className="mt-3 flex items-center gap-2 px-3 py-2 border border-[var(--brand)]/60 text-[var(--brand)] text-[10px] uppercase tracking-[0.2em] hover:bg-[var(--brand)] hover:text-black transition w-full justify-center"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        Ver en 360° →
      </a>
    </div>
  );
}
