"use client";

import { useEffect, useState } from "react";
import type { XRStore } from "@react-three/xr";

/**
 * Botón real de entrada a WebXR. Detecta soporte vía navigator.xr
 * (immersive-vr) y llama store.enterVR(). Sin esto, /vr es sólo una
 * página web — los headsets no ofrecen "Enter VR".
 */
export default function VRSessionButton({ store }: { store: XRStore }) {
  const [support, setSupport] = useState<
    "checking" | "supported" | "unsupported" | "insecure"
  >("checking");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const xr = (
      navigator as Navigator & {
        xr?: { isSessionSupported?: (m: string) => Promise<boolean> };
      }
    ).xr;
    // WebXR exige secure context (https) salvo en localhost.
    if (!window.isSecureContext) {
      setSupport("insecure");
      return;
    }
    if (!xr?.isSessionSupported) {
      setSupport("unsupported");
      return;
    }
    xr.isSessionSupported("immersive-vr")
      .then((ok) => !cancelled && setSupport(ok ? "supported" : "unsupported"))
      .catch(() => !cancelled && setSupport("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

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
          className="pointer-events-auto px-7 py-3.5 bg-[var(--brand)] text-black font-semibold tracking-wide hover:bg-white transition-colors shadow-[0_0_30px_rgba(66,220,58,0.35)]"
          style={{ fontFamily: "var(--font-body), sans-serif" }}
        >
          ▶ ENTRAR EN VR
        </button>
      )}
      {support === "unsupported" && (
        <p
          className="px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-white/45 text-center max-w-md"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Este dispositivo no soporta WebXR. Abre esta página en Quest 2/3/3S,
          Vision Pro u otro headset para entrar en modo inmersivo.
        </p>
      )}
      {support === "insecure" && (
        <p
          className="px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-[var(--alarm)] text-center max-w-md"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          WebXR requiere HTTPS — abre la URL de producción (https) en el headset,
          no la IP local.
        </p>
      )}
      {err && (
        <p
          className="px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-[var(--alarm)] text-center max-w-md"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {err}
        </p>
      )}
    </div>
  );
}
