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
    <mesh position={[0, 0, 0]} receiveShadow>
      <sphereGeometry args={[GLOBE_RADIUS, 96, 64]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
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
