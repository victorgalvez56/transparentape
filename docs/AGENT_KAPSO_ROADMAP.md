# Roadmap del agente Kapso — scope agente solamente

Plan acotado al boundary del **agente de WhatsApp/Kapso**: webhook, intents, queries, formatters, tool registry, sesión. Sin cron, sin templates push, sin PDFs, sin ETL nuevo, sin crowdsourcing.

> **Generado:** 2026-05-17 · scope: `web/lib/agent-kapso/*` + `web/lib/agent/*` + `web/app/api/kapso/webhook/route.ts`

---

## Scope dentro/fuera

### Dentro (lo que puedo tocar)

| Capa | Archivos |
|---|---|
| Webhook | `web/app/api/kapso/webhook/route.ts` |
| Intents (regex) | `web/lib/agent-kapso/intent.ts` |
| Queries SQL | `web/lib/agent-kapso/queries.ts` |
| Formatters WhatsApp | `web/lib/agent-kapso/wa-format.ts` |
| Sesión | `web/lib/agent-kapso/session.ts` |
| Config | `web/lib/agent-kapso/config.ts` |
| Pipeline LLM compartido | `web/lib/agent/core.ts` |
| Tool registry | `web/lib/agent/tools.ts` |
| Legacy pipeline (fallback) | `web/lib/agent-kapso/engine.ts` |
| Migraciones SQL | `supabase/migrations/*` (sólo si necesitamos columna nueva en `agent_sessions`) |

### Fuera (no toco)

- ETL (`etl/`, INFOBRAS scraper, OCDS download).
- Vercel cron, jobs proactivos, push templates Meta.
- PDF generation endpoints.
- Crowdsourcing tablas (`citizen_reports`).
- Cross-country data acquisition (Chile/Colombia/etc).
- AI Vision batch processing.
- Web frontend (`app/page.tsx`, `components/*`).

---

## Lo que el agente cubre HOY (14 intents)

`CAMBIAR_PAIS`, `BUSCAR_OBRAS`, `BUSCAR_CERCANOS`, `VER_DETALLE`, `CONTEXTO_DETALLE`, `STATS`, `MONTO_EN_RIESGO`, `RANKING_CONTRATISTAS`, `RANKING_ENTIDADES`, `ADJUDICACION_DIRECTA`, `INVESTIGAR_CONTRATISTA`, `INHABILITADOS`, `AYUDA`, `AGRADECIMIENTO`. Más fallback `PREGUNTA_LIBRE` → `runChatPipeline` → `chatEngine` legacy.

---

## Gaps factibles SÓLO con cambios al agente

### 🟢 Quick wins (≤ 1 día de código)

#### 1. Intent `EXPLICAR` + tool `lookup_definition` (civic literacy)
- Catálogo estático ~20 términos en `lib/agent-kapso/definitions.ts`: `adjudicación directa`, `OCDS`, `OECE`, `red flag`, `RUC`, `contraloría`, `tender`, `entidad`, `contratista`, `supervisor`, `proceso de selección`, `licitación pública`, `concurso público`, `subasta inversa`, `inhabilitación`, `penalidad`, `adenda`, `consorcio`, `expediente técnico`, `valor referencial`.
- Trigger regex en `parseIntent`: `/(qué es|que significa|definir|explica|explicame|qué quiere decir)/i`.
- Sin LLM, sin DB. <50ms.

#### 2. Intent `OBRAS_ACTIVAS` (10,477 filas con `contract_status='active'`)
- `parseIntent` regex: `/\bobras?\s+(en\s+ejecuci[oó]n|activas?|en\s+curso|vigentes?)\b/i`.
- `queries.ts`: `buscarObras({ ..., contract_status: 'active' })` — añadir filtro al builder existente.
- Formatter reusa `fmtObras` con flag visual.

#### 3. Intent `SOBRECOSTOS`
- Trigger: `/\bsobrecost(o|os)\b|\bsobre\s+precio\b/i`.
- Query: `WHERE contract_amount > tender_amount * 1.1 AND tender_amount > 0 ORDER BY (contract_amount - tender_amount) DESC`.
- Formatter nuevo `fmtSobrecostos`: muestra obra + `tender_amount` (referencial) + `contract_amount` (final) + delta.

