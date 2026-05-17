"use client";

import { motion } from "motion/react";
import ThemeToggle from "./ThemeToggle";

interface Props {
  obrasCount: number;
  redFlagsCount: number;
  source: string;
  regionLabel: string;
  view: "globe" | "list";
  onToggleView: () => void;
}

/**
 * Topbar estilo codex-globe: 3 columnas, full-width opaque (glass).
 *
 * Izquierda: wordmark + nav placeholder
 * Centro: stats vivos
 * Derecha: theme toggle + view toggle
 *
 * Reemplaza al AuthorityHud transparente original.
 */
export default function Topbar({
  obrasCount,
  redFlagsCount,
  source,
  regionLabel,
  view,
  onToggleView,
}: Props) {
  const isDemo = source === "mock";

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="absolute top-0 left-0 right-0 z-30 h-[60px]
                 bg-[var(--ink-1)]/85 backdrop-blur-xl
                 border-b border-[var(--rule)]
                 flex items-center"
    >
      {/* Izquierda — wordmark + nav */}
      <div className="flex items-center gap-6 px-6 min-w-[280px]">
        <a
          href="/"
          className="text-[18px] leading-none font-medium tracking-tight text-[var(--fg)] hover:opacity-90 transition"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          Transparentape
          <span className="text-[var(--brand)]">.</span>
        </a>
        <nav
          className="hidden md:flex items-center gap-4 text-[10px] uppercase tracking-[0.22em] text-[var(--fg-faint)]"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          <a href="/" className="text-[var(--fg)] border-b border-[var(--brand)] pb-0.5">
            Mapa
          </a>
          <a
            href="/vr"
            className="hover:text-[var(--fg-dim)] transition"
          >
            Audit Room VR
          </a>
        </nav>
      </div>

      {/* Centro — stats vivos */}
      <div
        className="flex-1 hidden md:flex items-center justify-center gap-5 text-[10px] tracking-[0.18em] uppercase text-[var(--fg-dim)]"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        <span>
          <span className="text-[var(--fg)] font-medium tabular-nums">
            {obrasCount.toLocaleString("es-PE")}
          </span>{" "}
          contratos {isDemo ? "demo" : "auditados"}
        </span>
        <Divider />
        <span>
          <span className="text-[var(--alarm)] font-medium tabular-nums">
            {redFlagsCount.toLocaleString("es-PE")}
          </span>{" "}
          alertas
        </span>
        <Divider />
        <span
          key={regionLabel}
          className="inline-block whitespace-nowrap animate-[fadeIn_0.25s_ease-out]"
        >
          {regionLabel}
        </span>
      </div>

      {/* Derecha — view + theme */}
      <div className="flex items-center gap-2 px-4 ml-auto">
        <ViewToggle view={view} onToggle={onToggleView} />
        <ThemeToggle />
        <a
          href="https://github.com/victorgalvez56/sigue-el-billete"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:inline-flex items-center justify-center h-8 w-8
                     border border-[var(--rule)] hover:border-[var(--brand)]/40
                     text-[var(--fg-dim)] hover:text-[var(--fg)] transition-colors"
          aria-label="Repositorio en GitHub"
          title="Código en GitHub"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-2.06c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.74-1.55-2.56-.29-5.25-1.28-5.25-5.71 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.18 1.18.93-.26 1.92-.39 2.91-.39s1.98.13 2.91.39c2.21-1.49 3.18-1.18 3.18-1.18.63 1.6.23 2.78.11 3.07.74.81 1.19 1.84 1.19 3.1 0 4.44-2.7 5.42-5.27 5.7.42.36.78 1.06.78 2.14v3.17c0 .3.2.66.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
          </svg>
        </a>
      </div>
    </motion.header>
  );
}

function Divider() {
  return <span className="text-[var(--fg-faint)]">·</span>;
}

function ViewToggle({
  view,
  onToggle,
}: {
  view: "globe" | "list";
  onToggle: () => void;
}) {
  return (
    <div className="inline-flex border border-[var(--rule)]">
      <button
        type="button"
        onClick={view === "list" ? onToggle : undefined}
        className={`h-8 px-3 text-[10px] uppercase tracking-[0.2em] transition ${
          view === "globe"
            ? "bg-[var(--brand)]/15 text-[var(--brand)]"
            : "text-[var(--fg-dim)] hover:text-[var(--fg)]"
        }`}
        style={{ fontFamily: "var(--font-mono), monospace" }}
        aria-pressed={view === "globe"}
      >
        Globo
      </button>
      <button
        type="button"
        onClick={view === "globe" ? onToggle : undefined}
        className={`h-8 px-3 text-[10px] uppercase tracking-[0.2em] border-l border-[var(--rule)] transition ${
          view === "list"
            ? "bg-[var(--brand)]/15 text-[var(--brand)]"
            : "text-[var(--fg-dim)] hover:text-[var(--fg)]"
        }`}
        style={{ fontFamily: "var(--font-mono), monospace" }}
        aria-pressed={view === "list"}
      >
        Lista
      </button>
    </div>
  );
}
