"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import Link from "next/link";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { DeviceOrientationControls } from "three-stdlib";
import {
  XR,
  createXRStore,
  useXR,
  useXRInputSourceState,
} from "@react-three/xr";
import type { Obra } from "@/lib/types";
import { formatMontoCompact, truncate } from "@/lib/vr/format";
import { usePanoLinks, type PanoLink } from "@/lib/vr/streetview-links";
import VRSessionButton from "./VRSessionButton";

/* ────────────────────────────────────────────────────────────────────────
   Visor 360° real (WebGL/WebXR). Reemplaza el widget plano de Google Street
   View — esto sí es inmersivo: una esfera equirectangular vista desde dentro,
   estéreo en Quest (WebXR) y Cardboard en móvil. Ligero: 1 esfera, sin luces,
   sin postproceso. La textura se stitchea desde los tiles oficiales del
   cliente web de Maps vía /api/streetview/tile.
   ──────────────────────────────────────────────────────────────────────── */

const xrStore = createXRStore();

type Mode = "drag" | "gyro" | "cardboard";

/** Zoom de tiles según dispositivo — "tú decides el balance" detalle/fluidez. */
function pickMaxZoom(): number {
  if (typeof navigator === "undefined") return 3;
  const mem =
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const ua = navigator.userAgent;
  const isQuest = /OculusBrowser|Quest|Pico|VR/i.test(ua);
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  if (isQuest) return 3; // headset: 4096² — nítido y fluido en GPU móvil
  if (isMobile) return mem >= 4 ? 3 : 2; // móvil: fluidez primero
  return mem >= 8 ? 4 : 3; // desktop: máximo detalle
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
      // El cleanup del efecto [tex] libera la textura anterior (swap +
      // unmount) — disponer aquí también la liberaría dos veces.
      setTex(t);
    };

    // 1) zoom 2 al instante → 2) sube al zoom del dispositivo.
    stitchPano(panoId, 2).then((cv) => {
      apply(cv);
      const target = pickMaxZoom();
      if (target > 2 && alive) stitchPano(panoId, target).then(apply);
    });

    return () => {
      alive = false;
    };
  }, [panoId, gl]);

  // Geometría invertida → se ve desde dentro, sin texto en espejo.
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(50, 60, 40);
    g.scale(-1, 1, 1);
    return g;
  }, []);

  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => tex?.dispose(), [tex]);

  // Montamos el mesh sólo con textura lista: el material nace con `map`
  // presente, evitando un recompile de shader undefined→texture.
  if (!tex) return null;

  return (
    <mesh geometry={geo}>
      <meshBasicMaterial map={tex} side={THREE.FrontSide} toneMapped={false} />
    </mesh>
  );
}

/* ── Mirar: drag (desktop/fallback) o giroscopio (móvil) ───────────────── */
function LookControls({ mode }: { mode: Mode }) {
  const { camera } = useThree();
  const inXR = useXR((s) => Boolean(s.session));
  const yaw = useRef(0);
  const pitch = useRef(0);
  const drag = useRef<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0,
    y: 0,
  });
  const doc = useRef<DeviceOrientationControls | null>(null);

  const useGyro = (mode === "gyro" || mode === "cardboard") && !inXR;

  // Giroscopio
  useEffect(() => {
    if (!useGyro || inXR) return;
    const c = new DeviceOrientationControls(camera);
    doc.current = c;
    return () => {
      c.dispose();
      doc.current = null;
    };
  }, [useGyro, inXR, camera]);

  // Drag con puntero (desktop + fallback si no hay sensor).
  // Escuchamos en window — el canvas ocupa todo el viewport (fixed inset-0).
  useEffect(() => {
    if (useGyro || inXR) return;
    const down = (e: PointerEvent) => {
      drag.current = { active: true, x: e.clientX, y: e.clientY };
    };
    const moveLook = (e: PointerEvent) => {
      if (!drag.current.active) return;
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
      yaw.current -= dx * 0.0026;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - dy * 0.0026,
        -Math.PI / 2 + 0.05,
        Math.PI / 2 - 0.05
      );
    };
    const up = () => {
      drag.current.active = false;
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", moveLook);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", moveLook);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [useGyro, inXR]);

  useFrame(() => {
    if (inXR) return; // la sesión XR controla la cámara
    if (useGyro) {
      doc.current?.update();
      return;
    }
    const e = new THREE.Euler(pitch.current, yaw.current, 0, "YXZ");
    camera.quaternion.setFromEuler(e);
  });

  return null;
}

