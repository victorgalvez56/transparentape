"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

/**
 * Tour interactivo simple por pasos. Reemplaza al ColdOpen: en vez de una
 * pantalla de entrada con números, guía al usuario por la UI real con un
 * spotlight (recorte iluminado) + tooltip por paso.
 *
 * - target: valor de [data-tour="..."] a iluminar. Sin target = paso
 *   centrado (mensaje de marca, hereda lo que decía el ColdOpen).
 * - Pasos cuyo target no existe (p.ej. sidebar en móvil) se saltan solos.
 * - Una vez por sesión; ?reset=1 lo limpia (parity en page.tsx).
 */

type Step = { target?: string; title: string; body: string };

const STEPS: Step[] = [
  {
    title: "Sigue el billete",
    body: "Cada punto del mapa es un contrato de obra pública — Perú y Chile. Aquí lo rastreas.",
  },
  {
    target: "filters",
    title: "Filtra",
    body: "Acota por país, nivel de riesgo o región.",
  },
  {
    target: "list",
    title: "Investiga",
    body: "Busca por obra, distrito, contratista o RUC y abre cualquier caso.",
  },
  {
    target: "views",
    title: "Cambia de vista",
    body: "Globo, Lista o Panel de indicadores.",
  },
];

const SEEN_KEY = "tourSeen";
const PAD = 8;
const MONO = "var(--font-mono), monospace";
const SERIF = "var(--font-display), serif";

function exists(target?: string) {
  return !target || !!document.querySelector(`[data-tour="${target}"]`);
}

export default function Tour({ enabled }: { enabled: boolean }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (sessionStorage.getItem(SEEN_KEY) === "1") return;
    // Arranque del tour gobernado por sessionStorage (sistema externo).
    /* eslint-disable react-hooks/set-state-in-effect */
    setActive(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [enabled]);

  const step = STEPS[i];

  const measure = useCallback(() => {
    if (!step?.target) return setRect(null);
    const el = document.querySelector<HTMLElement>(
      `[data-tour="${step.target}"]`
    );
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => {
    if (!active) return;
    // Medir el rect del target hacia el estado es justo el propósito de
    // useLayoutEffect (sincronizar con el layout del DOM).
    /* eslint-disable react-hooks/set-state-in-effect */
    measure();
    /* eslint-enable react-hooks/set-state-in-effect */
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, measure]);

  const finish = useCallback(() => {
    sessionStorage.setItem(SEEN_KEY, "1");
    setActive(false);
  }, []);

  const next = useCallback(() => {
    setI((p) => {
      let n = p + 1;
      while (n < STEPS.length && !exists(STEPS[n].target)) n++;
      if (n >= STEPS.length) {
        finish();
        return p;
      }
      return n;
    });
  }, [finish]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "Enter" || e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish, next]);

  if (!active) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const cardW = Math.min(320, vw - 32);

  const box = rect
    ? {
        left: rect.left - PAD,
        top: rect.top - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  // Colocación del tooltip: si el target es alto (sidebar) va al costado;
  // si no, debajo, y si no hay sitio, arriba. Sin target = centrado.
  let card: React.CSSProperties;
  if (!box) {
    card = { left: "50%", top: "50%", transform: "translate(-50%,-50%)" };
  } else if (box.height > vh * 0.5) {
    const onRight = box.left > vw / 2;
    card = {
      top: Math.max(16, Math.min(box.top, vh - 200)),
      left: onRight ? undefined : box.left + box.width + 14,
      right: onRight ? vw - box.left + 14 : undefined,
    };
  } else {
    const below = box.top + box.height + 14;
    const placeBelow = below + 170 < vh;
    card = {
      top: placeBelow ? below : undefined,
      bottom: placeBelow ? undefined : vh - box.top + 14,
      left: Math.max(16, Math.min(box.left, vw - cardW - 16)),
    };
  }

  const last = i === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60]">
      <AnimatePresence mode="wait">
        {box ? (
          <motion.div
            key={`spot-${i}`}
            className="absolute rounded-xl pointer-events-none"
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.66)",
              outline: "1.5px solid var(--cx-brand)",
              outlineOffset: 0,
            }}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22 }}
          />
        ) : (
          <motion.div
            key="scrim"
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.66)" }}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22 }}
          />
        )}
      </AnimatePresence>

      <motion.div
        key={`card-${i}`}
        className="absolute rounded-xl border p-4"
        style={{
          ...card,
          width: cardW,
          borderColor: "var(--cx-border)",
          background: "var(--cx-card)",
          boxShadow: "var(--cx-shadow)",
        }}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <p
          className="text-[10px] uppercase tracking-[0.2em]"
          style={{ color: "var(--cx-faint)", fontFamily: MONO }}
        >
          Paso {i + 1} de {STEPS.length}
        </p>
        <h3
          className="mt-1.5 text-[15px] font-medium leading-snug"
          style={{ color: "var(--cx-fg)", fontFamily: SERIF }}
        >
          {step.title}
        </h3>
        <p
          className="mt-1 text-[13px] leading-snug"
          style={{ color: "var(--cx-muted)" }}
        >
          {step.body}
        </p>

        <div className="mt-3.5 flex items-center justify-between gap-3">
          <button
            onClick={finish}
            className="text-[11px] hover:opacity-70 transition"
            style={{ color: "var(--cx-faint)", fontFamily: MONO }}
          >
            Saltar
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1">
              {STEPS.map((_, idx) => (
                <span
                  key={idx}
                  className="rounded-full transition-all"
                  style={{
                    width: idx === i ? 14 : 5,
                    height: 5,
                    background:
                      idx === i ? "var(--cx-brand)" : "var(--cx-border-strong)",
                  }}
                />
              ))}
            </div>
            <button
              onClick={next}
              className="px-3 py-1.5 rounded-md text-[12px] font-medium active:scale-95 transition-transform"
              style={{
                background: "var(--cx-brand)",
                color: "var(--cx-brand-fg)",
              }}
            >
              {last ? "Listo" : "Siguiente"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
