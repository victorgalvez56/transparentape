# PLAN UI KILLER — Transparentape

> Brand actualizado el 2026-05-16: el proyecto pasó de **"Sigue el billete"** a **"Transparentape"** (portmanteau: transparente + tape / cinta de auditoría). La dirección estética "Forensic Editorial" se mantiene intacta. La frase grabable se reescribió para conectar con el nuevo nombre — ver §0.

> **Track**: Transparency & Corruption · hack@latam 2026
> **Ventana de juicio del jurado**: ~90 segundos
> **Misión de este documento**: convertir esos 90 segundos en una sentencia emocional inolvidable.
> **Skill activa**: `frontend-design` (Anthropic) + capa de psicología cognitiva aplicada.
> **Dirección estética escogida y NO negociable**: **Forensic Editorial**.

---

## 0. Compromiso de dirección estética — FORENSIC EDITORIAL

La skill `frontend-design` exige *intentionality, not intensity*: una sola dirección, ejecutada con precisión. La nuestra:

**Forensic Editorial** = NYT Investigations + Bellingcat + FT Visual Storytelling + The Pudding.
No es "app de datos". Es **periodismo de investigación que respira**.

| Eje | Decisión |
|---|---|
| Familia tipográfica display | **Fraunces** (variable, axes opsz / wght / SOFT / WONK — Google Fonts) |
| Body sans | **IBM Plex Sans** (Mozilla, libre, voz técnica seria, NO genérica) |
| Numérica / tabular | **IBM Plex Mono** (coherente con la familia Plex, números monospace para autoridad de dato) |
| Aesthetic | Maximalismo controlado: tipografía gigante + grano + asimetría + un único acento brand |
| Layout | Asimétrico, breaking-grid, paneles flotantes con sombras dramáticas |
| Modo | Dark only — negro carbón forense, no negro genérico |
| Acento brand | Verde radiactivo `#42dc3a` — usado MÁXIMO 1 vez por pantalla |
| Atmósfera | Grano SVG procedural + gradiente radial verde-deep + cursor refinado |
| Motion | UN cold open de 2.4s con staggered reveals + flyTo cinematics del globo |
| Mensaje grabable | "El billete deja huella. Lo grabamos." |
| Wordmark | **Transparentape.** (Fraunces capitalize + punto verde brand) |

> Si una decisión futura contradice esto, gana esto. Nunca al revés.

---

## Mapa de fases (orden quirúrgico de ejecución)

| Fase | Nombre | Efecto psicológico principal | Archivos clave | Tiempo |
|---|---|---|---|---|
| 1 | Design tokens + fuentes | Aesthetic-Usability Effect (Lavie & Tractinsky, 2004) | `app/layout.tsx`, `app/globals.css` | 15 min |
| 2 | Cold Open cinematográfico | Visceral level + Identifiable Victim | `components/ColdOpen.tsx`, `app/page.tsx` | 30 min |
| 3 | HUD de Autoridad sobre el globo | Authority + Social Proof (Cialdini) | `components/AuthorityHud.tsx` | 15 min |
| 4 | Marker red_flag pulsante + caso del día | Von Restorff + Identifiable Victim | `components/MapGlobe.tsx` | 20 min |
| 5 | Editorial Index lateral | Hick's Law refinada + jerarquía editorial | `components/ObrasListPanel.tsx` | 25 min |
| 6 | Panel Obra editorial (anchoring) | Loss Aversion + Anchoring (Kahneman & Tversky) | `components/ObraDetailPanel.tsx` | 25 min |
| 7 | Forensics modal cinemático | Reflective level + Curiosity Gap (Loewenstein) | `components/ForensicsPanel.tsx` | 20 min |
| 8 | Página pública `/obras/[ocid]` | Authority + SEO + share | `app/obras/[ocid]/page.tsx` | 20 min |
| 9 | Microcopy total | Voss labeling + loss aversion + Cialdini | varios + `lib/copy.ts` (nuevo) | 15 min |
| 10 | Atmósfera (grain + gradient + cursor) | Embodied cognition / Lavie & Tractinsky | `app/globals.css`, `components/Atmosphere.tsx` | 15 min |
| 11 | Validación de impacto | Test cualitativo + métricas Core Web | demo + checklist | 10 min |

**Total estimado**: ~3h 30m de trabajo de UI puro, sobre la base que ya levantamos.

---

# FASE 1 — Design Tokens y Tipografía Editorial

## 1.1 Objetivo psicológico

**Aesthetic-Usability Effect** (Lavie & Tractinsky, 2004): interfaces percibidas como bellas son percibidas también como más usables, más confiables y más profesionales — *aunque el sistema sea idéntico funcionalmente*. En 90 segundos esto decide el voto.

Soporte adicional: **Halo Effect** (Thorndike, 1920) — una característica saliente (tipografía editorial seria) sesga la evaluación global hacia "esto es serio, esto es periodismo, esto se ganó mi atención".

## 1.2 Acciones quirúrgicas

### 1.2.1 Cargar Fraunces + IBM Plex Sans + IBM Plex Mono via `next/font/google`

**Archivo**: `web/app/layout.tsx`

Reemplazar el bloque actual de fuentes por:

```tsx
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz", "SOFT", "WONK"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});
```

Aplicar al `<html>`:

```tsx
<html lang="es" className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
```

### 1.2.2 Tokens CSS — paleta + spacing + motion

**Archivo**: `web/app/globals.css` — reescribir el bloque `:root` y `@theme inline`:

```css
:root {
  /* Neutros forenses */
  --ink-0: #050505;          /* Fondo abismo */
  --ink-1: #0a0a0a;          /* Paneles */
  --ink-2: #121212;          /* Cards elevadas */
  --ink-3: #1a1a1a;          /* Bordes oscuros */
  --paper: #f5f1e8;          /* Crema editorial (uso minimal) */

  /* Texto */
  --fg: #ededed;
  --fg-dim: #a3a3a3;
  --fg-faint: #525252;
  --rule: rgba(255,255,255,0.08);

  /* Único acento brand — usar con disciplina */
  --brand: #42dc3a;
  --brand-deep: #0a3d0a;
  --brand-glow: rgba(66, 220, 58, 0.45);

  /* Semaforización forense */
  --alarm: #ef4444;
  --alarm-soft: rgba(239,68,68,0.12);
  --warn: #f59e0b;
  --safe: #10b981;

  /* Tipografía */
  --font-display: var(--font-display), "Times New Roman", serif;
  --font-body: var(--font-body), system-ui, sans-serif;
  --font-mono: var(--font-mono), ui-monospace, monospace;

  /* Motion */
  --ease-cinematic: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-snap: cubic-bezier(0.4, 0, 0.2, 1);
  --t-cold-open: 2400ms;
  --t-reveal: 800ms;
  --t-snap: 160ms;
}

@theme inline {
  --color-background: var(--ink-0);
  --color-foreground: var(--fg);
  --color-brand: var(--brand);
  --color-alarm: var(--alarm);
  --font-display: var(--font-display);
  --font-body: var(--font-body);
  --font-mono: var(--font-mono);
}

html, body {
  background: var(--ink-0);
  color: var(--fg);
  font-family: var(--font-body);
  height: 100%;
  font-feature-settings: "ss01", "cv01", "cv11";
}
```

