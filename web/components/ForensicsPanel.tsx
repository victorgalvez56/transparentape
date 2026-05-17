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
      detalle: `Tipos: ${(o.red_flag_types ?? [])
        .join(", ")
        .replace(/_/g, " ")}. Fuente: OECE datosabiertos.gob.pe.`,
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
        detalle: `El Estado dijo que esta obra costaría ${fmtSolesLong(tender, o.country)}. Terminó adjudicándose por ${fmtSolesLong(award, o.country)}.`,
      });
    } else if (ratio < 0.7) {
      hallazgos.push({
        nivel: "medio",
        titulo: "Adjudicación muy por debajo del referencial",
        detalle: `Posible oferta temeraria. ${fmtSolesLong(award, o.country)} sobre un referencial de ${fmtSolesLong(tender, o.country)}.`,
      });
    }
  }

  if (award > 0 && o.contract_amount && o.contract_amount > award * 1.05) {
    const pct = (o.contract_amount / award - 1) * 100;
    hallazgos.push({
      nivel: "alto",
      titulo: `El contrato infló ${pct.toFixed(1)}% sobre lo adjudicado`,
      detalle: `Adjudicado ${fmtSolesLong(award, o.country)} → contrato firmado por ${fmtSolesLong(o.contract_amount, o.country)}.`,
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
      titulo: "Adjudicación simplificada",
      detalle:
        "Procedimiento de menor escrutinio. Vale la pena revisar la justificación de por qué no se usó licitación pública.",
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
      titulo: `Score automático ${o.ai_score} sobre 100`,
      detalle: o.ai_description ?? "Análisis Claude sobre la documentación.",
    });
  }

  if (hallazgos.length === 0) {
    hallazgos.push({
      nivel: "info",
      titulo: "No se detectaron señales automáticas",
      detalle:
        "Esto no garantiza ausencia de irregularidades. Vale revisar la documentación.",
    });
  }
  return hallazgos;
}

const ENTRANCE = { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const };

