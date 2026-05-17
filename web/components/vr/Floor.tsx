"use client";

import { TeleportTarget } from "@react-three/xr";
import type { Vector3 } from "three";
import { FLOOR_DIMENSIONS } from "@/lib/vr/projection";

interface Props {
  onTeleport?: (point: Vector3) => void;
}

export default function Floor({ onTeleport }: Props) {
  return (
    <TeleportTarget onTeleport={(point) => onTeleport?.(point)}>
      {/* Plano físico del suelo */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry
          args={[FLOOR_DIMENSIONS.width, FLOOR_DIMENSIONS.depth]}
        />
        <meshStandardMaterial
          color="#050505"
          metalness={0.1}
          roughness={0.9}
        />
      </mesh>
      {/* Grid sutil tipo blueprint */}
      <gridHelper
        args={[FLOOR_DIMENSIONS.width, 40, "#0a3d0a", "#0a3d0a"]}
        position={[0, 0.001, 0]}
      />
    </TeleportTarget>
  );
}
