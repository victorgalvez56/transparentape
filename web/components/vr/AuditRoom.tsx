"use client";

import { useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";
import type { Group, Vector3 } from "three";
import Floor from "./Floor";
import Skybox from "./Skybox";
import ColumnaForest from "./ColumnaForest";
import EnterVRButton from "./EnterVRButton";
import Player from "./Player";
import ObraPanel from "./ObraPanel";
import AmbientAudio from "./AmbientAudio";
import TimelineYears from "./TimelineYears";

const store = createXRStore({
  controller: true,
  hand: true,
});

export default function AuditRoom() {
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const playerRef = useRef<Group>(null);

  const handleTeleport = (point: Vector3) => {
    if (!playerRef.current) return;
    playerRef.current.position.set(point.x, point.y, point.z);
  };

  return (
    <>
      <EnterVRButton store={store} hovered={hovered} selected={selected} />
      <Canvas
        camera={{ position: [0, 1.6, 6], fov: 75, near: 0.1, far: 200 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <XR store={store}>
          <Skybox />
          <ambientLight intensity={0.2} />
          <directionalLight
            position={[10, 20, 5]}
            intensity={0.5}
            color="#ffffff"
          />
          <Player ref={playerRef} />
          <Floor onTeleport={handleTeleport} />
          <ColumnaForest
            yearFilter={yearFilter}
            onPointerOver={(id) => setHovered(id)}
            onPointerOut={() => setHovered(null)}
            onSelect={(id) => setSelected(id)}
          />
          <TimelineYears year={yearFilter} onChange={setYearFilter} />
          {/* Panel encima de la columna apuntada */}
          {hovered != null && hovered !== selected && (
            <ObraPanel obraId={hovered} variant="hover" />
          )}
          {/* Panel destacado de la seleccionada */}
          {selected != null && <ObraPanel obraId={selected} variant="selected" />}
          {/* Audio ambiental: zumbido proporcional a la corrupción cercana */}
          <AmbientAudio />
        </XR>
      </Canvas>
    </>
  );
}
