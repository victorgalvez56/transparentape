"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Obra } from "@/lib/types";
import { formatMontoCompact, truncate } from "@/lib/vr/format";

/* /vr — selector ligero de obras (sin globo 3D). Cada obra abre la vista
   inmersiva 360° real en /vr/obra/[ocid]. */

export default function VRPage() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [onlyRedFlag, setOnlyRedFlag] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      setLoading(true);
      const params = new URLSearchParams({
        with_coords: "true",
        has_panorama: "true",
        limit: "240",
      });
      if (q.trim()) params.set("q", q.trim());
      if (onlyRedFlag) params.set("red_flag", "true");
      fetch(`/api/obras?${params}`, { signal: ac.signal })
        .then((r) => r.json())
        .then((d) => {
          setObras(Array.isArray(d.obras) ? d.obras : []);
          setLoading(false);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setLoading(false);
        });
    }, 280);
    return () => clearTimeout(t);
  }, [q, onlyRedFlag]);

  return (
    <main
      className="min-h-screen bg-black text-white"
      style={{ fontFamily: "var(--font-mono), monospace" }}
    >
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-black/80 border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-baseline justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <span
                className="text-[20px] leading-none font-medium tracking-tight"
                style={{ fontFamily: "var(--font-display), serif" }}
              >
                Transparentape
                <span className="text-[var(--brand)]">.</span>
              </span>
              <span className="text-[11px] tracking-tight text-white/55 font-medium" style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
                Obras en VR 360°
              </span>
            </div>
            <Link
              href="/"
              className="text-[11.5px] tracking-tight text-white/50 hover:text-white transition font-medium"
              style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
            >
              Mapa
            </Link>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar obra, distrito, proveedor…"
              className="flex-1 bg-white/[0.04] border border-white/15 px-4 py-2.5 text-[12px] text-white placeholder:text-white/30 outline-none focus:border-[var(--brand)]/60 transition"
            />
            <button
              onClick={() => setOnlyRedFlag((v) => !v)}
              className={`px-4 py-2.5 text-[11.5px] tracking-tight border transition whitespace-nowrap font-medium ${
                onlyRedFlag
                  ? "bg-[var(--alarm)] text-black border-[var(--alarm)]"
                  : "text-white/60 border-white/15 hover:text-white hover:border-white/35"
              }`}
              style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
            >
              Alertas
            </button>
          </div>
        </div>
      </header>

      {/* Grid */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <p className="text-[12px] tracking-tight text-white/55 py-20 text-center font-medium" style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
            Cargando obras…
          </p>
        ) : obras.length === 0 ? (
          <p className="text-[12px] tracking-tight text-white/55 py-20 text-center font-medium" style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
            Sin obras con panorámica
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {obras.map((o) => {
              const monto =
                o.contract_amount ?? o.award_amount ?? o.tender_amount ?? 0;
              return (
                <Link
                  key={o.id}
                  href={`/vr/obra/${encodeURIComponent(o.ocid)}`}
                  prefetch={false}
                  className="group relative block border border-white/10 bg-white/[0.02] p-4 hover:border-[var(--brand)]/50 hover:bg-white/[0.04] transition"
                >
                  {o.is_red_flag && (
                    <span className="absolute top-3 right-3 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--alarm)] animate-pulse" />
                      <span className="text-[11px] tracking-tight text-[var(--alarm)] font-semibold" style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
                        Alerta
                      </span>
                    </span>
                  )}
                  <p
                    className="text-[13px] leading-snug text-white/90 mb-3 pr-12"
                    style={{ fontFamily: "var(--font-body), sans-serif" }}
                  >
                    {truncate(o.tender_title ?? "Sin título", 90)}
                  </p>
                  <div className="flex items-baseline gap-3">
                    <span
                      className={`text-[16px] tabular-nums ${
                        o.is_red_flag
                          ? "text-[var(--alarm)]"
                          : "text-[var(--brand)]"
                      }`}
                    >
                      {formatMontoCompact(monto)}
                    </span>
                    {o.buyer_locality && (
                      <span className="text-[11px] tracking-tight text-white/55 truncate font-medium" style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
                        {o.buyer_locality}
                      </span>
                    )}
                  </div>
                  <span className="mt-3 inline-block text-[11px] tracking-tight text-white/50 group-hover:text-[var(--brand)] transition font-medium" style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
                    Ver en 360° →
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
