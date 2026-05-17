"use client";

import type { XRStore } from "@react-three/xr";

interface Props {
  store: XRStore;
  hovered: number | null;
  selected: number | null;
  onFindAlert?: () => void;
  totalObras?: number;
}

export default function EnterVRButton({
  store,
  hovered,
  selected,
  onFindAlert,
  totalObras,
}: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
      {/* Header con wordmark */}
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
            Audit Room · VR
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

      {/* Stats arriba a la izquierda */}
      {totalObras != null && totalObras > 0 && (
        <div
          className="absolute top-20 left-6 text-[10px] uppercase tracking-[0.22em] text-white/45"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {totalObras.toLocaleString("es-PE")} obras renderizadas
        </div>
      )}

      {/* Hover/selected info */}
      {(hovered != null || selected != null) && (
        <div
          className="absolute top-32 left-6 text-[11px] tracking-[0.18em] uppercase text-white/70"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {selected != null ? (
            <span>
              Seleccionada · obra <span className="text-[var(--brand)]">{selected}</span>
            </span>
          ) : (
            <span>
              Hover · obra <span className="text-white">{hovered}</span>
            </span>
          )}
        </div>
      )}

      {/* Bottom: Enter VR + hint */}
      <div className="mt-auto pb-10 flex flex-col items-center gap-4">
        <p
          className="text-[11px] uppercase tracking-[0.28em] text-white/40 max-w-md text-center"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Camina entre la plata pública. Los puntos rojos son las{" "}
          <span className="text-[var(--alarm)]">alertas OECE</span>.
        </p>
        <div className="flex items-center gap-3">
          {onFindAlert && (
            <button
              onClick={onFindAlert}
              className="pointer-events-auto px-5 py-3 border border-[var(--alarm)] text-[var(--alarm)] text-[12px] uppercase tracking-[0.2em] hover:bg-[var(--alarm)] hover:text-black transition"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              → Llevame a la alerta mas cercana
            </button>
          )}
          <button
            onClick={() => store.enterVR()}
            className="pointer-events-auto px-7 py-3 bg-[var(--brand)] text-black font-medium hover:bg-white transition"
            style={{ fontFamily: "var(--font-body), sans-serif" }}
          >
            ENTRAR A AUDIT ROOM →
          </button>
        </div>
        <p
          className="text-[9px] uppercase tracking-[0.3em] text-white/30"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Quest 3 / Quest 3S · Vision Pro · WebXR
        </p>
      </div>
    </div>
  );
}
