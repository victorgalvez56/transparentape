# PLAN VR KILLER — Transparentape · Audit Room

> **Hardware del demo**: Meta Quest 3S (Victor) — Snapdragon XR2 Gen 2, 8GB RAM, 2× Touch Plus controllers.
> **Tech**: WebXR (Three.js + react-three-fiber + @react-three/xr) corriendo en Meta Browser. No es app nativa, es la misma web `transparentape.app/vr`.
> **Concepto**: la corrupción no se MIRA, se CAMINA. Bosque de columnas de luz salidas del piso de LATAM. Altura = monto, color = riesgo.
> **Skill activa para esto**: `frontend-design` (Anthropic) — dirección estética **Forensic Editorial** ya validada para la web 2D.

---

## 0. Compromiso conceptual — *Audit Room*

| Eje | Decisión |
|---|---|
| Mundo virtual | Suelo = mapa textura de LATAM. Cielo = noche estrellada con grain. |
| Columnas de luz | Una por obra georeferenciada (62,503 actuales · 71,181 cuando Victor termine ETL). Altura = `log(monto)`. Color = `riesgo`. |
| Movimiento | Teleport con thumbstick. Pinch zoom para "saltar" entre países. |
| Interacción | Controller raycast: apunta → trigger → flota panel HUD con datos de la obra. |
| Audio | Silencio. Ping bajo cuando hay red_flag cerca. Crescendo al acercarte. Voz del bot al "agarrar" una obra. |
| Multi-user | 2 jurados simultáneos en la misma sala virtual (Liveblocks). Uno ve la cabeza + manos del otro como avatar. |
| Identidad | Wordmark `Transparentape.` flota en el horizonte. Logo verde brand pulsando. |
| Modo | `immersive-vr` (no AR/MR — queremos aislar al jurado del cuarto físico). |

---

## Mapa de fases (orden quirúrgico de ejecución)

| Fase | Nombre | Tiempo | Bloqueante para… |
|---|---|---|---|
| 1 | Scaffold `/vr` + Three.js + react-three-xr | 2h | Todo lo demás |
| 2 | Bosque de columnas instanciado (Perú primero) | 3h | Audio + Cronología |
| 3 | Panel HUD flotante al raycast + teleport | 2h | Pitch básico |
| 4 | Audio ambient con threshold (Web Audio API) | 3h | Impacto sensorial |
| 5 | Cronología 3D (slider 2019–2026) | 4h | Storytelling temporal |
| 6 | Multi-país (suelo crece a LATAM) | 1h tras ETL de Victor | Vista continental |
| 7 | Multi-user WebXR con Liveblocks | 6h | Pitch killer cooperativo |
| 8 | Voz del agente al grab (Daniel) | 2h | Sinergia con bot WSP |
| 9 | Pulido visual + grain + skybox | 2h | Polish del demo |
| 10 | Hardening pre-demo + fallback | 2h | Seguridad del pitch |

**Total estimado**: ~27h de trabajo. **Disponibles**: ~36h hasta el demo. Margen seguro.

---

# FASE 1 — Scaffold `/vr`

## 1.1 Stack y deps

```bash
cd web
npm install three @react-three/fiber @react-three/drei @react-three/xr
npm install -D @types/three
```

Para multi-user (Fase 7):
```bash
npm install @liveblocks/client @liveblocks/react @liveblocks/react-ui
```

## 1.2 Archivos a crear

```
web/app/vr/
  page.tsx                  # entrypoint Next.js (client component)
  layout.tsx                # opcional, layout sin HUD 2D

web/components/vr/
  AuditRoom.tsx             # escena raíz Canvas + XR
  EnterVRButton.tsx         # botón "Entrar a VR" (UI 2D fallback)
  ColumnaForest.tsx         # InstancedMesh con todas las obras
  ObraPanel.tsx             # HTML→texture HUD flotante
  Floor.tsx                 # suelo con textura de mapa
  Skybox.tsx                # cielo noche + grain
  Teleporter.tsx            # controller pointer + teleport
  AudioField.tsx            # Web Audio API ambient
  TimelineSlider.tsx        # slider 3D 2019→2026
  PresenceAvatars.tsx       # cabezas + manos de otros users (Liveblocks)

web/lib/vr/
  obras-source.ts           # hook que sirve obras al campo VR
  audio-engine.ts           # generación + threshold del ambient
  liveblocks.ts             # config del room
```