#### 4. Intent `AVANCE_OBRA` (sobre `infobras_full`)
- Trigger: `/\bavance\b|\bporcentaje\b|\bcómo\s+va\b|\bestado\s+de\s+obra\b/i` + obraId o nombre.
- Query join: `obras` ↔ `infobras_full` por `infobras_code = codigo_infobras` (165 obras tienen `infobras_code`; 579 filas en `infobras_full`).
- Devuelve: `avance_fisico_pct`, `fecha_ultimo_avance`, `fecha_fin_programada` vs `fecha_fin_real`, `n_modificaciones_plazo`.
- Formatter nuevo `fmtAvance` con barra ASCII: `▓▓▓▓▓▓▓▓░░ 75%`.

#### 5. Intent `SUPERVISOR_OBRA` (sobre `infobras_full`)
- Trigger: `/\bsupervisor\b|\bquién\s+supervisa\b|\bquién\s+audita\b/i`.
- Devuelve `supervisor_nombre`, `supervisor_ruc`, `entidad_nombre`, `tiene_informe_control`.

#### 6. Link compartible en `fmtDetalle`
- Append: `\n\n🔗 transparentape.app/obras/{ocid}`.
- Cero código nuevo más allá del template del formatter.

#### 7. Footer fuente en formatters
- Agregar `\n\n_📊 Fuente: OCDS · datos al {fecha}_` en todos los `fmt*`.
- Constante `FECHA_DATOS` en `config.ts`. Bump manual cada ETL refresh.

#### 8. Closing prompts contextuales
- Modificar cada formatter para terminar con next-action:
  - `fmtObras`: "_Responde 1, 2 o 3 para ver el detalle._"
  - `fmtDetalle`: "_¿Quieres ver avance, supervisor o sobrecostos?_"
  - `fmtInvestigacion`: "_¿Quieres ver sus obras activas o sus sanciones?_"

#### 9. Tono ciudadano (copy)
- Buscar/reemplazar en `wa-format.ts`:
  - `red_flag_types: sancion_inhabilitacion` → `🚨 contratista sancionado por OECE`
  - `red_flag_types: penalidad` → `⚠️ obra con penalidad aplicada`
  - `procurement_method: direct` → `adjudicación directa (sin concurso)`
  - `contract_status: active` → `en ejecución`

#### 10. Fast-path AGRADECIMIENTO
- Hoy `AGRADECIMIENTO` ejecuta toda la ruta de `handleMessage`. Mismo patrón que `GREETING_RE` fast-path: regex temprano + respuesta directa sin session.

---

### 🟡 Medio (2-5 días)

#### 11. Intent `REFINAR_BUSQUEDA` (filtros encadenados)
- Agregar `session.lastFilters` (JSONB en `agent_sessions` — necesita migración 12).
- `parseIntent` detecta refinamiento: `/^(ahora\s+)?(solo|s[oó]lo|filtra|y\s+(de\s+)?los?)\s+/i` + criterio adicional.
- Merge sobre `session.lastFilters`. Ejecuta `buscarObras` con merged.
- Ejemplo flow: `obras Lima 2024` → `solo las activas` → `y de >S/10M` → `cuál tiene supervisor sospechoso`.

#### 12. Intent `INHABILITADOS_ACTIVOS` (cruce `red_flags` ↔ `obras`)
- Trigger: `/\binhabilitados?\s+(activos?|operando|trabajando|que\s+(siguen|aún))\b/i`.
- Query: `SELECT obras.* FROM obras JOIN red_flags ON obras.supplier_ruc = red_flags.ruc WHERE red_flags.vigente = TRUE AND obras.contract_start::date > NOW() - INTERVAL '12 months'`.
- Alarma cívica fuerte.

#### 13. Intent `OBRAS_RETRASADAS`
- Trigger: `/\b(retrasadas?|atrasadas?|estancadas?|paralizadas?)\b/i`.
- Query sobre `infobras_full`: `fecha_fin_programada::date < NOW() AND avance_fisico_pct < 100`.

