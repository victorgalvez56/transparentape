"use client";

import { useEffect, useState } from "react";
import { Obra, riesgoDeObra } from "@/lib/types";
import {
  fmtSolesShort,
  montoSymbol,
  fmtFecha,
  displayTitle,
  truncar,
} from "@/lib/format";
import ObraStreetViewCompare from "@/components/ObraStreetViewCompare";

interface Props {
  obra: Obra;
  onInvestigar: () => void;
}

/** Subconjunto de /api/infobras que usamos en el detalle. */
type InfobrasData = {
  codigo_infobras: number;
  estado: string | null;
  avance_fisico_pct: number | null;
  fecha_ultimo_avance: string | null;
  fecha_inicio: string | null;
  fecha_fin_programada: string | null;
  contratista_nombre: string | null;
  n_avances_mensuales: number | null;
  n_modificaciones_plazo: number | null;
  tiene_informe_control: boolean | null;
  photos: { url: string; label: string }[];
  infobras_url: string;
};

function calcDelta(base: number | null, comp: number | null) {
  if (base == null || comp == null || base === 0) return null;
  return comp / base - 1;
}

/**
 * Detalle de obra inline para el sidebar codex (w-80 / 320px).
 * Vive dentro del navigation-stack del aside — NO incluye su propia
 * animacion: la maneja AnimatePresence del padre.
 *
 * Jerarquia:
 *   HERO  → caso · ubicacion · ano · titulo · riesgo · monto final hero
 *   MID   → rastreo del billete (stack vertical referencial → adjudicacion → contrato)
 *           + street view
 *   TAIL  → supplier (con RUC y antecedentes si red_flag) · contrato compacto ·
 *           comprador · analisis automatico (solo si suma valor)
 */
