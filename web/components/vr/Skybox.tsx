"use client";

export default function Skybox() {
  return (
    <>
      {/* Cielo nocturno con un color sólido + niebla en la distancia */}
      <color attach="background" args={["#020202"]} />
      <fog attach="fog" args={["#020202", 30, 100]} />
    </>
  );
}
