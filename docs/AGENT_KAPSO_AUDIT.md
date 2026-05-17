# Audit completo del agente Kapso

Estado real auditado leyendo los archivos. Corrige imprecisiones de docs previos. Reevalúa Milestone A con base en lo que **realmente** falta. Evalúa la casuística "ranking de empresas con mayor riesgo de corrupción futura".

> **Generado:** 2026-05-17 · vs commit `d1fd14b`

---

## Inventario real del agente

### Archivos + LOC

| Archivo | LOC | Resumen |
|---|---|---|
| `app/api/kapso/webhook/route.ts` | 610 | Endpoint, dispatch, fast-path saludo, dedup, typing, send |
| `lib/agent/core.ts` | 517 | `runChatPipeline` con tools, adaptive fallback, reflexion implícito |
| `lib/agent/tools.ts` | 276 | **10 tools** registrados |
| `lib/agent-kapso/queries.ts` | 472 | SQL canónico con `q`, `q_geo`, `q_supplier`, `q_sector`, infobras join |
| `lib/agent-kapso/wa-format.ts` | 369 | 10 formatters + INTRO_MSG + COUNTRY_NAMES + CURRENCY |
| `lib/agent-kapso/places.ts` | 382 | Allowlist 6 países + `classifyQuery` (geo/supplier/sector split) |
| `lib/agent-kapso/intent.ts` | 324 | **10 intents** regex |
| `lib/agent-kapso/session.ts` | 95 | `getSession`/`updateSession` sobre `agent_sessions` |
| `lib/agent-kapso/config.ts` | 32 | `AGENT.models`/`timeoutMs`/`limits` |
| `lib/agent-kapso/index.ts` | 5 | Barrel exports |
| `lib/agent-kapso/test-agent.ts` · `test-suite.ts` · `load-test.ts` | 871 | Tests internos |
| ~~`engine.ts`~~ | — | **Eliminado** |

Total código del agente: ~3,950 líneas. Tests aparte.

### Intents (10 — eran 9 en docs previos)

`CAMBIAR_PAIS`, `AYUDA`, `AGRADECIMIENTO`, `BUSCAR_CERCANOS`, `CONTEXTO_DETALLE` (singular + plural), `VER_DETALLE`, `INVESTIGAR_CONTRATISTA`, **`OBRAS_RETRASADAS`**, `BUSCAR_OBRAS`, `PREGUNTA_LIBRE`.

**Importante:** `OBRAS_RETRASADAS` ya está como fast-path regex (intent.ts:276-290), no solo como tool. Triggers: `retrasad[oa]s?|atrasad[oa]s?|estancad[oa]s?|paralizad[oa]s?|demorad[oa]s?|retrasos?|atrasos?|demoras?|fuera de plazo|sin avance|sobre plazo|...`

### Tools registrados (10 — eran 9 en docs previos)

`buscar_obras`, `ver_detalle`, `stats_pais`, `ranking_contratistas`, `ranking_entidades`, `adjudicacion_directa`, `investigar_contratista`, `inhabilitados`, `monto_en_riesgo`, **`obras_retrasadas`**.

### Queries SQL existentes (12 funciones)

- `buscarObras(filters)` — soporta `q`, `q_geo`, `q_supplier`, `q_sector`
- `getObraResumen(id)`
- `buscarCercanas(lat, lng, country, limit)`
- `yearsDisponibles(country)`
- `rankingContratistas(country, por, limit, q)` — `por: monto|alertas`, `q` geo
- `investigarContratista(rucONombre, country)` — paraleliza obras + stats + sanción
- `inhabilitadosVigentes(country, limit, q)` — JOIN red_flags
- `adjudicacionDirectaAlertas(country, limit, q)`
- `rankingEntidades(country, limit, q)`
- `montoEnRiesgo(country, q)`
- **`obrasRetrasadas(country, q, limit, year)`** — JOIN obras ⋈ infobras_full con cálculo de `dias_retraso` + regex anti-cast-bomb sobre fechas TEXT
- `statsPorPais(country, q)`

