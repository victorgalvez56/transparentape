"use client";

import { useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import ColumnaForest from "./ColumnaForest";
import Skybox from "./Skybox";
import PeruMap from "./PeruMap";
import RedFlagPulses from "./RedFlagPulses";
import ContextLostListener, { ContextLostBanner } from "./ContextLostBanner";
import HudOverlay from "./HudOverlay";
import CameraController from "./CameraController";
import { useObrasVR } from "@/lib/vr/obras-source";
import { LIMA_POSITION } from "@/lib/vr/projection";
import { CITY_PRESETS, cameraForPreset } from "@/lib/vr/city-presets";

export default function AuditRoom() {
  const [contextLost, setContextLost] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [activePreset, setActivePreset] = useState<string>("lima");
  const [onlyRedFlag, setOnlyRedFlag] = useState(false);
  const [flyTo, setFlyTo] = useState<{
    target: [number, number, number];
    position: [number, number, number];
    seq: number;
  } | null>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { obras, loading } = useObrasVR();

  const handleSelectPreset = (key: string) => {
    const preset = CITY_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    const cam = cameraForPreset(preset);
    setActivePreset(key);
    setFlyTo({
      target: cam.target,
      position: cam.position,
      seq: (flyTo?.seq ?? 0) + 1,
    });
  };

  return (
    <>
      <HudOverlay
        loading={loading}
        totalObras={obras.length}
        hovered={hovered}
        selected={selected}
        obras={obras}
        onCloseSelected={() => setSelected(null)}
        presets={CITY_PRESETS}
        activePreset={activePreset}
        onSelectPreset={handleSelectPreset}
        onlyRedFlag={onlyRedFlag}
        onToggleRedFlag={() => setOnlyRedFlag((v) => !v)}
      />
      <ContextLostBanner visible={contextLost} />
      <Canvas
        camera={{
          position: [LIMA_POSITION[0] + 3, 4, LIMA_POSITION[1] + 6],
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
          onlyRedFlag={onlyRedFlag}
          onPointerOver={(id) => setHovered(id)}
          onPointerOut={() => setHovered(null)}
          onSelect={(id) => setSelected(id)}
        />
        <OrbitControls
          ref={controlsRef}
          target={[LIMA_POSITION[0], 0.5, LIMA_POSITION[1]]}
          minDistance={2}
          maxDistance={150}
          maxPolarAngle={Math.PI / 2 - 0.05}
          enablePan
        />
        <CameraController flyTo={flyTo} controlsRef={controlsRef} />
        <ContextLostListener onLost={() => setContextLost(true)} />
      </Canvas>
    </>
  );
}
