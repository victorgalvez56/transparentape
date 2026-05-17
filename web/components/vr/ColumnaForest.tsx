"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useObrasVR } from "@/lib/vr/obras-source";
import { projectToFloor, montoToHeight } from "@/lib/vr/projection";

const COLOR_ALTO = new THREE.Color("#ef4444"); // red_flag
const COLOR_BAJO = new THREE.Color("#42dc3a"); // brand

const XR_INSTANCE_CAP = 15000;
const DESKTOP_INSTANCE_CAP = 8000;

interface Props {
  yearFilter?: number | null; // null = todos
  onPointerOver?: (obraId: number) => void;
  onPointerOut?: () => void;
  onSelect?: (obraId: number) => void;
}

export default function ColumnaForest({
  yearFilter,
  onPointerOver,
  onPointerOut,
  onSelect,
}: Props) {
  const { obras, loading } = useObrasVR();
  // Detectamos XR via navigator para que el componente funcione sin <XR> wrapper
  const inXR =
    typeof navigator !== "undefined" &&
    Boolean((navigator as { xr?: { session?: unknown } }).xr?.session);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const pulseTime = useRef(0);

  // Filtrar por año + cap segun XR session
  const visible = useMemo(() => {
    const cap = inXR ? XR_INSTANCE_CAP : DESKTOP_INSTANCE_CAP;
    let list = obras;
    if (yearFilter != null) list = list.filter((o) => o.source_year === yearFilter);
    if (list.length <= cap) return list;
    return [...list]
      .sort((a, b) => {
        if (a.is_red_flag !== b.is_red_flag) return a.is_red_flag ? -1 : 1;
        return (b.monto ?? 0) - (a.monto ?? 0);
      })
      .slice(0, cap);
  }, [obras, yearFilter, inXR]);

  // Posicionar y colorear las instancias cuando cambia el dataset
  useEffect(() => {
    if (!meshRef.current || visible.length === 0) return;
    const mesh = meshRef.current;
    const dummy = new THREE.Object3D();

    for (let i = 0; i < visible.length; i++) {
      const o = visible[i];
      const [x, z] = projectToFloor(o.lng, o.lat);
      const h = montoToHeight(o.monto);
      dummy.position.set(x, h / 2, z);
      dummy.scale.set(1, h, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const color = o.is_red_flag ? COLOR_ALTO : COLOR_BAJO;
      mesh.setColorAt(i, color);
    }
    // Limpiar las instancias sobrantes (poner escala 0)
    const empty = new THREE.Object3D();
    empty.scale.set(0, 0, 0);
    empty.updateMatrix();
    for (let i = visible.length; i < DESKTOP_INSTANCE_CAP; i++) {
      mesh.setMatrixAt(i, empty.matrix);
    }

    mesh.count = visible.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [visible]);

  // Pulso de emissive intensity
  useFrame((_, delta) => {
    pulseTime.current += delta;
    if (matRef.current) {
      matRef.current.emissiveIntensity =
        0.6 + Math.sin(pulseTime.current * 2.0) * 0.2;
    }
  });

  // Handlers de raycast — react-three-fiber resuelve el instanceId automaticamente
  const handlePointerOver = (e: ThreeEvent) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id != null && id < visible.length) {
      onPointerOver?.(visible[id].id);
    }
  };
  const handleClick = (e: ThreeEvent) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id != null && id < visible.length) {
      onSelect?.(visible[id].id);
    }
  };

  if (loading) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, DESKTOP_INSTANCE_CAP]}
      onPointerOver={handlePointerOver}
      onPointerOut={() => onPointerOut?.()}
      onClick={handleClick}
      frustumCulled={false}
    >
      <cylinderGeometry args={[0.15, 0.15, 1, 4]} />
      <meshStandardMaterial
        ref={matRef}
        vertexColors={false}
        emissive="white"
        emissiveIntensity={0.7}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

// Tipo inline para evitar import circular del tipo de R3F
type ThreeEvent = {
  stopPropagation: () => void;
  instanceId?: number;
};
