"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useUpdateMyPresence } from "@liveblocks/react";

const MULTIPLAYER_ENABLED = Boolean(
  process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY
);

interface Props {
  pointingObraId: number | null;
}

/**
 * Broadcastea mi posición de cabeza + rotación + obra apuntada cada ~100ms.
 *
 * 10Hz es suficiente para que los demás vean el movimiento fluido sin
 * saturar el websocket de Liveblocks. La interpolación del lado del
 * remoto se hace con lerp en RemoteAvatars.
 */
export default function PresenceTracker({ pointingObraId }: Props) {
  if (!MULTIPLAYER_ENABLED) return null;
  return <PresenceTrackerInner pointingObraId={pointingObraId} />;
}

function PresenceTrackerInner({ pointingObraId }: Props) {
  const camera = useThree((s) => s.camera);
  const updateMyPresence = useUpdateMyPresence();

  const tmpPos = useRef(new THREE.Vector3());
  const tmpQuat = useRef(new THREE.Quaternion());
  const acc = useRef(0);
  const lastObraId = useRef<number | null>(null);

  useFrame((_state, dt) => {
    acc.current += dt;
    if (acc.current < 0.1 && lastObraId.current === pointingObraId) return;
    acc.current = 0;
    lastObraId.current = pointingObraId;

    camera.getWorldPosition(tmpPos.current);
    camera.getWorldQuaternion(tmpQuat.current);

    updateMyPresence({
      headPos: [tmpPos.current.x, tmpPos.current.y, tmpPos.current.z],
      headQuat: [
        tmpQuat.current.x,
        tmpQuat.current.y,
        tmpQuat.current.z,
        tmpQuat.current.w,
      ],
      pointingObraId,
    });
  });

  return null;
}
