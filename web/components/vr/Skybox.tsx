"use client";

import { Stars } from "@react-three/drei";

export default function Skybox() {
  return (
    <>
      {/* Cielo nocturno con un color sólido + niebla en la distancia */}
      <color attach="background" args={["#020202"]} />
      <fog attach="fog" args={["#020202", 30, 100]} />
      {/* Campo de estrellas — reducido para GPU integrada */}
      <Stars
        radius={150}
        depth={60}
        count={1500}
        factor={4}
        saturation={0}
        fade
        speed={0.3}
      />
    </>
  );
}
