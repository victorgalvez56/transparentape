"use client";

import { Obra, riesgoDeObra } from "@/lib/types";
import { displayTitle, fmtSoles, truncar } from "@/lib/format";

const RIESGO_COLOR = {
  alto: "var(--cx-alarm)",
  medio: "var(--cx-warn)",
  bajo: "var(--cx-brand)",
} as const;

export default function CodexObraCard({
  obra,
  selected,
  onClick,
  compact,
}: {
  obra: Obra;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const riesgo = riesgoDeObra(obra);
  const loc =
    [obra.buyer_locality, obra.buyer_region].filter(Boolean)[0] ?? "—";
  const amount = obra.contract_amount ?? obra.award_amount ?? obra.tender_amount;

  return (
    <button
      onClick={onClick}
      className={`text-left border rounded-lg transition-all duration-200 w-full ${
        compact ? "px-2.5 py-2" : "px-3 py-2.5"
      }`}
      style={{
        borderColor: selected ? "var(--cx-brand)" : "var(--cx-border)",
        background: selected ? "var(--cx-brand-soft)" : "var(--cx-card)",
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = "var(--cx-card-hover)";
          e.currentTarget.style.borderColor = "var(--cx-border-strong)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = "var(--cx-card)";
          e.currentTarget.style.borderColor = "var(--cx-border)";
        }
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="rounded-full shrink-0 mt-[5px]"
          style={{
            width: 7,
            height: 7,
            background: RIESGO_COLOR[riesgo],
          }}
        />
        <div className="min-w-0 flex-1">
          <p
            className={`font-medium leading-snug ${
              compact ? "text-xs" : "text-[13px]"
            }`}
          >
            {truncar(displayTitle(obra), compact ? 70 : 96)}
          </p>
          <p
            className={`truncate mt-1 ${compact ? "text-[10px]" : "text-[11px]"}`}
            style={{
              color: "var(--cx-muted)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            {loc}
            {obra.source_year ? ` · ${obra.source_year}` : ""} ·{" "}
            {fmtSoles(amount)}
            {obra.country === "CL" ? " · CL" : ""}
          </p>
          {obra.supplier_name && !compact && (
            <p
              className="truncate mt-1 text-[11px]"
              style={{ color: "var(--cx-faint)" }}
            >
              {obra.supplier_name}
            </p>
          )}
          {obra.is_red_flag && (
            <span
              className="inline-block mt-1.5 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold"
              style={{
                background: "var(--cx-alarm-soft)",
                color: "var(--cx-alarm)",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              ⚑ Alerta
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
