"use client";

import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useXR } from "@react-three/xr";

/**
 * Bloom selectivo sobre los materiales emissive (las columnas).
 * Desactivado en modo immersive — los EffectComposer son inestables
 * con XR layered rendering. En desktop hace que el bosque "respire" neon.
 */
export default function Postprocessing() {
  const inXR = useXR((s) => Boolean(s.session));
  if (inXR) return null;
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={0.9}
        luminanceThreshold={0.5}
        luminanceSmoothing={0.85}
        mipmapBlur
      />
    </EffectComposer>
  );
}
