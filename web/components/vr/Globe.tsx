"use client";

import { Suspense } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { GLOBE_RADIUS } from "@/lib/vr/sphere-projection";

function GlobeMesh() {
  const texture = useTexture("/textures/earth-sat.jpg") as THREE.Texture;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return (
    <group>
      {/* Tierra */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[GLOBE_RADIUS, 96, 64]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {/* Atmósfera exterior — halo azul */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[GLOBE_RADIUS * 1.018, 64, 32]} />
        <meshBasicMaterial
          color="#2255cc"
          transparent
          opacity={0.16}
          side={THREE.BackSide}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
      {/* Limbo planetario más difuso */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[GLOBE_RADIUS * 1.04, 64, 32]} />
        <meshBasicMaterial
          color="#0a1a3a"
          transparent
          opacity={0.07}
          side={THREE.BackSide}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function FallbackGlobe() {
  return (
    <mesh>
      <sphereGeometry args={[GLOBE_RADIUS, 32, 16]} />
      <meshBasicMaterial color="#0a1418" />
    </mesh>
  );
}

export default function Globe() {
  return (
    <Suspense fallback={<FallbackGlobe />}>
      <GlobeMesh />
    </Suspense>
  );
}
