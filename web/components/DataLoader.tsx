"use client";

import { motion, AnimatePresence } from "motion/react";

/**
 * Loader pequeño y discreto para la carga inicial de contratos
 * (~62k vía /api/obras/points). Píldora flotante con punto pulsante,
 * tokens --cx del tema. No bloquea el globo; se va al llegar la data.
 */
export default function DataLoader({ show }: { show: boolean }) {
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
            className="flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-xl"
            style={{
              borderColor: "var(--cx-border)",
              background: "var(--cx-bg-blur)",
              boxShadow: "var(--cx-shadow)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "var(--cx-brand)" }}
            />
            <span
              className="text-[10px] uppercase tracking-[0.18em]"
              style={{
                color: "var(--cx-muted)",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              Cargando contratos públicos…
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
