"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/**
 * Hook que escucha webglcontextlost (Chrome dropeo el contexto, suele
 * pasar al pasar el limite de ~16 contexts entre todas las tabs).
 * Tiene que estar dentro del <Canvas> para acceder a gl.domElement.
 */
export default function ContextLostListener({
  onLost,
}: {
  onLost: () => void;
}) {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const handleLost = (e: Event) => {
      e.preventDefault();
      onLost();
      console.warn("[transparentape] WebGL context lost. Recarga la pagina.");
    };
    canvas.addEventListener("webglcontextlost", handleLost, false);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleLost);
    };
  }, [gl, onLost]);

  return null;
}

export function ContextLostBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/85"
      style={{ fontFamily: "var(--font-mono), monospace" }}
    >
      <div className="max-w-md text-center px-6">
        <p className="text-[var(--alarm)] text-[12px] uppercase tracking-[0.28em] mb-4">
          WebGL context perdido
        </p>
        <p className="text-white/80 text-[13px] mb-6 leading-relaxed">
          Chrome dropeo el render context. Suele pasar con muchas tabs WebGL
          abiertas o multiples copias de three.js. Cierra otras tabs 3D y
          recarga.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-[var(--brand)] text-black text-[11px] uppercase tracking-[0.2em]"
        >
          Recargar pagina
        </button>
      </div>
    </div>
  );
}