export default function CodexObraDetailInline({
  obra: obraProp,
  onInvestigar,
}: Props) {
  // El panel recibe la proyección ligera de /api/obras/points (sin
  // contract_*, procurement_method, ai_description, infobras_code…). Al
  // seleccionar traemos la fila completa de /api/obra/[id] y, si tiene
  // infobras_code, el cruce con Infobras (/api/infobras).
  // Estado keyed por id de obra: al cambiar de obra el dato viejo se filtra
  // en el render (mismo patrón que ObraStreetViewCompare) en vez de
  // resetearlo en el efecto — así no hay renders en cascada.
  const [fullState, setFullState] = useState<{ id: number; obra: Obra } | null>(
    null
  );
  const [infobrasState, setInfobrasState] = useState<{
    id: number;
    data: InfobrasData;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    const id = obraProp.id;

    fetch(`/api/obra/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.obra) return;
        const o = d.obra as Obra;
        setFullState({ id, obra: o });
        if (o.infobras_code) {
          return fetch(
            `/api/infobras?code=${encodeURIComponent(o.infobras_code)}`
          )
            .then((r) => (r.ok ? r.json() : null))
            .then((inf) => {
              if (alive && inf && !inf.error)
                setInfobrasState({ id, data: inf as InfobrasData });
            });
        }
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [obraProp.id]);

  // Fila completa cuando ya cargó para ESTA obra; mientras, la ligera.
  const obra =
    fullState && fullState.id === obraProp.id ? fullState.obra : obraProp;
  const infobras =
    infobrasState && infobrasState.id === obraProp.id
      ? infobrasState.data
      : null;
  const riesgo = riesgoDeObra(obra);
  const tituloDisplay = displayTitle(obra);
  const currency = montoSymbol(obra.country);
  const heroMonto =
    obra.contract_amount ?? obra.award_amount ?? obra.tender_amount;
  const tweetText = `${truncar(tituloDisplay, 120)} · ${
    obra.buyer_locality ?? ""
  } · ${currency} ${fmtSolesShort(heroMonto)} · Transparentape`;
  const tweetUrl = `${
    typeof window !== "undefined" ? window.location.origin : ""
  }/obras/${obra.ocid}`;
  const twitterHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    tweetText
  )}&url=${encodeURIComponent(tweetUrl)}`;

  const deltaAdj = calcDelta(obra.tender_amount, obra.award_amount);
  const deltaCon = calcDelta(obra.award_amount, obra.contract_amount);

  const riesgoTone =
    riesgo === "alto"
      ? { dot: "var(--cx-alarm)", fg: "var(--cx-alarm)", label: "Riesgo alto" }
      : riesgo === "medio"
      ? { dot: "var(--cx-warn)", fg: "var(--cx-warn)", label: "Riesgo medio" }
      : { dot: "var(--cx-brand)", fg: "var(--cx-brand)", label: "Sin alertas" };

  const adendas = obra.n_amendments ?? 0;
  const showAi =
    Boolean(obra.ai_description) &&
    (obra.ai_score == null || obra.ai_score >= 40);

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* HERO */}
        <header className="px-4 pt-5 pb-4">
          {/* eyebrow: caso · ubicacion · ano */}
          <p
            className="text-[11px] tracking-tight truncate lowercase"
            style={{
              color: "var(--cx-muted)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            caso
            {obra.buyer_locality ? ` · ${obra.buyer_locality}` : ""}
            {obra.source_year ? ` · ${obra.source_year}` : ""}
          </p>

          {/* titulo */}
          <h2
            className="mt-2.5 text-[17px] leading-[1.22] font-medium tracking-tight"
            style={{
              color: "var(--cx-fg)",
              fontFamily: "var(--font-body), system-ui, sans-serif",
              letterSpacing: "-0.012em",
            }}
          >
            {truncar(tituloDisplay, 160)}
          </h2>

          {/* buyer inline (lo que antes era "Quien pago") */}
          {obra.buyer_name && (
            <p
              className="mt-2 text-[11.5px] leading-snug tracking-tight"
              style={{
                color: "var(--cx-muted)",
                fontFamily: "var(--font-body), system-ui, sans-serif",
              }}
            >
              <span style={{ color: "var(--cx-faint)" }}>Pago </span>
              {truncar(obra.buyer_name, 90)}
            </p>
          )}

          {/* riesgo */}
          <div className="mt-3.5 flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: riesgoTone.dot }}
            />
            <span
              className="text-[11.5px] font-medium tracking-tight"
              style={{
                color: riesgoTone.fg,
                fontFamily: "var(--font-body), system-ui, sans-serif",
              }}
            >
              {riesgoTone.label}
            </span>
          </div>

          {/* monto hero — lo que costo (o el ultimo disponible) */}
          <div className="mt-5">
            <p
              className="text-[11px] tracking-tight"
              style={{
                color: "var(--cx-faint)",
                fontFamily: "var(--font-body), system-ui, sans-serif",
              }}
            >
              Costo final del contrato
            </p>
            <p
              className="mt-1 leading-none tabular-nums"
              style={{
                color: "var(--cx-fg)",
                fontFamily: "var(--font-mono), monospace",
                letterSpacing: "-0.015em",
              }}
            >
              <span
                className="text-[12px] mr-1"
                style={{ color: "var(--cx-faint)" }}
              >
                {currency}
              </span>
              <span className="text-[22px] font-medium">
                {fmtSolesShort(heroMonto)}
              </span>
            </p>
          </div>
        </header>

        {/* RASTREO DEL BILLETE — stack vertical */}
        <section
          className="px-4 py-4 border-t"
          style={{ borderColor: "var(--cx-border)" }}
        >
          <p
            className="text-[11px] font-medium tracking-tight mb-3"
            style={{
              color: "var(--cx-muted)",
              fontFamily: "var(--font-body), system-ui, sans-serif",
            }}
          >
            Rastreo del billete
          </p>

          <div className="space-y-2.5">
            <MoneyRow
              label="Referencial"
              hint="Lo que dijeron que iba a costar"
              value={obra.tender_amount}
              currency={currency}
            />
            <MoneyRow
              label="Adjudicacion"
              hint="Lo que firmaron al ganador"
              value={obra.award_amount}
              delta={deltaAdj}
              currency={currency}
            />
            <MoneyRow
              label="Contrato"
              hint="Lo que finalmente costo"
              value={obra.contract_amount}
              delta={deltaCon}
              accent
              currency={currency}
            />
          </div>
        </section>

        {/* STREET VIEW — antes/después (slider arrastrable). Cuando Google
            no tiene cobertura cae a las fotos de la ficha técnica Infobras. */}
        <ObraStreetViewCompare
          obraId={obra.id}
          lat={obra.lat}
          lng={obra.lng}
          fichaPhotos={infobras?.photos}
        />

        {/* EJECUCIÓN — cruce con Infobras (Contraloría). Solo si hay match. */}
        {infobras && (
          <section
            className="px-4 py-4 border-t"
            style={{ borderColor: "var(--cx-border)" }}
          >
            <p
              className="text-[11px] font-medium tracking-tight mb-3"
              style={{
                color: "var(--cx-muted)",
                fontFamily: "var(--font-body), system-ui, sans-serif",
              }}
            >
              Ejecución · Infobras
            </p>

            {infobras.avance_fisico_pct != null && (
              <div className="mb-3.5">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span
                    className="text-[10.5px] font-medium tracking-tight"
                    style={{
                      color: "var(--cx-muted)",
                      fontFamily: "var(--font-body), system-ui, sans-serif",
                    }}
                  >
                    Avance físico
                  </span>
                  <span
                    className="text-[12px] tabular-nums tracking-tight"
                    style={{
                      color: "var(--cx-fg)",
                      fontFamily: "var(--font-mono), monospace",
                    }}
                  >
                    {Math.round(infobras.avance_fisico_pct)}%
                  </span>
                </div>
                <div
                  className="h-1.5 w-full rounded-full overflow-hidden"
                  style={{ background: "var(--cx-secondary)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, infobras.avance_fisico_pct)
                      )}%`,
                      background: "var(--cx-brand)",
                    }}
                  />
                </div>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <KVRow label="Estado de obra" value={infobras.estado ?? "—"} wide />
              <KVRow
                label="Último avance"
                value={fmtFecha(infobras.fecha_ultimo_avance)}
                mono
              />
              <KVRow
                label="Avances mensuales"
                value={String(infobras.n_avances_mensuales ?? 0)}
                mono
              />
              <KVRow
                label="Modif. de plazo"
                value={String(infobras.n_modificaciones_plazo ?? 0)}
                alert={(infobras.n_modificaciones_plazo ?? 0) >= 1}
                mono
              />
              <KVRow
                label="Informe de control"
                value={infobras.tiene_informe_control ? "Sí" : "No"}
                alert={Boolean(infobras.tiene_informe_control)}
              />
              {infobras.contratista_nombre && (
                <KVRow
                  label="Contratista (Infobras)"
                  value={infobras.contratista_nombre}
                  wide
                />
              )}
            </dl>

            <a
              href={infobras.infobras_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 text-[11.5px] tracking-tight transition-opacity hover:opacity-70"
              style={{
                color: "var(--cx-brand)",
                fontFamily: "var(--font-body), system-ui, sans-serif",
              }}
            >
              Ver ficha completa en Infobras ↗
            </a>
          </section>
        )}

        {/* QUIEN RECIBIO */}
        <section
          className="px-4 py-4 border-t"
          style={{ borderColor: "var(--cx-border)" }}
        >
          <p
            className="text-[11px] font-medium tracking-tight mb-1.5"
            style={{
              color: "var(--cx-muted)",
              fontFamily: "var(--font-body), system-ui, sans-serif",
            }}
          >
            Quien recibio el billete
          </p>
          <h3
            className="text-[14px] leading-snug font-medium tracking-tight"
            style={{
              color: "var(--cx-fg)",
              fontFamily: "var(--font-body), system-ui, sans-serif",
              letterSpacing: "-0.008em",
            }}
          >
            {obra.supplier_name ?? "—"}
          </h3>
          {obra.supplier_ruc && (
            <p
              className="text-[11.5px] mt-1.5 tracking-tight tabular-nums"
              style={{
                color: "var(--cx-fg)",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              <span style={{ color: "var(--cx-faint)" }}>RUC </span>
              {obra.supplier_ruc}
            </p>
          )}

          {obra.is_red_flag && (
            <div
              className="mt-3 border-l-2 pl-3 py-0.5"
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
                className="text-[12px] mt-1 leading-snug tracking-tight"
                style={{
                  color: "var(--cx-fg)",
                  fontFamily: "var(--font-body), system-ui, sans-serif",
                }}
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
          className="px-4 py-4 border-t"
          style={{ borderColor: "var(--cx-border)" }}
        >
          <p
            className="text-[11px] font-medium tracking-tight mb-2.5"
            style={{
              color: "var(--cx-muted)",
              fontFamily: "var(--font-body), system-ui, sans-serif",
            }}
          >
            Contrato
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <KVRow label="Inicio" value={fmtFecha(obra.contract_start)} mono />
            <KVRow label="Fin" value={fmtFecha(obra.contract_end)} mono />
            <KVRow
              label="Estado"
              value={obra.contract_status ?? "—"}
            />
            <KVRow
              label="Adendas"
              value={String(adendas)}
              alert={adendas >= 2}
              mono
            />
            <KVRow
              label="Metodo"
              value={obra.procurement_method ?? "—"}
              wide
            />
          </dl>
        </section>

        {/* ANALISIS AI — solo si suma valor */}
        {showAi && (
          <section
            className="px-4 py-4 border-t"
            style={{ borderColor: "var(--cx-border)" }}
          >
            <p
              className="text-[11px] font-medium tracking-tight mb-2 flex items-center gap-2"
              style={{
                color: "var(--cx-muted)",
                fontFamily: "var(--font-body), system-ui, sans-serif",
              }}
            >
              <span>Analisis automatico</span>
              {obra.ai_score != null && (
                <span
                  className="text-[10.5px] tabular-nums tracking-tight px-1.5 py-0.5 rounded-sm"
                  style={{
                    color: "var(--cx-fg)",
                    background: "var(--cx-secondary)",
                    fontFamily: "var(--font-mono), monospace",
                  }}
                >
                  {obra.ai_score}/100
                </span>
              )}
            </p>
            <p
              className="text-[12.5px] leading-relaxed tracking-tight"
              style={{
                color: "var(--cx-muted)",
                fontFamily: "var(--font-body), system-ui, sans-serif",
              }}
            >
              {obra.ai_description}
            </p>
          </section>
        )}

        {/* padding final para que no se pegue al footer */}
        <div className="h-3" />
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
          aria-label="Abrir pagina publica"
        >
          ↗
        </a>
      </footer>
    </div>
  );
}

/**
 * Fila del rastreo del billete: label + hint + monto mono + delta inline.
 * Layout flex con label izquierda + monto derecha → cabe sin truncar en 320px.
 */
function MoneyRow({
  label,
  hint,
  value,
  delta,
  accent = false,
  currency = "S/",
}: {
  label: string;
  hint?: string;
  value: number | null;
  delta?: number | null;
  accent?: boolean;
  currency?: string;
}) {
  const hasDelta = delta != null && Math.abs(delta) > 0.0005;
  const positive = (delta ?? 0) > 0.005;
  return (
    <div className="flex items-baseline gap-3 min-w-0">
      <div className="min-w-0 flex-1">
        <p
          className="text-[12px] font-medium tracking-tight leading-tight"
          style={{
            color: "var(--cx-fg)",
            fontFamily: "var(--font-body), system-ui, sans-serif",
          }}
        >
          {label}
        </p>
        {hint && (
          <p
            className="text-[10.5px] mt-0.5 tracking-tight leading-tight"
            style={{
              color: "var(--cx-faint)",
              fontFamily: "var(--font-body), system-ui, sans-serif",
            }}
          >
            {hint}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p
          className="text-[14px] tabular-nums leading-none whitespace-nowrap"
          style={{
            color: accent ? "var(--cx-brand)" : "var(--cx-fg)",
            fontFamily: "var(--font-mono), monospace",
            fontWeight: accent ? 500 : 400,
            letterSpacing: "-0.01em",
          }}
        >
          <span
            className="text-[10px] mr-0.5"
            style={{ color: "var(--cx-faint)" }}
          >
            {currency}
          </span>
          {fmtSolesShort(value)}
        </p>
        {hasDelta && (
          <p
            className="mt-1 text-[10px] tabular-nums leading-none tracking-tight"
            style={{
              color: positive ? "var(--cx-alarm)" : "var(--cx-faint)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            {positive ? "+" : "−"}
            {(Math.abs(delta!) * 100).toFixed(1)}%
          </p>
        )}
      </div>
    </div>
  );
}

function KVRow({
  label,
  value,
  alert = false,
  wide = false,
  mono = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
  wide?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt
        className="text-[10.5px] font-medium tracking-tight"
        style={{
          color: "var(--cx-muted)",
          fontFamily: "var(--font-body), system-ui, sans-serif",
        }}
      >
        {label}
      </dt>
      <dd
        className="text-[12px] mt-0.5 truncate tracking-tight"
        style={{
          color: alert ? "var(--cx-warn)" : "var(--cx-fg)",
          fontFamily: mono
            ? "var(--font-mono), monospace"
            : "var(--font-body), system-ui, sans-serif",
        }}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