export default function ForensicsPanel({ obra, onClose }: Props) {
  const hallazgos = analizar(obra);
  const periodo =
    obra.contract_start && obra.contract_end
      ? `${fmtFecha(obra.contract_start)} → ${fmtFecha(obra.contract_end)}`
      : "—";
  const tituloDisplay = displayTitle(obra);
  const monto =
    obra.contract_amount ?? obra.award_amount ?? obra.tender_amount;
  const altas = hallazgos.filter((h) => h.nivel === "alto").length;
  const shareUrl =
    typeof window !== "undefined"
      ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(
          `Caso ${truncar(tituloDisplay, 100)} · ${fmtSolesLong(
            monto,
            obra.country
          )} · ${altas} alertas. Transparentape.`
        )}&url=${encodeURIComponent(
          `${window.location.origin}/obras/${obra.ocid}`
        )}`
      : "#";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="fixed inset-0 z-40 bg-[var(--ink-0)]/96 backdrop-blur-2xl overflow-y-auto"
      onClick={onClose}
    >
      <motion.article
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={ENTRANCE}
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-3xl w-full mx-auto bg-[var(--ink-1)]
                   border-x border-[var(--rule)] min-h-screen"
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-5 right-5 z-20 inline-flex items-center gap-2
                     px-2.5 py-1.5 text-[11px] text-[var(--fg-faint)]
                     hover:text-[var(--fg)] border border-transparent
                     hover:border-[var(--rule)] transition-colors"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          <span className="text-[15px] leading-none">×</span>
          <span>cerrar</span>
        </button>

        {/* EYEBROW */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...ENTRANCE, delay: 0.05 }}
          className="px-8 sm:px-12 pt-14 pb-1"
        >
          <p
            className="text-[11px] text-[var(--fg-faint)] flex items-center gap-2.5 flex-wrap"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--alarm)" }}
            />
            <span>Investigación forense</span>
            <span aria-hidden className="text-[var(--fg-faint)]">/</span>
            <span className="tabular-nums truncate text-[var(--fg-dim)]">
              {obra.ocid}
            </span>
          </p>
        </motion.div>

        {/* TITLE — Fraunces, sin uppercase, weight regular */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...ENTRANCE, delay: 0.1 }}
          className="px-8 sm:px-12 mt-5
                     text-[clamp(28px,4.4vw,42px)] leading-[1.08]
                     text-[var(--fg)] font-normal tracking-[-0.012em]"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          {truncar(tituloDisplay, 220)}
        </motion.h1>

        {/* LEAD — Plex Sans, prosa legible */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...ENTRANCE, delay: 0.18 }}
          className="mt-6 px-8 sm:px-12 max-w-[62ch]
                     text-[17.5px] leading-[1.62] text-[var(--fg-dim)]"
          style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
        >
          <span className="text-[var(--fg)] font-medium">
            {obra.buyer_name ?? "El Estado"}
          </span>{" "}
          contrató a{" "}
          <span className="text-[var(--fg)] font-medium">
            {obra.supplier_name ?? "—"}
          </span>{" "}
          por{" "}
          <span
            className="text-[var(--brand)] tabular-nums whitespace-nowrap font-medium"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            {fmtSolesLong(monto, obra.country)}
          </span>
          .{" "}
          <em
            className="text-[var(--fg-dim)]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            Estos son los puntos que vale la pena mirar.
          </em>
        </motion.p>

        {/* META STRIP — hairlines + mono tabular */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...ENTRANCE, delay: 0.28 }}
          className="mt-10 mx-8 sm:mx-12 py-5
                     border-y border-[var(--rule)]
                     grid grid-cols-2 sm:grid-cols-4 gap-y-4 gap-x-8"
        >
          <Meta label="período" value={periodo} />
          <Meta
            label="adendas"
            value={String(obra.n_amendments ?? 0)}
            alert={(obra.n_amendments ?? 0) >= 2}
          />
          <Meta label="método" value={obra.procurement_method ?? "—"} />
          <Meta label="estado" value={obra.contract_status ?? "—"} />
        </motion.div>

        {/* HALLAZGOS — magazine numbered */}
        <section className="px-8 sm:px-12 pt-14 pb-16 space-y-12">
          {hallazgos.map((h, i) => {
            const tone =
              h.nivel === "alto"
                ? "var(--alarm)"
                : h.nivel === "medio"
                ? "var(--warn)"
                : "var(--fg-faint)";
            const sev =
              h.nivel === "alto"
                ? "severidad alta"
                : h.nivel === "medio"
                ? "severidad media"
                : "contexto";
            return (
              <motion.article
                key={i}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  ...ENTRANCE,
                  delay: 0.4 + i * 0.07,
                }}
                className="grid grid-cols-[72px_1fr] sm:grid-cols-[88px_1fr] gap-6 sm:gap-8"
              >
                <div className="text-right pt-1">
                  <div
                    className="text-[52px] sm:text-[56px] leading-[0.85] italic font-normal"
                    style={{
                      fontFamily: "var(--font-display), serif",
                      color: tone,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div
                    className="mt-2.5 text-[10.5px]"
                    style={{
                      fontFamily: "var(--font-mono), monospace",
                      color: tone,
                    }}
                  >
                    {sev}
                  </div>
                </div>
                <div>
                  <h2
                    className="text-[22px] sm:text-[24px] leading-[1.2]
                               text-[var(--fg)] font-normal tracking-[-0.005em]"
                    style={{ fontFamily: "var(--font-display), serif" }}
                  >
                    {h.titulo}
                  </h2>
                  <p
                    className="mt-3 text-[16px] leading-[1.62]
                               text-[var(--fg-dim)] max-w-[60ch]"
                    style={{
                      fontFamily: "var(--font-body), system-ui, sans-serif",
                    }}
                  >
                    {h.detalle}
                  </p>
                </div>
              </motion.article>
            );
          })}
        </section>

        {/* FOOTER */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...ENTRANCE, delay: 0.4 + hallazgos.length * 0.07 + 0.1 }}
          className="border-t border-[var(--rule)] px-8 sm:px-12 py-10
                     flex flex-wrap items-end justify-between gap-6"
        >
          <p
            className="text-[13px] leading-[1.55] text-[var(--fg-faint)]
                       italic max-w-md"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            Esta investigación es generada automáticamente sobre datos
            abiertos. No constituye una acusación.
          </p>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-baseline gap-2
                       text-[13px] text-[var(--brand)]
                       hover:text-[var(--fg)] transition-colors"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            <span
              className="border-b border-[var(--brand)]
                         group-hover:border-[var(--fg)] pb-0.5"
            >
              Compartir el caso
            </span>
            <span className="text-[15px] leading-none">↗</span>
          </a>
        </motion.footer>
      </motion.article>
    </motion.div>
  );
}

function Meta({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p
        className="text-[10.5px] text-[var(--fg-faint)] mb-1"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {label}
      </p>
      <p
        className={`text-[13.5px] tabular-nums truncate ${
          alert ? "text-[var(--warn)]" : "text-[var(--fg)]"
        }`}
        style={{ fontFamily: "var(--font-mono), monospace" }}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}
