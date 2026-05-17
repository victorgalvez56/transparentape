"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Obra, riesgoDeObra } from "@/lib/types";
import { fmtSolesLong, fmtSolesShort, fmtFecha, displayTitle, truncar } from "@/lib/format";
import dynamic from "next/dynamic";

const BeforeAfterSlider = dynamic(() => import("@/components/BeforeAfterSlider"), { ssr: false });

interface Props {
  obra: Obra;
  onClose: () => void;
  onInvestigar: () => void;
}

function calcDelta(base: number | null, comp: number | null) {
  if (!base || !comp) return null;
  return comp / base - 1;
}

type SvData = {
  beforeUrl: string | null;
  afterUrl: string;
  beforeDate: string | null;
  afterDate: string | null;
  hasHistory: boolean;
  totalPanos?: number;
  cached?: boolean;
};

type AiState = {
  status: "idle" | "loading" | "done" | "error" | "no_sv";
  score: number | null;
  description: string | null;
  sv: SvData | null;
};

export default function ObraDetailPanel({
  obra,
  onClose,
  onInvestigar,
}: Props) {
  const riesgo = riesgoDeObra(obra);
  const monto = obra.contract_amount ?? obra.award_amount ?? obra.tender_amount;
  const tituloDisplay = displayTitle(obra);
  const tweetText = `${truncar(tituloDisplay, 120)} · ${obra.buyer_locality} · ${fmtSolesLong(monto)} · Transparentape`;
  const tweetUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/obras/${obra.ocid}`;
  const twitterHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(tweetUrl)}`;

  // Pre-populate from cached DB values if available
  const hasCachedSv =
    obra.streetview_after &&
    obra.streetview_before &&
    obra.streetview_before !== obra.streetview_after;

  const [ai, setAi] = useState<AiState>({
    status: obra.ai_description ? "done" : "idle",
    score: obra.ai_score ?? null,
    description: obra.ai_description ?? null,
    sv: hasCachedSv
      ? {
          beforeUrl: obra.streetview_before!,
          afterUrl: obra.streetview_after!,
          beforeDate: null,
          afterDate: null,
          hasHistory: true,
          cached: true,
        }
      : obra.streetview_after
      ? {
          beforeUrl: null,
          afterUrl: obra.streetview_after,
          beforeDate: null,
          afterDate: null,
          hasHistory: false,
          cached: true,
        }
      : null,
  });

  // Auto-run analysis on mount for obras with coordinates
  useEffect(() => {
    if (!obra.lat || !obra.lng) return;
    // If already analyzed and cached, don't re-run automatically
    if (ai.status === "done" && ai.sv) return;
    runAiAnalysis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra.id]);

  async function runAiAnalysis(force = false) {
    if (!obra.lat || !obra.lng) { setAi((p) => ({ ...p, status: "no_sv" })); return; }
    setAi((p) => ({ ...p, status: "loading" }));
    try {
      const url = `/api/ai?id=${obra.id}${force ? "&force=1" : ""}`;
      const res = await fetch(url);
      if (!res.ok) { setAi((p) => ({ ...p, status: "no_sv" })); return; }
      const d = await res.json();
      setAi({
        status: "done",
        score: d.score ?? null,
        description: d.description ?? null,
        sv: d.streetview ?? null,
      });
    } catch {
      setAi((p) => ({ ...p, status: "error" }));
    }
  }

  const deltaAdj = calcDelta(obra.tender_amount, obra.award_amount);
  const deltaCon = calcDelta(obra.award_amount, obra.contract_amount);

  return (
    <motion.aside
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="absolute bottom-6 left-6 z-30 w-[min(560px,calc(100vw-3rem))] bg-[var(--ink-1)]/95 backdrop-blur-2xl border border-[var(--rule)] rounded-sm shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(66,220,58,0.06)] overflow-hidden flex flex-col max-h-[78vh]"
    >
      {/* HEADER editorial */}
      <header className="px-5 pt-5 pb-4 border-b border-[var(--rule)]">
        <div className="flex items-baseline justify-between gap-3">
          <p
            className="text-[9px] uppercase tracking-[0.32em] text-[var(--fg-faint)]"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Caso · {obra.buyer_locality} · {obra.source_year}
          </p>
          <button
            onClick={onClose}
            className="text-[var(--fg-faint)] hover:text-white text-lg leading-none transition-colors"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <h2
          className="mt-2 text-[22px] leading-[1.2] text-white font-medium"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          {truncar(tituloDisplay, 180)}
        </h2>
        {obra.tender_title && obra.tender_title !== tituloDisplay && (
          <p
            className="mt-1.5 text-[10px] uppercase tracking-[0.22em] text-[var(--fg-faint)]"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            {obra.tender_title}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              riesgo === "alto"
                ? "bg-[var(--alarm)]"
                : riesgo === "medio"
                ? "bg-[var(--warn)]"
                : "bg-[var(--safe)]"
            }`}
          />
          <span
            className={`text-[10px] uppercase tracking-[0.26em] ${
              riesgo === "alto"
                ? "text-[var(--alarm)]"
                : riesgo === "medio"
                ? "text-[var(--warn)]"
                : "text-[var(--safe)]"
            }`}
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            {riesgo === "alto"
              ? "Riesgo alto"
              : riesgo === "medio"
              ? "Riesgo medio"
              : "Sin alertas"}
          </span>
        </div>
      </header>

      <div className="overflow-y-auto flex-1">
        {/* RASTREO DEL BILLETE — anchoring visual */}
        <section className="px-5 py-4 border-b border-[var(--rule)] bg-[var(--ink-0)]/60">
          <p
            className="text-[9px] uppercase tracking-[0.26em] text-[var(--fg-faint)] mb-3"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Rastreo del billete
          </p>
          <div className="grid grid-cols-3 divide-x divide-[var(--rule)]">
            <Money label="Lo que dijeron" value={obra.tender_amount} />
            <Money
              label="Lo que firmaron"
              value={obra.award_amount}
              delta={deltaAdj}
            />
            <Money
              label="Lo que costó"
              value={obra.contract_amount}
              accent
              delta={deltaCon}
            />
          </div>
        </section>

        {/* STREET VIEW + AI */}
        {obra.lat && obra.lng && (
          <div className="border-b border-[var(--rule)]">

            {/* Loading state */}
            {ai.status === "loading" && (
              <div className="flex flex-col items-center justify-center h-32 gap-2 bg-[var(--ink-0)]/60">
                <span className="text-2xl animate-spin">🛰</span>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--fg-faint)] animate-pulse"
                   style={{ fontFamily: "var(--font-mono), monospace" }}>
                  Buscando imágenes históricas…
                </p>
              </div>
            )}

            {/* No Street View coverage */}
            {(ai.status === "no_sv" || ai.status === "error") && (
              <div className="flex flex-col items-center justify-center h-20 gap-1 bg-[var(--ink-0)]/40">
                <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--fg-faint)]"
                   style={{ fontFamily: "var(--font-mono), monospace" }}>
                  Sin cobertura Street View en esta zona
                </p>
              </div>
            )}

            {/* Images */}
            {(ai.status === "done" || ai.status === "idle") && ai.sv && (
              <>
                {ai.sv.hasHistory ? (
                  /* BEFORE + AFTER: thumbnails side-by-side + draggable slider */
                  <>
                    <div className="grid grid-cols-2 gap-0.5 bg-[var(--rule)]">
                      <div className="relative">
                        <img src={ai.sv.beforeUrl!} alt="Antes" className="w-full h-28 object-cover block" />
                        <span className="absolute bottom-1 left-1 text-[8px] uppercase tracking-wider bg-black/70 text-white px-1.5 py-0.5"
                              style={{ fontFamily: "var(--font-mono), monospace" }}>
                          Antes · {ai.sv.beforeDate ?? "—"}
                        </span>
                      </div>
                      <div className="relative">
                        <img src={ai.sv.afterUrl} alt="Ahora" className="w-full h-28 object-cover block" />
                        <span className="absolute bottom-1 right-1 text-[8px] uppercase tracking-wider bg-[var(--brand)]/80 text-black px-1.5 py-0.5"
                              style={{ fontFamily: "var(--font-mono), monospace" }}>
                          Ahora · {ai.sv.afterDate ?? "—"}
                        </span>
                      </div>
                    </div>
                    <BeforeAfterSlider
                      beforeUrl={ai.sv.beforeUrl!}
                      afterUrl={ai.sv.afterUrl}
                      beforeLabel={ai.sv.beforeDate ? `Antes · ${ai.sv.beforeDate}` : "Antes"}
                      afterLabel={ai.sv.afterDate ? `Ahora · ${ai.sv.afterDate}` : "Ahora"}
                    />
                  </>
                ) : (
                  /* Single image — no genuine historical comparison available */
                  <div className="relative">
                    <img src={ai.sv.afterUrl} alt="Street View" className="w-full h-40 object-cover block" />
                    <span className="absolute bottom-1 left-1 text-[8px] uppercase tracking-wider bg-black/70 text-white px-1.5 py-0.5"
                          style={{ fontFamily: "var(--font-mono), monospace" }}>
                      {ai.sv.afterDate ?? "Actual"} · Sin histórico disponible
                    </span>
                    {ai.score !== null && (
                      <span className={`absolute top-1 right-1 text-[10px] font-bold px-2 py-0.5 ${
                        ai.score <= 30 ? "bg-[var(--alarm)]/90 text-white" :
                        ai.score <= 60 ? "bg-[var(--warn)]/90 text-black" :
                        "bg-[var(--safe)]/90 text-black"
                      }`} style={{ fontFamily: "var(--font-mono), monospace" }}>
                        IA {ai.score}/100
                      </span>
                    )}
                  </div>
                )}

                {/* Footer row */}
                <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--rule)]">
                  <p className="text-[8px] uppercase tracking-[0.2em] text-[var(--fg-faint)]"
                     style={{ fontFamily: "var(--font-mono), monospace" }}>
                    Google Street View
                    {ai.sv.totalPanos != null && ` · ${ai.sv.totalPanos} panoramas`}
                  </p>
                  <button
                    onClick={() => runAiAnalysis(true)}
                    className="text-[8px] uppercase tracking-[0.18em] text-[var(--fg-faint)] hover:text-white transition"
                    style={{ fontFamily: "var(--font-mono), monospace" }}
                  >
                    Actualizar ↺
                  </button>
                </div>

                {/* AI verdict */}
                {ai.description && (
                  <div className="px-4 py-3 border-t border-[var(--rule)] bg-[var(--ink-0)]/60">
                    <p className={`text-[9px] uppercase tracking-[0.26em] mb-1.5 ${
                      ai.score != null && ai.score <= 30 ? "text-[var(--alarm)]" :
                      ai.score != null && ai.score <= 60 ? "text-[var(--warn)]" : "text-[var(--safe)]"
                    }`} style={{ fontFamily: "var(--font-mono), monospace" }}>
                      Veredicto IA · Claude Vision
                      {ai.score != null && ` · ${ai.score}/100`}
                      {ai.sv.hasHistory && " · comparación antes/ahora"}
                    </p>
                    <p className="text-[13px] text-white/80 italic leading-relaxed"
                       style={{ fontFamily: "var(--font-display), serif" }}>
                      "{ai.description}"
                    </p>
                    {!ai.sv.cached && (
                      <p className="text-[8px] text-[var(--fg-faint)] mt-1.5 text-right"
                         style={{ fontFamily: "var(--font-mono), monospace" }}>
                        análisis en vivo
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

          </div>
        )}

        {/* QUIÉN RECIBIÓ */}
        <section className="px-5 py-4 border-b border-[var(--rule)]">
          <p
            className="text-[9px] uppercase tracking-[0.26em] text-[var(--fg-faint)] mb-2"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Quién recibió el billete
          </p>
          <h3
            className="text-[18px] leading-[1.2] text-white"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            {obra.supplier_name ?? "—"}
          </h3>
          <p
            className="text-[11px] text-[var(--fg-dim)] mt-1"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            RUC <span className="text-white">{obra.supplier_ruc ?? "—"}</span>
          </p>

          {obra.is_red_flag && (
            <div className="mt-3 border-l-2 border-[var(--alarm)] pl-3 py-1">
              <p
                className="text-[10px] uppercase tracking-[0.22em] text-[var(--alarm)]"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                Antecedentes
              </p>
              <p className="text-sm text-white/90 mt-0.5">
                Figura en{" "}
                {(obra.red_flag_types ?? [])
                  .join(" · ")
                  .replace(/_/g, " ") || "registros de alerta"}
                .
              </p>
            </div>
          )}
        </section>

        {/* CONTRATO */}
        <section className="px-5 py-4 border-b border-[var(--rule)]">
          <p
            className="text-[9px] uppercase tracking-[0.26em] text-[var(--fg-faint)] mb-2"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Contrato
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <DetailRow label="Inicio" value={fmtFecha(obra.contract_start)} />
            <DetailRow label="Fin" value={fmtFecha(obra.contract_end)} />
            <DetailRow
              label="Estado"
              value={obra.contract_status ?? "—"}
            />
            <DetailRow
              label="Adendas"
              value={String(obra.n_amendments ?? 0)}
              alert={(obra.n_amendments ?? 0) >= 2}
            />
            <DetailRow
              label="Método"
              value={obra.procurement_method ?? "—"}
            />
          </dl>
        </section>

        {/* COMPRADOR */}
        <section className="px-5 py-4 border-b border-[var(--rule)]">
          <p
            className="text-[9px] uppercase tracking-[0.26em] text-[var(--fg-faint)] mb-2"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Quién pagó
          </p>
          <p className="text-sm text-white">{obra.buyer_name ?? "—"}</p>
        </section>

      </div>

      {/* CTAs */}
      <footer className="px-5 py-4 border-t border-[var(--rule)] flex gap-2 bg-[var(--ink-0)]/70">
        <button
          onClick={onInvestigar}
          className="flex-1 bg-[var(--brand)] text-black font-medium text-sm py-3 hover:bg-white transition-colors tracking-tight"
        >
          Investigar este caso →
        </button>
        <a
          href={twitterHref}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-3 border border-[var(--rule)] text-white text-sm hover:border-[var(--brand)] transition"
          aria-label="Compartir en X / Twitter"
        >
          Compartir
        </a>
        <a
          href={`/obras/${obra.ocid}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-3 border border-[var(--rule)] text-white text-sm hover:border-[var(--brand)] transition"
          aria-label="Abrir página pública"
        >
          ↗
        </a>
      </footer>
    </motion.aside>
  );
}

function Money({
  label,
  value,
  delta,
  accent = false,
}: {
  label: string;
  value: number | null;
  delta?: number | null;
  accent?: boolean;
}) {
  const positive = (delta ?? 0) > 0.005;
  return (
    <div className="px-3 first:pl-0 last:pr-0">
      <p
        className="text-[9px] uppercase tracking-[0.22em] text-[var(--fg-faint)]"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {label}
      </p>
      <p
        className={`mt-2 text-[20px] tabular-nums leading-none ${
          accent ? "text-[var(--brand)]" : "text-white"
        }`}
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        <span className="text-[10px] text-[var(--fg-faint)] mr-1">S/</span>
        {fmtSolesShort(value)}
      </p>
      {delta != null && (
        <p
          className={`mt-1 text-[10px] ${
            positive ? "text-[var(--alarm)]" : "text-[var(--fg-faint)]"
          }`}
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {positive ? "▲" : "▼"} {(Math.abs(delta) * 100).toFixed(1)}%
        </p>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div>
      <dt
        className="text-[9px] uppercase tracking-[0.2em] text-[var(--fg-faint)]"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {label}
      </dt>
      <dd
        className={`text-sm mt-0.5 ${alert ? "text-[var(--warn)]" : "text-white"}`}
      >
        {value}
      </dd>
    </div>
  );
}
