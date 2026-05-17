"use client";

import createGlobe from "cobe";
import { useEffect, useRef, useCallback } from "react";
import { Obra, riesgoDeObra } from "@/lib/types";
import { displayTitle, fmtSoles, truncar } from "@/lib/format";

interface Props {
  obras: Obra[];
  selectedId: number | null;
  onSelect: (o: Obra | null) => void;
  theme: "light" | "dark";
}

/** Cap de markers en el globo — muestreo denso del set filtrado (~62k). */
const MAX_MARKERS = 1500;

/** Centroide por defecto: Sudamérica / Perú (los datos están concentrados acá). */
const DEFAULT_FOCUS: [number, number] = [-12, -72];

function locationToAngles(lat: number, lng: number): [number, number] {
  return [
    Math.PI - ((lng * Math.PI) / 180 - Math.PI / 2),
    (lat * Math.PI) / 180,
  ];
}

function isFrontFace(
  lat: number,
  lng: number,
  phi: number,
  theta: number
): boolean {
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180 - Math.PI;
  const cosLat = Math.cos(latRad);
  const x = -cosLat * Math.cos(lngRad);
  const y = Math.sin(latRad);
  const z = cosLat * Math.sin(lngRad);
  return (
    -Math.sin(phi) * Math.cos(theta) * x +
      Math.sin(theta) * y +
      Math.cos(phi) * Math.cos(theta) * z >=
    0
  );
}

/**
 * Valores de tema tomados del reference (crafter-station/codex-globe) — son
 * los que producen el aspecto del screenshot. mapSamples subido para
 * continentes más detallados.
 */
const THEME = {
  dark: {
    dark: 1 as const,
    diffuse: 2.5,
    mapBrightness: 4,
    mapBaseBrightness: 0.02,
    baseColor: [0.12, 0.12, 0.14] as [number, number, number],
    markerColor: [0.2, 0.78, 0.5] as [number, number, number],
    glowColor: [0.05, 0.05, 0.08] as [number, number, number],
    opacity: 0.85,
  },
  light: {
    dark: 0 as const,
    diffuse: 3,
    mapBrightness: 6,
    mapBaseBrightness: 0.1,
    baseColor: [0.92, 0.92, 0.94] as [number, number, number],
    markerColor: [0.09, 0.6, 0.38] as [number, number, number],
    glowColor: [0.95, 0.95, 0.98] as [number, number, number],
    opacity: 0.9,
  },
};

const RED_FLAG_RGB: [number, number, number] = [0.94, 0.27, 0.27];
const SELECTED_RGB: [number, number, number] = [0.08, 0.85, 0.55];

interface LabelState {
  el: HTMLElement;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  currentOpacity: number;
  targetOpacity: number;
}

/** Markers que se dibujan: el seleccionado siempre incluido + muestreo del resto. */
function pickMarkerObras(obras: Obra[], selectedId: number | null): Obra[] {
  const withCoords = obras.filter((o) => o.lat != null && o.lng != null);
  if (withCoords.length <= MAX_MARKERS) return withCoords;
  // Priorizar red flags + seleccionado, luego muestreo uniforme del resto.
  const sel = withCoords.filter((o) => o.id === selectedId);
  const flags = withCoords.filter(
    (o) => o.is_red_flag && o.id !== selectedId
  );
  const rest = withCoords.filter(
    (o) => !o.is_red_flag && o.id !== selectedId
  );
  const budget = Math.max(0, MAX_MARKERS - sel.length - flags.length);
  const step = rest.length / budget;
  const sampled: Obra[] = [];
  for (let i = 0; i < budget; i++) sampled.push(rest[Math.floor(i * step)]);
  return [...sel, ...flags.slice(0, MAX_MARKERS), ...sampled];
}