## 1.3 `web/app/vr/page.tsx` — esqueleto

```tsx
"use client";

import dynamic from "next/dynamic";

const AuditRoom = dynamic(() => import("@/components/vr/AuditRoom"), {
  ssr: false, // Three.js + WebXR son client-only
  loading: () => (
    <div className="h-screen flex items-center justify-center bg-black text-white/60">
      Cargando Audit Room…
    </div>
  ),
});

export default function VRPage() {
  return (
    <main className="fixed inset-0 bg-black">
      <AuditRoom />
    </main>
  );
}
```

## 1.4 `AuditRoom.tsx` — Canvas + XR

```tsx
"use client";

import { Canvas } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";
import EnterVRButton from "./EnterVRButton";
import Floor from "./Floor";
import Skybox from "./Skybox";
import ColumnaForest from "./ColumnaForest";
import Teleporter from "./Teleporter";

const store = createXRStore({
  // controladores tienen prioridad; hand tracking como respaldo
  controller: true,
  hand: true,
});

export default function AuditRoom() {
  return (
    <>
      <EnterVRButton store={store} />
      <Canvas camera={{ position: [0, 1.6, 5], fov: 75 }}>
        <XR store={store}>
          <ambientLight intensity={0.15} />
          <directionalLight position={[10, 20, 5]} intensity={0.4} />
          <Skybox />
          <Floor />
          <ColumnaForest />
          <Teleporter />
        </XR>
      </Canvas>
    </>
  );
}
```

## 1.5 `EnterVRButton.tsx`

```tsx
"use client";

export default function EnterVRButton({ store }: { store: any }) {
  return (
    <button
      onClick={() => store.enterVR()}
      className="absolute z-10 bottom-10 left-1/2 -translate-x-1/2 px-6 py-3 bg-[var(--brand)] text-black font-medium"
      style={{ fontFamily: "var(--font-display), serif" }}
    >
      Entrar a Audit Room
    </button>
  );
}
```

**Métrica de éxito de Fase 1**: abrir `transparentape.app/vr` en cualquier browser desktop → ver Canvas Three.js con suelo, cielo y botón "Entrar a VR". Click → si hay headset, entra a modo inmersivo. Si no, queda en 3D plano.

---

# FASE 2 — Bosque de columnas instanciado

## 2.1 ¿Por qué InstancedMesh?

62,503 columnas individuales = 62,503 draw calls = GPU se ahoga, Quest 3S baja a 15fps. **Mata el demo**.

**InstancedMesh** = 1 sola draw call, 62,503 transformaciones aplicadas en GPU. Quest 3S lo aguanta a 90fps sin sudar.

## 2.2 `ColumnaForest.tsx` (concepto)

```tsx
"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useObrasVR } from "@/lib/vr/obras-source";

const COLOR_ALTO = new THREE.Color("#ef4444");
const COLOR_MEDIO = new THREE.Color("#f59e0b");
const COLOR_BAJO = new THREE.Color("#42dc3a");

// El suelo del VR es 100m × 60m. Mapeamos lng/lat de LATAM a x/z.
// Longitud LATAM aprox: -120° a -34° → 86° → escala 100/86 = 1.16
// Latitud LATAM aprox:  -55° a 32°  → 87° → escala 60/87 = 0.69
const LNG_SCALE = 100 / 86;
const LAT_SCALE = 60 / 87;
const LNG_OFFSET = -77; // centro lng (Perú)
const LAT_OFFSET = -10;  // centro lat (Perú)

function projectToFloor(lng: number, lat: number): [number, number] {
  return [(lng - LNG_OFFSET) * LNG_SCALE, -(lat - LAT_OFFSET) * LAT_SCALE];
}

export default function ColumnaForest() {
  const { obras } = useObrasVR(); // ~62k features
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useMemo(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    obras.forEach((o, i) => {
      const [x, z] = projectToFloor(Number(o.lng), Number(o.lat));
      const h = Math.log10((o.monto ?? 0) + 1) * 0.4; // log scale, 0–10m altura
      dummy.position.set(x, h / 2, z);
      dummy.scale.set(0.02, h, 0.02); // columnas finas y altas
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      const c = o.is_red_flag ? COLOR_ALTO : COLOR_BAJO;
      meshRef.current!.setColorAt(i, c);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [obras]);

  // Pulso en las red_flags
  useFrame(({ clock }) => {
    // Animar emissive intensity para que las rojas "respiren"
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 70000]}>
      <cylinderGeometry args={[0.05, 0.05, 1, 8]} />
      <meshStandardMaterial
        emissive="white"
        emissiveIntensity={0.4}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
```

