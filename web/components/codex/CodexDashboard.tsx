"use client";

import { useEffect, useState } from "react";
import type { Kpis } from "@/lib/kpis";
import { fmtMontoCompact } from "@/lib/format";

/**
 * Panel — foto de toda la base para el jurado. Vive en el tab "Panel" del
 * home, bajo .cx-scope, así que hereda light/dark vía las CSS vars --cx-*.
 * Estilo editorial idéntico al resto del codex: kicker mono en versalitas,
 * cifras en serif display, bordes y cards con los tokens del tema.
 */

const MONO = "var(--font-mono), monospace";
const SERIF = "var(--font-display), serif";

const nf = (n: number) => Math.round(n).toLocaleString("es-PE");
const pct = (n: number) => `${n.toFixed(1)} %`;

function money(n: number): string {
  if (n >= 1_000_000_000) return `S/ ${(n / 1_000_000_000).toFixed(2)} B`;
  if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1_000) return `S/ ${(n / 1_000).toFixed(0)} K`;
  return `S/ ${Math.round(n)}`;
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[9px] uppercase tracking-[0.26em]"
      style={{ color: "var(--cx-faint)", fontFamily: MONO }}
    >
      {children}
    </p>
  );
}

function Hero({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "fg" | "alarm";
}) {
  const c = tone === "alarm" ? "var(--cx-alarm)" : "var(--cx-fg)";
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <Kicker>{label}</Kicker>
      <span
        className="text-[clamp(1.6rem,3.4vw,2.6rem)] leading-none font-medium tracking-[-0.01em] tabular-nums truncate"
        style={{ color: c, fontFamily: SERIF }}
      >
        {value}
      </span>
      {sub && (
        <span
          className="text-[10px] tracking-[0.04em]"
          style={{ color: "var(--cx-muted)", fontFamily: MONO }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  hint,
}: {
  value: string;
  label: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-lg border p-3.5 flex flex-col gap-1.5"
      style={{
        borderColor: "var(--cx-border)",
        background: "var(--cx-card-bg)",
      }}
    >
      <span
        className="text-[19px] leading-none font-medium tabular-nums"
        style={{ color: "var(--cx-fg)", fontFamily: SERIF }}
      >
        {value}
      </span>
      <span
        className="text-[10px] uppercase tracking-[0.16em]"
        style={{ color: "var(--cx-muted)", fontFamily: MONO }}
      >
        {label}
      </span>
      {hint && (
        <span
          className="text-[9.5px] tracking-[0.02em]"
          style={{ color: "var(--cx-faint)", fontFamily: MONO }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl border p-4 sm:p-5"
      style={{ borderColor: "var(--cx-border)", background: "var(--cx-card)" }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <Kicker>{title}</Kicker>
        {note && (
          <span
            className="text-[9px] tracking-[0.04em]"
            style={{ color: "var(--cx-faint)", fontFamily: MONO }}
          >
            {note}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Bar({
  label,
  value,
  max,
  display,
  flags,
  tone = "brand",
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  flags?: number;
  tone?: "brand" | "alarm";
}) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  const fill = tone === "alarm" ? "var(--cx-alarm)" : "var(--cx-brand)";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="text-[11px] truncate"
          style={{ color: "var(--cx-fg)" }}
        >
          {label}
        </span>
        <span
          className="text-[11px] tabular-nums shrink-0 flex items-center gap-2"
          style={{ color: "var(--cx-muted)", fontFamily: MONO }}
        >
          {flags ? (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] tracking-[0.08em]"
              style={{
                color: "var(--cx-alarm)",
                background: "var(--cx-alarm-soft)",
              }}
            >
              {nf(flags)} alertas
            </span>
          ) : null}
          {display}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--cx-secondary)" }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${w}%`, background: fill }}
        />
      </div>
    </div>
  );
}

export default function CodexDashboard() {
  const [k, setK] = useState<Kpis | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let off = false;
    fetch("/api/kpis")
      .then((r) => r.json())
      .then((d) => {
        if (off) return;
        if (d?.source === "error" || !d?.totals) setErr(true);
        else setK(d as Kpis);
      })
      .catch(() => !off && setErr(true));
    return () => {
      off = true;
    };
  }, []);

  if (err) {
    return (
      <div
        className="h-full grid place-items-center text-xs"
        style={{ color: "var(--cx-faint)", fontFamily: MONO }}
      >
        No se pudo cargar el panel.
      </div>
    );
  }

  if (!k) {
    return (
      <div
        className="h-full grid place-items-center text-xs uppercase tracking-[0.24em]"
        style={{ color: "var(--cx-faint)", fontFamily: MONO }}
      >
        Cargando indicadores…
      </div>
    );
  }

  const t = k.totals;
  // Monto SOLO Perú (PEN) derivado de by_country — honesto como "S/".
  // t.monto_total mezcla PEN+CLP sin conversión; no se usa como cifra en soles.
  const montoPe = k.by_country
    .filter((c) => c.country !== "CL")
    .reduce((s, c) => s + c.monto, 0);
  const maxYear = Math.max(...k.years.map((y) => y.n), 1);
  const maxRegion = Math.max(...k.top_regions.map((r) => r.monto), 1);
  const maxSupplier = Math.max(...k.flagged_suppliers.map((s) => s.monto), 1);
  const maxCountry = Math.max(...k.by_country.map((c) => c.monto), 1);
  const fechaDatos = new Date(k.generated_at).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-6 animate-[cxFadeIn_0.4s_ease-out]">
      {/* TÍTULO */}
      <header className="flex flex-col gap-1.5">
        <Kicker>Panel · Toda la base · Perú + Chile</Kicker>
        <h1
          className="text-[clamp(1.3rem,2.6vw,2rem)] leading-tight font-medium tracking-[-0.01em]"
          style={{ color: "var(--cx-fg)", fontFamily: SERIF }}
        >
          Seguimos el billete de la obra pública.
        </h1>
      </header>

      {/* HERO KPIs */}
      <div
        className="rounded-xl border p-5 sm:p-6 grid grid-cols-2 lg:grid-cols-4 gap-6"
        style={{ borderColor: "var(--cx-border)", background: "var(--cx-card)" }}
      >
        <Hero
          label="Billete rastreado"
          value={money(montoPe)}
          sub="Perú · soles (PEN)"
        />
        <Hero label="Contratos auditados" value={nf(t.obras)} />
        <Hero
          label="Alertas detectadas"
          value={nf(t.red_flags)}
          tone="alarm"
          sub={`${pct(t.pct_red_flags)} de los contratos`}
        />
        <Hero
          label="Billete en riesgo"
          value={money(t.monto_riesgo)}
          tone="alarm"
          sub={`${pct(t.pct_monto_riesgo)} del total`}
        />
      </div>

      <p
        className="text-[10px] tracking-[0.04em] px-1"
        style={{ color: "var(--cx-muted)", fontFamily: MONO }}
      >
        Monto promedio por contrato {money(t.monto_promedio)} · {nf(t.suppliers)}{" "}
        contratistas · {nf(t.buyers)} entidades públicas
      </p>

      {/* COBERTURA */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <Stat
          value={nf(t.with_coords)}
          label="Geolocalizadas"
          hint={`${pct(t.pct_geo)} del total`}
        />
        <Stat
          value={nf(t.with_panorama)}
          label="Con Street View"
          hint="Evidencia visual"
        />
        <Stat value={nf(t.suppliers)} label="Contratistas" hint="RUC únicos" />
        <Stat value={nf(t.buyers)} label="Entidades" hint="Compradores" />
        <Stat
          value={nf(t.sanction_records)}
          label="Sanciones cruzadas"
          hint={`${nf(t.sanctioned_rucs)} RUC · ${nf(
            t.sanctions_vigentes
          )} vigentes`}
        />
        <Stat
          value={nf(t.infobras)}
          label="Avance físico"
          hint="Cruce INFOBRAS"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* PAÍS */}
        <Section title="Por país" note="Monto total">
          <div className="space-y-3.5">
            {k.by_country.map((c) => (
              <Bar
                key={c.country}
                label={
                  c.country === "CL"
                    ? "Chile"
                    : c.country === "PE"
                      ? "Perú"
                      : c.country
                }
                value={c.monto}
                max={maxCountry}
                display={`${fmtMontoCompact(c.monto, c.country)} · ${nf(c.n)}`}
                flags={c.red_flags || undefined}
              />
            ))}
          </div>
        </Section>

        {/* TENDENCIA ANUAL */}
        <Section title="Contratos por año" note="2019 – 2026">
          <div className="flex items-end gap-2 h-40">
            {k.years.map((y) => {
              const h = Math.max(6, (y.n / maxYear) * 100);
              const rf = y.n > 0 ? (y.red_flags / y.n) * h : 0;
              return (
                <div
                  key={y.year}
                  className="flex-1 flex flex-col items-center gap-1.5 min-w-0"
                >
                  <div
                    className="w-full rounded-t relative flex items-end"
                    style={{
                      height: `${h}%`,
                      background: "var(--cx-secondary)",
                    }}
                    title={`${y.year}: ${nf(y.n)} contratos · ${nf(
                      y.red_flags
                    )} alertas`}
                  >
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${rf}%`,
                        background: "var(--cx-alarm)",
                      }}
                    />
                  </div>
                  <span
                    className="text-[9px] tabular-nums"
                    style={{ color: "var(--cx-faint)", fontFamily: MONO }}
                  >
                    {String(y.year).slice(2)}
                  </span>
                </div>
              );
            })}
          </div>
          <p
            className="mt-3 text-[9.5px] tracking-[0.04em] flex items-center gap-2"
            style={{ color: "var(--cx-faint)", fontFamily: MONO }}
          >
            <span
              className="inline-block w-2 h-2 rounded-sm"
              style={{ background: "var(--cx-alarm)" }}
            />
            Porción con alerta dentro de cada año
          </p>
        </Section>
      </div>

      {/* TOP REGIONES */}
      <Section title="Regiones por billete" note="Top 8 · monto total">
        <div className="space-y-3.5">
          {k.top_regions.map((r) => (
            <Bar
              key={r.region}
              label={r.region}
              value={r.monto}
              max={maxRegion}
              display={`${money(r.monto)} · ${nf(r.n)}`}
              flags={r.red_flags || undefined}
            />
          ))}
        </div>
      </Section>

      {/* CONTRATISTAS CON ALERTA */}
      <Section
        title="Contratistas con sanción que aún concentran billete"
        note="Top 8 · monto total"
      >
        <div className="divide-y" style={{ borderColor: "var(--cx-border)" }}>
          {k.flagged_suppliers.map((s, i) => (
            <div
              key={`${s.ruc ?? s.name}-${i}`}
              className="flex items-center gap-3 py-2.5 first:pt-0"
            >
              <span
                className="text-[11px] tabular-nums w-5 shrink-0"
                style={{ color: "var(--cx-faint)", fontFamily: MONO }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[12px] truncate"
                  style={{ color: "var(--cx-fg)" }}
                >
                  {s.name}
                </p>
                <p
                  className="text-[9.5px] tracking-[0.04em]"
                  style={{ color: "var(--cx-faint)", fontFamily: MONO }}
                >
                  {s.ruc ? `RUC ${s.ruc} · ` : ""}
                  {nf(s.n)} contratos
                </p>
              </div>
              <span
                className="px-1.5 py-0.5 rounded text-[9px] tracking-[0.08em] shrink-0"
                style={{
                  color: "var(--cx-alarm)",
                  background: "var(--cx-alarm-soft)",
                  fontFamily: MONO,
                }}
              >
                {nf(s.red_flags)} alertas
              </span>
              <span
                className="text-[13px] tabular-nums shrink-0 w-24 text-right"
                style={{ color: "var(--cx-fg)", fontFamily: SERIF }}
              >
                {money(s.monto)}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* TIPOS DE ALERTA */}
      <Section title="Tipos de alerta" note="Registro de sanciones (OSCE)">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {k.flag_types.map((f) => (
            <div
              key={f.tipo}
              className="rounded-lg border p-3.5"
              style={{
                borderColor: "var(--cx-border)",
                background: "var(--cx-card-bg)",
              }}
            >
              <span
                className="text-[18px] font-medium tabular-nums block"
                style={{ color: "var(--cx-fg)", fontFamily: SERIF }}
              >
                {nf(f.n)}
              </span>
              <span
                className="text-[10px] uppercase tracking-[0.12em]"
                style={{ color: "var(--cx-muted)", fontFamily: MONO }}
              >
                {f.tipo.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* FUENTES */}
      <footer
        className="pt-2 pb-6 text-[9.5px] tracking-[0.06em] leading-relaxed"
        style={{ color: "var(--cx-faint)", fontFamily: MONO }}
      >
        Fuentes: OCDS Perú · OCDS Chile · SEACE · INFOBRAS · Registro de
        sanciones OSCE. Cruce y geocodificación propios. Datos a {fechaDatos}.
        Montos de Perú en soles (PEN) y de Chile en pesos (CLP); no se
        convierten entre sí. «Billete rastreado» y el desglose por país son
        cifras por moneda; los demás agregados en S/ están dominados por Perú.
      </footer>
    </div>
  );
}
