"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { Obra } from "@/lib/types";

const ObraVR = dynamic(() => import("@/components/vr/ObraVR"), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-screen flex items-center justify-center bg-black">
      <p
        className="text-white/60 text-[12px] tracking-tight font-medium"
        style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
      >
        Cargando escena…
      </p>
    </div>
  ),
});

interface PanoData {
  obra: Obra;
  panoId: string;
  beforePanoId?: string;
  afterPanoId?: string;
  beforeDate?: string;
  afterDate?: string;
}

function Screen({ msg, showBack = true }: { msg: string; showBack?: boolean }) {
  return (
    <main className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-5">
      <p
        className="text-white/60 text-[12px] tracking-tight font-medium"
        style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
      >
        {msg}
      </p>
      {showBack && (
        <a
          href="/vr"
          className="text-[11.5px] tracking-tight text-white/50 hover:text-white transition font-medium"
          style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
        >
          ← Audit Room
        </a>
      )}
    </main>
  );
}

export default function VRObraPage() {
  const params = useParams();
  const ocid = params.ocid as string;

  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; msg: string }
    | { status: "ready"; data: PanoData }
  >({ status: "loading" });

  useEffect(() => {
    if (!ocid) return;

    async function load() {
      // 1. Fetch obra
      const obraRes = await fetch(`/api/obra/${encodeURIComponent(ocid)}`);
      if (!obraRes.ok) {
        setState({ status: "error", msg: "Obra no encontrada" });
        return;
      }
      const { obra }: { obra: Obra } = await obraRes.json();

      if (!obra.lat || !obra.lng) {
        setState({ status: "error", msg: "Sin coordenadas para esta obra" });
        return;
      }

      // 2. Fetch street view panos
      const svRes = await fetch(
        `/api/streetview?lat=${obra.lat}&lng=${obra.lng}`
      );
      if (!svRes.ok) {
        setState({ status: "error", msg: "Sin panorámica para esta ubicación" });
        return;
      }
      const sv = await svRes.json();
      if (!sv.found) {
        setState({ status: "error", msg: "Sin panorámica para esta ubicación" });
        return;
      }

      const mainPanoId: string = sv.after?.panoId ?? sv.before?.panoId;
      setState({
        status: "ready",
        data: {
          obra,
          panoId: mainPanoId,
          beforePanoId: sv.before?.panoId,
          afterPanoId: sv.after?.panoId,
          beforeDate: sv.before?.date,
          afterDate: sv.after?.date,
        },
      });
    }

    load().catch(() =>
      setState({ status: "error", msg: "Error al cargar la obra" })
    );
  }, [ocid]);

  if (state.status === "loading") return <Screen msg="Cargando obra…" showBack={false} />;
  if (state.status === "error") return <Screen msg={state.msg} />;

  const { data } = state;
  return (
    <main className="fixed inset-0 bg-black overflow-hidden">
      <ObraVR
        obra={data.obra}
        panoId={data.panoId}
        beforePanoId={data.beforePanoId}
        afterPanoId={data.afterPanoId}
        beforeDate={data.beforeDate}
        afterDate={data.afterDate}
      />
    </main>
  );
}