### 1.2.3 Eliminar referencias a Geist / fuentes Next default

El scaffold dejó `Geist` y `Geist_Mono` en el layout original. Borrarlos. La skill prohíbe explícitamente Inter y por extensión todo lo que se vea genérico.

## 1.3 Métrica de éxito

- Cargar `/` en Chrome devtools — Performance panel → ningún FOUT visible >150ms.
- Inspeccionar `body` computed style → font-family resuelve a Fraunces/Plex.
- Screenshot side-by-side antes/después: el "después" debe leerse como una pieza editorial, no como "otra dashboard".

---

# FASE 2 — Cold Open Cinematográfico

## 2.1 Objetivo psicológico

Tres mecanismos apilados en 2.4 segundos:

1. **Visceral level of design** (Norman, *Emotional Design*, 2004): el cerebro juzga la confiabilidad de una interfaz en los primeros ~50 ms de mirada (Lindgaard et al., 2006). Un cold open bien orquestado convierte esos 50 ms en un *yes* emocional.
2. **Identifiable Victim Effect** (Slovic, 2007): "8,000 obras" no mueve a nadie. Un número grande seguido del nombre de UN distrito concreto activa la respuesta emocional individualizada.
3. **Anchoring** (Tversky & Kahneman, 1974): el primer número que ve el jurado se vuelve la referencia mental contra la que comparará todo lo demás.

## 2.2 Guión de 2.4 segundos

```
t=0.00s   Pantalla negra absoluta. Cursor oculto.
t=0.10s   Aparece un punto verde brand pulsante en el centro (10px).
t=0.20s   Comienza a contar de 0 a 49,800,000,000 en mono tabular, 96px.
          Easing ease-out-quart. El número entra desde abajo con blur.
t=0.50s   Eyebrow encima del número (Fraunces italic, 14px):
          "Soles fiscalizados en obras públicas, Lima — 2019–2025"
t=1.20s   El número llega a S/ 49,800,000,000.
          Pulso de brillo brand-glow.
t=1.40s   Frase debajo (Fraunces display, 56px, peso 600, italic+brand en "Lo grabamos"):
          "El billete deja huella. *Lo grabamos*."
t=1.90s   Sub (IBM Plex Sans 16px, --fg-dim):
          "Acá la puedes leer."
t=2.20s   El bloque se contrae a una insignia 12px arriba-izquierda.
          Globo se revela detrás con fade + zoom suave hasta Lima.
t=2.40s   Cold open termina. HUD de autoridad y paneles entran staggered
          (Fase 3 y 5).
```

Skipeable: tecla `Esc`, click en el negro, o tap. Una sola vez por sesión (guardar flag `sessionStorage.coldOpenSeen=1`).

## 2.3 Acciones quirúrgicas

### 2.3.1 Instalar `motion` (la skill lo recomienda explícito)

```bash
cd web && npm install motion
```

### 2.3.2 Crear `web/components/ColdOpen.tsx`

```tsx
"use client";

import { motion, useMotionValue, animate } from "motion/react";
import { useEffect, useState } from "react";

const TOTAL = 49_800_000_000;

export default function ColdOpen({ onDone }: { onDone: () => void }) {
  const [skip, setSkip] = useState(false);
  const count = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    const ctrl = animate(count, TOTAL, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        setDisplay(
          new Intl.NumberFormat("es-PE").format(Math.floor(v))
        );
      },
    });
    return () => ctrl.stop();
  }, [count]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSkip(true);
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => onDone(), 2400);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [onDone]);

  if (skip) {
    onDone();
    return null;
  }

  return (
    <motion.div
      onClick={() => setSkip(true)}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--ink-0)] cursor-pointer"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.span
        className="absolute top-6 right-6 text-[10px] tracking-[0.3em] text-[var(--fg-faint)] font-mono"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 }}
      >
        ESC PARA SALTAR
      </motion.span>

      <motion.p
        className="text-[13px] italic tracking-wide text-[var(--fg-dim)]"
        style={{ fontFamily: "var(--font-display)" }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        Soles fiscalizados en obras públicas · Lima 2019–2025
      </motion.p>

      <motion.div
        className="mt-2 text-[clamp(48px,9vw,128px)] font-mono font-medium tracking-tight tabular-nums text-white"
        initial={{ opacity: 0, filter: "blur(12px)", y: 30 }}
        animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="text-[var(--brand)]">S/</span>{" "}
        {display}
      </motion.div>

      <motion.h1
        className="mt-10 text-[clamp(28px,5vw,56px)] leading-[1.05] font-medium text-center max-w-3xl"
        style={{ fontFamily: "var(--font-display)" }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4, duration: 0.6 }}
      >
        El billete deja huella.{" "}
        <em className="italic text-[var(--brand)]" style={{ fontStyle: "italic" }}>
          Lo grabamos
        </em>
        .
      </motion.h1>

      <motion.p
        className="mt-3 text-base text-[var(--fg-dim)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.9, duration: 0.5 }}
      >
        Acá la puedes leer.
      </motion.p>
    </motion.div>
  );
}
```

### 2.3.3 Inyectar en `app/page.tsx`

Encima del `<main>`, condicional por `sessionStorage`:

```tsx
const [showColdOpen, setShowColdOpen] = useState<boolean | null>(null);

useEffect(() => {
  if (typeof window === "undefined") return;
  setShowColdOpen(sessionStorage.getItem("coldOpenSeen") !== "1");
}, []);

// dentro del JSX, al inicio:
{showColdOpen && (
  <ColdOpen
    onDone={() => {
      sessionStorage.setItem("coldOpenSeen", "1");
      setShowColdOpen(false);
    }}
  />
)}
```

