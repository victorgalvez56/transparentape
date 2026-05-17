"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import type { Obra } from "@/lib/types";
import { formatMontoCompact, truncate } from "@/lib/vr/format";

/**
 * Street View REAL de Google (widget oficial). Es la experiencia "como si
 * estuvieras ahí": navegable (clic para caminar), nítida, con todos los
 * controles de Maps. NO es WebXR — para el headset, ObraVR conmuta a la
 * esfera inmersiva. Aquí: máxima fidelidad para desktop/móvil.
 */

setOptions({
  key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "",
  v: "weekly",
});

interface Props {
  obra: Obra;
  panoId: string;
  beforePanoId?: string;
  afterPanoId?: string;
  beforeDate?: string;
  afterDate?: string;
}

export default function GoogleStreetView({
  obra,
  panoId: initialPanoId,
  beforePanoId,
  afterPanoId,
  beforeDate,
  afterDate,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showBefore, setShowBefore] = useState(false);

  const hasHistory = Boolean(
    beforePanoId && afterPanoId && beforePanoId !== afterPanoId
  );
  const activePanoId = hasHistory
    ? showBefore
      ? beforePanoId!
      : afterPanoId!
    : initialPanoId;

  const monto =
    obra.contract_amount ?? obra.award_amount ?? obra.tender_amount ?? 0;

  // Init una vez — con TODA la navegación de Google activada.
  useEffect(() => {
    if (!containerRef.current) return;
    importLibrary("streetView")
      .then((lib) => {
        const { StreetViewPanorama } = lib as google.maps.StreetViewLibrary;
        const sv = new StreetViewPanorama(containerRef.current!, {
          pano: activePanoId,
          pov: { heading: 0, pitch: 0 },
          zoom: 1,
          // "Como si realmente estuvieras ahí": caminar, links, brújula…
          clickToGo: true,
          linksControl: true,
          panControl: true,
          zoomControl: true,
          scrollwheel: true,
          addressControl: false, // libera la esquina sup-izq para "Volver"
          showRoadLabels: true,
          fullscreenControl: true,
          motionTracking: true,
          motionTrackingControl: true,
        });
        sv.addListener("status_changed", () => {
          if (sv.getStatus() === "OK") setLoaded(true);
        });
        panoramaRef.current = sv;
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchPano = useCallback(
    (before: boolean) => {
      setShowBefore(before);
      const target = before ? beforePanoId : afterPanoId;
      if (target && panoramaRef.current) panoramaRef.current.setPano(target);
    },
    [beforePanoId, afterPanoId]
  );

  return (
    <div className="absolute inset-0 bg-black overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Volver — z-index altísimo para quedar SOBRE la capa de Google
          (su panorama capturaba el clic del antiguo link del footer). */}
      <div
        className="absolute top-4 left-4 flex items-center gap-2"
        style={{ zIndex: 2147483000, fontFamily: "var(--font-mono), monospace" }}
      >
        <Link
          href="/vr"
          aria-label="Volver a la lista de obras"
          className="flex items-center gap-2 px-4 h-11 bg-black/80 backdrop-blur border border-white/25 text-white text-[11px] uppercase tracking-[0.18em] hover:bg-black hover:border-white/50 transition"
        >
          ← Obras
        </Link>
        <Link
          href="/"
          aria-label="Ir al mapa"
          className="flex items-center px-4 h-11 bg-black/55 backdrop-blur border border-white/15 text-white/70 text-[11px] uppercase tracking-[0.18em] hover:bg-black hover:text-white hover:border-white/40 transition"
        >
          Mapa
        </Link>
      </div>

      {!loaded && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black">
          <div className="relative w-12 h-12 mb-5">
            <div className="absolute inset-0 rounded-full border border-white/20 animate-ping" />
            <div className="absolute inset-3 rounded-full bg-white/60" />
          </div>
          <p
            className="text-[11px] uppercase tracking-[0.3em] text-white/40"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Cargando Street View…
          </p>
        </div>
      )}

      {/* Info de la obra — abajo, sin tapar los controles de Google */}
      <footer
        className="absolute bottom-0 inset-x-0 z-10 px-6 pb-6 pt-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 55%, transparent 100%)",
        }}
      >
        <div
          className="max-w-lg"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {obra.is_red_flag && (
            <div className="mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--alarm)] animate-pulse" />
              <span className="text-[10px] uppercase tracking-[0.28em] text-[var(--alarm)]">
                Alerta OECE · Proveedor sancionado
              </span>
            </div>
          )}

          <p
            className="text-white text-[15px] leading-snug mb-3"
            style={{ fontFamily: "var(--font-body), sans-serif" }}
          >
            {truncate(obra.tender_title ?? "Sin título", 130)}
          </p>

          <div className="flex items-baseline gap-4 mb-2">
            <span
              className={`text-[22px] tabular-nums ${
                obra.is_red_flag ? "text-[var(--alarm)]" : "text-[var(--brand)]"
              }`}
            >
              {formatMontoCompact(monto)}
            </span>
            {obra.buyer_locality && (
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                {obra.buyer_locality}
              </span>
            )}
            {obra.source_year && (
              <span className="text-[10px] text-white/25">
                {obra.source_year}
              </span>
            )}
          </div>

          {obra.supplier_name && (
            <p className="text-[11px] text-white/40 mb-4">
              {truncate(obra.supplier_name, 80)}
            </p>
          )}

          {hasHistory && (
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                onClick={() => switchPano(true)}
                className={`px-4 py-2 text-[10px] uppercase tracking-[0.18em] border transition ${
                  showBefore
                    ? "bg-white/90 text-black border-white"
                    : "text-white/50 border-white/15 hover:text-white hover:border-white/35"
                }`}
              >
                Antes · {beforeDate ?? "—"}
              </button>
              <span className="text-white/20">→</span>
              <button
                onClick={() => switchPano(false)}
                className={`px-4 py-2 text-[10px] uppercase tracking-[0.18em] border transition ${
                  !showBefore
                    ? "bg-[var(--brand)] text-black border-[var(--brand)]"
                    : "text-white/50 border-white/15 hover:text-white hover:border-white/35"
                }`}
              >
                Después · {afterDate ?? "—"}
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
