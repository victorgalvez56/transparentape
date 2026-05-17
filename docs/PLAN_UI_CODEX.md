# PLAN_UI_CODEX — Redesign del `/` estilo codex-globe

Objetivo: adaptar el `/` (home 2D) al pattern de
https://github.com/crafter-station/codex-globe — clean, jerarquizado,
información bajo demanda. **No tocar `/vr`** (otra rama / otra historia).

## Principios de diseño

1. **Globo es el héroe** — centro de la pantalla, libre de overlays
2. **Información bajo demanda** — sidebar collapse-friendly, drawer solo cuando aplica
3. **Animaciones se respetan** — cold open, flyTo, fade-in del HUD se mantienen
4. **Tipografía editorial** — Fraunces serif + IBM Plex Mono se mantienen
5. **Theme** — light / dark / system, persistido en localStorage. Map queda dark (es el satellite, no cambia)
6. **Reuso** — `ObraDetailPanel`, `BeforeAfterSlider`, `ForensicsPanel` se mantienen, solo cambia dónde montan

## Layout final

```
┌─────────────────────────────────────────────────────────────────┐
│ Transparentape.   Inicio · Obras   │ stats │   ⭐ · 🌗 · 🌐/📋  │  Topbar 60px
├─────────────────────────────────────────────────────────────────┤
│ [Todos] Perú 2,800  Chile 2,000  Colombia 0  ···                │  Country chips 44px
├─────────────────────────────────────────────────────────────────┤
│                                          ┌────────────────────┐ │
│                                          │ Buscar...           │ │
│                                          │ T / A / M / B       │ │
│                                          ├────────────────────┤ │
│        🌍 MapGlobe (hero)                │ ÍNDICE (lista)      │ │
│                                          │ - obras...           │ │
│                                          ├────────────────────┤ │
│                                          │ DETALLE (slide-in)  │ │
│                                          │ Street View + AI    │ │
│                                          │ → Investigar         │ │
│                                          └────────────────────┘ │
│  Live data · Fuente OCDS/OECE/MEF                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Theme system (foundation)

**Goal:** light / dark / system toggle con persistencia.

**Files:**
- `lib/theme.ts` (new): types + utilities
- `components/ThemeProvider.tsx` (new): React Context + localStorage
- `components/ThemeToggle.tsx` (new): botón con icono sol/luna/monitor
- `app/layout.tsx`: wrap children with ThemeProvider
- `app/globals.css`: agregar `[data-theme="light"]` overrides para CSS vars

**CSS vars expuestas:**
- `--ink-0` (background), `--ink-1`, `--ink-2`, `--ink-3`
- `--fg`, `--fg-dim`, `--fg-faint`
- `--rule` (borders)
- `--brand`, `--alarm`, `--warn` (no cambian con theme)

**Validation:**
- Toggle entre 3 estados funciona
- localStorage persiste correctamente
- Refresh respeta el tema guardado
- Sin tocar el mapa visualmente

**Commit:** `feat(ui): theme system light/dark/system con localStorage`

---

## Phase 2 — Topbar (reemplaza AuthorityHud)

**Goal:** nuevo topbar full-width, 3 columnas, theme toggle integrado.

**Files:**
- `components/Topbar.tsx` (new): logo + nav + stats + actions
- `app/page.tsx`: importar Topbar en lugar de AuthorityHud
- `components/AuthorityHud.tsx`: deprecar (mantener archivo pero sin usar)

**Layout:**
```
[ Logo + Nav ]   [ Stats centro ]   [ ⭐ GitHub · 🌗 Theme · 🌐 View ]
```

**Stats centro:**
- N contratos · N alertas · S/ presupuesto · región actual (live, scroll-spy)

**Actions:**
- ⭐ GitHub star count (opcional, fetch GitHub API)
- ThemeToggle
- View toggle: Globo (current) / Lista — si está en Lista, oculta map y muestra solo sidebar full-width

**Validation:**
- Topbar visible en mobile y desktop
- Stats se actualizan en vivo
- Theme toggle funcional
- View toggle Globo/Lista cambia layout

**Commit:** `feat(ui): topbar 3-column estilo codex con theme + view toggle`

---

## Phase 3 — Country chips

**Goal:** row debajo topbar con chips de país, count por país, click filtra.

**Files:**
- `components/CountryChips.tsx` (new): row horizontal scrollable
- `app/page.tsx`: state para filtro de país, integrar componente
- `lib/countries.ts`: agregar helper `availableCountriesWithCount(obras)`

**UX:**
- Chip "Todos" siempre visible (default activo)
- Chip por país con count: `Perú 2,800` `Chile 2,000` `Colombia 0`
- Click chip → set filter + flyTo del país (reutiliza CountryView)
- Países con count=0 aparecen disabled/grayed

**Validation:**
- Click "Perú" filtra obras y vuela cámara
- Click "Todos" reset y vista global
- Counts se actualizan con dataset real

**Commit:** `feat(ui): country chips row con count + flyTo on select`

---

## Phase 4 — Sidebar refactor

**Goal:** ObrasListPanel slim, detalle slides into sidebar (no overlay).

**Files:**
- `components/ObrasListPanel.tsx`: simplificar header (remove "Edición · fecha"), prep para slot detalle
- `components/Sidebar.tsx` (new): wrapper que combina ObrasListPanel + slot detalle
- `app/page.tsx`: usar Sidebar en lugar de mounts separados de ObrasListPanel + ObraDetailPanel
- `components/ObraDetailPanel.tsx`: ajustar styles para encajar en sidebar (no fullscreen overlay), mantener mismo content

**Behavior:**
- Idle: solo ÍNDICE visible
- Obra seleccionada: ÍNDICE colapsa a top 50%, DETALLE slide-in en bottom 50%
- ForensicsPanel sigue siendo modal full-screen ("→ Investigar")

**Validation:**
- Click obra en mapa o lista → detalle aparece en sidebar
- Cerrar detalle → lista vuelve a ocupar todo
- Click "Investigar" → ForensicsPanel modal abre como hoy
- Sin overlays superpuestos

**Commit:** `feat(ui): sidebar unificado con detalle slide-in (no overlay)`

---

## Phase 5 — Animación inicial nueva

**Goal:** despues del ColdOpen, mostrar globo entero 1.5s antes del flyTo país.

**Files:**
- `app/page.tsx`: agregar state `mapPhase: "cold" | "global" | "country"`
- `components/MapGlobe.tsx`: aceptar prop `phase` o exponer onReady callback
- Time-machine:
  - `cold`: ColdOpen mostrando
  - `global`: cold open done, MapGlobe en vista mundial (zoom 1.5)
  - `country`: flyTo country del user

**Sequence:**
```
t=0       ColdOpen overlay con S/ 102MM
t≈3s      ColdOpen fade out → phase="global"
t≈3s      MapGlobe: ya está en vista global (no flyTo aún)
t=3-4.5s  Pausa (Earth gira sutil con auto-rotate de MapLibre)
t=4.5s    Set phase="country" → flyToCountry triggers existing easeTo
t≈7s      Usuario toma control
```

**Validation:**
- ColdOpen → pausa global 1.5s → flyTo país
- `?reset=1` reinicia el flow completo
- En sesiones repetidas (coldOpenSeen=1), skip cold open pero mantener pausa global

**Commit:** `feat(ui): animación inicial — pausa global 1.5s antes del flyTo país`

---

## Phase 6 — Polish + test E2E

**Goal:** detalles finales, accesibilidad, responsive check.

**Tasks:**
- [ ] Hover states en todos los botones
- [ ] Focus rings accessible (focus-visible)
- [ ] Mobile: sidebar colapsable o fullscreen drawer
- [ ] Country chips scroll horizontal en mobile
- [ ] Theme toggle: animación rotate suave
- [ ] CustomCursor compatibility con nuevos elementos
- [ ] Test E2E:
  - Cold open → pausa → flyTo PE → Topbar visible → Sidebar visible
  - Click obra (mapa) → detalle en sidebar
  - Click "Investigar" → forensics modal
  - Theme toggle ciclo light/dark/system
  - Country chip change → filter + flyTo
  - View toggle Globo/Lista

**Commit:** `polish(ui): hover states + focus rings + mobile + final QA`

---

## Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Romper ColdOpen → flyTo existente | Phase 5 modifica con cuidado, tests E2E |
| Theme variables no cubren todos los componentes | Phase 1 audit completo de CSS vars usadas |
| ObraDetailPanel no encaja visual en sidebar slim | Phase 4 puede requerir style adjustments |
| GitHub star count rate-limit | Cache con SWR o solo carga 1x al mount |
| MapGlobe re-render por tema (si afecta map) | Map style se mantiene fijo, theme solo afecta UI chrome |

## Out of scope (no tocamos)

- `/vr` queda EXACTAMENTE como está (otra rama, otra historia)
- `ForensicsPanel` content (solo cambia que se abre desde sidebar detalle)
- ETL / API endpoints
- BD / Supabase
- Lib `/api/*` routes
