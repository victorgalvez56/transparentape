"use client";

import { motion } from "motion/react";
import { Obra, riesgoDeObra } from "@/lib/types";
import { fmtSolesLong, fmtSolesShort, fmtFecha, displayTitle, truncar } from "@/lib/format";

interface Props {
  obra: Obra;
  onClose: () => void;
  onInvestigar: () => void;
  /** Si true, se renderiza embebido dentro de un container (no floating). */
  embedded?: boolean;
}

function calcDelta(base: number | null, comp: number | null) {
  if (!base || !comp) return null;
  return comp / base - 1;
}

export default function ObraDetailPanel({
  obra,
  onClose,
  onInvestigar,
  embedded = false,
}: Props) {
  const riesgo = riesgoDeObra(obra);
  const monto = obra.contract_amount ?? obra.award_amount ?? obra.tender_amount;
  const tituloDisplay = displayTitle(obra);
  const tweetText = `${truncar(tituloDisplay, 120)} · ${obra.buyer_locality} · ${fmtSolesLong(monto)} · Transparentape`;
  const tweetUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/obras/${obra.ocid}`;
  const twitterHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(tweetUrl)}`;
  const gmapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const hasStreetView = Boolean(gmapsKey && obra.lat && obra.lng);
  const streetViewUrl = hasStreetView
    ? `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${obra.lat},${obra.lng}&fov=80&key=${gmapsKey}`
    : null;

  const deltaAdj = calcDelta(obra.tender_amount, obra.award_amount);
  const deltaCon = calcDelta(obra.award_amount, obra.contract_amount);

  return (
    <motion.aside
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={
        embedded
          ? "relative w-full h-full bg-[var(--ink-2)]/40 border-t-2 border-[var(--brand)]/30 overflow-hidden flex flex-col"
          : "absolute bottom-6 left-6 z-30 w-[min(560px,calc(100vw-3rem))] bg-[var(--ink-1)]/95 backdrop-blur-2xl border border-[var(--rule)] rounded-sm shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(66,220,58,0.06)] overflow-hidden flex flex-col max-h-[78vh]"
      }
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
            className="text-[var(--fg-faint)] hover:text-[var(--fg)] text-lg leading-none transition-colors"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <h2
          className="mt-2 text-[22px] leading-[1.2] text-[var(--fg)] font-medium"
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

        {/* STREET VIEW */}
        {hasStreetView ? (
          <div className="border-b border-[var(--rule)]">
            <img
              src={streetViewUrl!}
              alt="Street View"
              className="w-full h-44 object-cover"
            />
            <p
              className="text-[9px] tracking-[0.2em] uppercase text-[var(--fg-faint)] px-2 py-1.5 border-t border-[var(--rule)]"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Street View · Google
            </p>
          </div>
        ) : (
          <div
            className="border-b border-[var(--rule)] px-5 py-3 text-[10px] uppercase tracking-[0.22em] text-[var(--fg-faint)]"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Sin Street View · configura GOOGLE_MAPS_KEY
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
            className="text-[18px] leading-[1.2] text-[var(--fg)]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            {obra.supplier_name ?? "—"}
          </h3>
          <p
            className="text-[11px] text-[var(--fg-dim)] mt-1"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            RUC <span className="text-[var(--fg)]">{obra.supplier_ruc ?? "—"}</span>
          </p>

          {obra.is_red_flag && (
            <div className="mt-3 border-l-2 border-[var(--alarm)] pl-3 py-1">
              <p
                className="text-[10px] uppercase tracking-[0.22em] text-[var(--alarm)]"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                Antecedentes
              </p>
              <p className="text-sm text-[var(--fg)]/90 mt-0.5">
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
          <p className="text-sm text-[var(--fg)]">{obra.buyer_name ?? "—"}</p>
        </section>

        {/* AI */}
        {obra.ai_description && (
          <section className="px-5 py-4 border-b border-[var(--rule)]">
            <p
              className="text-[9px] uppercase tracking-[0.26em] text-[var(--fg-faint)] mb-2"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Análisis automático
              {obra.ai_score != null && (
                <span className="text-[var(--fg-dim)]">
                  {" "}
                  · score {obra.ai_score}/100
                </span>
              )}
            </p>
            <p
              className="text-sm text-[var(--fg)]/80 italic leading-relaxed"
              style={{ fontFamily: "var(--font-display), serif" }}
            >
              "{obra.ai_description}"
            </p>
          </section>
        )}
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
          className="px-4 py-3 border border-[var(--rule)] text-[var(--fg)] text-sm hover:border-[var(--brand)] transition"
          aria-label="Compartir en X / Twitter"
        >
          Compartir
        </a>
        <a
          href={`/obras/${obra.ocid}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-3 border border-[var(--rule)] text-[var(--fg)] text-sm hover:border-[var(--brand)] transition"
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
          accent ? "text-[var(--brand)]" : "text-[var(--fg)]"
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
        className={`text-sm mt-0.5 ${alert ? "text-[var(--warn)]" : "text-[var(--fg)]"}`}
      >
        {value}
      </dd>
    </div>
  );
}