**Todas las agregaciones aceptan `q` geo carry-forward.** Eso es lo que hace que "obras en Piura" → "y el ranking?" filtre Piura.

### Formatters (10)

`fmtObras`, `fmtDetalle`, `fmtCercanas`, `fmtStats`, `fmtRankingContratistas`, `fmtInvestigacion`, `fmtInhabilitados`, `fmtAdjudicacionDirecta`, `fmtRankingEntidades`, **`fmtRetrasadas`** (con barra ASCII `▓▓▓▓░░ 60%`), `fmtMontoEnRiesgo`.

### Sesión `agent_sessions`

```
conversation_id, country, last_query, last_result_ids, last_messages,
last_location, last_suggestions, updated_at
```

TTL 30 min. Migrations 06-09 + 11.

---

## Reevaluación de Milestone A — qué falta de verdad

Versión previa del Milestone A asumía cosas que **YA están hechas**. Audit real:

### ✅ YA implementado (no requiere trabajo)

- **Closing prompts contextuales** — `hint()` helper + constantes `HINT_OBRAS`, `HINT_GENERAL`. Cada formatter cierra con sugerencia next-action. Ejemplos en código:
  - `fmtObras`: "_Responde *el primero*, *el segundo*... para ver detalles._"
  - `fmtRankingContratistas`: "_Escribe *investigar [empresa]* para ver sus obras._"
  - `fmtStats`: "_Prueba: *ranking contratistas* · *monto en riesgo* · *obras en Lima*_"
  - 7 hints específicos más.
- **Plural ordinals** — "los primeros 3", "ultimas 2" en intent.ts:74-89.
- **Thin-data note** — `thinDataNote(country)` agrega aviso "_ℹ️ Datos limitados para este país_" en CL/CO/MX/AR/BR.
- **Title-case en obras** — `cleanTitle()` convierte ALLCAPS a Title Case y trunca a 85 chars.
- **`AGRADECIMIENTO` intent** — existe en `parseIntent` línea 188-190 y case en webhook. **Pero NO es fast-path real** — pasa por `getSession` primero.

### ❌ Sigue faltando (Milestone A real, reescrito)

| # | Cambio | LOC | Detalle |
|---|---|---|---|
| **A1** | **`lookup_definition` tool + dict cívico** | ~80 | Nuevo archivo `lib/agent-kapso/definitions.ts` con ~20 términos (adjudicación directa, OCDS, OECE, RUC, red flag, contraloría, valor referencial, expediente técnico, supervisor, consorcio, adenda, penalidad, inhabilitación, proceso de selección, licitación pública, etc.). Tool agregado a `tools.ts`. |
| **A2** | **Footer fuente** | ~12 | Constante `FECHA_DATOS` en `config.ts`. Helper `SOURCE_FOOTER` en `wa-format.ts`. Append en `fmtObras`/`fmtDetalle`/`fmtStats`/etc. Hoy NINGÚN formatter cita fuente standardizada (sólo INTRO_MSG menciona "OCDS · SEACE · Mercado Público" como copy). |
| **A3** | **Link compartible** | ~3 | En `fmtDetalle` agregar `\n🔗 https://transparentape.app/obras/${ocid}`. Hoy muestra `🔖 OCID: ${ocid}` pero no la URL. |
| **A4** | **Copy tono ciudadano (PARCIAL hoy)** | ~25 | `fmtDetalle` aún muestra `red_flag_types.join(", ")` raw — sale "sancion_inhabilitacion, penalidad" en pantalla. También `Método: ${procurement_method}` muestra "direct"/"open". Mapeo: `direct` → "adjudicación directa (sin concurso)"; `open` → "licitación abierta"; `sancion_inhabilitacion` → "🚫 contratista sancionado por OECE"; `penalidad` → "⚠️ obra con penalidad". |
| **A5** | **Fast-path AGRADECIMIENTO real** | ~12 | Hoy el intent existe pero pasa por `getSession` (DB hit ~500ms) + `parseIntent` antes de retornar texto fijo. Misma técnica que `GREETING_RE`: regex check en webhook ANTES de handleMessage, `waitUntil` con sendText directo. |

