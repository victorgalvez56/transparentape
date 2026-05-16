import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { riesgoDeObra } from "@/lib/types";
import { getObraByOcid } from "@/lib/obras-query";
import { fmtSolesLong, fmtSolesShort, fmtFecha, displayTitle, truncar } from "@/lib/format";

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
  const monto = obra.contract_amount ?? obra.award_amount ?? obra.tender_amount;
  const titulo = displayTitle(obra);
  const desc = `${obra.buyer_locality} · ${fmtSolesLong(monto)} · ${obra.supplier_name ?? "—"}`;
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
  const monto = obra.contract_amount ?? obra.award_amount ?? obra.tender_amount;
  const gmapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const sv =
    gmapsKey && obra.lat && obra.lng
      ? `https://maps.googleapis.com/maps/api/streetview?size=1600x600&location=${obra.lat},${obra.lng}&fov=85&key=${gmapsKey}`
      : null;
  const deltaAdj = calcDelta(obra.tender_amount, obra.award_amount);
  const deltaCon = calcDelta(obra.award_amount, obra.contract_amount);

  return (
    <div className="min-h-screen bg-[var(--ink-0)] text-white pb-20 overflow-y-auto h-screen">
      {/* TOP BAR */}
      <header className="px-6 py-4 border-b border-[var(--rule)] flex items-baseline justify-between sticky top-0 bg-[var(--ink-0)]/95 backdrop-blur z-10">
        <a
          href="/"
          className="text-[12px] text-[var(--fg-dim)] hover:text-white transition"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          ← Volver al mapa
        </a>
        <span
          className="text-[10px] uppercase tracking-[0.3em] text-[var(--fg-faint)]"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Transparentape
          <span className="text-[var(--brand)]">.</span>
        </span>
      </header>

      {/* HEADER editorial */}
      <header className="max-w-3xl mx-auto px-6 pt-16 pb-12">
        <p
          className={`text-[10px] uppercase tracking-[0.36em] ${
            riesgo === "alto"
              ? "text-[var(--alarm)]"
              : riesgo === "medio"
              ? "text-[var(--warn)]"
              : "text-[var(--fg-faint)]"
          }`}
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Caso · {obra.buyer_locality} · {obra.source_year}
        </p>
        <h1
          className="mt-5 text-[clamp(32px,5.5vw,64px)] leading-[1.05] text-white font-medium"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          {truncar(displayTitle(obra), 280)}
        </h1>
        {obra.tender_title && obra.tender_title !== displayTitle(obra) && (
          <p
            className="mt-3 text-[11px] uppercase tracking-[0.22em] text-[var(--fg-faint)]"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Código · {obra.tender_title}
          </p>
        )}
        <p className="mt-6 text-lg text-[var(--fg-dim)] leading-relaxed max-w-prose">
          <span className="text-white">{obra.buyer_name}</span> pagó{" "}
          <span
            className="text-[var(--brand)] tabular-nums"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            {fmtSolesLong(monto)}
          </span>{" "}
          a <span className="text-white">{obra.supplier_name ?? "—"}</span>
          {obra.contract_start && (
            <>
              {" "}en{" "}
              <span className="text-white">{fmtFecha(obra.contract_start)}</span>
            </>
          )}
          .
        </p>
      </header>

      {/* STREET VIEW (si hay) */}
      {sv && (
        <div className="max-w-5xl mx-auto px-6 mb-12">
          <div className="border border-[var(--rule)]">
            <img
              src={sv}
              alt="Street View"
              className="w-full aspect-[8/3] object-cover"
            />
            <p
              className="text-[10px] uppercase tracking-[0.22em] text-[var(--fg-faint)] px-3 py-2 border-t border-[var(--rule)]"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Street View · Google · Coordenadas {obra.lat?.toFixed(4)},{" "}
              {obra.lng?.toFixed(4)}
            </p>
          </div>
        </div>
      )}

      {/* PULL-QUOTE si red_flag */}
      {obra.is_red_flag && (
        <blockquote className="max-w-2xl mx-auto px-6 my-16 border-l-2 border-[var(--alarm)] pl-6">
          <p
            className="text-[clamp(20px,3vw,28px)] leading-[1.2] text-white font-medium italic"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            Este contratista figura en{" "}
            {(obra.red_flag_types ?? [])
              .join(" · ")
              .replace(/_/g, " ") || "registros de alerta"}
            .
          </p>
          <cite
            className="block mt-4 text-[10px] uppercase tracking-[0.26em] text-[var(--fg-faint)] not-italic"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Fuente · OECE datosabiertos · {new Date().getFullYear()}
          </cite>
        </blockquote>
      )}

      {/* RASTREO DEL BILLETE — 3 stats con anchoring */}
      <section className="max-w-3xl mx-auto px-6 my-16">
        <p
          className="text-[10px] uppercase tracking-[0.3em] text-[var(--fg-faint)] mb-4"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Rastreo del billete
        </p>
        <div className="grid grid-cols-3 divide-x divide-[var(--rule)]">
          <PageMoney label="Lo que dijeron" value={obra.tender_amount} />
          <PageMoney
            label="Lo que firmaron"
            value={obra.award_amount}
            delta={deltaAdj}
          />
          <PageMoney
            label="Lo que costó"
            value={obra.contract_amount}
            accent
            delta={deltaCon}
          />
        </div>
      </section>

      {/* QUIÉN PAGÓ / QUIÉN RECIBIÓ */}
      <section className="max-w-3xl mx-auto px-6 my-16 grid grid-cols-1 md:grid-cols-2 gap-10">
        <div>
          <p
            className="text-[10px] uppercase tracking-[0.3em] text-[var(--fg-faint)] mb-3"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Quién pagó
          </p>
          <h2
            className="text-[20px] leading-[1.2] text-white"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            {obra.buyer_name ?? "—"}
          </h2>
        </div>
        <div>
          <p
            className="text-[10px] uppercase tracking-[0.3em] text-[var(--fg-faint)] mb-3"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Quién recibió
          </p>
          <h2
            className="text-[20px] leading-[1.2] text-white"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            {obra.supplier_name ?? "—"}
          </h2>
          <p
            className="mt-2 text-[11px] text-[var(--fg-dim)]"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            RUC <span className="text-white">{obra.supplier_ruc ?? "—"}</span>
          </p>
        </div>
      </section>

      {/* META CONTRATO */}
      <section className="max-w-3xl mx-auto px-6 my-16">
        <p
          className="text-[10px] uppercase tracking-[0.3em] text-[var(--fg-faint)] mb-4"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Detalles del contrato
        </p>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 text-sm">
          <Field label="Inicio" value={fmtFecha(obra.contract_start)} />
          <Field label="Fin" value={fmtFecha(obra.contract_end)} />
          <Field label="Estado" value={obra.contract_status ?? "—"} />
          <Field
            label="Adendas"
            value={String(obra.n_amendments ?? 0)}
            alert={(obra.n_amendments ?? 0) >= 2}
          />
          <Field label="Método" value={obra.procurement_method ?? "—"} />
          <Field
            label="Publicado"
            value={fmtFecha(obra.date_published)}
          />
        </dl>
      </section>

      {/* AI */}
      {obra.ai_description && (
        <section className="max-w-2xl mx-auto px-6 my-16">
          <p
            className="text-[10px] uppercase tracking-[0.3em] text-[var(--fg-faint)] mb-4"
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
            className="text-[20px] leading-[1.4] text-white italic"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            "{obra.ai_description}"
          </p>
        </section>
      )}

      {/* FOOTER autoridad */}
      <footer className="border-t border-[var(--rule)] mt-20 pt-8 max-w-3xl mx-auto px-6">
        <p
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--fg-faint)]"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Datos · OCDS Open Contracting / OECE / MEF
        </p>
        <p
          className="mt-3 text-[10px] uppercase tracking-[0.22em] text-[var(--fg-faint)]"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          OCID <span className="text-white">{obra.ocid}</span>
          {obra.tender_id && (
            <>
              {" · "}Licitación{" "}
              <span className="text-white">{obra.tender_id}</span>
            </>
          )}
        </p>
        <p
          className="mt-6 text-[10px] uppercase tracking-[0.22em] text-[var(--fg-faint)]"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Transparentape<span className="text-[var(--brand)]">.</span>
        </p>
      </footer>
    </div>
  );
}

function PageMoney({
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
    <div className="px-4 first:pl-0 last:pr-0">
      <p
        className="text-[10px] uppercase tracking-[0.22em] text-[var(--fg-faint)]"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {label}
      </p>
      <p
        className={`mt-3 text-[clamp(20px,3vw,32px)] tabular-nums leading-none ${
          accent ? "text-[var(--brand)]" : "text-white"
        }`}
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        <span className="text-[11px] text-[var(--fg-faint)] mr-1">S/</span>
        {fmtSolesShort(value)}
      </p>
      {delta != null && (
        <p
          className={`mt-2 text-[10px] ${
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
    <div>
      <dt
        className="text-[10px] uppercase tracking-[0.2em] text-[var(--fg-faint)]"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm ${alert ? "text-[var(--warn)]" : "text-white"}`}
      >
        {value}
      </dd>
    </div>
  );
}
