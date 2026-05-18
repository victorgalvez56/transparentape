"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const BeforeAfterSlider = dynamic(
  () => import("@/components/BeforeAfterSlider"),
  { ssr: false }
);

interface Sv {
  beforeUrl: string | null;
  afterUrl: string | null;
  beforeDate: string | null;
  afterDate: string | null;
  hasHistory: boolean;
}

interface Loaded {
  obraId: number;
  sv: Sv;
  score: number | null;
}

interface Props {
  obraId: number;
  lat: number | null;
  lng: number | null;
}

/**
 * Street View antes/después para el detalle codex (el panel que se abre al
 * dar clic a una obra). Llama /api/ai — que devuelve la comparación de
 * Google Street View aunque el análisis con IA falle — y renderiza el
 * slider arrastrable cuando hay histórico real (>=2 años de cobertura).
 *
 * El estado se asocia al obraId resuelto: al cambiar de obra se muestra
 * "buscando…" en vez de la imagen anterior, sin parpadeo de datos viejos.
 */
export default function ObraStreetViewCompare({ obraId, lat, lng }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failedId, setFailedId] = useState<number | null>(null);

  useEffect(() => {
    if (!lat || !lng) return;
    let alive = true;
    fetch(`/api/ai?id=${obraId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (!d || !d.streetview || !d.streetview.afterUrl) {
          setFailedId(obraId);
          return;
        }
        setLoaded({ obraId, sv: d.streetview, score: d.score ?? null });
      })
      .catch(() => {
        if (alive) setFailedId(obraId);
      });
    return () => {
      alive = false;
    };
  }, [obraId, lat, lng]);

  if (!lat || !lng) return null;

  const data = loaded && loaded.obraId === obraId ? loaded : null;
  const isFailed = failedId === obraId;
  if (isFailed && !data) return null;

  const caption = (extra?: string) => (
    <p
      className="text-[10.5px] tracking-tight px-4 py-1.5 lowercase"
      style={{
        color: "var(--cx-faint)",
        fontFamily: "var(--font-mono), monospace",
      }}
    >
      {extra ? `${extra} · ` : ""}street view · google
    </p>
  );

  return (
    <div className="border-t" style={{ borderColor: "var(--cx-border)" }}>
      {!data ? (
        <div className="flex flex-col items-center justify-center h-36 gap-2">
          <span className="text-xl animate-spin">🛰</span>
          <p
            className="text-[10.5px] tracking-tight lowercase animate-pulse"
            style={{
              color: "var(--cx-faint)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            buscando imágenes históricas…
          </p>
        </div>
      ) : data.sv.hasHistory && data.sv.beforeUrl ? (
        <>
          <BeforeAfterSlider
            beforeUrl={data.sv.beforeUrl}
            afterUrl={data.sv.afterUrl!}
            beforeLabel={
              data.sv.beforeDate ? `Antes · ${data.sv.beforeDate}` : "Antes"
            }
            afterLabel={
              data.sv.afterDate ? `Ahora · ${data.sv.afterDate}` : "Ahora"
            }
          />
          {caption(
            data.score != null ? `ia ${data.score}/100 · arrastra` : "arrastra"
          )}
        </>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.sv.afterUrl!}
            alt="Street View"
            className="w-full h-36 object-cover block"
          />
          {caption(
            data.sv.afterDate
              ? `${data.sv.afterDate} · sin histórico`
              : "sin histórico"
          )}
        </>
      )}
    </div>
  );
}
