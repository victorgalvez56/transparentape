"use client";

import { motion, useMotionValue, animate } from "motion/react";
import { useEffect, useState } from "react";

interface Props {
  onDone: () => void;
  total?: number; // monto en soles. Si no llega, usamos fallback.
}

const FALLBACK_TOTAL = 49_800_000_000;
const COLD_OPEN_DURATION = 4200; // ms — total visible

export default function ColdOpen({ onDone, total }: Props) {
  const target = total && total > 0 ? total : FALLBACK_TOTAL;
  const count = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    const ctrl = animate(count, target, {
      duration: 2.0,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        setDisplay(new Intl.NumberFormat("es-PE").format(Math.floor(v)));
      },
    });
    return () => ctrl.stop();
  }, [count, target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => onDone(), COLD_OPEN_DURATION);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [onDone]);

  return (
    <motion.div
      onClick={onDone}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--ink-0)] cursor-pointer px-6"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
    >
      <motion.span
        className="absolute top-6 right-6 text-[10px] tracking-[0.3em] text-[var(--fg-faint)]"
        style={{ fontFamily: "var(--font-mono), monospace" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.4 }}
      >
        ESC PARA SALTAR
      </motion.span>

      <motion.p
        className="text-[13px] italic tracking-wide text-[var(--fg-dim)] text-center"
        style={{ fontFamily: "var(--font-display), serif" }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
      >
        Soles fiscalizados en obras públicas · Perú · 2019–2026
      </motion.p>

      <motion.div
        className="mt-3 text-[clamp(48px,9vw,128px)] font-medium tracking-tight tabular-nums text-[var(--fg)] leading-none"
        style={{ fontFamily: "var(--font-mono), monospace" }}
        initial={{ opacity: 0, filter: "blur(12px)", y: 30 }}
        animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
        transition={{ delay: 0.3, duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="text-[var(--brand)]">S/</span> {display}
      </motion.div>

      <motion.h1
        className="mt-12 text-[clamp(28px,5vw,56px)] leading-[1.05] font-medium text-center max-w-3xl text-[var(--fg)]"
        style={{ fontFamily: "var(--font-display), serif" }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.2, duration: 0.7 }}
      >
        El billete deja huella.{" "}
        <em
          className="italic text-[var(--brand)]"
          style={{ fontStyle: "italic" }}
        >
          Lo grabamos
        </em>
        .
      </motion.h1>

      <motion.p
        className="mt-4 text-base text-[var(--fg-dim)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.9, duration: 0.6 }}
      >
        Acá la puedes leer.
      </motion.p>
    </motion.div>
  );
}
