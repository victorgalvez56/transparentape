"use client";

import { OrbitControls } from "@react-three/drei";
import { useXR } from "@react-three/xr";
import { LIMA_POSITION } from "@/lib/vr/projection";

/**
 * Controles para preview en desktop. Permite drag-rotate y wheel-zoom para
 * inspeccionar el bosque sin entrar a immersive VR.
 *
 * Se desactiva automaticamente cuando hay sesion XR activa.
 */
export default function DesktopControls() {
  const inXR = useXR((s) => Boolean(s.session));
  if (inXR) return null;
  return (
    <OrbitControls
      makeDefault
      target={[LIMA_POSITION[0], 0.5, LIMA_POSITION[1]]}
      minDistance={1.5}
      maxDistance={120}
      maxPolarAngle={Math.PI / 2 - 0.05}
      enablePan
      panSpeed={0.8}
      rotateSpeed={0.4}
      zoomSpeed={0.9}
    />
  );
}
