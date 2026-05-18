"use client";

import { motion, AnimatePresence } from "motion/react";

/**
 * Loader pequeño y discreto para la carga PROGRESIVA de contratos
 * (~62k vía /api/obras/points/chunk). Píldora flotante con punto pulsante
 * + contador y barra de progreso. Tokens --cx del tema. No bloquea el
 * globo; el mapa/lista se van llenando mientras esto sigue visible.
 *
 * `loaded`/`total` son opcionales: sin ellos cae al modo indeterminado
 * (compatibilidad hacia atrás).
 */
export default function DataLoader({
  show,
  loaded = 0,
  total = 0,
}: {
  show: boolean;
  loaded?: number;
  total?: number;
}) {
  const hasProgress = total > 0 && loaded > 0;
  const pct = hasProgress
    ? Math.min(100, Math.max(2, Math.round((loaded / total) * 100)))
    : 0;
  const fmt = (n: number) => n.toLocaleString("es-PE");

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 top-[52px] z-20 pointer-events-none"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="flex flex-col gap-1.5 rounded-2xl border px-3 py-2 backdrop-blur-xl min-w-[208px]"
            style={{
              borderColor: "var(--cx-border)",
              background: "var(--cx-bg-blur)",
              boxShadow: "var(--cx-shadow)",
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
                style={{ background: "var(--cx-brand)" }}
              />
              <span
                className="text-[10px] uppercase tracking-[0.18em] flex-1"
                style={{
                  color: "var(--cx-muted)",
                  fontFamily: "var(--font-mono), monospace",
                }}
              >
                Cargando contratos públicos…
              </span>
              {hasProgress && (
                <span
                  className="text-[10px] tabular-nums shrink-0"
                  style={{
                    color: "var(--cx-faint)",
                    fontFamily: "var(--font-mono), monospace",
                  }}
                >
                  {fmt(loaded)} / {fmt(total)}
                </span>
              )}
            </div>

            <div
              className="h-1 w-full rounded-full overflow-hidden"
              style={{ background: "var(--cx-secondary)" }}
            >
              {hasProgress ? (
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "var(--cx-brand)" }}
                  initial={false}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                />
              ) : (
                // Indeterminado: barrita que viaja mientras no hay totales.
                <motion.div
                  className="h-full w-1/3 rounded-full"
                  style={{ background: "var(--cx-brand)" }}
                  animate={{ x: ["-100%", "300%"] }}
                  transition={{
                    duration: 1.1,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
