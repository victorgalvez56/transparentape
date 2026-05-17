"use client";

import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import ColumnaForest from "./ColumnaForest";
import Skybox from "./Skybox";
import PeruMap from "./PeruMap";
import RedFlagPulses from "./RedFlagPulses";
import ContextLostListener, { ContextLostBanner } from "./ContextLostBanner";
import HudOverlay from "./HudOverlay";
import { useObrasVR } from "@/lib/vr/obras-source";
import { LIMA_POSITION } from "@/lib/vr/projection";

/**
 * Audit Room desktop estable.
 *
 * Sin drei Text (Troika SDF causa context lost en Apple M5 Metal driver),
 * sin XR wrapper por ahora (testing solo desktop), sin Liveblocks.
 *
 * Lo que SI tiene:
 * - Mapa real de Peru con outline departamentos (PeruMap)
 * - 8k columnas en coords reales de cada obra (ColumnaForest)
 * - Anillos rojos pulsando bajo alertas OECE (RedFlagPulses)
 * - HUD DOM con counter + selected obra info
 * - OrbitControls drag+zoom
 */
export default function AuditRoom() {
  const [contextLost, setContextLost] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const { obras, loading } = useObrasVR();

  return (
    <>
      <HudOverlay
        loading={loading}
        totalObras={obras.length}
        hovered={hovered}
        selected={selected}
        obras={obras}
        onCloseSelected={() => setSelected(null)}
      />
      <ContextLostBanner visible={contextLost} />
      <Canvas
        camera={{
          position: [LIMA_POSITION[0] + 5, 8, LIMA_POSITION[1] + 12],
          fov: 60,
          near: 0.1,
          far: 300,
        }}
        gl={{ antialias: true }}
      >
        <Skybox />
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 10, 5]} intensity={0.8} />
        <gridHelper args={[80, 40, "#1a7a18", "#0a3d0a"]} />
        <PeruMap />
        <RedFlagPulses />
        <ColumnaForest
          onPointerOver={(id) => setHovered(id)}
          onPointerOut={() => setHovered(null)}
          onSelect={(id) => setSelected(id)}
        />
        <OrbitControls
          target={[LIMA_POSITION[0], 0.5, LIMA_POSITION[1]]}
          minDistance={2}
          maxDistance={150}
          maxPolarAngle={Math.PI / 2 - 0.05}
          enablePan
        />
        <ContextLostListener onLost={() => setContextLost(true)} />
      </Canvas>
    </>
  );
}