#### 14. Intent `COMPARAR_REGIONES`
- Trigger: `/\bcomparar?\s+\w+\s+(vs|contra|y)\s+\w+/i`.
- Query: 2 aggregates paralelos (`COUNT`, `SUM`, `% red_flag`) por región. Formatter side-by-side.

#### 15. Intent `CONCENTRACION_CONTRATISTA`
- Trigger: `/\bconcentraci[oó]n\b|\bmonopoliz\w+|\bcu[aá]ntas?\s+obras\s+gan[oó]\b/i`.
- Query con HAVING: `SELECT supplier_name, buyer_name, COUNT(*) FROM obras GROUP BY supplier_name, buyer_name HAVING COUNT(*) >= 5 ORDER BY count DESC`.
- Útil para detectar relaciones cliente-proveedor sospechosas.

#### 16. Conectar `runChatPipeline` con `tools[]` en webhook
- En `PREGUNTA_LIBRE`, pasar el tool registry completo:
  ```ts
  const result = await runChatPipeline(history, {
    tools: buildTransparentapeTools(),
    toolContext: { country: session.country },
  });
  ```
- El router LLM puede llamar tools nuevos sin que agreguemos regex por cada uno.

#### 17. Reflexion narrow en tool SQL fallback
- Si `runChatPipeline` cae en `NEEDS_SQL` y la query retorna 0 rows o error, **1 retry** con el error en context.
- Aplicar SOLO al SQL gen, NO al synthesis (innecesario).

---

### 🔴 Big-effort dentro del scope (1+ semana de código)

#### 18. Multi-país real
- Hoy `session.country` cambia pero queries siguen funcionando solo para PE bien (CL apenas 1K obras, 2026 only).
- Si Victor/ETL trae más data Chile/Colombia: el agente ya está listo (country-aware en todas las queries).
- **Mi parte**: agregar `detectCountry` para más variantes ("colombiano", "mexicana", etc), formatters con flag emojis correctos.

#### 19. Memoria semántica de sesión
- Hoy `session.lastMessages` = últimas 6 raw messages.
- Agregar `session.summary` (string corto) regenerado cada 5 turnos: "Usuario investiga obras de Cusco, mostró interés en sobrecostos".
- Pasar `summary` al prompt del router → contexto más denso, menos tokens.

#### 20. Auto-eval set + golden queries
- Tabla `agent_evals` con 30-50 queries español + expected intent + expected output substring.
- Endpoint `/api/agent/eval` que corre todo el batch y reporta regressions.
- No bloquea CI, sólo dashboard.

---

## Lo que NO entra en este scope (pero documento por claridad)

| Funcionalidad | Por qué fuera |
|---|---|
| Suscripciones push proactivas | Requiere Vercel cron + template Meta aprobado |
| Subir fotos / inbound multimedia | Requiere Supabase Storage + ETL match |
| PDF on-demand | Endpoint separado, no agente |
| Crowdsourcing denuncias | Tabla nueva + integración Defensoría |
| AI Vision masivo | Anthropic API budget + batch infra |
| Cross-country data | ETL de Chile/Colombia/etc, no agente |

---

## Plan en 3 milestones (agente-only)

### Milestone A (1 sprint corto, ~1-2 días)

Apunta a multiplicar utilidad del agente sin nueva infra.

| # | Cambio | Archivos |
|---|---|---|
| 1 | Intent `EXPLICAR` + dict definiciones | `intent.ts`, nuevo `definitions.ts` |
| 6 | Link compartible en `fmtDetalle` | `wa-format.ts` |
| 7 | Footer fuente | `wa-format.ts`, `config.ts` |
| 8 | Closing prompts contextuales | `wa-format.ts` |
| 9 | Copy tono ciudadano | `wa-format.ts` |
| 10 | Fast-path AGRADECIMIENTO | `webhook/route.ts` |

**Resultado:** mismo agente pero más amable, más educativo, más confiable, más rápido en respuestas cortas.

### Milestone B (~3-5 días)

Expande lo que se puede preguntar usando datos que YA están en DB.

