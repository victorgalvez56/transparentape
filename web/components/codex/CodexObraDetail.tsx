"use client";

import { Obra, riesgoDeObra } from "@/lib/types";
import { displayTitle, fmtMonto, fmtFecha } from "@/lib/format";

const RIESGO = {
  alto: { label: "Riesgo alto", c: "var(--cx-alarm)", bg: "var(--cx-alarm-soft)" },
  medio: { label: "Riesgo medio", c: "var(--cx-warn)", bg: "var(--cx-warn-soft)" },
  bajo: { label: "Riesgo bajo", c: "var(--cx-brand)", bg: "var(--cx-brand-soft)" },
} as const;

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-[9px] uppercase tracking-[0.18em]"
        style={{
          color: "var(--cx-faint)",
          fontFamily: "var(--font-mono), monospace",
        }}
      >
        {label}
      </span>
      <span className="text-[13px] leading-snug">{value}</span>
    </div>
  );
}

export default function CodexObraDetail({
  obra,
  onClose,
}: {
  obra: Obra;
  onClose: () => void;
}) {
  const r = RIESGO[riesgoDeObra(obra)];

  return (
    <div
      className="cx-animate-in absolute z-30 left-3 right-3 bottom-3 sm:left-4 sm:right-auto sm:bottom-4 sm:w-[420px] sm:max-h-[calc(100%-2rem)] flex flex-col rounded-xl border overflow-hidden"
      style={{
        borderColor: "var(--cx-border)",
        background: "var(--cx-card)",
        boxShadow: "var(--cx-shadow)",
      }}
    >
      <div
        className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b shrink-0"
        style={{ borderColor: "var(--cx-border)" }}
      >
        <div className="min-w-0">
          <span
            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: r.bg, color: r.c }}
          >
            {obra.is_red_flag ? "⚑ " : ""}
            {r.label}
          </span>
          <h2 className="mt-2 text-[15px] font-semibold leading-snug">
            {displayTitle(obra)}
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="grid place-items-center w-7 h-7 rounded-md shrink-0 transition-colors"
          style={{ color: "var(--cx-muted)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--cx-secondary)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="overflow-y-auto px-4 py-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
        <div className="col-span-2">
          <Field label="Entidad" value={obra.buyer_name} />
        </div>
        <Field
          label="Localidad"
          value={
            [obra.buyer_locality, obra.buyer_region]
              .filter(Boolean)
              .join(" · ") || null
          }
        />
        <Field label="Año" value={obra.source_year} />
        <Field
          label="País"
          value={obra.country === "CL" ? "Chile" : "Perú"}
        />
        <Field label="Método" value={obra.procurement_method} />

        <div
          className="col-span-2 h-px my-0.5"
          style={{ background: "var(--cx-border)" }}
        />

        <Field
          label="Monto licitado"
          value={fmtMonto(obra.tender_amount, obra.country)}
        />
        <Field
          label="Monto adjudicado"
          value={fmtMonto(obra.award_amount, obra.country)}
        />
        <div className="col-span-2">
          <Field
            label="Monto contrato"
            value={
              <strong>{fmtMonto(obra.contract_amount, obra.country)}</strong>
            }
          />
        </div>

        <div className="col-span-2">
          <Field label="Contratista" value={obra.supplier_name} />
        </div>
        <Field label="RUC / ID" value={obra.supplier_ruc ?? obra.supplier_id} />
        <Field label="Adendas" value={obra.n_amendments} />

        <Field label="Adjudicación" value={fmtFecha(obra.award_date)} />
        <Field
          label="Plazo"
          value={
            obra.contract_start || obra.contract_end
              ? `${fmtFecha(obra.contract_start)} → ${fmtFecha(
                  obra.contract_end
                )}`
              : null
          }
        />

        {obra.red_flag_types && obra.red_flag_types.length > 0 && (
          <div className="col-span-2 flex flex-col gap-1.5">
            <span
              className="text-[9px] uppercase tracking-[0.18em]"
              style={{
                color: "var(--cx-faint)",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              Señales detectadas
            </span>
            <div className="flex flex-wrap gap-1.5">
              {obra.red_flag_types.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded text-[10px]"
                  style={{
                    background: "var(--cx-alarm-soft)",
                    color: "var(--cx-alarm)",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {obra.ai_description && (
          <div
            className="col-span-2 rounded-lg p-3 text-[12px] leading-relaxed"
            style={{
              background: "var(--cx-secondary)",
              color: "var(--cx-muted)",
            }}
          >
            <span
              className="block mb-1 text-[9px] uppercase tracking-[0.18em]"
              style={{ color: "var(--cx-faint)" }}
            >
              Análisis IA
              {obra.ai_score != null ? ` · score ${obra.ai_score}` : ""}
            </span>
            {obra.ai_description}
          </div>
        )}
      </div>

      <div
        className="px-4 py-3 border-t shrink-0"
        style={{ borderColor: "var(--cx-border)" }}
      >
        <a
          href={`/obras/${encodeURIComponent(obra.ocid)}`}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90"
          style={{
            background: "var(--cx-brand)",
            color: "var(--cx-brand-fg)",
          }}
        >
          Ver expediente completo
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>
      </div>
    </div>
  );
}
