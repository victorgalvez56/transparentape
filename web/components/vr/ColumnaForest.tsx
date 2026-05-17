"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useObrasVR } from "@/lib/vr/obras-source";
import { projectToFloor, montoToHeight } from "@/lib/vr/projection";

// Paleta jerarquica por monto — el ojo va a las obras grandes naturalmente
const COLOR_RED_FLAG = new THREE.Color("#ef4444"); // alerta OECE
const COLOR_HUGE = new THREE.Color("#fbbf24"); // > 100M soles — dorado
const COLOR_BIG = new THREE.Color("#42dc3a"); // 10-100M — brand verde
const COLOR_MID = new THREE.Color("#1f7a1c"); // 1-10M — verde apagado
const COLOR_SMALL = new THREE.Color("#3a4d3a"); // < 1M — verde grisaceo

function pickColor(monto: number, isRedFlag: boolean): THREE.Color {
  if (isRedFlag) return COLOR_RED_FLAG;
  if (monto >= 1e8) return COLOR_HUGE;
  if (monto >= 1e7) return COLOR_BIG;
  if (monto >= 1e6) return COLOR_MID;
  return COLOR_SMALL;
}

const XR_INSTANCE_CAP = 15000;
const DESKTOP_INSTANCE_CAP = 8000;

interface Props {
  yearFilter?: number | null; // null = todos
  onlyRedFlag?: boolean; // si true, oculta verdes
  onPointerOver?: (obraId: number) => void;
  onPointerOut?: () => void;
  onSelect?: (obraId: number) => void;
}

export default function ColumnaForest({
  yearFilter,
  onlyRedFlag,
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

  // Filtrar por año + red flag toggle + cap segun XR session
  const visible = useMemo(() => {
    const cap = inXR ? XR_INSTANCE_CAP : DESKTOP_INSTANCE_CAP;
    let list = obras;
    if (yearFilter != null) list = list.filter((o) => o.source_year === yearFilter);
    if (onlyRedFlag) list = list.filter((o) => o.is_red_flag);
    if (list.length <= cap) return list;
    return [...list]
      .sort((a, b) => {
        if (a.is_red_flag !== b.is_red_flag) return a.is_red_flag ? -1 : 1;
        return (b.monto ?? 0) - (a.monto ?? 0);
      })
      .slice(0, cap);
  }, [obras, yearFilter, onlyRedFlag, inXR]);

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
      mesh.setColorAt(i, pickColor(o.monto, o.is_red_flag));
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
    // Recomputar bounds para que el raycaster encuentre las instancias
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [visible]);

  // Pulso sutil del emissive — vida visual sin lavar los colores
  useFrame((_, delta) => {
    pulseTime.current += delta;
    if (matRef.current) {
      matRef.current.emissiveIntensity =
        0.2 + Math.sin(pulseTime.current * 1.5) * 0.08;
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
        emissive="#888888"
        emissiveIntensity={0.25}
        metalness={0.3}
        roughness={0.4}
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
