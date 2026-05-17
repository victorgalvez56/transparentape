import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { riesgoDeObra } from "@/lib/types";
import { getObraByOcid } from "@/lib/obras-query";
import {
  fmtSolesLong,
  fmtSolesShort,
  fmtFecha,
  displayTitle,
  truncar,
} from "@/lib/format";

export const runtime = "nodejs";
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ocid: string }>;
}): Promise<Metadata> {
  const { ocid } = await params;
  const obra = await getObraByOcid(ocid);
  if (!obra) return { title: "Caso no encontrado · Transparentape" };
  const monto =
    obra.contract_amount ?? obra.award_amount ?? obra.tender_amount;
  const titulo = displayTitle(obra);
  const desc = `${obra.buyer_locality ?? "—"} · ${fmtSolesLong(monto)} · ${
    obra.supplier_name ?? "—"
  }`;
  const ogUrl = `/api/og?ocid=${encodeURIComponent(ocid)}`;
  return {
    title: `${truncar(titulo, 110)} — Transparentape`,
    description: desc,
    openGraph: {
      title: truncar(titulo, 110),
      description: desc,
      images: [ogUrl],
      type: "article",
      locale: "es_PE",
    },
    twitter: {
      card: "summary_large_image",
      title: truncar(titulo, 110),
      description: desc,
      images: [ogUrl],
    },
  };
}

function calcDelta(base: number | null, comp: number | null) {
  if (!base || !comp) return null;
  return comp / base - 1;
}

