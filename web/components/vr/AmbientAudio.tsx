"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useObrasVR } from "@/lib/vr/obras-source";
import { projectToFloor } from "@/lib/vr/projection";

const MAX_DISTANCE = 20; // metros
const MAX_GAIN = 0.18; // suficiente para Quest, no agresivo

/**
 * Phase 4 — Audio ambient con threshold.
 *
 * Cuanto más cerca estás de una obra con alerta OECE, más fuerte el zumbido.
 * Sine wave subsónica 55Hz (rumble) + segunda armónica desafinada para
 * sensación "menace ambiental". Inverse-linear attenuation hasta 20m.
 *
 * Inicializa el AudioContext en el primer click (Web Audio policy).
 */
export default function AmbientAudio() {
  const { obras } = useObrasVR();
  const camera = useThree((s) => s.camera);

  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  // Precomputamos las posiciones de los red flags. Iterar 10k floats por
  // frame es barato si lo hacemos como flat array, no objetos.
  const redFlagXZ = useMemo(() => {
    const arr = obras.filter((o) => o.is_red_flag);
    const flat = new Float32Array(arr.length * 2);
    for (let i = 0; i < arr.length; i++) {
      const [x, z] = projectToFloor(arr[i].lng, arr[i].lat);
      flat[i * 2] = x;
      flat[i * 2 + 1] = z;
    }
    return flat;
  }, [obras]);

  // Lazy-init del audio en primer gesto del usuario, con tolerancia a fallos.
  useEffect(() => {
    let attached = true;
    const init = () => {
      if (!attached || ctxRef.current) return;
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctx) {
          // Sin Web Audio API — degradamos silenciosamente
          return;
        }
        const ctx = new Ctx();
        // Safari/iOS pueden empezar suspended hasta resume()
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {
            /* ignore */
          });
        }
        const osc1 = ctx.createOscillator();
        osc1.type = "sine";
        osc1.frequency.value = 55;
        const osc2 = ctx.createOscillator();
        osc2.type = "sine";
        osc2.frequency.value = 56.5;
        const master = ctx.createGain();
        master.gain.value = 0;
        osc1.connect(master);
        osc2.connect(master);
        master.connect(ctx.destination);
        osc1.start();
        osc2.start();
        ctxRef.current = ctx;
        gainRef.current = master;
      } catch (e) {
        // Web Audio negado por el navegador — sin drama, solo no hay zumbido
        console.warn("AmbientAudio init failed, continuing silent:", e);
      }
    };
    window.addEventListener("click", init, { once: true });
    window.addEventListener("touchstart", init, { once: true });
    return () => {
      attached = false;
      window.removeEventListener("click", init);
      window.removeEventListener("touchstart", init);
    };
  }, []);

  // Cada frame: distancia al red flag más cercano → gain
  const headWorld = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const gainNode = gainRef.current;
    const ctx = ctxRef.current;
    if (!gainNode || !ctx || redFlagXZ.length === 0) return;
    camera.getWorldPosition(headWorld);
    const px = headWorld.x;
    const pz = headWorld.z;
    let minD2 = Infinity;
    for (let i = 0; i < redFlagXZ.length; i += 2) {
      const dx = redFlagXZ[i] - px;
      const dz = redFlagXZ[i + 1] - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD2) minD2 = d2;
    }
    const d = Math.sqrt(minD2);
    const target =
      d > MAX_DISTANCE ? 0 : Math.max(0, MAX_GAIN * (1 - d / MAX_DISTANCE));
    gainNode.gain.setTargetAtTime(target, ctx.currentTime, 0.25);
  });

  return null;
}
