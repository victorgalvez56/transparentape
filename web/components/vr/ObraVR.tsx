"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  XR,
  createXRStore,
  useXR,
  useXRInputSourceState,
} from "@react-three/xr";
import type { Obra } from "@/lib/types";
import { usePanoLinks, type PanoLink } from "@/lib/vr/streetview-links";
import VRSessionButton from "./VRSessionButton";
import GoogleStreetView from "./GoogleStreetView";

/* ────────────────────────────────────────────────────────────────────────
   HÍBRIDO:
   - Por defecto (desktop/móvil): Street View REAL de Google — navegable,
     nítido, "como si estuvieras ahí" (componente GoogleStreetView).
   - Al pulsar ENTRAR EN VR en un headset: conmuta a la esfera WebXR
     equirectangular inmersiva (estéreo real). Google SV no es WebXR, por eso
     se necesita la esfera sólo para el modo inmersivo.
   ──────────────────────────────────────────────────────────────────────── */

const xrStore = createXRStore();

/** Zoom de tiles según dispositivo del headset. */
function pickMaxZoom(): number {
  if (typeof navigator === "undefined") return 3;
  const mem =
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const ua = navigator.userAgent;
  const isQuest = /OculusBrowser|Quest|Pico|VR/i.test(ua);
  if (isQuest) return 3; // 4096² — nítido y fluido en GPU móvil
  return mem >= 8 ? 4 : 3;
}

async function fetchTile(
  pano: string,
  x: number,
  y: number,
  zoom: number
): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(
      `/api/streetview/tile?pano=${encodeURIComponent(
        pano
      )}&x=${x}&y=${y}&zoom=${zoom}`
    );
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

/** Stitchea el grid de tiles (cols=2^z, rows=2^(z-1)) en un canvas equirect. */
async function stitchPano(
  pano: string,
  zoom: number
): Promise<HTMLCanvasElement> {
  const cols = 1 << zoom;
  const rows = 1 << Math.max(0, zoom - 1);
  const cv = document.createElement("canvas");
  cv.width = cols * 512;
  cv.height = rows * 512;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, cv.width, cv.height);
  const jobs: Promise<void>[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      jobs.push(
        fetchTile(pano, x, y, zoom).then((bmp) => {
          if (bmp) {
            ctx.drawImage(bmp, x * 512, y * 512);
            bmp.close();
          }
        })
      );
    }
  }
  await Promise.all(jobs);
  return cv;
}

/* ── La esfera panorámica con carga progresiva ─────────────────────────── */
function PanoSphere({ panoId }: { panoId: string }) {
  const { gl } = useThree();
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let alive = true;
    const maxAniso = gl.capabilities.getMaxAnisotropy();

    const apply = (cv: HTMLCanvasElement) => {
      if (!alive) return;
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      t.anisotropy = Math.min(8, maxAniso);
      // El cleanup del efecto [tex] libera la anterior (swap + unmount).
      setTex(t);
    };

    stitchPano(panoId, 2).then((cv) => {
      apply(cv);
      const target = pickMaxZoom();
      if (target > 2 && alive) stitchPano(panoId, target).then(apply);
    });

    return () => {
      alive = false;
    };
  }, [panoId, gl]);

  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(50, 60, 40);
    g.scale(-1, 1, 1); // visto desde dentro, sin texto en espejo
    return g;
  }, []);

  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => tex?.dispose(), [tex]);

  if (!tex) return null;

  return (
    <mesh geometry={geo}>
      <meshBasicMaterial map={tex} side={THREE.FrontSide} toneMapped={false} />
    </mesh>
  );
}

/* ── Navegación entre panoramas (caminar) — sólo en VR ─────────────────── */

// Si la dirección de giro saliera invertida en el headset, cambia a -1.
const HEADING_SIGN = 1;

