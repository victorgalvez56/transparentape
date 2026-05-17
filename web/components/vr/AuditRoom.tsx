"use client";

import { useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";
import DesktopControls from "./DesktopControls";
import type { Group, Vector3 } from "three";
import Floor from "./Floor";
import Skybox from "./Skybox";
import ColumnaForest from "./ColumnaForest";
import EnterVRButton from "./EnterVRButton";
import Player from "./Player";
import ObraPanel from "./ObraPanel";
import AmbientAudio from "./AmbientAudio";
import TimelineYears from "./TimelineYears";
import GeoLabels from "./GeoLabels";
import Postprocessing from "./Postprocessing";
import Narrator from "./Narrator";
import MultiplayerProvider from "./MultiplayerProvider";
import PresenceTracker from "./PresenceTracker";
import RemoteAvatars from "./RemoteAvatars";
import RedFlagPulses from "./RedFlagPulses";
import ConnectionStatus from "./ConnectionStatus";
import LoadingOverlay from "./LoadingOverlay";
import { useObrasVR } from "@/lib/vr/obras-source";
import { projectToFloor } from "@/lib/vr/projection";

const store = createXRStore({
  controller: true,
  hand: true,
  // iwer auto-emulator habilitado. Su bug de null en getParameter
  // (COLOR_CLEAR_VALUE) lo parcheamos via scripts/patch-iwer.mjs en postinstall.
});

export default function AuditRoom() {
  return (
    <MultiplayerProvider>
      <AuditRoomScene />
    </MultiplayerProvider>
  );
}

function AuditRoomScene() {
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const playerRef = useRef<Group>(null);
  const { obras, loading } = useObrasVR();

  const handleTeleport = (point: Vector3) => {
    if (!playerRef.current) return;
    playerRef.current.position.set(point.x, point.y, point.z);
  };

  const goToNearestRedFlag = () => {
    if (!playerRef.current || obras.length === 0) return;
    const pos = playerRef.current.position;
    let bestId: number | null = null;
    let bestX = 0;
    let bestZ = 0;
    let minD2 = Infinity;
    for (const o of obras) {
      if (!o.is_red_flag) continue;
      const [x, z] = projectToFloor(o.lng, o.lat);
      const d2 = (x - pos.x) ** 2 + (z - pos.z) ** 2;
      if (d2 < minD2) {
        minD2 = d2;
        bestId = o.id;
        bestX = x;
        bestZ = z;
      }
    }
    if (bestId == null) return;
    // Aterrizamos a 2m al sur de la obra para que quede en frente
    playerRef.current.position.set(bestX, 0, bestZ + 2);
    setSelected(bestId);
  };

  // Lo que estoy mirando ahora se broadcastea como pointingObraId
  const myPointing = selected ?? hovered;

  return (
    <>
      <EnterVRButton
        store={store}
        hovered={hovered}
        selected={selected}
        onFindAlert={goToNearestRedFlag}
        totalObras={obras.length}
      />
      <ConnectionStatus />
      <LoadingOverlay loading={loading} count={obras.length} />
      <Narrator selectedId={selected} />
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
          <GeoLabels />
          <RedFlagPulses />
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
          {/* Multiplayer — avatares + tracking de mi presencia */}
          <PresenceTracker pointingObraId={myPointing} />
          <RemoteAvatars />
          {/* Bloom solo en desktop (postproc no plays well con XR) */}
          <Postprocessing />
          {/* Drag-rotate + wheel-zoom para inspeccionar en navegador */}
          <DesktopControls />
        </XR>
      </Canvas>
    </>
  );
}
