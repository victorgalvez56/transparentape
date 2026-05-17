"use client";

import { motion } from "motion/react";
import type { CountryView } from "@/lib/countries";

interface ChipCountry extends CountryView {
  count: number;
}

interface Props {
  countries: ChipCountry[];
  selectedCode: string | null; // null = "Todos"
  onSelect: (code: string | null) => void;
}

/**
 * Row de chips estilo codex-globe: "All / North America 26 / South America 6 / ..."
 *
 * En nuestro caso son países. El chip "Todos" siempre primero.
 * Países con count > 0 son clickeables. Los de count 0 quedan grisados.
 *
 * Click un chip → setea filtro de país + dispara flyTo al país.
 */
export default function CountryChips({
  countries,
  selectedCode,
  onSelect,
}: Props) {
  const totalCount = countries.reduce((sum, c) => sum + c.count, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="absolute top-[60px] left-0 right-0 z-20 h-[44px]
                 bg-[var(--ink-1)]/70 backdrop-blur-md
                 border-b border-[var(--rule)]"
    >
      <div
        className="h-full flex items-center gap-1 px-4 overflow-x-auto
                   scrollbar-thin scrollbar-thumb-[var(--rule)]
                   whitespace-nowrap"
        style={{
          fontFamily: "var(--font-mono), monospace",
          scrollbarWidth: "thin",
        }}
      >
        <Chip
          label="Todos"
          count={totalCount}
          active={selectedCode === null}
          onClick={() => onSelect(null)}
        />
        {countries.map((c) => (
          <Chip
            key={c.code}
            label={c.name}
            count={c.count}
            active={selectedCode === c.code}
            disabled={c.count === 0}
            onClick={() => onSelect(c.code)}
          />
        ))}
      </div>
    </motion.div>
  );
}

function Chip({
  label,
  count,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  count: number;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`inline-flex items-baseline gap-1.5 px-3 py-1.5
                  text-[10px] uppercase tracking-[0.18em]
                  border transition-colors
                  ${
                    active
                      ? "bg-[var(--brand)]/15 border-[var(--brand)]/60 text-[var(--brand)]"
                      : disabled
                        ? "border-transparent text-[var(--fg-faint)]/40 cursor-not-allowed"
                        : "border-transparent text-[var(--fg-dim)] hover:text-[var(--fg)] hover:bg-white/[0.03]"
                  }`}
    >
      <span>{label}</span>
      <span
        className={`text-[9px] tabular-nums ${
          active ? "text-[var(--brand)]/80" : "text-[var(--fg-faint)]"
        }`}
      >
        {count.toLocaleString("es-PE")}
      </span>
    </button>
  );
}
