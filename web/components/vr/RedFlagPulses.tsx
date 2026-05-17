"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useObrasVR } from "@/lib/vr/obras-source";
import {
  GLOBE_RADIUS,
  lngLatToVec3,
  getNormal,
  quaternionFromNormal,
} from "@/lib/vr/sphere-projection";

const PULSE_COLOR = new THREE.Color("#ef4444");
const MAX_PULSES = 2000;

/**
 * Anillos rojos pulsando sobre la superficie del globo bajo cada red flag.
 * Cada ring esta orientado tangente a la esfera (radial normal hacia afuera).
 */
export default function RedFlagPulses() {
  const { obras } = useObrasVR();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const pulseTime = useRef(0);

  const redFlags = useMemo(() => {
    return obras.filter((o) => o.is_red_flag).slice(0, MAX_PULSES);
  }, [obras]);

  useEffect(() => {
    if (!meshRef.current || redFlags.length === 0) return;
    const mesh = meshRef.current;
    const dummy = new THREE.Object3D();
    // El ring viene plano en plano XY, su normal es +Z. Para que quede
    // tangente al globo (normal = radial outward), aplicamos quaternion
    // que rota +Z hacia el normal del punto sobre la esfera.
    const _zUp = new THREE.Vector3(0, 0, 1);
    const _tmpQ = new THREE.Quaternion();
    for (let i = 0; i < redFlags.length; i++) {
      const o = redFlags[i];
      // Posicion ligeramente sobre la superficie para evitar z-fighting
      const surface = lngLatToVec3(o.lng, o.lat, GLOBE_RADIUS + 0.05);
      const normal = getNormal(o.lng, o.lat);
      _tmpQ.setFromUnitVectors(_zUp, normal);
      dummy.position.copy(surface);
      dummy.quaternion.copy(_tmpQ);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    // Limpiar sobrantes
    const empty = new THREE.Object3D();
    empty.scale.set(0, 0, 0);
    empty.updateMatrix();
    for (let i = redFlags.length; i < MAX_PULSES; i++) {
      mesh.setMatrixAt(i, empty.matrix);
    }
    mesh.count = redFlags.length;
    mesh.instanceMatrix.needsUpdate = true;
    // suppress unused warning
    void quaternionFromNormal;
  }, [redFlags]);

  useFrame((_, delta) => {
    pulseTime.current += delta;
    if (!matRef.current) return;
    matRef.current.opacity = 0.4 + Math.sin(pulseTime.current * 1.5) * 0.25;
  });

  if (redFlags.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_PULSES]}
      frustumCulled={false}
    >
      <ringGeometry args={[0.12, 0.22, 16]} />
      <meshBasicMaterial
        ref={matRef}
        color={PULSE_COLOR}
        transparent
        opacity={0.5}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
