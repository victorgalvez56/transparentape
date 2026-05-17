"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

interface Props {
  /** Si !== null, animar la camara hacia este target + position */
  flyTo: {
    target: [number, number, number];
    position: [number, number, number];
    seq: number; // incrementa cada peticion para retriggear
  } | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}

/**
 * Tween suave de la camara + target del OrbitControls.
 * Cuando flyTo.seq cambia, anima durante FLY_DURATION segundos.
 */
const FLY_DURATION = 1.2;

export default function CameraController({ flyTo, controlsRef }: Props) {
  const camera = useThree((s) => s.camera);
  const startRef = useRef<{
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toPos: THREE.Vector3;
    toTarget: THREE.Vector3;
    t: number;
    seq: number;
  } | null>(null);

  useEffect(() => {
    if (!flyTo || !controlsRef.current) return;
    if (startRef.current?.seq === flyTo.seq) return;
    startRef.current = {
      fromPos: camera.position.clone(),
      fromTarget: controlsRef.current.target.clone(),
      toPos: new THREE.Vector3(...flyTo.position),
      toTarget: new THREE.Vector3(...flyTo.target),
      t: 0,
      seq: flyTo.seq,
    };
  }, [flyTo, camera, controlsRef]);

  useFrame((_, delta) => {
    const a = startRef.current;
    if (!a || !controlsRef.current) return;
    a.t = Math.min(1, a.t + delta / FLY_DURATION);
    // easeInOutCubic
    const ease =
      a.t < 0.5 ? 4 * a.t * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 3) / 2;
    camera.position.lerpVectors(a.fromPos, a.toPos, ease);
    controlsRef.current.target.lerpVectors(a.fromTarget, a.toTarget, ease);
    controlsRef.current.update();
    if (a.t >= 1) startRef.current = null;
  });

  return null;
}