**Total real Milestone A:** ~130 LOC, ~4-5h.

Versión previa estimaba 6h y 160 LOC. Audit baja por las pieces ya hechas.

---

## Casuística específica: "ranking de empresas con mayor riesgo de corrupción FUTURA"

### Análisis técnico

**El user pide:** score predictivo por contratista sobre comportamiento futuro de riesgo.

**¿Predicción real (ML)?** No. Sería modelo entrenado con features históricas + outcome (corrupción confirmada). No tenemos labels confirmados → no ML.

**¿Heurística defendible?** Sí. Score compuesto sobre patrones históricos. Lo que llamarías "score de riesgo según patrones detectados", no "predicción futura".

### Datos disponibles para el score

| Señal | Columna | Cobertura |
|---|---|---|
| Tasa histórica red_flag | `obras.is_red_flag` | 6% obras PE |
| Sanción vigente | `red_flags.vigente` | 960 vigentes |
| Adjudicación directa | `obras.procurement_method='direct'` | 2,817 |
| Sobrecostos | `obras.contract_amount > tender_amount * 1.1` | calculable |
| Adendas plazo | `infobras_full.n_modificaciones_plazo` | 165 obras |
| Avance lento | `infobras_full.avance_fisico_pct` | 165 obras |
| Concentración entidad | HAVING COUNT >5 mismo `buyer_name` | calculable |

### Fórmula heurística propuesta

```
risk_score = clamp(0, 100,
    30 * tasa_red_flag          # red_flag_count / obras_total
  + 25 * inhabilitado_vigente   # 1 si tiene sanción activa, 0 sino
  + 15 * tasa_adj_directa       # adj_directa / obras_total
  + 15 * tasa_sobrecostos       # obras con sobrecosto > 10% / obras_total
  + 10 * concentracion_entidad  # 1 si >50% obras en una sola entidad
  +  5 * adendas_promedio_norm  # avg(n_modif_plazo) / 5, capped at 1
)
```

Componentes normalizados [0-1]. Multiplicados por peso. Suma → [0-100].

**Decisión de pesos:**
- Inhabilitación vigente vale 25 porque es señal regulatoria fuerte.
- Tasa red_flag vale 30 porque integra varios riesgos ya detectados.
- Adj. directa + sobrecostos suman 30 — patrones procedimentales.
- Concentración 10 — proxy de cártel.
- Adendas 5 — solo 165 obras tienen, peso bajo.

### SQL viable (CTE)

