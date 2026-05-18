"use client";

import {
  motion,
  useMotionValue,
  animate,
  useReducedMotion,
} from "motion/react";
import { useEffect, useState } from "react";

interface Props {
  onDone: () => void;
  total?: number; // monto SOLO Perú (PEN). Si no llega, usamos fallback.
}

const FALLBACK_TOTAL = 49_800_000_000;
const COLD_OPEN_DURATION = 4200; // ms — total visible (normal)
const COLD_OPEN_DURATION_REDUCED = 1600; // ms — sin motion no se hace esperar

/**
 * Colores propios y explícitos. El ColdOpen es un momento cinematográfico
 * oscuro a propósito (no sigue el tema light/dark) — pero el acento usa
 * --cx-brand para que el verde sea EXACTAMENTE el de la app, no el verde
 * del sistema de tokens viejo.
 */
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const fmt = (v: number) => new Intl.NumberFormat("es-PE").format(v);
const INK = "#050505";
const TX_STRONG = "#ffffff";
const TX_DIM = "#a3a3a3";
const TX_FAINT = "#6b7280";

export default function ColdOpen({ onDone, total }: Props) {
  const target = total && total > 0 ? total : FALLBACK_TOTAL;
  const reduce = useReducedMotion();
  const count = useMotionValue(0);
  // Sólo el path animado usa estado; setState vive en onUpdate (callback de
  // un sistema externo: la animación), no en el cuerpo del efecto.
  const [animated, setAnimated] = useState("0");
  const display = reduce ? fmt(target) : animated;

  useEffect(() => {
    if (reduce) return;
    const ctrl = animate(count, target, {
      duration: 2.0,
      ease: EASE,
      onUpdate: (v) => setAnimated(fmt(Math.floor(v))),
    });
    return () => ctrl.stop();
  }, [count, target, reduce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", onKey);
    const t = setTimeout(
      () => onDone(),
      reduce ? COLD_OPEN_DURATION_REDUCED : COLD_OPEN_DURATION
    );
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [onDone, reduce]);

  // Sin motion: aparición instantánea; con motion: reveal escalonado.
  const reveal = (delay: number, y = 0, blur = 0) =>
    reduce
      ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
      : {
          initial: { opacity: 0, y, filter: blur ? `blur(${blur}px)` : "none" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { delay, duration: 0.7, ease: EASE },
        };

  return (
    <motion.div
      onClick={onDone}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer px-6"
      style={{ background: INK }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0.2 : 0.5 } }}
    >
      <motion.span
        className="absolute top-6 right-6 text-[10px] tracking-[0.3em]"
        style={{ color: TX_FAINT, fontFamily: "var(--font-mono), monospace" }}
        {...reveal(0.6)}
      >
        ESC · CLIC PARA SALTAR
      </motion.span>

      <motion.p
        className="text-[13px] italic tracking-wide text-center"
        style={{ color: TX_DIM, fontFamily: "var(--font-display), serif" }}
        {...reveal(0.5, 8)}
      >
        Presupuesto público fiscalizado · Perú · 2019–2026
      </motion.p>

      <motion.div
        className="mt-3 text-[clamp(48px,9vw,128px)] font-medium tracking-tight tabular-nums leading-none"
        style={{ color: TX_STRONG, fontFamily: "var(--font-mono), monospace" }}
        {...reveal(0.3, 30, 12)}
      >
        <span style={{ color: "var(--cx-brand)" }}>S/</span> {display}
      </motion.div>

      <motion.h1
        className="mt-12 text-[clamp(28px,5vw,56px)] leading-[1.05] font-medium text-center max-w-3xl"
        style={{ color: TX_STRONG, fontFamily: "var(--font-display), serif" }}
        {...reveal(2.2, 12)}
      >
        El billete deja huella.{" "}
        <em className="italic" style={{ color: "var(--cx-brand)" }}>
          Lo grabamos
        </em>
        .
      </motion.h1>

      <motion.p
        className="mt-4 text-base"
        style={{ color: TX_DIM }}
        {...reveal(2.9)}
      >
        Cada punto del mapa es un contrato. Síguelo.
      </motion.p>
    </motion.div>
  );
}
