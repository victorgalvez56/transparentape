"use client";

import { useTheme } from "./ThemeProvider";
import type { ThemePref } from "@/lib/theme";

interface Props {
  className?: string;
}

const LABEL: Record<ThemePref, string> = {
  light: "Light",
  dark: "Dark",
  system: "Auto",
};

export default function ThemeToggle({ className = "" }: Props) {
  const { pref, cycle } = useTheme();
  return (
    <button
      type="button"
      onClick={cycle}
      title={`Tema: ${LABEL[pref]} (click para cambiar)`}
      aria-label={`Tema actual ${LABEL[pref]}, cambiar tema`}
      className={`
        inline-flex items-center justify-center gap-2 h-8 px-3
        text-[10px] uppercase tracking-[0.2em]
        border border-[var(--rule)] hover:border-[var(--brand)]/40
        text-[var(--fg-dim)] hover:text-[var(--fg)]
        transition-colors
        ${className}
      `}
      style={{ fontFamily: "var(--font-mono), monospace" }}
    >
      <Icon pref={pref} />
      <span>{LABEL[pref]}</span>
    </button>
  );
}

function Icon({ pref }: { pref: ThemePref }) {
  if (pref === "light") {
    return (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  if (pref === "dark") {
    return (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  // system
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="4" width="20" height="14" rx="1" />
      <path d="M8 21h8M12 18v3" />
    </svg>
  );
}
