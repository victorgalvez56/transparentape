"use client";

import { Obra, riesgoDeObra } from "@/lib/types";
import {
  fmtSolesShort,
  montoSymbol,
  fmtFecha,
  displayTitle,
  truncar,
} from "@/lib/format";

interface Props {
  obra: Obra;
  onInvestigar: () => void;
}

function calcDelta(base: number | null, comp: number | null) {
  if (base == null || comp == null || base === 0) return null;
  return comp / base - 1;
}

/**
 * Detalle de obra inline para el sidebar codex (w-80 / 320px).
 * Vive dentro del navigation-stack del aside — NO incluye su propia
 * animacion: la maneja AnimatePresence del padre.
 *
 * Diseno: editorial compacto, Plex Mono para meta/cifras + Fraunces para
 * nombres propios. Todas las CSS vars son --cx-*. Tamanos calibrados para
 * que ningun valor (S/ 1111.91M) se desborde de la columna de ~92px.
 */
export default function CodexObraDetailInline({ obra, onInvestigar }: Props) {
  const riesgo = riesgoDeObra(obra);
  const tituloDisplay = displayTitle(obra);
  const monto =
    obra.contract_amount ?? obra.award_amount ?? obra.tender_amount;
  const tweetText = `${truncar(tituloDisplay, 120)} · ${
    obra.buyer_locality ?? ""
  } · ${montoSymbol(obra.country)} ${fmtSolesShort(monto)} · Transparentape`;
  const tweetUrl = `${
    typeof window !== "undefined" ? window.location.origin : ""
  }/obras/${obra.ocid}`;
  const twitterHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    tweetText
  )}&url=${encodeURIComponent(tweetUrl)}`;
  const gmapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const hasStreetView = Boolean(gmapsKey && obra.lat && obra.lng);
  const streetViewUrl = hasStreetView
    ? `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${obra.lat},${obra.lng}&fov=80&key=${gmapsKey}`
    : null;

  const deltaAdj = calcDelta(obra.tender_amount, obra.award_amount);
  const deltaCon = calcDelta(obra.award_amount, obra.contract_amount);

  const riesgoTone =
    riesgo === "alto"
      ? { dot: "var(--cx-alarm)", fg: "var(--cx-alarm)", label: "Riesgo alto" }
      : riesgo === "medio"
      ? { dot: "var(--cx-warn)", fg: "var(--cx-warn)", label: "Riesgo medio" }
      : { dot: "var(--cx-brand)", fg: "var(--cx-brand)", label: "Sin alertas" };

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* HEADER editorial */}
        <header
          className="px-4 pt-4 pb-3.5 border-b"
          style={{ borderColor: "var(--cx-border)" }}
        >
          <p
            className="text-[11px] tracking-tight truncate"
            style={{
              color: "var(--cx-muted)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            Caso
            {obra.buyer_locality ? ` · ${obra.buyer_locality}` : ""}
            {obra.source_year ? ` · ${obra.source_year}` : ""}
          </p>
          <h2
            className="mt-2 text-[17px] leading-[1.2] font-medium tracking-tight"
            style={{
              color: "var(--cx-fg)",
              fontFamily: "var(--font-body), system-ui, sans-serif",
            }}
          >
            {truncar(tituloDisplay, 160)}
          </h2>
          {obra.tender_title && obra.tender_title !== tituloDisplay && (
            <p
              className="mt-2 text-[11px] tracking-tight leading-relaxed"
              style={{
                color: "var(--cx-faint)",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              {truncar(obra.tender_title, 100)}
            </p>
          )}
          <div className="mt-3 flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: riesgoTone.dot }}
            />
            <span
              className="text-[12px] font-medium tracking-tight"
              style={{
                color: riesgoTone.fg,
                fontFamily: "var(--font-body), system-ui, sans-serif",
              }}
            >
              {riesgoTone.label}
            </span>
          </div>
        </header>

        {/* RASTREO DEL BILLETE */}
        <section
          className="px-4 py-3.5 border-b"
          style={{ borderColor: "var(--cx-border)" }}
        >
          <p
            className="text-[11.5px] font-medium tracking-tight mb-3"
            style={{
              color: "var(--cx-muted)",
              fontFamily: "var(--font-body), system-ui, sans-serif",
            }}
          >
            Rastreo del billete
          </p>
          <div
            className="grid grid-cols-3 -mx-1"
            style={{ gap: 0 }}
          >
            <MoneyCell
              label="Lo que dijeron"
              value={obra.tender_amount}
              isFirst
              currency={montoSymbol(obra.country)}
            />
            <MoneyCell
              label="Lo que firmaron"
              value={obra.award_amount}
              delta={deltaAdj}
              currency={montoSymbol(obra.country)}
            />
            <MoneyCell
              label="Lo que costó"
              value={obra.contract_amount}
              delta={deltaCon}
              accent
              isLast
              currency={montoSymbol(obra.country)}
            />
          </div>
        </section>

        {/* STREET VIEW */}
        {hasStreetView ? (
          <div
            className="border-b"
            style={{ borderColor: "var(--cx-border)" }}
          >
            <img
              src={streetViewUrl!}
              alt="Street View"
              className="w-full h-36 object-cover"
            />
            <p
              className="text-[11px] tracking-tight px-4 py-1.5 border-t"
              style={{
                color: "var(--cx-faint)",
                fontFamily: "var(--font-mono), monospace",
                borderColor: "var(--cx-border)",
              }}
            >
              Street View · Google
            </p>
          </div>
        ) : (
          <div
            className="px-4 py-2.5 text-[11px] tracking-tight border-b"
            style={{
              color: "var(--cx-faint)",
              fontFamily: "var(--font-mono), monospace",
              borderColor: "var(--cx-border)",
            }}
          >
            Sin Street View · configura GOOGLE_MAPS_KEY
          </div>
        )}

        {/* QUIEN RECIBIO */}
        <section
          className="px-4 py-3.5 border-b"
          style={{ borderColor: "var(--cx-border)" }}
        >
          <p
            className="text-[11.5px] font-medium tracking-tight mb-1.5"
            style={{
              color: "var(--cx-muted)",
              fontFamily: "var(--font-body), system-ui, sans-serif",
            }}
          >
            Quién recibió el billete
          </p>
          <h3
            className="text-[15px] leading-[1.22] font-medium tracking-tight"
            style={{
              color: "var(--cx-fg)",
              fontFamily: "var(--font-body), system-ui, sans-serif",
            }}
          >
            {obra.supplier_name ?? "—"}
          </h3>
          <p
            className="text-[11px] mt-1.5 tracking-tight"
            style={{
              color: "var(--cx-muted)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            <span style={{ color: "var(--cx-faint)" }}>RUC </span>
            <span style={{ color: "var(--cx-fg)" }} className="tabular-nums">
              {obra.supplier_ruc ?? "—"}
            </span>
          </p>

          {obra.is_red_flag && (
            <div
              className="mt-3 border-l-2 pl-2.5 py-0.5"
              style={{ borderColor: "var(--cx-alarm)" }}
            >
              <p
                className="text-[11px] font-medium tracking-tight"
                style={{
                  color: "var(--cx-alarm)",
                  fontFamily: "var(--font-body), system-ui, sans-serif",
                }}
              >
                Antecedentes
              </p>
              <p
                className="text-[11.5px] mt-0.5 leading-snug"
                style={{ color: "var(--cx-fg)" }}
              >
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
        <section
          className="px-4 py-3.5 border-b"
          style={{ borderColor: "var(--cx-border)" }}
        >
          <p
            className="text-[11.5px] font-medium tracking-tight mb-2.5"
            style={{
              color: "var(--cx-muted)",
              fontFamily: "var(--font-body), system-ui, sans-serif",
            }}
          >
            Contrato
          </p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            <KVRow label="Inicio" value={fmtFecha(obra.contract_start)} />
            <KVRow label="Fin" value={fmtFecha(obra.contract_end)} />
            <KVRow label="Estado" value={obra.contract_status ?? "—"} />
            <KVRow
              label="Adendas"
              value={String(obra.n_amendments ?? 0)}
              alert={(obra.n_amendments ?? 0) >= 2}
            />
            <KVRow
              label="Método"
              value={obra.procurement_method ?? "—"}
              wide
            />
          </dl>
        </section>

        {/* COMPRADOR */}
        <section
          className="px-4 py-3.5 border-b"
          style={{ borderColor: "var(--cx-border)" }}
        >
          <p
            className="text-[11.5px] font-medium tracking-tight mb-1.5"
            style={{
              color: "var(--cx-muted)",
              fontFamily: "var(--font-body), system-ui, sans-serif",
            }}
          >
            Quién pagó
          </p>
          <p
            className="text-[12.5px] leading-snug"
            style={{ color: "var(--cx-fg)" }}
          >
            {obra.buyer_name ?? "—"}
          </p>
        </section>

        {/* AI */}
        {obra.ai_description && (
          <section
            className="px-4 py-3.5 border-b"
            style={{ borderColor: "var(--cx-border)" }}
          >
            <p
              className="text-[11.5px] font-medium tracking-tight mb-1.5"
              style={{
                color: "var(--cx-muted)",
                fontFamily: "var(--font-body), system-ui, sans-serif",
              }}
            >
              Análisis automático
              {obra.ai_score != null && (
                <span style={{ color: "var(--cx-faint)" }}>
                  {" "}
                  · score {obra.ai_score}/100
                </span>
              )}
            </p>
            <p
              className="text-[12.5px] italic leading-relaxed"
              style={{
                color: "var(--cx-muted)",
                fontFamily: "var(--font-display), serif",
              }}
            >
              &ldquo;{obra.ai_description}&rdquo;
            </p>
          </section>
        )}
      </div>

      {/* CTAs sticky bottom */}
      <footer
        className="shrink-0 border-t flex gap-1.5 px-3 py-3"
        style={{
          borderColor: "var(--cx-border)",
          background: "var(--cx-bg-blur)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <button
          onClick={onInvestigar}
          className="flex-1 text-[12px] font-semibold py-2.5 transition-colors rounded-sm tracking-tight"
          style={{
            background: "var(--cx-brand)",
            color: "var(--cx-brand-fg)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--cx-brand-strong)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "var(--cx-brand)")
          }
        >
          Investigar este caso →
        </button>
        <a
          href={twitterHref}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2.5 py-2.5 border text-[11.5px] transition rounded-sm whitespace-nowrap"
          style={{
            borderColor: "var(--cx-border)",
            color: "var(--cx-fg)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.borderColor = "var(--cx-brand)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.borderColor = "var(--cx-border)")
          }
          aria-label="Compartir en X / Twitter"
        >
          Compartir
        </a>
        <a
          href={`/obras/${obra.ocid}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2.5 py-2.5 border text-[12px] transition rounded-sm"
          style={{
            borderColor: "var(--cx-border)",
            color: "var(--cx-fg)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.borderColor = "var(--cx-brand)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.borderColor = "var(--cx-border)")
          }
          aria-label="Abrir página pública"
        >
          ↗
        </a>
      </footer>
    </div>
  );
}

