"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { XR, createXRStore, useXR, XROrigin } from "@react-three/xr";
import VRSessionButton from "./VRSessionButton";
import ColumnaForest from "./ColumnaForest";
import Skybox from "./Skybox";
import Globe from "./Globe";
import RedFlagPulses from "./RedFlagPulses";
import ContextLostListener, { ContextLostBanner } from "./ContextLostBanner";
import HudOverlay from "./HudOverlay";
import CameraController from "./CameraController";
import { useObrasVR } from "@/lib/vr/obras-source";
import { montoToHeight } from "@/lib/vr/projection";
import {
  GLOBE_RADIUS,
  lngLatToVec3,
  getNormal,
} from "@/lib/vr/sphere-projection";
import { CITY_PRESETS, cameraForPreset } from "@/lib/vr/city-presets";

// WebXR store — creado una vez. /vr ahora abre sesión inmersiva real,
// detectable por headsets (Quest, Vision Pro, …), no sólo una página web.
const xrStore = createXRStore();

/** OrbitControls de desktop — se desactiva al entrar en sesión XR. */
function OrbitGate({
  controlsRef,
  target,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  target: [number, number, number];
}) {
  const inXR = useXR((s) => Boolean(s.session));
  return (
    <OrbitControls
      ref={controlsRef}
      target={target}
      enabled={!inXR}
      minDistance={GLOBE_RADIUS + 1.5}
      maxDistance={GLOBE_RADIUS * 6}
      enablePan={false}
      enableDamping
      dampingFactor={0.06}
    />
  );
}

export default function AuditRoom() {
  const [contextLost, setContextLost] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [activePreset, setActivePreset] = useState<string>("peru");
  const [onlyRedFlag, setOnlyRedFlag] = useState(false);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [tourPlaying, setTourPlaying] = useState(false);
  const [flyTo, setFlyTo] = useState<{
    target: [number, number, number];
    position: [number, number, number];
    seq: number;
  } | null>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { obras, loading } = useObrasVR();

  // Cámara inicial: Lima, rasante e inmersiva
  const initialCam = cameraForPreset(CITY_PRESETS[1]);

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

  // Click columna → seleccionar + fly camera radial cerca de esa obra
  const handleSelectObra = (id: number) => {
    setSelected(id);
    const obra = obras.find((o) => o.id === id);
    if (!obra) return;
    const surface = lngLatToVec3(obra.lng, obra.lat, GLOBE_RADIUS);
    const normal = getNormal(obra.lng, obra.lat);
    const h = montoToHeight(obra.monto) * 2.5;
    // Posicion del cilindro
    const target = surface
      .clone()
      .add(normal.clone().multiplyScalar(h / 2));
    // Camara a 6m al lado del cilindro
    const camPos = surface.clone().add(normal.clone().multiplyScalar(h + 6));
    setFlyTo({
      target: [target.x, target.y, target.z],
      position: [camPos.x, camPos.y, camPos.z],
      seq: (flyTo?.seq ?? 0) + 1,
    });
  };

  // Años disponibles en el dataset
  const availableYears = (() => {
    const set = new Set<number>();
    for (const o of obras) if (o.source_year != null) set.add(o.source_year);
    return [...set].sort((a, b) => b - a);
  })();

  // Auto-tour: recorre los presets cada 4.5s mientras tourPlaying
  useEffect(() => {
    if (!tourPlaying) return;
    let idx = CITY_PRESETS.findIndex((p) => p.key === activePreset);
    const advance = () => {
      idx = (idx + 1) % CITY_PRESETS.length;
      handleSelectPreset(CITY_PRESETS[idx].key);
    };
    const firstTick = setTimeout(advance, 100);
    const id = setInterval(advance, 4500);
    return () => {
      clearTimeout(firstTick);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourPlaying]);

  // Hotkeys: 1-6 presets, R alertas, T tour, Esc cierra
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "SELECT" ||
        target?.tagName === "TEXTAREA"
      )
        return;
      const key = e.key.toLowerCase();
      if (key >= "1" && key <= "6") {
        const idx = Number(key) - 1;
        if (idx < CITY_PRESETS.length) handleSelectPreset(CITY_PRESETS[idx].key);
      } else if (key === "r") {
        setOnlyRedFlag((v) => !v);
      } else if (key === "t") {
        setTourPlaying((v) => !v);
      } else if (key === "escape") {
        setSelected(null);
        setTourPlaying(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obras]);

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
        years={availableYears}
        yearFilter={yearFilter}
        onSelectYear={(y) => setYearFilter(y)}
        tourPlaying={tourPlaying}
        onToggleTour={() => setTourPlaying((v) => !v)}
      />
      <ContextLostBanner visible={contextLost} />
      <VRSessionButton store={xrStore} />
      <Canvas
        camera={{
          position: initialCam.position,
          fov: 60,
          near: 0.1,
          far: 800,
        }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
      >
        <XR store={xrStore}>
          <Skybox />
          <ambientLight intensity={0.5} />
          <directionalLight position={[80, 60, 40]} intensity={1.4} />
          <directionalLight position={[-40, -20, -60]} intensity={0.15} color="#1a3a6e" />
          <Globe />
          <RedFlagPulses />
          <ColumnaForest
            onlyRedFlag={onlyRedFlag}
            yearFilter={yearFilter}
            onPointerOver={(id) => setHovered(id)}
            onPointerOut={() => setHovered(null)}
            onSelect={handleSelectObra}
          />
          {/* Posición del jugador en sesión inmersiva — frente al globo */}
          <XROrigin position={initialCam.position} />
          <OrbitGate controlsRef={controlsRef} target={initialCam.target} />
          <CameraController flyTo={flyTo} controlsRef={controlsRef} />
          <ContextLostListener onLost={() => setContextLost(true)} />
        </XR>
      </Canvas>
    </>
  );
}
