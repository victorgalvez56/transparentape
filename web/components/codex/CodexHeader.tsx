"use client";

interface Props {
  /** Conteo de contratos (filtrados) — se muestra en el centro */
  obrasCount: number;
  /** Conteo de alertas (red_flags) — se muestra en el centro */
  redFlagsCount: number;
  /** Etiqueta de region/pais a mostrar a la derecha del centro */
  regionLabel: string;
  view: "globe" | "grid" | "panel";
  onViewChange: (v: "globe" | "grid" | "panel") => void;
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

export default function CodexHeaderHybrid({
  obrasCount,
  redFlagsCount,
  regionLabel,
  view,
  onViewChange,
  theme,
  onThemeToggle,
  hasFilters,
  onClearFilters,
}: Props) {
  const nf = (n: number) => n.toLocaleString("es-PE");

  return (
    <header
      className="flex items-center px-3 sm:px-5 py-2.5 shrink-0 border-b gap-3 sm:gap-6"
      style={{ borderColor: "var(--cx-border)" }}
    >
      {/* IZQUIERDA — wordmark + nav (paridad con / local) */}
      <div className="flex items-center gap-4 sm:gap-6 shrink-0">
        <a
          href="/"
          className="text-[18px] leading-none font-medium tracking-tight hover:opacity-90 transition"
          style={{
            fontFamily: "var(--font-display), serif",
            color: "var(--cx-fg)",
          }}
        >
          Transparentape
          <span style={{ color: "var(--cx-brand)" }}>.</span>
        </a>
        <nav
          className="hidden md:flex items-center gap-5 text-[12.5px] font-medium tracking-tight"
          style={{
            fontFamily: "var(--font-body), system-ui, sans-serif",
            color: "var(--cx-muted)",
          }}
        >
          <a
            href="/"
            className="pb-0.5 border-b"
            style={{
              color: "var(--cx-fg)",
              borderColor: "var(--cx-brand)",
            }}
          >
            Mapa
          </a>
          <a
            href="/vr"
            className="hover:text-[var(--cx-fg)] transition-colors"
          >
            Audit Room VR
          </a>
        </nav>
      </div>

      {/* CENTRO — stats vivos */}
      <div
        className="flex-1 hidden md:flex items-center justify-center gap-4 text-[12.5px] tracking-tight min-w-0"
        style={{
          fontFamily: "var(--font-body), system-ui, sans-serif",
          color: "var(--cx-muted)",
        }}
      >
        <span className="whitespace-nowrap">
          <span
            className="font-medium tabular-nums"
            style={{ color: "var(--cx-fg)" }}
          >
            {nf(obrasCount)}
          </span>{" "}
          contratos auditados
        </span>
        <span style={{ color: "var(--cx-faint)" }}>·</span>
        <span
          key={regionLabel}
          className="whitespace-nowrap inline-block animate-[fadeIn_0.25s_ease-out]"
        >
          {regionLabel}
        </span>
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
          data-tour="views"
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
          <Seg active={view === "panel"} onClick={() => onViewChange("panel")}>
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path d="M3 3v18h18" />
              <rect x="7" y="11" width="3" height="6" rx="0.5" />
              <rect x="12.5" y="7" width="3" height="10" rx="0.5" />
              <rect x="18" y="13" width="3" height="4" rx="0.5" />
            </svg>
            <span className="hidden sm:inline">Panel</span>
          </Seg>
        </div>
      </div>
    </header>
  );
}
