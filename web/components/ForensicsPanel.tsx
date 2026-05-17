"use client";

import { motion } from "motion/react";
import { Obra } from "@/lib/types";
import { fmtSolesLong, fmtFecha, displayTitle, truncar } from "@/lib/format";

interface Props {
  obra: Obra;
  onClose: () => void;
}

interface Hallazgo {
  nivel: "alto" | "medio" | "info";
  titulo: string;
  detalle: string;
}

function analizar(o: Obra): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];

  if (o.is_red_flag) {
    hallazgos.push({
      nivel: "alto",
      titulo: "Contratista con registro de sanción",
      detalle: `Tipos: ${(o.red_flag_types ?? []).join(", ").replace(/_/g, " ")}. Fuente: OECE datosabiertos.gob.pe.`,
    });
  }

  const award = o.award_amount ?? 0;
  const tender = o.tender_amount ?? 0;
  if (tender > 0 && award > 0) {
    const ratio = award / tender;
    if (ratio > 1.05) {
      hallazgos.push({
        nivel: "alto",
        titulo: `Adjudicación ${(ratio * 100 - 100).toFixed(1)}% sobre el valor referencial`,
        detalle: `El Estado dijo que esta obra costaría ${fmtSolesLong(tender)}. Terminó adjudicándose por ${fmtSolesLong(award)}.`,
      });
    } else if (ratio < 0.7) {
      hallazgos.push({
        nivel: "medio",
        titulo: "Adjudicación muy por debajo del referencial",
        detalle: `Posible oferta temeraria. ${fmtSolesLong(award)} sobre un referencial de ${fmtSolesLong(tender)}.`,
      });
    }
  }

  if (award > 0 && o.contract_amount && o.contract_amount > award * 1.05) {
    const pct = (o.contract_amount / award - 1) * 100;
    hallazgos.push({
      nivel: "alto",
      titulo: `El contrato infló ${pct.toFixed(1)}% sobre lo adjudicado`,
      detalle: `Adjudicado ${fmtSolesLong(award)} → contrato firmado por ${fmtSolesLong(o.contract_amount)}.`,
    });
  }

  if ((o.n_amendments ?? 0) >= 2) {
    hallazgos.push({
      nivel: "medio",
      titulo: `${o.n_amendments} adendas al contrato`,
      detalle:
        "Múltiples adendas suelen indicar cambios de alcance, plazo o presupuesto durante la ejecución.",
    });
  }

  if (o.procurement_method === "AS") {
    hallazgos.push({
      nivel: "medio",
      titulo: "Adjudicación Simplificada",
      detalle:
        "Procedimiento de menor escrutinio. Revisar la justificación de por qué no se usó licitación pública.",
    });
  }

  if (o.contract_status === "terminated") {
    hallazgos.push({
      nivel: "alto",
      titulo: "Contrato resuelto anticipadamente",
      detalle:
        "Suele indicar incumplimiento del contratista o del comprador. Vale la pena revisar el expediente.",
    });
  }

  if (o.ai_score != null && o.ai_score >= 60) {
    hallazgos.push({
      nivel: "info",
      titulo: `Score automático ${o.ai_score}/100`,
      detalle: o.ai_description ?? "Análisis Claude sobre la documentación.",
    });
  }

  if (hallazgos.length === 0) {
    hallazgos.push({
      nivel: "info",
      titulo: "No se detectaron señales automáticas",
      detalle:
        "Esto no garantiza ausencia de irregularidades; revise la documentación.",
    });
  }
  return hallazgos;
}

