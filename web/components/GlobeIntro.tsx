"use client";

import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Puente ColdOpen → globo. El ColdOpen cierra con "Cada punto del mapa es
 * un contrato. Síguelo." y aquí continúa esa voz: orienta sin volcar data.
 * Se muestra una vez por sesión; ?reset=1 lo limpia (parity en page.tsx).
 */
const SEEN_KEY = "globeIntroSeen";

export default function GlobeIntro({ enabled }: { enabled: boolean }) {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (sessionStorage.getItem(SEEN_KEY) === "1") return;
    // Sync desde sessionStorage (sistema externo) — mismo patrón que el
    // efecto de tema en page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
    const t = setTimeout(() => dismiss(), 11_000);
    return () => clearTimeout(t);
  }, [enabled]);

  function dismiss() {
    sessionStorage.setItem(SEEN_KEY, "1");
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute inset-x-0 bottom-20 lg:bottom-6 z-20 flex justify-center px-4 pointer-events-none"
          initial={reduce ? { opacity: 1 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="pointer-events-auto max-w-md w-full rounded-xl border backdrop-blur-xl px-4 py-3.5"
            style={{
              borderColor: "var(--cx-border)",
              background: "var(--cx-bg-blur)",
              boxShadow: "var(--cx-shadow)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <p
                className="text-[13px] leading-snug"
                style={{ color: "var(--cx-fg)" }}
              >
                Cada punto es un contrato público.{" "}
                <span style={{ color: "var(--cx-brand)" }}>Síguelo.</span>
              </p>
              <button
                onClick={dismiss}
                className="text-[10px] uppercase tracking-[0.18em] shrink-0 hover:opacity-70 transition"
                style={{
                  color: "var(--cx-muted)",
                  fontFamily: "var(--font-mono), monospace",
                }}
              >
                Entendido
              </button>
            </div>
            <p
              className="mt-2 text-[11px] leading-relaxed"
              style={{
                color: "var(--cx-muted)",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              Filtra por país, riesgo o región arriba · clic en un punto para
              investigarlo.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