## 2.3 `lib/vr/obras-source.ts`

Hook que carga las obras desde `/api/obras?with_coords=true&limit=70000`. Cache en memoria para no re-fetch.

**Métrica de éxito**: ponés VR mode, mirás abajo, ves Perú/Chile/etc como un **bosque iluminado**. Columnas rojas saltan visualmente.

---

# FASE 3 — Panel HUD flotante + Teleport

## 3.1 Teleport (movimiento)

Library: usar `useXR()` + `useController()` de `@react-three/xr`. Detectar thumbstick press → emitir ray desde controller → si toca el suelo → animar movimiento.

`@react-three/xr` provee primitivas:
```tsx
import { XROrigin, useXR } from "@react-three/xr";

// Mover la XROrigin = mover al usuario en el mundo
```

## 3.2 Panel HUD al raycast

Cuando el user apunta una columna y presiona trigger:
1. Detectar `intersect` con la `InstancedMesh`
2. Sacar `instanceId` del intersection
3. Buscar la obra correspondiente
4. Instanciar un panel **HTML→Canvas texture** flotando 0.5m frente al user
5. Mostrar: título, distrito, monto, contratista, alerta

Usar `<Html>` de `@react-three/drei` para renderizar JSX dentro del mundo 3D — permite usar el componente `<ObraDetailPanel>` que YA TENGO en 2D, casi sin cambios.

```tsx
import { Html } from "@react-three/drei";

<group position={[hovered.x, 1.2, hovered.z]}>
  <Html transform distanceFactor={1.5} pointerEvents="auto">
    <ObraVRPanel obra={selected} />
  </Html>
</group>
```

**Métrica de éxito**: apuntás una columna roja, click trigger, ves el panel con `S/ 1,111,909,484 · MIRAFLORES · J Y S SERVICIOS GENERALES`. Sentís inmersión real.

---

# FASE 4 — Audio Ambient con Threshold (KILLER)

## 4.1 Concepto

Silencio total cuando no hay red_flags cerca. Cuando el user se aproxima a una columna roja, **emerge un tono bajo** (rumor grave). Cuanto más cerca, más fuerte. Si se aleja, se desvanece.

**Por qué es killer**: psicológicamente activa **Slovic + Embodied Cognition**. El cuerpo siente el peligro en el oído antes que el ojo. El jurado va a "buscar" las red_flags sin que se las muestren.

## 4.2 Implementación

`lib/vr/audio-engine.ts`:

```ts
class RedFlagAudioField {
  private ctx: AudioContext;
  private osc: OscillatorNode;
  private gain: GainNode;
  
  constructor() {
    this.ctx = new AudioContext();
    this.osc = this.ctx.createOscillator();
    this.osc.type = "sine";
    this.osc.frequency.value = 55; // tono bajo "A1", subliminal
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.osc.connect(this.gain).connect(this.ctx.destination);
    this.osc.start();
  }
  
  /** Llamar en cada frame con la distancia al red_flag más cercano */
  updateProximity(minDistance: number) {
    // Inverse-square falloff dentro de 20m
    const maxDist = 20;
    if (minDistance > maxDist) {
      this.gain.gain.value = 0;
      return;
    }
    const proximity = 1 - (minDistance / maxDist);
    this.gain.gain.value = proximity * proximity * 0.3; // max 30% vol
  }
}
```

