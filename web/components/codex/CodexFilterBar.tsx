"use client";

import type { RiesgoNivel } from "@/lib/types";

export type PaisFiltro = "todos" | "PE" | "CL";
export type RiesgoFiltro = "todas" | RiesgoNivel;

interface Props {
  pais: PaisFiltro;
  onPais: (p: PaisFiltro) => void;
  paisCounts: Record<PaisFiltro, number>;
  region: string | null;
  onRegion: (r: string | null) => void;
  regions: { name: string; count: number }[];
  riesgo: RiesgoFiltro;
  onRiesgo: (r: RiesgoFiltro) => void;
  riesgoCounts: Record<RiesgoFiltro, number>;
  soloRedFlags: boolean;
  onRedFlags: (v: boolean) => void;
  redFlagsCount: number;
}

function Chip({
  active,
  onClick,
  children,
  tone = "neutral",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "neutral" | "alarm";
}) {
  const activeBg =
    tone === "alarm" ? "var(--cx-alarm-soft)" : "var(--cx-secondary)";
  const activeFg = tone === "alarm" ? "var(--cx-alarm)" : "var(--cx-fg)";
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap shrink-0"
      style={{
        background: active ? activeBg : "transparent",
        color: active ? activeFg : "var(--cx-muted)",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--cx-accent)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span style={{ color: "var(--cx-faint)" }} className="tabular-nums">
      {n}
    </span>
  );
}

const PAIS_LABEL: Record<PaisFiltro, string> = {
  todos: "Todos",
  PE: "🇵🇪 Perú",
  CL: "🇨🇱 Chile",
};

const RIESGO_LABEL: Record<RiesgoFiltro, string> = {
  todas: "Riesgo: todo",
  alto: "Alto",
  medio: "Medio",
  bajo: "Bajo",
};

export default function CodexFilterBar(p: Props) {
  return (
    <div
      className="flex items-center gap-2 px-3 sm:px-6 py-2 border-b shrink-0 overflow-x-auto backdrop-blur-xl"
      style={{
        borderColor: "var(--cx-border)",
        background: "var(--cx-bg-blur)",
        maskImage:
          "linear-gradient(to right, black calc(100% - 24px), transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, black calc(100% - 24px), transparent)",
      }}
    >
      {/* País */}
      <div className="flex items-center gap-1 shrink-0">
        {(["todos", "PE", "CL"] as PaisFiltro[]).map((k) => (
          <Chip
            key={k}
            active={p.pais === k}
            onClick={() => p.onPais(k)}
          >
            {PAIS_LABEL[k]}{" "}
            <Count n={p.paisCounts[k]} />
          </Chip>
        ))}
      </div>

      <div
        className="w-px h-4 shrink-0"
        style={{ background: "var(--cx-border)" }}
      />

      {/* Riesgo */}
      <div className="flex items-center gap-1 shrink-0">
        {(["todas", "alto", "medio", "bajo"] as RiesgoFiltro[]).map((k) => (
          <Chip
            key={k}
            active={p.riesgo === k}
            tone={k === "alto" ? "alarm" : "neutral"}
            onClick={() => p.onRiesgo(k)}
          >
            {RIESGO_LABEL[k]} <Count n={p.riesgoCounts[k]} />
          </Chip>
        ))}
        <Chip
          active={p.soloRedFlags}
          tone="alarm"
          onClick={() => p.onRedFlags(!p.soloRedFlags)}
        >
          ⚑ Red flags <Count n={p.redFlagsCount} />
        </Chip>
      </div>

      {p.regions.length > 0 && (
        <>
          <div
            className="w-px h-4 shrink-0"
            style={{ background: "var(--cx-border)" }}
          />
          {/* Regiones */}
          <div className="flex items-center gap-1 shrink-0">
            <Chip
              active={p.region === null}
              onClick={() => p.onRegion(null)}
            >
              Todas las regiones
            </Chip>
            {p.regions.map((r) => (
              <Chip
                key={r.name}
                active={p.region === r.name}
                onClick={() =>
                  p.onRegion(p.region === r.name ? null : r.name)
                }
              >
                {r.name} <Count n={r.count} />
              </Chip>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
