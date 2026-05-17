"use client";

import { useRef } from "react";
import { useOthers } from "@liveblocks/react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";

const MULTIPLAYER_ENABLED = Boolean(
  process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY
);

/**
 * Renderiza un avatar 3D simple por cada otro auditor conectado al room:
 * - Esfera-cabeza con color personal (emissive para que destaque)
 * - Visor delante para dar dirección de mirada
 * - Etiqueta flotante con nombre + obra que está mirando
 *
 * Posición/rotación interpolada (lerp) en cada frame para suavizar el
 * stream 10Hz del PresenceTracker remoto.
 */
export default function RemoteAvatars() {
  if (!MULTIPLAYER_ENABLED) return null;
  return <RemoteAvatarsInner />;
}

function RemoteAvatarsInner() {
  const others = useOthers();
  return (
    <>
      {others.map((other) => (
        <RemoteAvatar key={other.connectionId} other={other} />
      ))}
    </>
  );
}

interface OtherUser {
  connectionId: number;
  presence: Liveblocks["Presence"];
}

function RemoteAvatar({ other }: { other: OtherUser }) {
  const groupRef = useRef<THREE.Group>(null);
  const labelRef = useRef<THREE.Group>(null);
  const tmpQ = useRef(new THREE.Quaternion());

  useFrame(() => {
    const p = other.presence;
    if (!p || !groupRef.current) return;
    // Lerp suave hacia la posición/rot recibida
    const g = groupRef.current;
    g.position.lerp(
      new THREE.Vector3(p.headPos[0], p.headPos[1], p.headPos[2]),
      0.25
    );
    tmpQ.current.set(p.headQuat[0], p.headQuat[1], p.headQuat[2], p.headQuat[3]);
    g.quaternion.slerp(tmpQ.current, 0.25);
    if (labelRef.current) {
      labelRef.current.position.set(
        g.position.x,
        g.position.y + 0.32,
        g.position.z
      );
    }
  });

  const p = other.presence;
  if (!p) return null;
  const color = p.color || "#ffffff";
  const name = p.name || "Auditor";
  const isPointing = p.pointingObraId != null;

  return (
    <>
      <group ref={groupRef}>
        {/* Cabeza */}
        <mesh>
          <sphereGeometry args={[0.13, 16, 12]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.5}
            toneMapped={false}
          />
        </mesh>
        {/* Visor delante (three.js cam mira a -Z) */}
        <mesh position={[0, 0, -0.115]}>
          <boxGeometry args={[0.2, 0.07, 0.04]} />
          <meshStandardMaterial
            color="#000000"
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>
      </group>
      {/* Label con nombre + estado, posicionada por encima de la cabeza */}
      <group ref={labelRef}>
        <Billboard follow>
          <Text
            fontSize={0.055}
            color={color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.003}
            outlineColor="#000000"
          >
            {name}
          </Text>
          {isPointing && (
            <Text
              position={[0, -0.07, 0]}
              fontSize={0.035}
              color="#9ca3af"
              anchorX="center"
              anchorY="middle"
            >
              {`mirando obra ${p.pointingObraId}`}
            </Text>
          )}
        </Billboard>
      </group>
    </>
  );
}
