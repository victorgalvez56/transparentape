"use client";

import { useEffect, useState } from "react";
import type { XRStore } from "@react-three/xr";

/**
 * Botón real de entrada a WebXR. Detecta soporte vía navigator.xr
 * (immersive-vr) y llama store.enterVR(). Sin esto, /vr es sólo una
 * página web — los headsets no ofrecen "Enter VR".
 */
export default function VRSessionButton({ store }: { store: XRStore }) {
  // Checks síncronos (secure context / presencia de navigator.xr) en el
  // inicializador perezoso — el componente es client-only (ssr:false).
  const [support, setSupport] = useState<
    "checking" | "supported" | "unsupported" | "insecure"
  >(() => {
    if (typeof window === "undefined") return "checking";
    if (!window.isSecureContext) return "insecure";
    const xr = (
      navigator as Navigator & {
        xr?: { isSessionSupported?: (m: string) => Promise<boolean> };
      }
    ).xr;
    return xr?.isSessionSupported ? "checking" : "unsupported";
  });
  const [err, setErr] = useState<string | null>(null);

  // Sólo el chequeo asíncrono real vive en el efecto (setState en callback).
  useEffect(() => {
    if (support !== "checking" || typeof window === "undefined") return;
    const xr = (
      navigator as Navigator & {
        xr?: { isSessionSupported?: (m: string) => Promise<boolean> };
      }
    ).xr;
    if (!xr?.isSessionSupported) return;
    let cancelled = false;
    xr.isSessionSupported("immersive-vr")
      .then((ok) => {
        if (!cancelled) setSupport(ok ? "supported" : "unsupported");
      })
      .catch(() => {
        if (!cancelled) setSupport("unsupported");
      });
    return () => {
      cancelled = true;
    };
  }, [support]);

  const enter = async () => {
    setErr(null);
    try {
      await store.enterVR();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setTimeout(() => setErr(null), 6000);
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-8 z-20 flex flex-col items-center gap-3">
      {support === "supported" && (
        <button
          onClick={enter}
          className="pointer-events-auto px-7 py-3.5 bg-[var(--brand)] text-black font-semibold tracking-tight hover:bg-white transition-colors shadow-[0_0_30px_rgba(66,220,58,0.35)]"
          style={{ fontFamily: "var(--font-body), sans-serif" }}
        >
          ▶ Entrar en VR
        </button>
      )}
      {support === "unsupported" && (
        <p
          className="px-4 py-2 text-[12px] tracking-tight text-white/65 text-center max-w-md"
          style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
        >
          Este dispositivo no soporta WebXR. Abre esta página en Quest 2/3/3S,
          Vision Pro u otro headset para entrar en modo inmersivo.
        </p>
      )}
      {support === "insecure" && (
        <p
          className="px-4 py-2 text-[12px] tracking-tight text-[var(--alarm)] text-center max-w-md font-medium"
          style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
        >
          WebXR requiere HTTPS — abre la URL de producción (https) en el headset,
          no la IP local.
        </p>
      )}
      {err && (
        <p
          className="px-4 py-2 text-[12px] tracking-tight text-[var(--alarm)] text-center max-w-md font-medium"
          style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
        >
          {err}
        </p>
      )}
    </div>
  );
}