Y en el frame loop del `Canvas`:

```tsx
useFrame((state) => {
  const userPos = state.camera.position;
  const minDist = findClosestRedFlag(userPos, obras);
  audioField.updateProximity(minDist);
});
```

## 4.3 Escalado del concepto

- **Crescendo dramático**: si el user se queda quieto dentro de 5m de una red_flag por 3s, el tono baja medio paso y suma armónico → da sensación de "te tiene"
- **Voz del bot** al grab: cuando agarra una obra, Web Speech API (o audio pre-generado) lee el resumen — esto se sincroniza con Daniel del WSP en Fase 8

**Métrica de éxito**: el user cierra los ojos en VR y puede navegar SOLO por sonido hacia los focos de corrupción.

---

# FASE 5 — Cronología 3D (slider 2019–2026)

## 5.1 Concepto

Un slider físico flotante a la izquierda del user (anclado a la posición XR). Es una **barra horizontal de 1m** con marcadores por año (2019, 2020… 2026). El user lo "agarra" con el trigger del controller izquierdo y arrastra.

Mientras arrastra, **el bosque entero recompone**: las columnas crecen/decrecen según los contratos vigentes ese año. Las red_flags aparecen y desaparecen según fechas.

**Por qué es killer**: el jurado VE el dinero del Estado fluir por el tiempo. Ve cómo crecen los presupuestos. Ve dónde explotan las alertas. Es **un documental Netflix interactivo**.

## 5.2 Implementación

`TimelineSlider.tsx`:

```tsx
"use client";

import { useState, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useController } from "@react-three/xr";
import * as THREE from "three";

export default function TimelineSlider({
  onChange,
}: {
  onChange: (year: number) => void;
}) {
  const leftController = useController("left");
  const [year, setYear] = useState(2024);
  const handleRef = useRef<THREE.Mesh>(null);
  const grabbedRef = useRef(false);

  useFrame(() => {
    if (!leftController) return;
    const trigger = leftController.inputSource.gamepad?.buttons[0]?.pressed;
    
    if (trigger && !grabbedRef.current) {
      // empezar drag si el controller está cerca del handle
      const dist = leftController.targetRayWorld.distanceTo(handleRef.current!.position);
      if (dist < 0.15) grabbedRef.current = true;
    }
    
    if (grabbedRef.current && trigger) {
      // mover el handle según la X del controller
      const x = leftController.targetRayWorld.x;
      const clamped = Math.max(-0.5, Math.min(0.5, x));
      handleRef.current!.position.x = clamped;
      const newYear = 2019 + Math.round((clamped + 0.5) * 7); // 2019..2026
      if (newYear !== year) {
        setYear(newYear);
        onChange(newYear);
      }
    }
    
    if (!trigger) grabbedRef.current = false;
  });

  return (
    <group position={[-1, 1.2, -1.5]}>
      {/* Riel del slider */}
      <mesh>
        <boxGeometry args={[1, 0.02, 0.02]} />
        <meshStandardMaterial color="#42dc3a" emissive="#42dc3a" emissiveIntensity={0.3} />
      </mesh>
      {/* Handle */}
      <mesh ref={handleRef}>
        <sphereGeometry args={[0.04]} />
        <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.6} />
      </mesh>
      {/* Año actual flotando arriba */}
      <Text position={[0, 0.15, 0]} fontSize={0.1} color="white">
        {year}
      </Text>
    </group>
  );
}
```

Y `ColumnaForest` escucha el `year` y filtra las obras `where source_year === year`.

## 5.3 Fallback hand-tracking (por si Victor pierde un controller)

`@react-three/xr` provee `useXRHandState()`. Detectar pinch gesture (thumb + index tips a < 2cm) → mismo efecto que trigger. Activable con flag.

**Métrica de éxito**: agarrás el handle, arrastrás de 2019 a 2026, ves el bosque transformándose. Lleva ~1.5s de animación. Las columnas crecen suavemente, no salta.

---

# FASE 6 — Multi-país (cuando Victor termine ETL)

Si Victor agrega más países (ya tiene Chile + Perú), el `ColumnaForest` ya los muestra sin cambios — porque proyectamos cualquier lng/lat a x/z.