> **Importante para la demo en vivo**: limpiar `sessionStorage` antes del pitch para que el cold open vuelva a dispararse. Agregar query param `?reset=1` que limpia y recarga.

## 2.4 Métrica de éxito

- Cronometrar: 0s → 2.4s. Si excede 3s, el jurado se aburre.
- Verificar en Lighthouse: el cold open **no debe** retrasar el FCP del globo (se monta detrás). El globo debe estar listo cuando el cold open termina.

---

# FASE 3 — HUD de Autoridad sobre el globo

## 3.1 Objetivo psicológico

**Authority + Social Proof** (Cialdini, *Influence*, 1984):

- *Authority*: nombrar instituciones reconocidas (OECE, MEF, OCDS) transfiere su credibilidad acumulada al producto.
- *Social Proof*: mostrar el volumen total auditado ("184,329 contratos") activa la prueba social cuantitativa.

Adicional: **Mere Exposure Effect** (Zajonc, 1968) — al ver los acrónimos institucionales arriba, el jurado los reconoce sin esfuerzo cognitivo y baja la guardia.

## 3.2 Acciones quirúrgicas

### 3.2.1 Crear `web/components/AuthorityHud.tsx`

```tsx
"use client";

import { motion } from "motion/react";

interface Props {
  obrasCount: number;
  ciudad: string;
}

export default function AuthorityHud({ obrasCount, ciudad }: Props) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 2.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="absolute top-0 left-0 z-20 w-full pointer-events-none"
    >
      <div className="flex items-baseline justify-between px-6 py-5">
        {/* Wordmark */}
        <div className="flex items-baseline gap-3">
          <span
            className="text-[20px] leading-none font-medium tracking-tight text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Transparentape
            <span className="text-[var(--brand)]">.</span>
          </span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--fg-faint)] font-mono">
            {ciudad}
          </span>
        </div>

        {/* Autoridad + counts */}
        <div className="flex items-center gap-8 text-[10px] font-mono tracking-[0.18em] uppercase text-[var(--fg-dim)]">
          <Stat n={obrasCount.toLocaleString("es-PE")} label="contratos auditados" />
          <Divider />
          <span>Fuente · OCDS / OECE / MEF</span>
          <Divider />
          <span className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--brand)] shadow-[0_0_8px_var(--brand-glow)]" />
            Live data
          </span>
        </div>
      </div>
    </motion.header>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <span>
      <span className="text-white font-medium">{n}</span>{" "}
      <span>{label}</span>
    </span>
  );
}

function Divider() {
  return <span className="text-[var(--fg-faint)]">·</span>;
}
```

### 3.2.2 Montar en `app/page.tsx` después del `MapGlobe`

```tsx
<AuthorityHud obrasCount={obras.length} ciudad="Lima · Perú" />
```

> **Verdad obligatoria**: si `obrasCount` viene del modo mock (48), mostrar "demo · 48 contratos". Mentir aquí mata la credibilidad si el jurado pregunta.

## 3.3 Métrica de éxito

- El HUD aparece **después** del cold open (delay 2.5s) con un fade suave.
- Es legible sobre el globo (texto blanco + mono tracking ancho garantiza contraste).
- No interfiere con la interacción del mapa (`pointer-events-none` en el header).

---

# FASE 4 — Marker red_flag pulsante + Caso del Día auto-flyto

## 4.1 Objetivo psicológico

Dos sesgos apilados:

1. **Von Restorff Effect** (Hedwig von Restorff, 1933): el ojo va inmediatamente al elemento que rompe la homogeneidad. Si el 80% de los markers son neutros y un puñado **pulsa rojo**, el cerebro del jurado los procesa primero.
2. **Identifiable Victim Effect** (Slovic) + **Storytelling priming** (Kahneman, *Thinking Fast and Slow*, 2011 — Sistema 1 ama narrativas concretas, no datos agregados): hacer auto-flyto a UNA obra específica con narrativa al cargar = el jurado ya tiene un caso para "ver" antes de explorar.

## 4.2 Acciones quirúrgicas

### 4.2.1 Pulse halo para markers red_flag

**Archivo**: `web/components/MapGlobe.tsx` — agregar una segunda capa `circle` para halo animado.

Dentro del `map.on("load", ...)`, después de la layer `obras-points`:

```tsx
map.addLayer({
  id: "obras-pulse",
  type: "circle",
  source: "obras",
  filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "is_red_flag"], true]],
  paint: {
    "circle-color": "#ef4444",
    "circle-radius": 8,
    "circle-opacity": 0,
    "circle-stroke-color": "#ef4444",
    "circle-stroke-width": 2,
    "circle-stroke-opacity": 0.5,
  },
}, "obras-points"); // se inserta DEBAJO de los puntos sólidos
```

Y animar el halo con un loop CSS-style usando un `setInterval` que cambia el `circle-radius` y `circle-opacity`:

```tsx
let phase = 0;
const pulse = () => {
  phase = (phase + 1) % 60; // 60 frames @ ~60fps = 1s loop
  const t = phase / 60;
  const r = 8 + 14 * t;
  const op = 0.6 * (1 - t);
  if (map.getLayer("obras-pulse")) {
    map.setPaintProperty("obras-pulse", "circle-radius", r);
    map.setPaintProperty("obras-pulse", "circle-stroke-opacity", op);
  }
  rafId = requestAnimationFrame(pulse);
};
let rafId = requestAnimationFrame(pulse);
// cleanup en el return del useEffect:
return () => { cancelAnimationFrame(rafId); map.remove(); };
```

### 4.2.2 Caso del Día automático

Después del cold open, identificar la obra "más impactante" (mayor monto entre red_flag) y hacer flyTo + abrir el panel detalle.

**En `app/page.tsx`**, después de cargar `obras`:

```tsx
useEffect(() => {
  if (obras.length === 0 || selected) return;
  // Esperar a que termine el cold open (2.4s) + buffer
  const t = setTimeout(() => {
    const candidato = [...obras]
      .filter((o) => o.is_red_flag && o.lat && o.lng)
      .sort((a, b) => (b.contract_amount ?? 0) - (a.contract_amount ?? 0))[0];
    if (candidato) setSelected(candidato);
  }, 3200);
  return () => clearTimeout(t);
}, [obras, selected]);
```

El componente `MapGlobe` ya hace `flyTo` cuando cambia `selectedId` (lo escribimos antes). Esto se encadena solo.

