"use client";

interface Props {
  stats: string;
  view: "globe" | "grid";
  onViewChange: (v: "globe" | "grid") => void;
  theme: "light" | "dark";
  onThemeToggle: () => void;
  hasFilters: boolean;
  onClearFilters: () => void;
}

function Seg({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-medium transition-colors"
      style={{
        background: active ? "var(--cx-card)" : "transparent",
        color: active ? "var(--cx-fg)" : "var(--cx-muted)",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
      }}
    >
      {children}
    </button>
  );
}

export default function CodexHeader({
  stats,
  view,
  onViewChange,
  theme,
  onThemeToggle,
  hasFilters,
  onClearFilters,
}: Props) {
  return (
    <header
      className="flex items-center justify-between px-3 sm:px-5 py-2.5 shrink-0 border-b"
      style={{ borderColor: "var(--cx-border)" }}
    >
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="grid place-items-center w-6 h-6 rounded-md text-[13px] font-bold"
            style={{
              background: "var(--cx-brand)",
              color: "var(--cx-brand-fg)",
            }}
          >
            S/
          </span>
          <span className="text-[15px] sm:text-base font-semibold tracking-tight">
            Sigue&nbsp;el&nbsp;Billete
          </span>
        </div>
        <p
          className="text-[10px] sm:text-xs hidden sm:block truncate"
          style={{
            color: "var(--cx-muted)",
            fontFamily: "var(--font-mono), monospace",
          }}
        >
          {stats}
        </p>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        {hasFilters && (
          <button
            onClick={onClearFilters}
            className="text-[10px] sm:text-xs transition-colors"
            style={{ color: "var(--cx-muted)" }}
          >
            Limpiar
          </button>
        )}

        <button
          onClick={onThemeToggle}
          aria-label="Cambiar tema"
          className="grid place-items-center w-7 h-7 rounded-md transition-colors"
          style={{ color: "var(--cx-muted)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--cx-secondary)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          {theme === "dark" ? (
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        <div
          className="flex items-center rounded-lg p-0.5"
          style={{ background: "var(--cx-secondary)" }}
        >
          <Seg active={view === "globe"} onClick={() => onViewChange("globe")}>
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span className="hidden sm:inline">Globo</span>
          </Seg>
          <Seg active={view === "grid"} onClick={() => onViewChange("grid")}>
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span className="hidden sm:inline">Lista</span>
          </Seg>
        </div>
      </div>
    </header>
  );
}
