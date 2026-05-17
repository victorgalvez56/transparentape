"use client";

import { motion } from "motion/react";

interface Props {
  obrasCount: number;
  redFlagsCount: number;
  source: string;
  regionLabel: string;
}

export default function AuthorityHud({
  obrasCount,
  redFlagsCount,
  source,
  regionLabel,
}: Props) {
  const isDemo = source === "mock";
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="absolute top-0 left-0 z-20 w-full pointer-events-none"
    >
      <div className="flex items-baseline justify-between px-6 py-5 gap-6 flex-wrap">
        {/* Wordmark + region scroll-spy */}
        <div className="flex items-baseline gap-3 min-w-0">
          <span
            className="text-[20px] leading-none font-medium tracking-tight text-white shrink-0"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            Transparentape
            <span className="text-[var(--brand)]">.</span>
          </span>
          <span
            className="inline-block text-[11.5px] tracking-tight text-[var(--fg-dim)] truncate max-w-[480px] pointer-events-none font-medium"
            style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
          >
            <span
              key={regionLabel}
              className="inline-block whitespace-nowrap animate-[fadeIn_0.25s_ease-out]"
            >
              {regionLabel}
            </span>
          </span>
        </div>

        {/* Autoridad + counts */}
        <div
          className="flex items-center gap-5 text-[11.5px] tracking-tight text-[var(--fg-dim)] flex-wrap pointer-events-none"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          <span>
            <span className="text-white font-medium tabular-nums">
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
          <Divider className="hidden md:inline" />
          <span className="hidden md:inline">
            Fuente · <span className="text-white/70">OCDS / OECE / MEF</span>
          </span>
          <Divider className="hidden md:inline" />
          <span className="flex items-center gap-2">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                isDemo
                  ? "bg-[var(--warn)]"
                  : "bg-[var(--brand)] shadow-[0_0_8px_var(--brand-glow)]"
              }`}
            />
            {isDemo ? "Demo data" : "Live data"}
          </span>
        </div>
      </div>
    </motion.header>
  );
}

function Divider({ className = "" }: { className?: string }) {
  return <span className={`text-[var(--fg-faint)] ${className}`}>·</span>;
}