## 4.3 Métrica de éxito

- A los ~3.2s del page load, el globo gira y aterriza en una obra red_flag, panel detalle abierto.
- Los markers red_flag son visualmente imposibles de ignorar — un observador con la mirada en blanco va a ir hacia ellos antes que a los verdes.

---

# FASE 5 — Editorial Index Lateral

## 5.1 Objetivo psicológico

- **Hick's Law** (Hick, 1952; Hyman, 1953): el tiempo de decisión crece con el log del número de opciones. La lista debe sentirse "guiada", no "abrumadora".
- **Aesthetic-Usability Effect** ya citado: una lista que parece índice de revista (kicker + headline + standfirst) se percibe como información curada, no como dump de datos.
- **Categorization & chunking** (Miller, 1956 — la magia del 7±2): segmentar visualmente en grupos (filtros Alto/Medio/Bajo) reduce carga cognitiva.

## 5.2 Acciones quirúrgicas

### 5.2.1 Rediseñar `web/components/ObrasListPanel.tsx`

Cambios clave:

| Elemento | Antes | Después |
|---|---|---|
| Header del panel | "Obras públicas" sans bold | Wordmark display Fraunces + small caps "ÍNDICE" + count tabular |
| Buscador | input redondeado genérico | input sin bordes laterales, sola línea inferior 1px brand on focus, tipografía mono |
| Filtros | 4 botones iguales | 4 tabs estilo periódico (underline en el activo, sin background) |
| Item | divider sólido, padding uniforme | item con kicker (distrito en mono small caps) + headline (Fraunces 17px) + standfirst (Plex Sans 13px gris) + monto giga a la derecha |
| Marker de riesgo | bullet 2.5px | barra vertical 2px a la izquierda del item, sólo si red_flag |
| Hover | bg blanco/5 | borde brand a la izquierda + leve translate-x:2px |

Snippet del item (reemplazar el `<button>` interno):

```tsx
<button
  onClick={() => onSelect(o)}
  className={`group w-full text-left px-5 py-4 transition-all relative
    ${isSel ? "bg-[var(--brand-deep)]/30" : "hover:bg-white/[0.02]"}
    hover:translate-x-[2px]`}
>
  {/* Barra de riesgo lateral */}
  {riesgo === "alto" && (
    <span className="absolute left-0 top-4 bottom-4 w-[2px] bg-[var(--alarm)]" />
  )}
  {riesgo === "medio" && (
    <span className="absolute left-0 top-4 bottom-4 w-[2px] bg-[var(--warn)] opacity-60" />
  )}

  <div className="flex items-baseline justify-between gap-4">
    <div className="min-w-0 flex-1">
      <p className="text-[9px] uppercase tracking-[0.22em] text-[var(--fg-faint)] font-mono">
        {o.buyer_locality} · {o.source_year}
      </p>
      <h3
        className="mt-1 text-[17px] leading-[1.2] text-white font-medium"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {truncar(o.tender_title, 90)}
      </h3>
      {o.supplier_name && (
        <p className="mt-1.5 text-[12px] text-[var(--fg-dim)] truncate">
          {o.supplier_name}
        </p>
      )}
    </div>
    <div className="shrink-0 text-right">
      <p className="text-[13px] font-mono tabular-nums text-white">
        {fmtSoles(o.contract_amount ?? o.award_amount)}
      </p>
      {o.is_red_flag && (
        <p className="text-[9px] uppercase tracking-wider text-[var(--alarm)] mt-1">
          Alerta
        </p>
      )}
    </div>
  </div>
</button>
```

### 5.2.2 Header del panel

```tsx
<header className="px-6 pt-6 pb-4 border-b border-[var(--rule)]">
  <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--fg-faint)] font-mono">
    Edición · 16 Mayo 2026
  </p>
  <h2
    className="mt-2 text-[28px] leading-none text-white"
    style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
  >
    Índice
  </h2>
  <p className="mt-3 text-sm text-[var(--fg-dim)] leading-snug max-w-xs">
    Cada línea es un contrato público con coordenadas, plata y nombre y apellido.
  </p>
</header>
```

### 5.2.3 Tabs filtro estilo prensa

```tsx
<nav className="px-6 pt-4 flex gap-5 border-b border-[var(--rule)]">
  {(["todas", "alto", "medio", "bajo"] as Filtro[]).map((f) => (
    <button
      key={f}
      onClick={() => setFiltro(f)}
      className={`pb-3 text-[11px] uppercase tracking-[0.18em] font-mono transition
        ${
          filtro === f
            ? "text-white border-b-2 border-[var(--brand)] -mb-[2px]"
            : "text-[var(--fg-faint)] hover:text-[var(--fg-dim)]"
        }`}
    >
      {f === "todas" ? "Todas" : `Riesgo ${f}`}
    </button>
  ))}
</nav>
```

## 5.3 Métrica de éxito

- Captura del panel debe parecerse a la portada del feed de The Pudding o de FT Visual & Data Journalism, no a una sidebar de SaaS.
- 0 bullet points colored. Toda la categorización es tipográfica + 1 pixel lateral.

---

# FASE 6 — Panel de Obra Editorial con Anchoring

## 6.1 Objetivo psicológico

Tres palancas:

1. **Loss Aversion** (Kahneman & Tversky, *Prospect Theory*, 1979): perder X duele ~2.25 veces más que ganar X. Replantear "monto" como "lo que salió" multiplica el impacto.
2. **Anchoring** (Tversky & Kahneman, 1974): mostrar referencial + adjudicado + contrato en horizontal con delta en %, hace que el ojo del jurado calcule el sobrecosto sin que se lo digamos.
3. **Identifiable Victim Effect** continuo: el nombre del contratista grande + su RUC + sus sanciones convierte una estadística en una cara con DNI.

## 6.2 Acciones quirúrgicas en `web/components/ObraDetailPanel.tsx`

### 6.2.1 Layout: dejar de ser una card pegada a la esquina

Cambiar el contenedor para que sea un panel asimétrico que cubre el flanco izquierdo desde abajo, con sombra dramática:

```tsx
<motion.aside
  initial={{ y: 40, opacity: 0 }}
  animate={{ y: 0, opacity: 1 }}
  exit={{ y: 40, opacity: 0 }}
  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
  className="absolute bottom-6 left-6 z-30 w-[min(560px,calc(100vw-3rem))]
             bg-[var(--ink-1)]/95 backdrop-blur-2xl
             border border-[var(--rule)] rounded-sm
             shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(66,220,58,0.06)]
             overflow-hidden flex flex-col max-h-[78vh]"
>
```