export default function ForensicsPanel({ obra, onClose }: Props) {
  const hallazgos = analizar(obra);
  const periodo =
    obra.contract_start && obra.contract_end
      ? `${fmtFecha(obra.contract_start)} → ${fmtFecha(obra.contract_end)}`
      : "—";
  const tituloDisplay = displayTitle(obra);
  const shareUrl =
    typeof window !== "undefined"
      ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(
          `Caso ${truncar(tituloDisplay, 100)} · ${fmtSolesLong(obra.contract_amount ?? obra.award_amount ?? obra.tender_amount)} · ${hallazgos.filter((h) => h.nivel === "alto").length} alertas. Transparentape.`
        )}&url=${encodeURIComponent(`${window.location.origin}/obras/${obra.ocid}`)}`
      : "#";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 bg-[var(--ink-0)]/95 backdrop-blur-3xl flex items-stretch justify-center overflow-y-auto"
      onClick={onClose}
    >
      <motion.article
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-3xl w-full bg-[var(--ink-1)] border-x border-[var(--rule)] my-0 min-h-screen"
      >
        {/* CLOSE BTN */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-[var(--fg-faint)] hover:text-[var(--fg)] text-2xl leading-none z-10"
          aria-label="Cerrar"
        >
          ×
        </button>

        {/* HEADER tipo investigación */}
        <header className="px-10 pt-14 pb-8 border-b border-[var(--rule)]">
          <p
            className="text-[10px] uppercase tracking-[0.36em] text-[var(--alarm)]"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Investigación · OCID {obra.ocid}
          </p>
          <h1
            className="mt-4 text-[clamp(28px,4.5vw,40px)] leading-[1.08] text-[var(--fg)] font-medium"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            {truncar(tituloDisplay, 220)}
          </h1>
          <p className="mt-5 text-base text-[var(--fg-dim)] max-w-prose leading-relaxed">
            <span className="text-[var(--fg)]">{obra.buyer_name}</span> contrató a{" "}
            <span className="text-[var(--fg)]">{obra.supplier_name}</span> por{" "}
            <span
              className="text-[var(--brand)] tabular-nums"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              {fmtSolesLong(obra.contract_amount)}
            </span>
            . Estos son los puntos que vale la pena mirar.
          </p>
        </header>

        {/* META BAR */}
        <section
          className="px-10 py-4 border-b border-[var(--rule)] text-[10px] uppercase tracking-[0.2em] text-[var(--fg-faint)] flex flex-wrap gap-x-6 gap-y-2"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          <span>
            Período · <span className="text-[var(--fg)]">{periodo}</span>
          </span>
          <span>
            Adendas · <span className="text-[var(--fg)]">{obra.n_amendments ?? 0}</span>
          </span>
          <span>
            Método ·{" "}
            <span className="text-[var(--fg)]">{obra.procurement_method ?? "—"}</span>
          </span>
          <span>
            Estado ·{" "}
            <span className="text-[var(--fg)]">{obra.contract_status ?? "—"}</span>
          </span>
        </section>

        {/* HALLAZGOS numerados estilo periódico */}
        <section className="px-10 py-10 space-y-10">
          {hallazgos.map((h, i) => (
            <div key={i} className="grid grid-cols-[64px_1fr] gap-6">
              <span
                className={`text-[44px] leading-none italic font-medium ${
                  h.nivel === "alto"
                    ? "text-[var(--alarm)]"
                    : h.nivel === "medio"
                    ? "text-[var(--warn)]"
                    : "text-[var(--fg-faint)]"
                }`}
                style={{ fontFamily: "var(--font-display), serif" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p
                  className={`text-[9px] uppercase tracking-[0.3em] ${
                    h.nivel === "alto"
                      ? "text-[var(--alarm)]"
                      : h.nivel === "medio"
                      ? "text-[var(--warn)]"
                      : "text-[var(--fg-faint)]"
                  }`}
                  style={{ fontFamily: "var(--font-mono), monospace" }}
                >
                  {h.nivel === "alto"
                    ? "Severidad alta"
                    : h.nivel === "medio"
                    ? "Severidad media"
                    : "Contexto"}
                </p>
                <h2
                  className="mt-2 text-[22px] leading-tight text-[var(--fg)] font-medium"
                  style={{ fontFamily: "var(--font-display), serif" }}
                >
                  {h.titulo}
                </h2>
                <p className="mt-2 text-[15px] text-[var(--fg-dim)] leading-relaxed">
                  {h.detalle}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* FOOTER */}
        <footer className="px-10 py-8 border-t border-[var(--rule)] flex items-center justify-between gap-6 flex-wrap">
          <p
            className="text-[11px] text-[var(--fg-faint)] max-w-md leading-relaxed"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Esta investigación es generada automáticamente sobre datos abiertos.
            No es una acusación.
          </p>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] uppercase tracking-[0.22em] text-[var(--brand)] border-b border-[var(--brand)] pb-1 hover:text-[var(--fg)] hover:border-white transition"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Compartir el caso ↗
          </a>
        </footer>
      </motion.article>
    </motion.div>
  );
}
