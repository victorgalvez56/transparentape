# Roadmap del agente Kapso — scope agente-only

Plan acotado al boundary del agente WhatsApp/Kapso. Sin cron, sin templates push, sin PDFs, sin ETL nuevo, sin crowdsourcing.

> **Última actualización:** 2026-05-17 · commit `ede6080` (post tool-registry, engine.ts retired)

---

## Scope

### Dentro

| Capa | Archivos |
|---|---|
| Webhook | `web/app/api/kapso/webhook/route.ts` |
| Intents regex | `web/lib/agent-kapso/intent.ts` |
| Queries SQL | `web/lib/agent-kapso/queries.ts` |
| Formatters | `web/lib/agent-kapso/wa-format.ts` |
| Sesión | `web/lib/agent-kapso/session.ts` |
| Config | `web/lib/agent-kapso/config.ts` |
| Places allowlist | `web/lib/agent-kapso/places.ts` |
| Pipeline LLM | `web/lib/agent/core.ts` |
| Tool registry | `web/lib/agent/tools.ts` |
| Migraciones (solo si afectan al agente) | `supabase/migrations/*` |

### Fuera

ETL · cron jobs · push templates Meta · PDF generation · crowdsourcing · AI Vision batch · cross-country data acquisition · frontend web.

---

## Estado actual del agente

### Lo que YA está implementado

✅ **Tier 1 (regex fast-path) — 9 intents:** `AYUDA`, `AGRADECIMIENTO`, `CAMBIAR_PAIS`, `BUSCAR_OBRAS`, `BUSCAR_CERCANOS`, `VER_DETALLE`, `CONTEXTO_DETALLE` (incl plural `los primeros 3`), `INVESTIGAR_CONTRATISTA`, `PREGUNTA_LIBRE`.

✅ **Tier 2 (tool registry) — 9 tools:** `buscar_obras`, `ver_detalle`, `stats_pais`, `ranking_contratistas`, `ranking_entidades`, `adjudicacion_directa`, `investigar_contratista`, `inhabilitados`, `monto_en_riesgo`. Despachados por LLM router cuando `PREGUNTA_LIBRE`.

✅ **Pipeline LLM compartido (`runChatPipeline`):**
- TOOL_CALL / ANSWER_FROM_CONTEXT / NEEDS_SQL / NEEDS_CLARIFICATION
- Adaptive fallback en cada paso
- `statement_timeout=5s` + LIMIT mandatorio

✅ **UX features:**
- `markRead + typingIndicator` ("escribiendo…" hasta 25s)
- Fast-path saludo (sin getSession ni parseIntent)
- Sugerencias indexadas (`sendInteractiveList` + `resolveIndexFromText`)
- `obraIds` persistidos post-TOOL_CALL para ordinal follow-up

✅ **Robustez:**
- Custom HMAC verify (Meta + Kapso formats)
- `waitUntil` para fire-and-forget seguro en Vercel
- Dedup `webhook_dedup` en background
- `places.ts` separa `q_geo` de `q_supplier` (evita ILIKE roto)
- `engine.ts` retirado (single brain)

### Lo que NO está implementado

❌ `infobras_full` (579 obras enriquecidas) no consumido por ningún tool/intent.
❌ Sobrecostos como query directa (calculable de `tender` vs `contract`).
❌ Filtros encadenados conversacionales (`session.lastFilters` no existe).
❌ `lookup_definition` (civic literacy).
❌ Concentración contratista-entidad (cártel detection).
❌ Comparativos región vs región.
❌ Inhabilitados activos (cruce con obras recientes).
❌ Obras retrasadas (`fecha_fin_programada` vs `NOW()`).
❌ Footer fuente en respuestas.
❌ Link compartible (`/obras/{ocid}`) en formatters.
❌ Closing prompts contextuales.
❌ Memoria semántica de sesión (`session.summary`).
❌ Eval set ofline.

---

## Roadmap restante — 3 milestones

### 🟢 Milestone A — pulido (1-2 días)

Sin nuevos datos, sin nueva infra. Solo UX y educación cívica.

| # | Cambio | Archivos | Líneas aprox |
|---|---|---|---|
| A1 | Tool `lookup_definition` + dict cívico ~20 términos | nuevo `lib/agent-kapso/definitions.ts` + `tools.ts` | ~80 |
| A2 | Footer fuente en todos los `fmt*` | `wa-format.ts`, `config.ts` (constante `FECHA_DATOS`) | ~15 |
| A3 | Link compartible en `fmtDetalle` (`transparentape.app/obras/{ocid}`) | `wa-format.ts` | ~3 |
| A4 | Closing prompts contextuales en cada formatter | `wa-format.ts` | ~20 |
| A5 | Copy tono ciudadano (`sancion_inhabilitacion` → "🚨 contratista sancionado") | `wa-format.ts` | ~30 |
| A6 | Fast-path `AGRADECIMIENTO` (sin `getSession`) | `webhook/route.ts` | ~10 |

**Resultado:** mismo agente más amable, más educativo, más confiable, más rápido en respuestas cortas. **Cero riesgo, alto perceived value.**

### 🟡 Milestone B — más casuísticas con datos existentes (3-5 días)

Conectar `infobras_full` + queries derivadas que no requieren regex porque el tool registry las despacha.