> Nota: `rounded-sm`, no `rounded-2xl`. Editorial editorial. Las pieces de NYT/FT tienen esquinas casi a 90°.

### 6.2.2 Kicker editorial

Primer elemento dentro del header:

```tsx
<p className="text-[9px] uppercase tracking-[0.32em] text-[var(--fg-faint)] font-mono">
  Caso · {obra.buyer_locality} · {obra.source_year}
</p>
<h2
  className="mt-2 text-[26px] leading-[1.05] text-white font-medium"
  style={{ fontFamily: "var(--font-display)" }}
>
  {obra.tender_title}
</h2>
```

### 6.2.3 Anchoring visual de los 3 montos

Reemplazar el `<Field>` grid actual por:

```tsx
<section className="px-5 py-4 border-t border-[var(--rule)] bg-[var(--ink-0)]/60">
  <p className="text-[9px] uppercase tracking-[0.26em] text-[var(--fg-faint)] font-mono mb-3">
    Rastreo del billete
  </p>
  <div className="grid grid-cols-3 divide-x divide-[var(--rule)]">
    <Money label="Referencial" value={obra.tender_amount} />
    <Money label="Adjudicado" value={obra.award_amount} delta={calcDelta(obra.tender_amount, obra.award_amount)} />
    <Money label="Contrato firmado" value={obra.contract_amount} accent delta={calcDelta(obra.award_amount, obra.contract_amount)} />
  </div>
</section>
```

Componente `<Money>`:

```tsx
function Money({
  label,
  value,
  delta,
  accent = false,
}: {
  label: string;
  value: number | null;
  delta?: number | null;
  accent?: boolean;
}) {
  const positive = (delta ?? 0) > 0.005;
  return (
    <div className="px-3 first:pl-0 last:pr-0">
      <p className="text-[9px] uppercase tracking-[0.22em] text-[var(--fg-faint)] font-mono">
        {label}
      </p>
      <p
        className={`mt-2 text-[22px] font-mono tabular-nums leading-none ${
          accent ? "text-[var(--brand)]" : "text-white"
        }`}
      >
        {fmtSolesShort(value)}
      </p>
      {delta != null && (
        <p
          className={`mt-1 text-[10px] font-mono ${
            positive ? "text-[var(--alarm)]" : "text-[var(--fg-faint)]"
          }`}
        >
          {positive ? "▲" : "▼"} {(Math.abs(delta) * 100).toFixed(1)}%
        </p>
      )}
    </div>
  );
}

function calcDelta(base: number | null, comp: number | null) {
  if (!base || !comp) return null;
  return comp / base - 1;
}
```

### 6.2.4 Bloque contratista con cara y DNI

```tsx
<section className="px-5 py-4 border-t border-[var(--rule)]">
  <p className="text-[9px] uppercase tracking-[0.26em] text-[var(--fg-faint)] font-mono mb-2">
    Quién recibió el billete
  </p>
  <h3 className="text-[18px] text-white" style={{ fontFamily: "var(--font-display)" }}>
    {obra.supplier_name ?? "—"}
  </h3>
  <p className="text-[11px] font-mono text-[var(--fg-dim)] mt-1">
    RUC <span className="text-white">{obra.supplier_ruc ?? "—"}</span>
  </p>

  {obra.is_red_flag && (
    <div className="mt-3 border-l-2 border-[var(--alarm)] pl-3 py-1">
      <p className="text-[11px] uppercase tracking-wider text-[var(--alarm)] font-mono">
        Antecedentes
      </p>
      <p className="text-sm text-white/90 mt-0.5">
        Figura en {(obra.red_flag_types ?? []).join(" · ").replace(/_/g, " ")}.
      </p>
    </div>
  )}
</section>
```

### 6.2.5 CTAs reducidos a 3 (Hick's)

```tsx
<footer className="px-5 py-4 border-t border-[var(--rule)] flex gap-2 bg-[var(--ink-0)]/70">
  <button
    onClick={onInvestigar}
    className="flex-1 group relative bg-[var(--brand)] text-black font-medium text-sm py-3
               hover:bg-white transition-colors"
    style={{ fontFamily: "var(--font-body)" }}
  >
    Investigar este caso →
  </button>
  <a
    href={twitterHref}
    target="_blank"
    rel="noopener noreferrer"
    className="px-4 py-3 border border-[var(--rule)] text-white text-sm hover:border-[var(--brand)] transition"
  >
    Compartir
  </a>
  <a
    href={`/obras/${obra.ocid}`}
    target="_blank"
    rel="noopener noreferrer"
    className="px-4 py-3 border border-[var(--rule)] text-white text-sm hover:border-[var(--brand)] transition"
    aria-label="Abrir página pública"
  >
    ↗
  </a>
</footer>
```

## 6.3 Métrica de éxito

- El delta porcentual (▲ X.X%) es lo segundo que el ojo captura, después del título.
- Si el adjudicado supera referencial → ese número está en rojo. El jurado calcula sobrecosto sin que se lo expliquen.
- "Quién recibió el billete" + nombre grande del contratista = el jurado memoriza una empresa concreta, no un dato.

---

# FASE 7 — Forensics Modal Cinemático

## 7.1 Objetivo psicológico

1. **Curiosity Gap** (Loewenstein, 1994): el botón "Investigar este caso" abre un loop. El modal lo cierra con hallazgos. El cierre del loop es químicamente recompensante.
2. **Reflective level** (Norman, 2004): tras el visceral (cold open) y el behavioral (mapa + paneles), el reflective es donde se gesta la conversión emocional a "compartir". El forensics debe terminar con un CTA de compartir.
3. **Authority via investigative format**: bullets numerados con kickers de severidad imitan exactamente la estética de un reporte de investigación. Eso transfiere autoridad sin que afirmemos nada de más.

## 7.2 Acciones quirúrgicas en `web/components/ForensicsPanel.tsx`

### 7.2.1 Stage cinemático

Reemplazar el wrapper actual por un overlay full screen con franja editorial centrada:

```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  className="fixed inset-0 z-40 bg-[var(--ink-0)]/95 backdrop-blur-3xl flex items-stretch justify-center"
>
  <motion.article
    initial={{ y: 40, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    className="relative max-w-3xl w-full bg-[var(--ink-1)] border-x border-[var(--rule)] overflow-y-auto"
  >
```

