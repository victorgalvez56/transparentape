"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useObrasVR } from "@/lib/vr/obras-source";
import { projectToFloor } from "@/lib/vr/projection";

const PULSE_COLOR = new THREE.Color("#ef4444");
const MAX_PULSES = 2000; // cap igual que las columnas, prioriza los mas relevantes

/**
 * Anillos emissive en el suelo bajo cada columna red_flag.
 * Visible a larga distancia para identificar alertas sin tener que leer color
 * de la columna pequeña.
 */
export default function RedFlagPulses() {
  const { obras } = useObrasVR();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const pulseTime = useRef(0);

  const positions = useMemo(() => {
    return obras
      .filter((o) => o.is_red_flag)
      .slice(0, MAX_PULSES)
      .map((o) => projectToFloor(o.lng, o.lat));
  }, [obras]);

  useEffect(() => {
    if (!meshRef.current || positions.length === 0) return;
    const mesh = meshRef.current;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < positions.length; i++) {
      const [x, z] = positions[i];
      dummy.position.set(x, 0.015, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = positions.length;
  }, [positions]);

  // Ref callback: count=0 al mountar para evitar overdraw inicial
  const handleMeshRef = useCallback((m: THREE.InstancedMesh | null) => {
    if (m && meshRef.current !== m) m.count = 0;
    meshRef.current = m;
  }, []);

  useFrame((_, delta) => {
    pulseTime.current += delta;
    if (!matRef.current) return;
    matRef.current.opacity = 0.5 + Math.sin(pulseTime.current * 1.5) * 0.25;
  });

  if (positions.length === 0) return null;

  return (
    <instancedMesh
      ref={handleMeshRef}
      args={[undefined, undefined, MAX_PULSES]}
      frustumCulled={false}
    >
      <ringGeometry args={[0.35, 0.6, 16]} />
      <meshBasicMaterial
        ref={matRef}
        color={PULSE_COLOR}
        transparent
        opacity={0.6}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
