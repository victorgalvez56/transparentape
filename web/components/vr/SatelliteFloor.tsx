"use client";

import { Suspense } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { FLOOR_DIMENSIONS } from "@/lib/vr/projection";

/**
 * Piso con textura satelital real de Peru desde Esri World Imagery.
 * El bbox de la imagen (lng -82..-68, lat -19..0) matchea exactamente
 * el mapping de projection.ts.
 */
function FloorWithTexture() {
  const texture = useTexture("/textures/peru-sat.jpg") as THREE.Texture;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[FLOOR_DIMENSIONS.width, FLOOR_DIMENSIONS.depth]} />
      <meshBasicMaterial
        map={texture}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

function FallbackFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[FLOOR_DIMENSIONS.width, FLOOR_DIMENSIONS.depth]} />
      <meshBasicMaterial color="#020202" side={THREE.DoubleSide} />
    </mesh>
  );
}

export default function SatelliteFloor() {
  return (
    <Suspense fallback={<FallbackFloor />}>
      <FloorWithTexture />
    </Suspense>
  );
}