function wrap180(d: number): number {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

function cameraHeadingDeg(camera: THREE.Camera, centerHeading: number): number {
  const dir = camera.getWorldDirection(new THREE.Vector3());
  const sceneAz = Math.atan2(dir.x, -dir.z); // 0 al frente, +derecha
  return centerHeading + HEADING_SIGN * THREE.MathUtils.radToDeg(sceneAz);
}

function chooseLink(
  links: PanoLink[],
  viewHeading: number,
  reverse: boolean
): PanoLink | null {
  if (links.length === 0) return null;
  const target = reverse ? viewHeading + 180 : viewHeading;
  let best: PanoLink | null = null;
  let bestDiff = Infinity;
  for (const l of links) {
    const diff = Math.abs(wrap180(l.heading - target));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = l;
    }
  }
  return bestDiff <= 75 ? best : null;
}

/** Avanza al panorama de delante: stick del mando del headset. */
function NavController({
  links,
  centerHeading,
  onMove,
}: {
  links: PanoLink[];
  centerHeading: number;
  onMove: (pano: string) => void;
}) {
  const { camera } = useThree();
  const right = useXRInputSourceState("controller", "right");
  const left = useXRInputSourceState("controller", "left");
  const cooldown = useRef(0);

  useFrame(() => {
    const ts =
      right?.gamepad?.["xr-standard-thumbstick"] ??
      left?.gamepad?.["xr-standard-thumbstick"];
    const y = ts?.yAxis ?? 0;
    if (Math.abs(y) < 0.65) return;
    const now = performance.now();
    if (now - cooldown.current < 750) return;
    const target = chooseLink(
      links,
      cameraHeadingDeg(camera, centerHeading),
      y > 0
    );
    if (!target) return;
    cooldown.current = now;
    onMove(target.pano);
  });

  return null;
}

/* ── Detector de sesión XR (vive dentro del Canvas) ────────────────────── */
function XRBridge({ onChange }: { onChange: (b: boolean) => void }) {
  const inXR = useXR((s) => Boolean(s.session));
  useEffect(() => onChange(inXR), [inXR, onChange]);
  return null;
}

/* ════════════════════════════ COMPONENTE ═════════════════════════════ */
interface Props {
  obra: Obra;
  panoId: string;
  beforePanoId?: string;
  afterPanoId?: string;
  beforeDate?: string;
  afterDate?: string;
}

export default function ObraVR(props: Props) {
  const { panoId, afterPanoId } = props;
  const [inXR, setInXR] = useState(false);

  // En VR: pano canónico de la obra, o al que el usuario caminó.
  const spherePano = afterPanoId ?? panoId;
  const [navPano, setNavPano] = useState<string | null>(null);
  const displayed = navPano ?? spherePano;

  // Sólo pedimos el grafo de links cuando estamos en el headset.
  const { links, centerHeading } = usePanoLinks(inXR ? displayed : null);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* Canvas WebXR — SIEMPRE montado para que enterVR() funcione desde
          el gesto del usuario; oculto y vacío mientras no estás en VR. */}
      <div
        className={
          inXR
            ? "absolute inset-0 z-20"
            : "absolute inset-0 -z-10 opacity-0 pointer-events-none"
        }
      >
        <Canvas
          camera={{ position: [0, 0, 0.01], fov: 75, near: 0.05, far: 120 }}
          gl={{ antialias: false, powerPreference: "high-performance" }}
          dpr={[1, 1.75]}
          frameloop="always"
        >
          <XR store={xrStore}>
            <XRBridge onChange={setInXR} />
            {inXR && (
              <>
                <PanoSphere panoId={displayed} />
                <NavController
                  links={links}
                  centerHeading={centerHeading}
                  onMove={setNavPano}
                />
              </>
            )}
          </XR>
        </Canvas>
      </div>

      {/* Street View REAL de Google — la experiencia por defecto */}
      {!inXR && <GoogleStreetView {...props} />}

      {/* Botón ENTRAR EN VR (Quest / headsets WebXR) */}
      {!inXR && <VRSessionButton store={xrStore} />}
    </div>
  );
}
