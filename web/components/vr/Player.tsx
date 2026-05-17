"use client";

import { forwardRef } from "react";
import { XROrigin, useXRControllerLocomotion } from "@react-three/xr";
import type { Group } from "three";

/**
 * El origen del jugador. Habilita locomoción por joystick:
 * - Stick izquierdo: avanzar/strafe (smooth, 2.5 m/s)
 * - Stick derecho: giro snap de 30° (anti motion-sickness)
 *
 * En desktop esto no afecta — la cámara default funciona normal.
 *
 * El ref expuesto sirve para que TeleportTarget pueda mover al player.
 */
const Player = forwardRef<Group>(function Player(_, ref) {
  useXRControllerLocomotion(
    (velocity, rotY, dt) => {
      const g = (ref as React.RefObject<Group | null>)?.current;
      if (!g) return;
      g.position.x += velocity.x * dt;
      g.position.z += velocity.z * dt;
      // Clamp dentro del piso 100×60 para no caer al vacío
      const halfW = 49;
      const halfD = 29;
      if (g.position.x > halfW) g.position.x = halfW;
      if (g.position.x < -halfW) g.position.x = -halfW;
      if (g.position.z > halfD) g.position.z = halfD;
      if (g.position.z < -halfD) g.position.z = -halfD;
      // Rotación snap
      g.rotation.y += rotY * dt;
    },
    { speed: 2.5 },
    { type: "snap", degrees: 30, deadZone: 0.5 }
  );

  return <XROrigin ref={ref} position={[0, 0, 6]} />;
});

export default Player;
