"use client";

/**
 * @react-three/postprocessing@3.0.4 + Turbopack + three@0.184 incompatibles
 * — duplican Three.js en el bundle y EffectComposer revienta con
 * "Cannot read properties of null (reading 'alpha')".
 *
 * Lo dejamos no-op hasta resolver versiones. Las columnas usan
 * `meshStandardMaterial` con emissive alto + toneMapped=false, asi que
 * siguen brillando sin bloom — solo se pierde el "neon spread".
 */
export default function Postprocessing() {
  return null;
}