export default function CodexGlobe({
  obras,
  selectedId,
  onSelect,
  theme,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(locationToAngles(...DEFAULT_FOCUS)[0]);
  const thetaRef = useRef(locationToAngles(...DEFAULT_FOCUS)[1]);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);
  const hoveredLabel = useRef(false);
  const focusRef = useRef<[number, number] | null>(null);
  const gsRef = useRef(0);
  const hoveredIdRef = useRef<number | null>(null);

  const markerObrasRef = useRef<Obra[]>([]);
  markerObrasRef.current = pickMarkerObras(obras, selectedId);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const config = THEME[theme];

  // Foco hacia el marker seleccionado.
  useEffect(() => {
    if (selectedId == null) {
      focusRef.current = null;
      return;
    }
    const o = obras.find((x) => x.id === selectedId);
    if (o?.lat != null && o?.lng != null) {
      focusRef.current = locationToAngles(Number(o.lat), Number(o.lng));
    }
  }, [selectedId, obras]);

  const handleClick = useCallback((o: Obra) => {
    if (selectedIdRef.current === o.id) onSelectRef.current(null);
    else onSelectRef.current(o);
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const measure = () => {
      gsRef.current = wrapper.offsetWidth;
    };
    measure();
    window.addEventListener("resize", measure);

    const dpr = Math.min(window.devicePixelRatio, 2);
    const gs0 = gsRef.current || 600;

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: gs0 * dpr,
      height: gs0 * dpr,
      phi: phiRef.current,
      theta: thetaRef.current,
      dark: config.dark,
      diffuse: config.diffuse,
      mapSamples: 22000,
      mapBrightness: config.mapBrightness,
      mapBaseBrightness: config.mapBaseBrightness,
      baseColor: config.baseColor,
      markerColor: config.markerColor,
      glowColor: config.glowColor,
      markers: [],
      scale: 1,
      offset: [0, 0],
      opacity: config.opacity,
      markerElevation: 0.05,
    });

    const labelStates = new Map<number, LabelState>();
    const LERP = 0.18;

    const buildLabel = (o: Obra): LabelState => {
      const existing = labelStates.get(o.id);
      if (existing) return existing;

      const riesgo = riesgoDeObra(o);
      const dotColor =
        riesgo === "alto"
          ? "var(--cx-alarm)"
          : riesgo === "medio"
            ? "var(--cx-warn)"
            : "var(--cx-brand)";

      const el = document.createElement("div");
      el.style.cssText =
        "position:absolute;z-index:20;pointer-events:auto;transform:translate(-50%,-100%);opacity:0;display:none;cursor:pointer;margin-top:-14px;will-change:transform,opacity;max-width:280px";

      const inner = document.createElement("div");
      inner.style.cssText =
        "display:flex;align-items:flex-start;gap:9px;padding:9px 12px;border-radius:12px;border:1px solid var(--cx-border);background:var(--cx-card);box-shadow:var(--cx-shadow);backdrop-filter:blur(10px);color:var(--cx-fg)";

      const dot = document.createElement("span");
      dot.style.cssText = `width:8px;height:8px;border-radius:9999px;background:${dotColor};flex-shrink:0;margin-top:5px`;

      const info = document.createElement("div");
      info.style.cssText = "display:flex;flex-direction:column;gap:3px;min-width:0";

      const title = document.createElement("span");
      title.textContent = truncar(displayTitle(o), 64);
      title.style.cssText =
        "font-size:12.5px;font-weight:600;line-height:1.25;white-space:normal";

      const meta = document.createElement("span");
      const loc = [o.buyer_locality, o.buyer_region].filter(Boolean)[0] ?? "—";
      meta.textContent = `${loc} · ${fmtSoles(
        o.contract_amount ?? o.award_amount ?? o.tender_amount
      )}`;
      meta.style.cssText =
        "font-size:11px;line-height:1.2;color:var(--cx-muted);font-family:var(--font-mono),monospace";

      info.append(title, meta);
      inner.append(dot, info);
      el.appendChild(inner);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        handleClick(o);
      });
      el.addEventListener("mouseenter", () => {
        hoveredLabel.current = true;
      });
      el.addEventListener("mouseleave", () => {
        hoveredLabel.current = false;
      });
      wrapper.appendChild(el);

      const state: LabelState = {
        el,
        currentX: 0,
        currentY: 0,
        targetX: 0,
        targetY: 0,
        currentOpacity: 0,
        targetOpacity: 0,
      };
      labelStates.set(o.id, state);
      return state;
    };

    const hitZones = new Map<number, HTMLElement>();
    const createHitZone = (o: Obra): HTMLElement => {
      const existing = hitZones.get(o.id);
      if (existing) return existing;
      const el = document.createElement("div");
      el.style.cssText =
        "position:absolute;width:22px;height:22px;transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer;z-index:15;border-radius:50%";
      el.addEventListener("mouseenter", () => {
        hoveredIdRef.current = o.id;
        hoveredLabel.current = true;
      });
      el.addEventListener("mouseleave", () => {
        hoveredIdRef.current = null;
        hoveredLabel.current = false;
      });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        handleClick(o);
      });
      wrapper.appendChild(el);
      hitZones.set(o.id, el);
      return el;
    };

    const doublePi = Math.PI * 2;
    let rafId: number;
    let frameCount = 0;

    const animate = () => {
      const focus = focusRef.current;
      const markerObras = markerObrasRef.current;
      const selId = selectedIdRef.current;
      const gs = gsRef.current;

      if (focus) {
        const [fp, ft] = focus;
        const dp = (fp - phiRef.current + doublePi) % doublePi;
        const dn = (phiRef.current - fp + doublePi) % doublePi;
        if (dp < dn) phiRef.current += dp * 0.08;
        else phiRef.current -= dn * 0.08;
        thetaRef.current = thetaRef.current * 0.92 + ft * 0.08;
      } else if (!pointerInteracting.current && !hoveredLabel.current) {
        phiRef.current += 0.0016;
      }

      const curPhi = phiRef.current + pointerInteractionMovement.current / 200;

      globe.update({
        phi: curPhi,
        theta: thetaRef.current,
        width: gs * dpr,
        height: gs * dpr,
        markers: markerObras.map((o, i) => {
          const isSel = o.id === selId;
          return {
            location: [Number(o.lat), Number(o.lng)] as [number, number],
            size: isSel ? 0.09 : o.is_red_flag ? 0.05 : 0.04,
            id: `obra-${i}`,
            color: isSel
              ? SELECTED_RGB
              : o.is_red_flag
                ? RED_FLAG_RGB
                : undefined,
          };
        }),
      });

      frameCount++;
      if (frameCount % 6 === 0 && gs > 0) {
        const anchors = wrapper.querySelectorAll<HTMLElement>(
          'div[style*="anchor-name"]'
        );
        const anchorMap = new Map<number, { lp: number; tp: number }>();
        anchors.forEach((a) => {
          const nm =
            a.style.getPropertyValue("anchor-name") ||
            (a.style as unknown as Record<string, string>)["anchorName"] ||
            "";
          const m = nm.match(/--cobe-obra-(\d+)/);
          if (!m) return;
          const l = parseFloat(a.style.left);
          const t = parseFloat(a.style.top);
          if (!Number.isNaN(l) && !Number.isNaN(t))
            anchorMap.set(parseInt(m[1]), { lp: l, tp: t });
        });

        const hovered = hoveredIdRef.current;
        const activeHitKeys = new Set<number>();
        const showLabelKeys = new Set<number>();

        for (let i = 0; i < markerObras.length; i++) {
          const ap = anchorMap.get(i);
          if (!ap) continue;
          const o = markerObras[i];
          const front = isFrontFace(
            Number(o.lat),
            Number(o.lng),
            curPhi,
            thetaRef.current
          );
          const x = (ap.lp / 100) * gs;
          const y = (ap.tp / 100) * gs;

          if (front) {
            activeHitKeys.add(o.id);
            const hz = createHitZone(o);
            hz.style.left = `${x}px`;
            hz.style.top = `${y}px`;
            hz.style.display = "";

            if (selId === o.id || hovered === o.id) {
              showLabelKeys.add(o.id);
              const state = buildLabel(o);
              state.targetX = x;
              state.targetY = y - 14;
              state.targetOpacity = 1;
              state.el.style.display = "";
              state.el.style.pointerEvents = "auto";
            }
          }
        }

        for (const [key, el] of hitZones) {
          if (!activeHitKeys.has(key)) el.style.display = "none";
        }
        for (const [key, state] of labelStates) {
          if (!showLabelKeys.has(key)) state.targetOpacity = 0;
        }
      }

      for (const [, state] of labelStates) {
        state.currentX += (state.targetX - state.currentX) * LERP;
        state.currentY += (state.targetY - state.currentY) * LERP;
        state.currentOpacity +=
          (state.targetOpacity - state.currentOpacity) * LERP;
        if (state.currentOpacity < 0.01) {
          state.el.style.display = "none";
          state.el.style.pointerEvents = "none";
          continue;
        }
        state.el.style.left = `${state.currentX}px`;
        state.el.style.top = `${state.currentY}px`;
        state.el.style.opacity = `${state.currentOpacity}`;
      }

      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    setTimeout(() => {
      if (canvas) canvas.style.opacity = "1";
    });

    return () => {
      cancelAnimationFrame(rafId);
      globe.destroy();
      window.removeEventListener("resize", measure);
      for (const s of labelStates.values()) s.el.remove();
      labelStates.clear();
      for (const el of hitZones.values()) el.remove();
      hitZones.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, handleClick]);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--cx-globe-glow)" }}
      />
      <div
        ref={wrapperRef}
        className="relative"
        style={{
          width: "min(100%, min(calc(100dvh - 150px), 760px))",
          aspectRatio: "1",
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={(e) => {
            pointerInteracting.current =
              e.clientX - pointerInteractionMovement.current;
            if (canvasRef.current)
              canvasRef.current.style.cursor = "grabbing";
          }}
          onPointerUp={() => {
            pointerInteracting.current = null;
            phiRef.current += pointerInteractionMovement.current / 200;
            pointerInteractionMovement.current = 0;
            if (canvasRef.current) canvasRef.current.style.cursor = "grab";
          }}
          onPointerOut={() => {
            pointerInteracting.current = null;
            phiRef.current += pointerInteractionMovement.current / 200;
            pointerInteractionMovement.current = 0;
            if (canvasRef.current) canvasRef.current.style.cursor = "grab";
          }}
          onMouseMove={(e) => {
            if (pointerInteracting.current !== null)
              pointerInteractionMovement.current =
                e.clientX - pointerInteracting.current;
          }}
          onTouchMove={(e) => {
            if (pointerInteracting.current !== null && e.touches[0])
              pointerInteractionMovement.current =
                e.touches[0].clientX - pointerInteracting.current;
          }}
          style={{
            width: "100%",
            height: "100%",
            cursor: "grab",
            contain: "layout paint size",
            opacity: 0,
            transition: "opacity 1s ease",
          }}
        />
      </div>
    </div>
  );
}