| # | Cambio | Archivos |
|---|---|---|
| 2 | Intent `OBRAS_ACTIVAS` | `intent.ts`, `queries.ts`, `wa-format.ts` |
| 3 | Intent `SOBRECOSTOS` | `intent.ts`, `queries.ts`, `wa-format.ts` |
| 4 | Intent `AVANCE_OBRA` (INFOBRAS) | `intent.ts`, `queries.ts` (join), `wa-format.ts` |
| 5 | Intent `SUPERVISOR_OBRA` (INFOBRAS) | `intent.ts`, `queries.ts`, `wa-format.ts` |
| 12 | Intent `INHABILITADOS_ACTIVOS` | `intent.ts`, `queries.ts` (join red_flags) |
| 13 | Intent `OBRAS_RETRASADAS` | `intent.ts`, `queries.ts` (INFOBRAS) |
| 16 | Conectar `tools[]` en `PREGUNTA_LIBRE` | `webhook/route.ts`, `tools.ts` |

**Resultado:** 6 intents nuevos + tool registry activo para queries no-regex. INFOBRAS deja de ser data muerta.

### Milestone C (~1 semana)

Conversación más sofisticada.

| # | Cambio | Archivos |
|---|---|---|
| 11 | Intent `REFINAR_BUSQUEDA` con `lastFilters` | migración 12, `session.ts`, `intent.ts`, `webhook/route.ts` |
| 14 | Intent `COMPARAR_REGIONES` | `intent.ts`, `queries.ts`, `wa-format.ts` |
| 15 | Intent `CONCENTRACION_CONTRATISTA` | `intent.ts`, `queries.ts` |
| 17 | Reflexion narrow en `runChatPipeline` SQL | `core.ts` |
| 19 | Memoria semántica `session.summary` | migración 13, `session.ts`, `core.ts` |

**Resultado:** filtros encadenados naturales, comparativos, pipeline LLM más robusto a SQL errors.

---

## Cómo el agente actual se mapea al patrón tool-use loop

Cada intent regex puede coexistir con tool registry. **No tirar lo existente.**

```
Webhook recibe text
  │
  ▼
GREETING_RE? ─yes─▶ sendAyudaWithButtons (fast-path)
  │ no
  ▼
parseIntent(text) ─▶ hit conocido? ─yes─▶ handler determinístico (queries.ts)
  │ no
  ▼
runChatPipeline(history, { tools, toolContext })
  │
  ├─ Router → TOOL_CALL → tools.ts ejecuta + formatea
  ├─ Router → ANSWER_FROM_CONTEXT → synthesis sobre history
  ├─ Router → NEEDS_SQL → SQL gen + execute + synthesis (con reflexion)
  └─ Router → NEEDS_CLARIFICATION → reply + suggested_questions
```

**Tier 1 (regex)** = velocidad + determinismo para queries comunes.
**Tier 2 (tools en LLM router)** = cubre variaciones lingüísticas que regex no atrapa, sin agregar regex case por case.
**Tier 3 (NEEDS_SQL)** = fallback para queries ad-hoc no anticipadas.

---

## Bottom line

**Si tengo 1-2 días:** Milestone A completo. Cero riesgo, alto perceived value.

**Si tengo 1 semana:** A + B. Da al agente acceso a 4 datos críticos (INFOBRAS, sobrecostos, activas, retrasadas). El bot pasa de "consulta básica OCDS" a "auditor ciudadano con visión de ejecución".

**Si tengo 2 semanas:** A + B + C. Conversación encadenada + comparativos + LLM más robusto. Es ya producto de retención (usuario vuelve porque puede investigar profundo).

**Lo más alto en ROI por línea de código:**

1. `lookup_definition` — 50 líneas → diferencial educativo enorme.
2. Footer fuente + link compartible — 10 líneas → confianza + viralidad.
3. Conectar `tools[]` al `PREGUNTA_LIBRE` — 5 líneas → habilita TODOS los tools nuevos sin agregar regex.
4. INFOBRAS join — 30 líneas → desbloquea 579 obras con avance físico real.

¿Empezamos por Milestone A?
