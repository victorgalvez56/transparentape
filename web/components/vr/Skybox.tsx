"use client";

import { useMemo } from "react";
import * as THREE from "three";

function Stars() {
  const { positions, sizes } = useMemo(() => {
    const count = 3000;
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 450 + Math.random() * 100;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      sz[i] = 0.4 + Math.random() * 1.2;
    }
    return { positions: pos, sizes: sz };
  }, []);

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute args={[positions, 3]} attach="attributes-position" />
        <bufferAttribute args={[sizes, 1]} attach="attributes-size" />
      </bufferGeometry>
      <pointsMaterial
        size={0.9}
        color="#ffffff"
        sizeAttenuation
        toneMapped={false}
        transparent
        opacity={0.85}
      />
    </points>
  );
}

export default function Skybox() {
  return (
    <>
      <color attach="background" args={["#020409"]} />
      <Stars />
    </>
  );
}