Decisión visual: **un sólo bosque continental** (ver toda LATAM como un mar de torres) versus **clusters por país** que el user puede "saltar" entre ellos.

Recomendación: **un sólo bosque** — eso es más dramático visualmente. El user mira hacia abajo, ve **toda Sudamérica iluminada**.

---

# FASE 7 — Multi-user WebXR con Liveblocks

## 7.1 ¿Por qué Liveblocks?

| Opción | Pros | Contras |
|---|---|---|
| **Liveblocks** | SDK React, free tier (100 MAU), <50ms latency, presence built-in | Vendor lock-in, requiere config dashboard |
| Socket.io custom | Control total, gratis | Hay que armar server + hosting |
| Y.js + WebSocket | CRDT robusto, sin vendor | Más complejo de integrar |

**Para 24-48h, Liveblocks gana**. Free tier sobra para demo.

## 7.2 Setup

1. Crear cuenta en `liveblocks.io`
2. Crear proyecto → obtener public key
3. Agregar env var: `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY=pk_dev_...`

## 7.3 Implementación

`lib/vr/liveblocks.ts`:

```ts
"use client";

import { createClient } from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";

const client = createClient({
  publicApiKey: process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY!,
});

type Presence = {
  headPos: [number, number, number];
  headRot: [number, number, number, number];
  leftHandPos: [number, number, number];
  rightHandPos: [number, number, number];
  grabbedObraId: number | null;
};

export const { RoomProvider, useMyPresence, useOthers } = createRoomContext<Presence>(client);
```

`AuditRoom.tsx` se envuelve en `<RoomProvider id="audit-room-demo">`.

`PresenceAvatars.tsx`:

```tsx
import { useOthers } from "@/lib/vr/liveblocks";

export default function PresenceAvatars() {
  const others = useOthers();
  return (
    <>
      {others.map((other) => (
        <group key={other.connectionId}>
          {/* Cabeza */}
          <mesh position={other.presence.headPos}>
            <sphereGeometry args={[0.15]} />
            <meshStandardMaterial color="#42dc3a" emissive="#42dc3a" emissiveIntensity={0.4} />
          </mesh>
          {/* Manos */}
          <mesh position={other.presence.leftHandPos}>
            <boxGeometry args={[0.08, 0.08, 0.12]} />
          </mesh>
          <mesh position={other.presence.rightHandPos}>
            <boxGeometry args={[0.08, 0.08, 0.12]} />
          </mesh>
        </group>
      ))}
    </>
  );
}
```

Y en cada frame:

```tsx
const [, updateMyPresence] = useMyPresence();

useFrame(({ camera, gl }) => {
  const session = gl.xr.getSession();
  // mandar posición de la cabeza + manos al servidor
  updateMyPresence({
    headPos: camera.position.toArray(),
    // ...
  });
});
```

**Métrica de éxito**: 2 jurados con Quest distintos abren `/vr` simultáneo. Ven la cabeza verde flotante del otro. Pueden caminar juntos. **Esto no lo hace nadie en el track**.

---

# FASE 8 — Voz del agente al grab (sinergia con Daniel)

Cuando el user grabea una obra red_flag, el VR llama `/api/agent/detalle?id=X` y **narra** la respuesta vía Web Speech API.

```tsx
const speak = (text: string) => {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-PE";
  u.rate = 0.95;
  u.pitch = 0.85;
  speechSynthesis.speak(u);
};

// Al grab:
const obra = await fetch(`/api/agent/detalle?id=${id}`).then(r => r.json());
speak(`${obra.titulo}. Contratista: ${obra.contratista}. ${obra.alertas.join(". ")}`);
```

**Por qué es killer**: el jurado escucha al **mismo agente** que está en el bot de Daniel. La misma "voz" del producto está en 3 lugares: chat web (Jose), WSP (Daniel), VR (yo). **Branding sensorial unificado**.

---

# FASE 9 — Polish

- Skybox con shader noise (estrellas + grain)
- Suelo con textura de mapa real (raster de MapTiler o screenshot del style Carto)
- Wordmark "Transparentape." flotando en el horizonte
- Niebla en el infinito (Three.js `fog`)
- Bloom pass (post-processing) para que las columnas brillen como en una scifi