### 7.2.2 Header tipo investigación

```tsx
<header className="px-10 pt-12 pb-8 border-b border-[var(--rule)]">
  <p className="text-[10px] uppercase tracking-[0.36em] text-[var(--alarm)] font-mono">
    Investigación · OCID {obra.ocid}
  </p>
  <h1
    className="mt-4 text-[44px] leading-[1.02] text-white font-medium"
    style={{ fontFamily: "var(--font-display)" }}
  >
    {obra.tender_title}
  </h1>
  <p className="mt-4 text-base text-[var(--fg-dim)] max-w-prose leading-relaxed">
    {obra.buyer_name} contrató a{" "}
    <span className="text-white">{obra.supplier_name}</span> por{" "}
    <span className="text-[var(--brand)] font-mono">
      {fmtSolesLong(obra.contract_amount)}
    </span>
    . Estos son los puntos que vale la pena mirar.
  </p>
</header>
```

### 7.2.3 Hallazgos numerados estilo periódico

Cada hallazgo: número grande Fraunces a la izquierda + título display + descripción + severidad como tag.

```tsx
<section className="px-10 py-8 space-y-8">
  {hallazgos.map((h, i) => (
    <div key={i} className="grid grid-cols-[60px_1fr] gap-6">
      <span
        className={`text-[44px] leading-none font-medium ${
          h.nivel === "alto"
            ? "text-[var(--alarm)]"
            : h.nivel === "medio"
            ? "text-[var(--warn)]"
            : "text-[var(--fg-faint)]"
        }`}
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
      >
        {String(i + 1).padStart(2, "0")}
      </span>
      <div>
        <p className="text-[9px] uppercase tracking-[0.3em] text-[var(--fg-faint)] font-mono">
          {h.nivel === "alto" ? "Severidad alta" : h.nivel === "medio" ? "Severidad media" : "Contexto"}
        </p>
        <h2
          className="mt-2 text-[22px] leading-tight text-white font-medium"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {h.titulo}
        </h2>
        <p className="mt-2 text-[15px] text-[var(--fg-dim)] leading-relaxed">
          {h.detalle}
        </p>
      </div>
    </div>
  ))}
</section>
```

### 7.2.4 Footer con CTA compartir único

```tsx
<footer className="px-10 py-8 border-t border-[var(--rule)] flex items-baseline justify-between">
  <p className="text-[11px] font-mono text-[var(--fg-faint)] max-w-xs">
    Esta investigación es generada automáticamente sobre datos abiertos. No es una acusación.
  </p>
  <a
    href={shareUrl}
    target="_blank"
    rel="noopener noreferrer"
    className="text-[13px] uppercase tracking-[0.2em] text-[var(--brand)]
               border-b border-[var(--brand)] pb-1
               hover:text-white hover:border-white transition"
  >
    Compartir el caso ↗
  </a>
</footer>
```

## 7.3 Métrica de éxito

- Al abrir, el jurado lee primero el número 01 enorme, después el titulo del hallazgo, después la descripción. Eso es lectura periodística pura.
- El único CTA inferior es "Compartir el caso". El reflective layer convierte en acción.

---

# FASE 8 — Página Pública `/obras/[ocid]`

## 8.1 Objetivo psicológico

- **Authority** (Cialdini) extendida: la página pública es el "comprobante" que existe fuera de la app. Si parece artículo del FT, transfiere credibilidad incluso al jurado que no la abre.
- **Mere Exposure + Social Sharing**: cuanto más circule, más se reconoce. La OG image generada por `/api/og` debe verse como portada de revista, no como link preview.
- **SEO authority**: metadata + structured data ya están armados en Fase previa. La presentación visual cierra el círculo.

## 8.2 Acciones quirúrgicas

### 8.2.1 Hero giga editorial

Reemplazar el header de la página por:

```tsx
<header className="max-w-3xl mx-auto px-6 pt-16 pb-12">
  <p className="text-[10px] uppercase tracking-[0.36em] text-[var(--alarm)] font-mono">
    Caso · {obra.buyer_locality} · {obra.source_year}
  </p>
  <h1
    className="mt-5 text-[clamp(36px,6vw,72px)] leading-[1.02] text-white font-medium"
    style={{ fontFamily: "var(--font-display)" }}
  >
    {obra.tender_title}
  </h1>
  <p className="mt-6 text-lg text-[var(--fg-dim)] leading-relaxed max-w-prose">
    {obra.buyer_name} pagó{" "}
    <span className="text-[var(--brand)] font-mono">
      {fmtSolesLong(monto)}
    </span>{" "}
    a <span className="text-white">{obra.supplier_name ?? "—"}</span>{" "}
    {obra.contract_start && (
      <>en {fmtFecha(obra.contract_start)}</>
    )}
    .
  </p>
</header>
```

### 8.2.2 Pull-quote del riesgo

Si hay red_flag, debajo del header:

```tsx
{obra.is_red_flag && (
  <blockquote className="max-w-2xl mx-auto px-6 my-12 border-l-2 border-[var(--alarm)] pl-6">
    <p
      className="text-[28px] leading-[1.2] text-white font-medium italic"
      style={{ fontFamily: "var(--font-display)" }}
    >
      Este contratista figura en {(obra.red_flag_types ?? []).join(" · ").replace(/_/g, " ")}.
    </p>
    <cite className="block mt-4 text-[11px] uppercase tracking-[0.26em] text-[var(--fg-faint)] font-mono not-italic">
      Fuente · OECE Datosabiertos · {new Date().getFullYear()}
    </cite>
  </blockquote>
)}
```

### 8.2.3 Stats tabulares

3 stats horizontales con divisores verticales (igual estética del panel detalle, pero al ancho de página).

### 8.2.4 Footer de autoridad

```tsx
<footer className="border-t border-[var(--rule)] mt-20 py-8 max-w-3xl mx-auto px-6 text-[11px] uppercase tracking-[0.22em] text-[var(--fg-faint)] font-mono">
  <p>Datos: OCDS Open Contracting · OECE · MEF</p>
  <p className="mt-2">
    OCID <span className="text-white">{obra.ocid}</span>
  </p>
</footer>
```

## 8.3 Métrica de éxito

- Tomar screenshot y poner al lado un artículo cualquiera del NYT/FT — la diferencia visual debe ser ESTILÍSTICA, no de calidad percibida.
- Compartir el link en Twitter: la card OG (Fase ya hecha) debe verse premium.