/* ── Render estéreo Cardboard (split-screen) — sólo móvil sin headset ──── */
function CardboardRenderer() {
  const inXR = useXR((s) => Boolean(s.session));
  const stereo = useMemo(() => {
    const s = new THREE.StereoCamera();
    s.aspect = 0.5;
    return s;
  }, []);
  const size = useMemo(() => new THREE.Vector2(), []);

  useFrame(({ gl, scene, camera }) => {
    if (inXR) return;
    const cam = camera as THREE.PerspectiveCamera;
    cam.updateWorldMatrix(true, false);
    stereo.update(cam);
    // getSize → píxeles CSS; three aplica pixelRatio internamente en
    // setViewport/setScissor (getDrawingBufferSize lo duplicaría).
    gl.getSize(size);
    const w = size.x;
    const h = size.y;
    gl.setScissorTest(true);
    gl.setScissor(0, 0, w / 2, h);
    gl.setViewport(0, 0, w / 2, h);
    gl.render(scene, stereo.cameraL);
    gl.setScissor(w / 2, 0, w / 2, h);
    gl.setViewport(w / 2, 0, w / 2, h);
    gl.render(scene, stereo.cameraR);
    gl.setScissorTest(false);
  }, 1); // priority>0 → tomamos el control del render

  return null;
}

/* ── Navegación entre panoramas (caminar por la calle) ─────────────────── */

// Si la dirección de giro saliera invertida en el headset, cambia a -1.
const HEADING_SIGN = 1;

function wrap180(d: number): number {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

/** Rumbo brújula (grados) al que mira la cámara, dado el centro de imagen. */
function cameraHeadingDeg(
  camera: THREE.Camera,
  centerHeading: number
): number {
  const dir = camera.getWorldDirection(new THREE.Vector3());
  // Cámara por defecto (mira a -Z) = centro de la imagen = centerHeading.
  const sceneAz = Math.atan2(dir.x, -dir.z); // 0 al frente, +derecha
  return centerHeading + HEADING_SIGN * THREE.MathUtils.radToDeg(sceneAz);
}

/** El link más cercano a donde miras (o a tu espalda si reverse). */
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
  // Sólo si hay un link razonablemente en esa dirección (cono ~75°).
  return bestDiff <= 75 ? best : null;
}

/**
 * Avanza al panorama de delante: stick del mando en Quest, deslizar en
 * móvil, flechas/W-S en desktop, o el evento "obravr-move" del HUD.
 */
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

  const trigger = useCallback(
    (reverse: boolean) => {
      const now = performance.now();
      if (now - cooldown.current < 750) return;
      const target = chooseLink(
        links,
        cameraHeadingDeg(camera, centerHeading),
        reverse
      );
      if (!target) return;
      cooldown.current = now;
      onMove(target.pano);
    },
    [links, centerHeading, camera, onMove]
  );

  // Teclado + swipe + botones del HUD (no-XR).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowup" || k === "w") trigger(false);
      else if (k === "arrowdown" || k === "s") trigger(true);
    };
    let touchY: number | null = null;
    const onTS = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
    };
    const onTE = (e: TouchEvent) => {
      if (touchY == null) return;
      const dy = (e.changedTouches[0]?.clientY ?? touchY) - touchY;
      if (dy < -60) trigger(false);
      else if (dy > 60) trigger(true);
      touchY = null;
    };
    const onHud = (e: Event) =>
      trigger(Boolean((e as CustomEvent).detail?.reverse));
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTS, { passive: true });
    window.addEventListener("touchend", onTE, { passive: true });
    window.addEventListener("obravr-move", onHud as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTS);
      window.removeEventListener("touchend", onTE);
      window.removeEventListener("obravr-move", onHud as EventListener);
    };
  }, [trigger]);

  // Stick del mando (Quest): adelante = avanzar, atrás = retroceder.
  useFrame(() => {
    const ts =
      right?.gamepad?.["xr-standard-thumbstick"] ??
      left?.gamepad?.["xr-standard-thumbstick"];
    const y = ts?.yAxis ?? 0;
    if (y < -0.65) trigger(false);
    else if (y > 0.65) trigger(true);
  });

  return null;
}