```sql
WITH base AS (
  SELECT
    o.supplier_ruc,
    o.supplier_name,
    COUNT(*) AS obras_total,
    COUNT(*) FILTER (WHERE o.is_red_flag) AS red_flag_count,
    COUNT(*) FILTER (WHERE o.procurement_method='direct') AS adj_directa_count,
    COUNT(*) FILTER (
      WHERE o.contract_amount IS NOT NULL
        AND o.tender_amount IS NOT NULL
        AND o.tender_amount > 0
        AND o.contract_amount > o.tender_amount * 1.1
    ) AS sobrecostos_count,
    (
      SELECT MAX(c) FROM (
        SELECT COUNT(*) AS c FROM obras o2
        WHERE o2.supplier_ruc = o.supplier_ruc AND o2.country = $1
        GROUP BY o2.buyer_name
      ) sub
    )::float / NULLIF(COUNT(*),0) AS concentracion_max,
    EXISTS (SELECT 1 FROM red_flags rf WHERE rf.ruc = o.supplier_ruc AND rf.vigente=TRUE) AS inhabilitado,
    AVG(i.n_modificaciones_plazo) AS adendas_avg
  FROM obras o
  LEFT JOIN infobras_full i ON o.infobras_code = i.codigo_infobras
  WHERE o.country = $1 AND o.supplier_ruc IS NOT NULL
  GROUP BY o.supplier_ruc, o.supplier_name
  HAVING COUNT(*) >= 5  -- contratistas con historial mínimo
)
SELECT
  supplier_name,
  supplier_ruc,
  obras_total,
  ROUND(
    LEAST(100,
        30 * red_flag_count::numeric / obras_total
      + 25 * CASE WHEN inhabilitado THEN 1 ELSE 0 END
      + 15 * adj_directa_count::numeric / obras_total
      + 15 * sobrecostos_count::numeric / obras_total
      + 10 * LEAST(1, concentracion_max)
      +  5 * LEAST(1, COALESCE(adendas_avg, 0) / 5.0)
    ), 1
  ) AS risk_score,
  red_flag_count,
  inhabilitado,
  adj_directa_count,
  sobrecostos_count,
  ROUND(concentracion_max::numeric, 2) AS concentracion_max
FROM base
ORDER BY risk_score DESC, obras_total DESC
LIMIT 10;
```

Latencia esperada: 3-6s sobre 70K obras + LEFT JOIN infobras (579 filas) + subquery concentración. Aceptable. Si pesa, materializar en view.

### Output WhatsApp propuesto

```
🚨 *Top 5 contratistas con patrones de riesgo · Perú*
_Score basado en historial OCDS + sanciones OECE._

1. *CONSORCIO X* — Score 78/100
   📊 193 obras · ⚠️ 41 con alerta (21%)
   🚫 Inhabilitado vigente
   ⚡ 35% adjudicación directa · 60% concentrado en 1 entidad

2. *EMPRESA Y* — Score 65/100
   📊 47 obras · ⚠️ 12 con alerta (26%)
   💰 8 con sobrecostos >10%
   🔁 Promedio 4 adendas de plazo

[...]

_Componentes del score: tasa de alertas (30%), inhabilitación vigente (25%), uso adj. directa (15%), sobrecostos (15%), concentración entidad (10%), adendas (5%)._
_Fuente: OCDS · OECE. No es predicción individual de delito — refleja patrones agregados._
```

### Viabilidad legal/reputacional — **CUIDADO**

Nombrar empresas privadas como "mayor riesgo de corrupción" es **legalmente riesgoso** en Perú:

- **Código Civil PE Art. 1969** — responsabilidad civil por daño moral.
- **Ley 26842 / Código Penal Art. 132** — difamación si afirmas hechos falsos como ciertos.
- **Derecho a réplica** — empresas pueden exigir rectificación.

**Mitigaciones obligatorias antes de publicar el tool:**

1. **NO usar las palabras "corrupto", "fraude", "delincuente"** en ningún texto. Solo "patrones de riesgo", "alertas detectadas", "señales históricas".
2. **Mostrar componentes del score visiblemente** (transparencia algorítmica). El user debe entender por qué la empresa está en la lista.
3. **Citar fuentes explícitas** ("OCDS · OECE") en cada respuesta.
4. **Disclaimer al final**: "Score basado en datos públicos. No constituye acusación legal. Una empresa puede tener score alto sin haber cometido delito."
5. **Threshold de mínimo** — `HAVING COUNT(*) >= 5` evita empresas con 1-2 obras y `is_red_flag=TRUE` dando 100/100 espurio.
6. **No personalizar a personas físicas** (RUC sí, supplier_name OK, no nombrar dueños/gerentes).

### Viabilidad UX

- Formato canónico (`fmtRankingContratistas` ya existe — base estructural).
- Nuevo formatter `fmtRankingRiesgo` con componentes desglosados.
- Carry-forward `q` geo nativo (igual que ranking_contratistas).

