"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { FLOOR_DIMENSIONS } from "@/lib/vr/projection";

/**
 * Piso con textura satelital real de Peru desde Esri World Imagery.
 * El bbox de la imagen (lng -82..-68, lat -19..0) matchea exactamente
 * el mapping de projection.ts, asi que cada cilindro cae sobre su
 * coordenada geografica real.
 */
export default function SatelliteFloor() {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(
      "/textures/peru-sat.jpg",
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        setTexture(tex);
      },
      undefined,
      (err) => {
        console.warn("[SatelliteFloor] no se pudo cargar peru-sat.jpg:", err);
      }
    );
    return () => {
      // No dispose explicito — el cleanup de three al unmount lo agarra
    };
  }, []);

  if (!texture) {
    // Mientras carga, mostrar piso oscuro
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry
          args={[FLOOR_DIMENSIONS.width, FLOOR_DIMENSIONS.depth]}
        />
        <meshBasicMaterial color="#020202" />
      </mesh>
    );
  }

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[FLOOR_DIMENSIONS.width, FLOOR_DIMENSIONS.depth]} />
      <meshBasicMaterial
        map={texture}
        toneMapped={false}
      />
    </mesh>
  );
}