| # | Tool nuevo | Source data | Notas |
|---|---|---|---|
| B1 | `avance_obra` | `obras` ⋈ `infobras_full` (`infobras_code = codigo_infobras`) | Devuelve `avance_fisico_pct`, `fecha_ultimo_avance`, `n_modificaciones_plazo`. Formatter con barra ASCII `▓▓▓▓░░ 60%`. |
| B2 | `supervisor_obra` | `infobras_full` | `supervisor_nombre`, `supervisor_ruc`, `tiene_informe_control`. |
| B3 | `sobrecostos` | `obras` (cálculo) | `WHERE contract_amount > tender_amount * 1.1 AND tender_amount > 0 ORDER BY (contract_amount - tender_amount) DESC`. |
| B4 | `obras_activas` | `obras` (`contract_status='active'`) | 10K filas disponibles. Filtro al builder existente. |
| B5 | `obras_retrasadas` | `infobras_full` | `fecha_fin_programada::date < NOW() AND avance_fisico_pct < 100`. |
| B6 | `inhabilitados_activos` | `red_flags` ⋈ `obras` | `red_flags.vigente=TRUE AND obras.contract_start::date > NOW() - INTERVAL '12 months'`. Alarma cívica fuerte. |

**Archivos tocados:** `queries.ts` (6 funciones nuevas), `wa-format.ts` (6 formatters), `tools.ts` (6 tools registered).

**Sin cambios en `intent.ts`** — el LLM router despacha. Si alguno termina siendo muy frecuente, después se le agrega fast-path regex.

**Resultado:** 6 capacidades nuevas. INFOBRAS deja de ser data muerta. Las 4 más útiles (`avance_obra`, `sobrecostos`, `obras_activas`, `inhabilitados_activos`) cubren casi todas las preguntas ciudadanas reales sobre obras públicas.

### 🔴 Milestone C — conversación profunda (~1 semana)

| # | Cambio | Notas |
|---|---|---|
| C1 | Intent `REFINAR_BUSQUEDA` + `session.lastFilters` | Migración 12 (columna JSONB). Regex `^(ahora\s+)?(solo|filtra|y\s+(de\s+)?los?)\s+...`. Merge sobre últimos filtros. Ejemplo: `obras Lima 2024` → `solo las activas` → `y de >S/10M`. |
| C2 | Tool `comparar_regiones` | Aggregates paralelos (COUNT, SUM, % red_flag) por 2 regiones. Formatter side-by-side. |
| C3 | Tool `concentracion_contratista` | HAVING COUNT >= 5 sobre supplier ⋈ buyer. Detecta cliente-proveedor sospechoso. |
| C4 | `session.summary` regenerado cada 5 turns | Migración 13. LLM produce summary corto que se pasa al router. Contexto más denso, menos tokens. |
| C5 | Eval set golden queries | Tabla `agent_evals` + endpoint `/api/agent/eval`. 30-50 queries español, expected layer + substring. Dashboard, no CI blocking. |

**Resultado:** filtros encadenados naturales, comparativos, agente con memoria semántica, regression catch.

---

## Métricas de éxito sugeridas

Antes de implementar más, vale acordar qué medir. Todas observables vía `agent_logs`:

1. **`layer` distribution** — % `atajo:*` vs `tool:*` vs `sql_libre` vs `clarify`. **Salud:** `sql_libre` debería ser <5%. Si sube, el tool registry está perdiendo cobertura.
2. **Latencia p50 / p95 por layer.** Atajos <1s. Tools <3s. SQL libre <8s.
3. **`clarify` rate** — usuarios que reciben sugerencias en vez de respuesta. Si >20%, el router está rechazando queries que sí deberían matchear tools.
4. **Ordinal follow-up rate** — % de respuestas `CONTEXTO_DETALLE` después de un `BUSCAR_OBRAS` / `TOOL_CALL`. Indicador de engagement.
5. **Suggestion tap rate** — `resolveIndexFromText` hits / sugerencias enviadas. Útil para saber si la lista es buena.

Query base:

```sql
SELECT
  params->'meta'->>'layer' AS layer,
  COUNT(*) AS n,
  ROUND(AVG(latencia_ms)) AS avg_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latencia_ms)) AS p95_ms
FROM agent_logs
WHERE endpoint = '/api/kapso/webhook'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY layer
ORDER BY n DESC;
```

---

## Decisiones explícitas — qué NO entra en scope agente

| Funcionalidad | Por qué fuera |
|---|---|
| Suscripciones push proactivas | Cron + template Meta aprobado |
| Subir fotos inbound | Supabase Storage + matching obra |
| PDF on-demand | Endpoint separado, no agente |
| Crowdsourcing denuncias | Nueva tabla + integración Defensoría |
| AI Vision masivo | Anthropic budget + batch infra |
| Cross-country data | ETL de Chile/Colombia |
| Frontend web | Otra capa |

---

## Bottom line

**Si tengo 1-2 días:** Milestone A completo. Cero riesgo, alto perceived value.

**Si tengo 1 semana:** A + B. INFOBRAS desbloqueado. El bot pasa de "consulta básica OCDS" a "auditor ciudadano con visión de ejecución".

**Si tengo 2 semanas:** A + B + C. Conversación encadenada + comparativos + LLM más robusto. Producto de retención.

### Top 4 ROI por línea de código

1. **`lookup_definition`** — ~80 líneas → diferencial educativo.
2. **Footer fuente + link compartible** — ~20 líneas → confianza + viralidad.
3. **Tool `sobrecostos`** — ~30 líneas → tema número 1 que ciudadano quiere saber.
4. **INFOBRAS join (`avance_obra`)** — ~50 líneas → desbloquea 579 obras con datos reales de ejecución.

¿Empezamos por Milestone A?