/* ── HUD detector de sesión XR (vive dentro del Canvas) ────────────────── */
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

export default function ObraVR({
  obra,
  panoId,
  beforePanoId,
  afterPanoId,
  beforeDate,
  afterDate,
}: Props) {
  const hasHistory = Boolean(
    beforePanoId && afterPanoId && beforePanoId !== afterPanoId
  );
  const [showBefore, setShowBefore] = useState(false);
  const [mode, setMode] = useState<Mode>("drag");
  const [inXR, setInXR] = useState(false);

  const isTouch =
    typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0);

  // Pano canónico de la obra (antes/después) …
  const baseId = hasHistory
    ? showBefore
      ? beforePanoId!
      : afterPanoId!
    : panoId;
  // … o el pano al que el usuario caminó.
  const [navPano, setNavPano] = useState<string | null>(null);
  const displayedPano = navPano ?? baseId;

  const { links, centerHeading } = usePanoLinks(displayedPano);

  const monto =
    obra.contract_amount ?? obra.award_amount ?? obra.tender_amount ?? 0;

  // Antes/Después vuelve al pano de la obra (sale del recorrido).
  const switchPano = useCallback((before: boolean) => {
    setNavPano(null);
    setShowBefore(before);
  }, []);

  // iOS exige permiso de sensor desde un gesto del usuario.
  const enableGyro = useCallback(async (m: "gyro" | "cardboard") => {
    const DOE = (
      window as unknown as {
        DeviceOrientationEvent?: {
          requestPermission?: () => Promise<"granted" | "denied">;
        };
      }
    ).DeviceOrientationEvent;
    if (DOE?.requestPermission) {
      try {
        const r = await DOE.requestPermission();
        if (r !== "granted") return;
      } catch {
        return;
      }
    }
    setMode(m);
  }, []);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <Canvas
        camera={{ position: [0, 0, 0.01], fov: 75, near: 0.05, far: 120 }}
        gl={{
          antialias: false,
          powerPreference: "high-performance",
        }}
        dpr={[1, 1.75]}
        frameloop="always"
      >
        <XR store={xrStore}>
          <XRBridge onChange={setInXR} />
          <PanoSphere panoId={displayedPano} />
          <LookControls mode={mode} />
          <NavController
            links={links}
            centerHeading={centerHeading}
            onMove={setNavPano}
          />
          {mode === "cardboard" && !inXR && <CardboardRenderer />}
        </XR>
      </Canvas>

      {/* Botón ENTRAR EN VR (Quest / headsets WebXR) */}
      <VRSessionButton store={xrStore} />

      {/* Top bar */}
      {!inXR && (
        <header
          className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-6 py-5 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)",
          }}
        >
          <div className="flex items-baseline gap-3">
            <span
              className="text-[18px] leading-none font-medium tracking-tight text-white"
              style={{ fontFamily: "var(--font-display), serif" }}
            >
              Transparentape
              <span className="text-[var(--brand)]">.</span>
            </span>
            <span
              className="text-[9px] uppercase tracking-[0.28em] text-white/35"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Vista inmersiva 360°
            </span>
          </div>
          <nav
            className="pointer-events-auto flex items-center gap-5"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            <Link
              href="/vr"
              className="text-[10px] uppercase tracking-[0.2em] text-white/50 hover:text-white transition"
            >
              ← Obras
            </Link>
            <Link
              href="/"
              className="text-[10px] uppercase tracking-[0.2em] text-white/30 hover:text-white transition"
            >
              Mapa
            </Link>
          </nav>
        </header>
      )}

      {/* Controles de visión (móvil) */}
      {!inXR && isTouch && (
        <div
          className="absolute top-1/2 right-5 z-10 -translate-y-1/2 flex flex-col gap-2"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {[
            { k: "gyro" as const, label: "Sensor" },
            { k: "cardboard" as const, label: "Cardboard" },
            { k: "drag" as const, label: "Tocar" },
          ].map(({ k, label }) => (
            <button
              key={k}
              onClick={() =>
                k === "drag" ? setMode("drag") : enableGyro(k)
              }
              className={`px-3 py-2 text-[10px] uppercase tracking-[0.16em] border transition ${
                mode === k
                  ? "bg-[var(--brand)] text-black border-[var(--brand)]"
                  : "text-white/55 border-white/15 hover:text-white hover:border-white/35"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Navegación entre panoramas (caminar) — no-XR */}
      {!inXR && links.length > 0 && (
        <div
          className="absolute bottom-32 inset-x-0 z-10 flex flex-col items-center gap-2 pointer-events-none"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              aria-label="Avanzar"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("obravr-move", { detail: { reverse: false } })
                )
              }
              className="w-11 h-11 flex items-center justify-center text-[16px] bg-[var(--brand)] text-black border border-[var(--brand)] hover:bg-white transition"
            >
              ▲
            </button>
            <button
              aria-label="Retroceder"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("obravr-move", { detail: { reverse: true } })
                )
              }
              className="w-11 h-11 flex items-center justify-center text-[16px] text-white/60 border border-white/15 hover:text-white hover:border-white/35 transition"
            >
              ▼
            </button>
            {navPano && (
              <button
                onClick={() => setNavPano(null)}
                className="ml-1 px-3 h-11 text-[10px] uppercase tracking-[0.16em] text-white/55 border border-white/15 hover:text-white hover:border-white/35 transition"
              >
                Volver a la obra
              </button>
            )}
          </div>
          <span className="text-[9px] uppercase tracking-[0.24em] text-white/35">
            Mira y avanza · stick / desliza ↑ / ↑↓
          </span>
        </div>
      )}

      {/* Panel de la obra + Antes/Después */}
      {!inXR && (
        <footer
          className="absolute bottom-0 inset-x-0 z-10 px-6 py-6 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)",
          }}
        >
          <div
            className="max-w-lg"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            {obra.is_red_flag && (
              <div className="mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--alarm)] animate-pulse" />
                <span className="text-[10px] uppercase tracking-[0.28em] text-[var(--alarm)]">
                  Alerta OECE · Proveedor sancionado
                </span>
              </div>
            )}
            <p
              className="text-white text-[15px] leading-snug mb-3"
              style={{ fontFamily: "var(--font-body), sans-serif" }}
            >
              {truncate(obra.tender_title ?? "Sin título", 130)}
            </p>
            <div className="flex items-baseline gap-4 mb-4">
              <span
                className={`text-[22px] tabular-nums ${
                  obra.is_red_flag
                    ? "text-[var(--alarm)]"
                    : "text-[var(--brand)]"
                }`}
              >
                {formatMontoCompact(monto)}
              </span>
              {obra.buyer_locality && (
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                  {obra.buyer_locality}
                </span>
              )}
              {obra.source_year && (
                <span className="text-[10px] text-white/25">
                  {obra.source_year}
                </span>
              )}
            </div>

            {hasHistory && (
              <div className="pointer-events-auto flex items-center gap-2">
                <button
                  onClick={() => switchPano(true)}
                  className={`px-4 py-2 text-[10px] uppercase tracking-[0.18em] border transition ${
                    showBefore
                      ? "bg-white/90 text-black border-white"
                      : "text-white/50 border-white/15 hover:text-white hover:border-white/35"
                  }`}
                >
                  Antes · {beforeDate ?? "—"}
                </button>
                <span className="text-white/20">→</span>
                <button
                  onClick={() => switchPano(false)}
                  className={`px-4 py-2 text-[10px] uppercase tracking-[0.18em] border transition ${
                    !showBefore
                      ? "bg-[var(--brand)] text-black border-[var(--brand)]"
                      : "text-white/50 border-white/15 hover:text-white hover:border-white/35"
                  }`}
                >
                  Después · {afterDate ?? "—"}
                </button>
              </div>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