export default async function ObraPage({
  params,
}: {
  params: Promise<{ ocid: string }>;
}) {
  const { ocid } = await params;
  const obra = await getObraByOcid(ocid);
  if (!obra) notFound();

  const riesgo = riesgoDeObra(obra);
  const monto =
    obra.contract_amount ?? obra.award_amount ?? obra.tender_amount;
  const gmapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const sv =
    gmapsKey && obra.lat && obra.lng
      ? `https://maps.googleapis.com/maps/api/streetview?size=1600x600&location=${obra.lat},${obra.lng}&fov=85&key=${gmapsKey}`
      : null;
  const deltaAdj = calcDelta(obra.tender_amount, obra.award_amount);
  const deltaCon = calcDelta(obra.award_amount, obra.contract_amount);

  const riesgoColor =
    riesgo === "alto"
      ? "var(--alarm)"
      : riesgo === "medio"
      ? "var(--warn)"
      : "var(--brand)";
  const riesgoLabel =
    riesgo === "alto"
      ? "Riesgo alto"
      : riesgo === "medio"
      ? "Riesgo medio"
      : "Sin alertas";

  return (
    <div
      className="min-h-screen bg-[var(--ink-0)] text-[var(--fg)] pb-24
                 overflow-y-auto h-screen"
    >
      {/* TOP BAR — minimal, sticky */}
      <header
        className="px-6 sm:px-8 py-4 border-b border-[var(--rule)]
                   flex items-baseline justify-between sticky top-0
                   bg-[var(--ink-0)]/92 backdrop-blur-xl z-10"
      >
        <a
          href="/"
          className="group inline-flex items-baseline gap-2
                     text-[12.5px] text-[var(--fg-dim)]
                     hover:text-[var(--fg)] transition-colors"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          <span className="text-[15px] leading-none group-hover:-translate-x-0.5 transition-transform">
            ←
          </span>
          <span>Volver al mapa</span>
        </a>
        <a
          href="/"
          className="text-[14px] leading-none text-[var(--fg)]
                     hover:opacity-90 transition-opacity tracking-tight"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          Transparentape
          <span className="text-[var(--brand)]">.</span>
        </a>
      </header>

      {/* HERO — editorial */}
      <section
        className="max-w-3xl mx-auto px-6 sm:px-8 pt-16 sm:pt-24 pb-12 animate-in"
        style={{ animationDelay: "0ms" }}
      >
        {/* Eyebrow — lowercase, mono, hairline dot */}
        <p
          className="text-[11.5px] text-[var(--fg-faint)]
                     flex items-center gap-2.5 flex-wrap"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: riesgoColor }}
          />
          <span>Caso forense</span>
          {obra.buyer_locality && (
            <>
              <span aria-hidden className="text-[var(--fg-faint)]/60">/</span>
              <span className="text-[var(--fg-dim)]">
                {obra.buyer_locality}
              </span>
            </>
          )}
          {obra.source_year && (
            <>
              <span aria-hidden className="text-[var(--fg-faint)]/60">/</span>
              <span className="tabular-nums text-[var(--fg-dim)]">
                {obra.source_year}
              </span>
            </>
          )}
        </p>

        {/* Title — Fraunces regular weight, NO uppercase, tracking sutil */}
        <h1
          className="mt-7 text-[clamp(32px,5.2vw,56px)] leading-[1.06]
                     text-[var(--fg)] font-normal tracking-[-0.018em]"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          {truncar(displayTitle(obra), 240)}
        </h1>

        {/* Código contrato — mono small */}
        {obra.tender_title && obra.tender_title !== displayTitle(obra) && (
          <p
            className="mt-4 text-[12px] text-[var(--fg-faint)] leading-relaxed"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            <span className="text-[var(--fg-faint)]/70">Código </span>
            <span className="text-[var(--fg-dim)]">{obra.tender_title}</span>
          </p>
        )}

        {/* Lead paragraph — Plex Sans 19px, line-height 1.65, cifra en brand */}
        <p
          className="mt-8 text-[18px] sm:text-[19px] leading-[1.65]
                     text-[var(--fg-dim)] max-w-[64ch]"
          style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
        >
          <span className="text-[var(--fg)] font-medium">
            {obra.buyer_name ?? "El Estado"}
          </span>{" "}
          pagó{" "}
          <span
            className="text-[var(--brand)] tabular-nums whitespace-nowrap font-medium"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            {fmtSolesLong(monto)}
          </span>{" "}
          a{" "}
          <span className="text-[var(--fg)] font-medium">
            {obra.supplier_name ?? "—"}
          </span>
          {obra.contract_start && (
            <>
              {" "}en{" "}
              <span className="text-[var(--fg)] tabular-nums">
                {fmtFecha(obra.contract_start)}
              </span>
            </>
          )}
          .
        </p>

        {/* Status badge — sin uppercase */}
        <div className="mt-7 inline-flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: riesgoColor }}
          />
          <span
            className="text-[12.5px] tracking-tight"
            style={{
              fontFamily: "var(--font-mono), monospace",
              color: riesgoColor,
            }}
          >
            {riesgoLabel}
          </span>
        </div>
      </section>

      {/* STREET VIEW — wide, refined */}
      {sv && (
        <section
          className="max-w-5xl mx-auto px-6 sm:px-8 mb-16 sm:mb-20 animate-in"
          style={{ animationDelay: "120ms" }}
        >
          <figure className="border border-[var(--rule)]">
            <img
              src={sv}
              alt="Vista del entorno (Google Street View)"
              className="w-full aspect-[8/3] object-cover"
            />
            <figcaption
              className="flex items-center justify-between gap-4 flex-wrap
                         text-[11.5px] text-[var(--fg-faint)]
                         px-4 py-2.5 border-t border-[var(--rule)]"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              <span>Street View · Google Maps</span>
              <span className="tabular-nums text-[var(--fg-dim)]">
                {obra.lat?.toFixed(4)}, {obra.lng?.toFixed(4)}
              </span>
            </figcaption>
          </figure>
        </section>
      )}

      {/* PULL QUOTE — solo si red_flag, Fraunces italic */}
      {obra.is_red_flag && (
        <section
          className="max-w-2xl mx-auto px-6 sm:px-8 my-16 sm:my-20 animate-in"
          style={{ animationDelay: "180ms" }}
        >
          <blockquote
            className="border-l-2 pl-6 sm:pl-8 py-2"
            style={{ borderColor: "var(--alarm)" }}
          >
            <p
              className="text-[clamp(22px,3vw,30px)] leading-[1.25]
                         text-[var(--fg)] italic font-normal
                         tracking-[-0.005em]"
              style={{ fontFamily: "var(--font-display), serif" }}
            >
              Este contratista figura en{" "}
              {(obra.red_flag_types ?? [])
                .join(" · ")
                .replace(/_/g, " ") || "registros de alerta"}
              .
            </p>
            <cite
              className="block mt-5 text-[11.5px] text-[var(--fg-faint)] not-italic"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Fuente: OECE datosabiertos · {new Date().getFullYear()}
            </cite>
          </blockquote>
        </section>
      )}

      {/* RASTREO DEL BILLETE — 3 stats grandes */}
      <section
        className="max-w-3xl mx-auto px-6 sm:px-8 my-16 sm:my-20 animate-in"
        style={{ animationDelay: "200ms" }}
      >
        <header className="mb-6 flex items-baseline justify-between gap-3 flex-wrap">
          <h2
            className="text-[22px] sm:text-[24px] text-[var(--fg)]
                       font-normal tracking-[-0.005em]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            El rastreo del billete
          </h2>
          <p
            className="text-[11.5px] text-[var(--fg-faint)]"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Referencial → adjudicación → contrato
          </p>
        </header>
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

      {/* QUIÉN PAGÓ / QUIÉN RECIBIÓ */}
      <section
        className="max-w-3xl mx-auto px-6 sm:px-8 my-16 sm:my-20
                   grid grid-cols-1 md:grid-cols-2 gap-10 sm:gap-14 animate-in"
        style={{ animationDelay: "280ms" }}
      >
        <div>
          <p
            className="text-[11.5px] text-[var(--fg-faint)] mb-3"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Quién pagó
          </p>
          <h3
            className="text-[20px] sm:text-[21px] leading-[1.22]
                       text-[var(--fg)] font-normal tracking-[-0.005em]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            {obra.buyer_name ?? "—"}
          </h3>
          {obra.buyer_region && (
            <p
              className="mt-2 text-[12.5px] text-[var(--fg-dim)]"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              {obra.buyer_region}
              {obra.buyer_street ? ` · ${obra.buyer_street}` : ""}
            </p>
          )}
        </div>
        <div>
          <p
            className="text-[11.5px] text-[var(--fg-faint)] mb-3"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Quién recibió
          </p>
          <h3
            className="text-[20px] sm:text-[21px] leading-[1.22]
                       text-[var(--fg)] font-normal tracking-[-0.005em]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            {obra.supplier_name ?? "—"}
          </h3>
          <p
            className="mt-2 text-[12.5px] text-[var(--fg-dim)]"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            <span className="text-[var(--fg-faint)]/80">RUC </span>
            <span className="tabular-nums text-[var(--fg)]">
              {obra.supplier_ruc ?? "—"}
            </span>
          </p>
        </div>
      </section>

      {/* DETALLES CONTRATO — definition list */}
      <section
        className="max-w-3xl mx-auto px-6 sm:px-8 my-16 sm:my-20 animate-in"
        style={{ animationDelay: "340ms" }}
      >
        <header className="mb-6 flex items-baseline justify-between gap-3 flex-wrap">
          <h2
            className="text-[22px] sm:text-[24px] text-[var(--fg)]
                       font-normal tracking-[-0.005em]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            El contrato, en detalle
          </h2>
        </header>
        <dl
          className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-6
                     py-6 border-y border-[var(--rule)]"
        >
          <Field label="Inicio" value={fmtFecha(obra.contract_start)} />
          <Field label="Fin" value={fmtFecha(obra.contract_end)} />
          <Field label="Estado" value={obra.contract_status ?? "—"} />
          <Field
            label="Adendas"
            value={String(obra.n_amendments ?? 0)}
            alert={(obra.n_amendments ?? 0) >= 2}
          />
          <Field label="Método" value={obra.procurement_method ?? "—"} />
          <Field label="Publicado" value={fmtFecha(obra.date_published)} />
          <Field
            label="Adjudicación"
            value={fmtFecha(obra.award_date)}
          />
          {obra.country && (
            <Field label="País" value={obra.country.toUpperCase()} />
          )}
        </dl>
      </section>

      {/* AI ANALYSIS — pull quote estilo magazine */}
      {obra.ai_description && (
        <section
          className="max-w-2xl mx-auto px-6 sm:px-8 my-16 sm:my-20 animate-in"
          style={{ animationDelay: "400ms" }}
        >
          <p
            className="text-[11.5px] text-[var(--fg-faint)] mb-5
                       flex items-center gap-2.5 flex-wrap"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            <span>Lectura automática</span>
            {obra.ai_score != null && (
              <>
                <span aria-hidden className="text-[var(--fg-faint)]/60">/</span>
                <span className="tabular-nums text-[var(--fg-dim)]">
                  score {obra.ai_score} de 100
                </span>
              </>
            )}
          </p>
          <blockquote
            className="text-[clamp(19px,2.4vw,22px)] leading-[1.5]
                       text-[var(--fg)] italic font-normal
                       tracking-[-0.003em]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            &ldquo;{obra.ai_description}&rdquo;
          </blockquote>
        </section>
      )}

      {/* FOOTER — datasource editorial */}
      <footer
        className="max-w-3xl mx-auto px-6 sm:px-8 mt-20 pt-10
                   border-t border-[var(--rule)] animate-in"
        style={{ animationDelay: "480ms" }}
      >
        <p
          className="text-[11.5px] text-[var(--fg-faint)] leading-[1.55]"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Datos OCDS Open Contracting · OECE · MEF.
        </p>
        <p
          className="mt-3 text-[11.5px] text-[var(--fg-faint)] leading-[1.55]
                     flex flex-wrap gap-x-2 gap-y-1 items-baseline"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          <span>OCID</span>
          <span className="tabular-nums text-[var(--fg-dim)]">{obra.ocid}</span>
          {obra.tender_id && (
            <>
              <span aria-hidden className="text-[var(--fg-faint)]/60">·</span>
              <span>Licitación</span>
              <span className="tabular-nums text-[var(--fg-dim)]">
                {obra.tender_id}
              </span>
            </>
          )}
        </p>
        <p
          className="mt-8 text-[13px] text-[var(--fg)]"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          Transparentape<span className="text-[var(--brand)]">.</span>
        </p>
      </footer>
    </div>
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
    <div className="px-4 first:pl-0 last:pr-0 min-w-0">
      <p
        className="text-[11px] text-[var(--fg-faint)] mb-3"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {label}
      </p>
      <p
        className={`text-[clamp(22px,3.2vw,32px)] tabular-nums leading-none truncate ${
          accent ? "text-[var(--brand)]" : "text-[var(--fg)]"
        }`}
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        <span className="text-[11.5px] text-[var(--fg-faint)] mr-1.5">
          S/
        </span>
        {fmtSolesShort(value)}
      </p>
      {delta != null && (
        <p
          className="mt-2.5 text-[11.5px] tabular-nums"
          style={{
            fontFamily: "var(--font-mono), monospace",
            color: positive ? "var(--alarm)" : "var(--fg-faint)",
          }}
        >
          {positive ? "▲" : "▼"} {(Math.abs(delta) * 100).toFixed(1)}%
        </p>
      )}
    </div>
  );
}

function Field({
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
      <dt
        className="text-[11px] text-[var(--fg-faint)]"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {label}
      </dt>
      <dd
        className={`mt-1.5 text-[14px] tabular-nums truncate ${
          alert ? "text-[var(--warn)]" : "text-[var(--fg)]"
        }`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