---

# FASE 10 — Hardening pre-demo

| Riesgo | Fallback |
|---|---|
| Quest 3S no carga la página | Tener la URL en `localhost` del Mac via ngrok como respaldo |
| WebXR no entra inmersivo | Modo 3D plano funciona en desktop, lo proyectamos |
| Liveblocks rate limit en demo | Modo single-user funciona standalone |
| Las APIs caen | Cache de las obras en `public/cache/obras.json` build-time |
| Audio falla | Visual no depende del audio |
| Hand tracking dropa controllers | Cada feature accesible con click 2D fallback |

**Pre-demo checklist** (1h antes del pitch):
- [ ] Quest 3S cargada al 100%
- [ ] Boundary configurado en el espacio del pitch
- [ ] `/vr` cargada y entrando a VR sin errores
- [ ] Audio detecta red_flags
- [ ] Slider funciona con controller
- [ ] Liveblocks: probar con 2 dispositivos
- [ ] Voz del agente lee la primera obra correctamente

---

# ANEXO A — Demo script de 90 segundos

| t | Acción | Línea hablada |
|---|---|---|
| 0:00 | Junior abre laptop, proyecta `transparentape.app` | "Esta es la plata pública que mapeamos: 71,000 contratos, S/ 525,000 millones." |
| 0:15 | Click en una obra → flyTo cinematic, halo killer, panel | "Cada punto rojo es una alerta del OECE. Vean Miraflores: S/ 1,100 millones con un contratista sancionado." |
| 0:30 | Click en "Audit Room VR" | "Pero esto se puede vivir." |
| 0:35 | Le pasa el Quest 3S al jurado más senior | (silencio dramático) |
| 0:45 | Jurado pone el Quest, ve el bosque | (audio ambient bajo empieza al acercarse a Lima) |
| 1:00 | Jurado camina hacia la columna más alta y roja | "Esto que está sintiendo es Pucallpa. S/ 4,200 millones. La voz que va a escuchar es del agente de WhatsApp que tu vecino puede consultar HOY." |
| 1:15 | El bot lee: "Contratista figura en sancion inhabilitacion..." | — |
| 1:20 | Jurado mira al cielo, ve Sudamérica entera iluminada | "Misma DB, misma capa de IA, misma experiencia. Open source. OCDS estándar internacional." |
| 1:30 | Junior toma el cierre | "Transparentape. La transparencia, pegada." |

---

# ANEXO B — Bibliografía psicológica (extiende `PLAN_UI_KILLER.md`)

| Técnica | Aplicación VR |
|---|---|
| **Presence Effect** (Slater) | El cerebro registra VR como realidad. Memoria episódica > 5× más fuerte que pantalla |
| **Embodied Cognition** (Lakoff) | El cuerpo CAMINA entre datos. La corrupción se siente con los pies |
| **Awe** (Keltner) | Escala del bosque dispara emoción de magnitud → recuerdo permanente |
| **Audio thresholding** (Slovic + visceral) | Cuerpo siente peligro antes que ojo lo vea → cazar es activo |
| **Identifiable Victim** (Slovic) | Una columna roja = una obra concreta = una historia. No es estadística |
| **Spatial Memory** (Tolman) | El jurado recuerda DÓNDE estaban las obras. Memoria geográfica > memoria de número |
| **Social Presence** (multi-user) | Saber que otro está ahí amplifica la sensación de evento real |

---

# Decisiones explícitas para defender en review

- **No usamos Unity/Unreal**: WebXR es accesible desde URL pública. Sin instaladores. Open source coherente con OCDS.
- **No hacemos MR (passthrough)**: el aislamiento del VR puro es lo que da impacto emocional. MR diluye la inmersión.
- **No diseñamos para sentado**: el demo es de pie con caminata real (`room-scale`). Eso multiplica el embodied effect.
- **No agregamos juegos / gamification**: esto es periodismo de investigación, no entertainment. Cualquier mecánica que distraiga de los datos se rechaza.