---

# FASE 9 — Microcopy Killer

## 9.1 Objetivo psicológico

- **Labeling** (Voss, *Never Split the Difference*, 2016): nombrar la emoción del jurado antes de que la sienta. "Esto es plata tuya" en lugar de "Esto es presupuesto público".
- **Loss Aversion** (Kahneman & Tversky): replantear cada interacción como pérdida potencial.
- **Reciprocity** (Cialdini): dar al usuario información sin pedirle nada (en el HUD, en los kickers) activa reciprocidad → mayor probabilidad de compartir.
- **Concrete vs abstract** (Trope & Liberman, *Construal Level Theory*, 2010): aterrizar lo abstracto ("transparencia") en lo concreto ("S/ 4.2M por reparar 800 metros de pista en Surco").

## 9.2 Tabla copy actual → killer

Crear `web/lib/copy.ts` para centralizar:

```ts
export const COPY = {
  brand: {
    word: "Transparentape",
    tagline: "El billete deja huella.",
    sub: "Lo grabamos.",
  },
  index: {
    kicker: "Edición · {fecha}",
    title: "Índice",
    standfirst: "Cada línea es un contrato público con coordenadas, plata y nombre y apellido.",
  },
  panel: {
    kicker: "Caso · {distrito} · {año}",
    money: {
      label: "Rastreo del billete",
      referencial: "Lo que dijeron",
      adjudicado: "Lo que firmaron",
      contrato: "Lo que terminó costando",
    },
    contractor: {
      title: "Quién recibió el billete",
    },
    cta: {
      investigate: "Investigar este caso",
      share: "Compartir",
    },
  },
  forensics: {
    intro: "{comprador} contrató a {contratista} por {monto}. Estos son los puntos que vale la pena mirar.",
    disclaimer: "Esta investigación es generada automáticamente sobre datos abiertos. No es una acusación.",
    cta: "Compartir el caso",
  },
  share: {
    twitterText:
      "{titulo} — {distrito}. {monto}. Y el contratista ya tiene antecedentes.",
  },
} as const;
```

> Reemplazar todos los strings hardcoded en los componentes por referencias a `COPY.*`.

## 9.3 Reglas duras de microcopy

1. **Nunca "Usuario"** → "Estratega" / "Ciudadano".
2. **Nunca "Item"** → "Caso" / "Obra".
3. **Nunca "Eliminar"** → "Archivar" (este patrón ya está en tu CLAUDE.md global).
4. **Nunca emoji decorativo**. Solo cuando informa (🔴 🟡 🟢 en el bot Kapso porque ahí el medio es WhatsApp).
5. **Verbos en imperativo corto**: "Investigar", "Compartir", "Ver", no "Investigar este caso ahora!".

## 9.4 Métrica de éxito

- Lectura de portada en voz alta debe sonar a primera plana de diario, no a "Welcome to our dashboard".
- Cada string responde a la pregunta: "¿esto haría que YO comparta esta obra con un periodista amigo?".

---

# FASE 10 — Atmósfera (Grain + Gradient + Cursor)

## 10.1 Objetivo psicológico

**Embodied Cognition** (Lakoff, Wilson): texturas y atmósferas afectan inconscientemente la percepción de "calidez", "seriedad", "peso". Un grain sutil hace que la pantalla "respire" como papel impreso → activa asociaciones de prensa seria.

**Aesthetic-Usability** una vez más: atmosphere = depth = perceived craft.

## 10.2 Acciones quirúrgicas

### 10.2.1 Grain SVG procedural

Agregar al final de `app/globals.css`:

```css
/* Grain procedural — superpuesto a toda la app */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
  opacity: 0.06;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
}

/* Gradiente radial brand-deep tras el globo */
.globe-bg {
  background:
    radial-gradient(1200px 800px at 50% 60%, var(--brand-deep) 0%, transparent 60%),
    radial-gradient(800px 600px at 80% 20%, rgba(66,220,58,0.04) 0%, transparent 60%),
    var(--ink-0);
}
```

Aplicar `className="globe-bg"` al `<main>` de `app/page.tsx`.

### 10.2.2 Custom cursor sobre el globo

Sobre el container del mapa, agregar un cursor circular minimal:

```css
.globe-cursor {
  cursor: none;
}
.globe-cursor-dot {
  position: fixed;
  width: 24px;
  height: 24px;
  border: 1px solid var(--brand);
  border-radius: 9999px;
  pointer-events: none;
  z-index: 99;
  mix-blend-mode: difference;
  transition: width 200ms var(--ease-snap), height 200ms var(--ease-snap), opacity 200ms;
}
.globe-cursor-dot.is-over-marker {
  width: 40px;
  height: 40px;
  background: var(--brand-glow);
}
```

Componente React mínimo:

```tsx
// web/components/CustomCursor.tsx
"use client";
import { useEffect, useState } from "react";

export default function CustomCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return (
    <span
      className="globe-cursor-dot hidden lg:block"
      style={{ transform: `translate(${pos.x - 12}px, ${pos.y - 12}px)` }}
    />
  );
}
```

> Mount sólo en desktop. En mobile no aplica.

### 10.2.3 Decorative rule lines

En el header global y entre secciones largas, agregar separadores ultra finos con label tipográfico:

```tsx
<div className="flex items-center gap-3 my-12">
  <span className="text-[9px] uppercase tracking-[0.36em] text-[var(--fg-faint)] font-mono">
    {label}
  </span>
  <span className="flex-1 h-px bg-[var(--rule)]" />
</div>
```

## 10.3 Métrica de éxito

- En screenshot estático, el grain debe ser apenas perceptible — el cerebro lo registra pero no lo nombra.
- Sin grain vs con grain en A/B mental: con grain se ve "premium / impreso". Sin grain se ve "webapp".

---

# FASE 11 — Validación de Impacto

## 11.1 Checklist visual (rúbrica del jurado simulada)

Imprimir esto y revisar antes del pitch:

- [ ] El cold open dura 2.4s exactos y se puede skip con Esc/click
- [ ] El primer número que ve el jurado es **S/ 49,800,000,000** en mono giga
- [ ] La frase "El billete deja huella. Lo grabamos." aparece en serif con énfasis brand italic en "Lo grabamos"
- [ ] El HUD muestra OCDS / OECE / MEF como fuente
- [ ] Los markers red_flag pulsan visiblemente
- [ ] A los ~3.2s del page load, el globo vuela solo a UN caso con red_flag
- [ ] El panel detalle abre con kicker editorial + título en Fraunces + 3 montos con delta porcentual
- [ ] El delta del adjudicado vs referencial es rojo si supera 5%
- [ ] El nombre del contratista aparece en Fraunces grande, no escondido en un sub-label
- [ ] Click en "Investigar" abre forensics modal cinemático con número 01 / 02 / 03 giant
- [ ] La página `/obras/[ocid]` parece artículo de revista, no dashboard page
- [ ] Grain SVG aplicado en toda la app
- [ ] Custom cursor activo en desktop
- [ ] Ningún uso de Inter, Roboto, Arial, system-ui
- [ ] Ningún botón con gradiente púrpura ni "shimmer" decorativo
- [ ] Ningún emoji decorativo en la UI (sólo en outputs del bot WhatsApp)

## 11.2 Test de 5 segundos

Mostrar la home a alguien que no conoce el proyecto. A los 5 segundos, taparla y preguntar:

1. ¿De qué se trata? → Esperamos: "transparencia / obras públicas / corrupción / dinero del estado".
2. ¿Es serio o juguete? → Esperamos: "serio / parece NYT / parece investigación".
3. ¿Te dieron ganas de hacer click en algo? → Esperamos: "sí, en el punto rojo grande" / "sí, en la frase de arriba".

Si las 3 respuestas pegan, ganamos los primeros 90 segundos del pitch.

## 11.3 Performance budget

- Cold open NO debe bloquear el mount del mapa (este se monta detrás durante los 2.4s).
- Lighthouse score target en `/`: Performance > 80, Accessibility > 95, Best Practices = 100.
- Bundle size del cold open: < 8KB después de gzip (Motion library lazy-imported).

---

# ANEXO A — Bibliografía y citas verificables

| Técnica | Fuente |
|---|---|
| Aesthetic-Usability Effect | Lavie, T., & Tractinsky, N. (2004). "Assessing dimensions of perceived visual aesthetics of web sites." *Int. J. Human-Computer Studies*, 60. |
| Halo Effect | Thorndike, E. L. (1920). "A constant error in psychological ratings." *J. Applied Psychology*, 4. |
| Visceral / Behavioral / Reflective design | Norman, D. (2004). *Emotional Design*. Basic Books. |
| 50ms first impression | Lindgaard, G., et al. (2006). "Attention web designers: You have 50 milliseconds to make a good first impression!" *Behaviour & Information Technology*, 25. |
| Identifiable Victim Effect | Slovic, P. (2007). "If I look at the mass I will never act." *Judgment and Decision Making*, 2. |
| Anchoring | Tversky, A., & Kahneman, D. (1974). "Judgment under uncertainty: Heuristics and biases." *Science*, 185. |
| Loss Aversion / Prospect Theory | Kahneman, D., & Tversky, A. (1979). *Econometrica*, 47. |
| Authority + Social Proof + Reciprocity | Cialdini, R. (1984). *Influence: The Psychology of Persuasion*. |
| Labeling (negotiation) | Voss, C. (2016). *Never Split the Difference*. HarperBusiness. |
| Hick's Law | Hick, W. E. (1952). "On the rate of gain of information." *Quarterly Journal of Experimental Psychology*, 4. |
| Von Restorff Effect | Von Restorff, H. (1933). "Über die Wirkung von Bereichsbildungen im Spurenfeld." *Psychologische Forschung*, 18. |
| Curiosity Gap | Loewenstein, G. (1994). "The psychology of curiosity." *Psychological Bulletin*, 116. |
| System 1 / System 2 | Kahneman, D. (2011). *Thinking, Fast and Slow*. |
| Construal Level Theory | Trope, Y., & Liberman, N. (2010). "Construal-level theory of psychological distance." *Psychological Review*, 117. |
| Mere Exposure Effect | Zajonc, R. B. (1968). *Journal of Personality and Social Psychology*. |
| Working memory 7±2 | Miller, G. A. (1956). *Psychological Review*. |

---

# ANEXO B — Guión de pitch de 90 segundos basado en este UI

| t | Acción del demo | Línea hablada |
|---|---|---|
| 0:00 | Pantalla con cold open arrancando | "Esto es la plata que el Estado peruano gastó en obras en Lima en 6 años." |
| 0:08 | Aparece S/ 401B y "Lo grabamos" en italic brand | "El problema no es que el dato no exista. Está. El problema es que nadie lo lee." |
| 0:15 | Cold open termina, globo se revela | "Lo abrimos. Cada punto es un contrato real, sacado del estándar OCDS." |
| 0:25 | Globo vuela solo a un caso red_flag | "Esta obra en Surco se firmó por 4.2 millones. El contratista ya tenía dos sanciones del OECE." |
| 0:38 | Abre panel con delta porcentual rojo | "El adjudicado superó el referencial en 18%. El contrato terminó costando 11% más que el adjudicado. Eso es plata pública." |
| 0:55 | Click en "Investigar este caso" | "Y todo esto se genera automáticamente desde datos abiertos. Sin un humano detrás." |
| 1:08 | Modal forensics con 3 hallazgos numerados | "Tres señales rojas en este contrato, todas auditables." |
| 1:20 | Compartir → muestra OG image | "Y compartible en un solo clic, con tarjeta de calidad editorial." |
| 1:30 | Volver al globo + zoom out al globo entero | "Mismo sistema, cualquier ciudad de LATAM que publique OCDS. Bogotá, Santiago, CDMX. En una hora." |
| 1:30 | (fin) | "Transparentape. Gracias." |

---

# ANEXO C — Lo que NO vamos a hacer (decisiones explícitas para defender en review)

- **No** modo claro. Forense es de noche, no de mañana.
- **No** glassmorphism cliché — la transparencia que sí usamos es para paneles flotantes, controlada, no decorativa.
- **No** logos sponsor del hack en la home — eso va en el deck, no en el producto. Distrae del impacto.
- **No** chatbot widget visible en la home — el WhatsApp bot es un canal aparte, no un floating bubble.
- **No** carousel de "features" — no somos una landing de SaaS.
- **No** intro vídeo en mp4 — el cold open es código, escala, es ligero.

---

**Última línea**:
Si una fase no se puede ejecutar a tiempo, **saltar la atmósfera** (Fase 10) antes que cualquier otra. La atmósfera mejora una pieza ya buena; las fases 1 a 7 son la pieza.
