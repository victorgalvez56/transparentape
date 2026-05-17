"use client";

import { useEffect, useState } from "react";

interface Props {
  loading: boolean;
  count: number;
}

/**
 * Overlay centrado mientras se descarga la BD de obras.
 * Una vez con datos, fade-out suave.
 */
export default function LoadingOverlay({ loading, count }: Props) {
  const [visible, setVisible] = useState(loading || count === 0);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (loading || count === 0) {
      setVisible(true);
      setOpacity(1);
      return;
    }
    // Fade out cuando ya hay data
    setOpacity(0);
    const t = setTimeout(() => setVisible(false), 500);
    return () => clearTimeout(t);
  }, [loading, count]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-black transition-opacity duration-500"
      style={{ opacity }}
    >
      {/* Pulse ring */}
      <div className="relative w-20 h-20 mb-8">
        <div className="absolute inset-0 rounded-full border border-[var(--brand)] animate-ping" />
        <div className="absolute inset-2 rounded-full border border-[var(--brand)]/60 animate-ping [animation-delay:0.3s]" />
        <div className="absolute inset-5 rounded-full bg-[var(--brand)]/80" />
      </div>
      <p
        className="text-[12px] uppercase tracking-[0.32em] text-white"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        Conectando con la base
      </p>
      <p
        className="mt-2 text-[10px] uppercase tracking-[0.28em] text-white/40"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {count > 0
          ? `${count.toLocaleString("es-PE")} obras cargadas · renderizando`
          : "Descargando 70k obras públicas — espera ~5 segundos"}
      </p>
    </div>
  );
}