function MoneyCell({
  label,
  value,
  delta,
  accent = false,
  isFirst = false,
  isLast = false,
  currency = "S/",
}: {
  label: string;
  value: number | null;
  delta?: number | null;
  accent?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  currency?: string;
}) {
  const hasDelta = delta != null;
  const positive = (delta ?? 0) > 0.005;
  return (
    <div
      className={`min-w-0 px-2 ${isFirst ? "pl-1" : ""} ${
        isLast ? "pr-1" : ""
      } ${!isLast ? "border-r" : ""}`}
      style={{ borderColor: "var(--cx-border)" }}
    >
      <p
        className="text-[10.5px] tracking-tight leading-tight"
        style={{
          color: "var(--cx-faint)",
          fontFamily: "var(--font-body), system-ui, sans-serif",
        }}
      >
        {label}
      </p>
      <p
        className="mt-1.5 text-[13px] tabular-nums leading-none truncate"
        style={{
          color: accent ? "var(--cx-brand)" : "var(--cx-fg)",
          fontFamily: "var(--font-mono), monospace",
        }}
      >
        <span
          className="text-[9px] mr-0.5"
          style={{ color: "var(--cx-faint)" }}
        >
          {currency}
        </span>
        {fmtSolesShort(value)}
      </p>
      {hasDelta && (
        <p
          className="mt-1 text-[9px] tabular-nums leading-none"
          style={{
            color: positive ? "var(--cx-alarm)" : "var(--cx-faint)",
            fontFamily: "var(--font-mono), monospace",
          }}
        >
          {positive ? "▲" : "▼"} {(Math.abs(delta!) * 100).toFixed(1)}%
        </p>
      )}
    </div>
  );
}

function KVRow({
  label,
  value,
  alert = false,
  wide = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt
        className="text-[11px] font-medium tracking-tight"
        style={{
          color: "var(--cx-muted)",
          fontFamily: "var(--font-body), system-ui, sans-serif",
        }}
      >
        {label}
      </dt>
      <dd
        className="text-[12px] mt-0.5 truncate"
        style={{
          color: alert ? "var(--cx-warn)" : "var(--cx-fg)",
        }}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