### Implementación recomendada

**Como tool nuevo, NO como intent regex.** El LLM router lo despacha cuando el user paraphrase ("¿qué empresas son las más sospechosas?", "ranking de los peores contratistas", "empresas que se ven más turbias").

```ts
{
  name: "ranking_riesgo",
  description:
    "Ranking de contratistas por score compuesto de riesgo según historial público (OCDS + OECE). Usa cuando el usuario pregunta por empresas 'sospechosas', 'de mayor riesgo', 'más turbias', 'peores contratistas', o pide identificar empresas a vigilar. Score combina: tasa de alertas, sanción vigente, uso de adjudicación directa, sobrecostos, concentración por entidad, adendas. NO es predicción de delito individual — refleja patrones agregados.",
  parameters: {
    q: "string opcional — región para acotar",
    limit: "número opcional — default 5, max 10",
  },
  async run(args, ctx) { ... }
}
```

### Estimación

- `rankingRiesgo` en queries.ts: ~50 LOC
- `fmtRankingRiesgo` en wa-format.ts: ~40 LOC
- Tool entry: ~25 LOC
- Tests: ~30 LOC
- Total: ~145 LOC · ~4-6h

### Recomendación final

**Sí implementar.** Es exactamente el tipo de feature que diferencia un agente cívico de un buscador OCDS. Pero **estrictamente con los 6 mitigantes**. Sin ellos, el bot se vuelve potencial vector de demandas.

Ubicación en roadmap: **Milestone B** (junto con `sobrecostos`, `obras_activas`, `inhabilitados_activos`).

---

## Milestone B reevaluado (con base en audit)

Lo que efectivamente falta:

| # | Tool | Estado | LOC |
|---|---|---|---|
| B1 | `avance_obra` (standalone) | Datos viven en infobras_full pero NO hay tool aislado. Hoy solo `obras_retrasadas` los usa. | ~40 |
| B2 | `supervisor_obra` (standalone) | Mismo caso — `fmtRetrasadas` lo incluye pero no hay tool dedicado para "¿quién supervisa la obra X?". | ~30 |
| B3 | `sobrecostos` | No existe. Comparación `contract_amount > tender_amount * 1.1`. | ~50 |
| B4 | `obras_activas` | Filtro `contract_status='active'` no expuesto. 10K obras disponibles. | ~30 |
| B5 | `inhabilitados_activos` | `inhabilitados` actual NO filtra por contratos recientes. Nuevo tool cruza con `contract_start::date > NOW() - INTERVAL '12 months'`. | ~40 |
| B6 | **`ranking_riesgo`** (casuística user) | **No existe.** CTE compuesto + formatter con desglose. | ~145 |

**Total Milestone B:** ~335 LOC, ~10-12h.

---

## Top 4 ROI ajustado (post-audit)

1. **`lookup_definition` + dict cívico** — diferencial educativo. ~80 LOC.
2. **`ranking_riesgo`** — casuística pedida por user. ~145 LOC. **Con los 6 mitigantes legales**.
3. **`sobrecostos`** — tema número 1 de preocupación ciudadana. ~50 LOC.
4. **Footer fuente + link compartible** — confianza + viralidad. ~15 LOC.

---

## Pregunta abierta para el user

Para `ranking_riesgo`:

1. **¿Aceptas el framing "patrones históricos de riesgo" en vez de "predicción de corrupción"?** (clave legal)
2. **¿Mostrar componentes del score?** Sí recomendado, no aumenta significativamente la longitud.
3. **¿Umbral mínimo de obras?** 5 propuesto. Más alto (10) reduce falsos positivos pero deja fuera empresas chicas.
4. **¿Pesos del score son OK?** 30% red_flag · 25% inhabilitado · 15% adj. directa · 15% sobrecostos · 10% concentración · 5% adendas. Tunable.
