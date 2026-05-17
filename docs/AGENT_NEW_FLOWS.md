# Nuevas casuísticas / flujos para el agente Transparentape

Análisis basado en estado actual de la base Supabase (snapshot 2026-05-17) y el set de intents ya implementados. Identifica qué datos están subutilizados, qué preguntas reales del ciudadano caen fuera del agente hoy, y cómo extender el bot sin reescribirlo.

> **⚠️ Nota:** documento parcialmente desactualizado vs estado actual del código. Para roadmap accionable acotado al agente Kapso ver `AGENT_KAPSO_ROADMAP.md`. Para arquitectura actual del agente ver `AGENT_KAPSO.md`. Este doc se mantiene como referencia de **análisis de la data** disponible.

**Cambios desde que este doc fue escrito:**
- Tool registry ya activo (`tools.ts`) — 9 tools registrados.
- Webhook usa `runChatPipeline(history, { tools })` para `PREGUNTA_LIBRE`.
- 6 intents regex retirados (STATS / RANKING_* / MONTO_EN_RIESGO / ADJUDICACION_DIRECTA / INHABILITADOS) — ahora vía TOOL_CALL.
- `engine.ts` borrado.

---

## 1. Snapshot de datos disponibles

### Tablas

| Tabla | Filas | Uso actual en agente |
|---|---|---|
| `obras` | 71,181 (PE 70K + CL 1.1K) | Sí — todos los intents |
| `red_flags` (OECE) | 20,707 total · 960 vigentes | Sí — `INHABILITADOS`, `INVESTIGAR_CONTRATISTA` |
| `infobras_full` | 579 | **NO USADO** — campo rico de avance/supervisión/fotos |
| `agent_logs` | (creciendo) | Diagnóstico |
| `agent_sessions` | (por usuario) | Estado conversación |
| `webhook_dedup` | (creciendo) | Idempotencia |

### Coverage `obras`

| Country | Total | Alertas | Años | Coords (%) |
|---|---|---|---|---|
| PE | 70,024 | 4,196 (6%) | 2019-2026 | 87% |
| CL | 1,157 | 0 | 2026 only | 99% |

### Campos `obras` subutilizados

| Campo | Filas no-null | Uso actual |
|---|---|---|
| `ai_score` + `ai_description` (Claude Vision) | 10 | NO |
| `streetview_before` + `streetview_after` | 9 | NO |
| `infobras_code` | 165 | NO |
| `buyer_street` | parcial | NO |
| `tender_amount` vs `award_amount` vs `contract_amount` | mayoría | Solo COALESCE para monto |
| `n_amendments` (adendas) | 0 actualmente | Intent existe, sin datos |
| `item_classification` (sector) | parcial | NO |
| `contract_start` / `contract_end` (fechas reales) | parcial | NO en filtros |
| `contract_status` (`active` 10,477) | parcial | NO en filtros |

### `infobras_full` — el oro escondido (579 obras enriquecidas)

| Campo | Qué permite |
|---|---|
| `avance_fisico_pct` | % de obra completada |
| `fecha_fin_programada` vs `fecha_fin_real` | Detectar retrasos |
| `n_modificaciones_plazo` | Adendas de tiempo |
| `n_avances_mensuales` | Frecuencia reporte |
| `n_fotos` + `fotos` (JSONB) | Evidencia visual |
| `supervisor_nombre` + `supervisor_ruc` | Auditor de obra |
| `monto_aprobacion` vs `monto_expediente` | Sobrecostos |
| `tiene_informe_control` + `informes_control` (JSONB) | Auditoría Contraloría |
| `procesos_seleccion` (JSONB) | Concurso original |
| `imagenes_aereas` (JSONB) | Drone/satelital |
| `direccion` | Geocoding más fino que lat/lng |
| `comentarios` (JSONB) | Posibles denuncias ciudadanas |

**Solo 10 obras tienen ai_score** y **9 streetview** — los flujos visuales no escalan aún. INFOBRAS sí (579 obras útiles ya).

### Patrones notables del data

- **CONSORCIO SAN JUAN: 193 obras adjudicadas en PE.** Concentración inusual = bandera roja institucional.
- **Top contratistas son chinos:** Sinohydro, OHL, China Gezhouba — megaproyectos. Curiosidad ciudadana alta.
- **Solo 2 tipos de red_flag_types** en `obras`: `penalidad` y `sancion_inhabilitacion`. No están los típicos OCDS-EDS (single bidder, contract amendment, etc.) — oportunidad de derivar más.
- **Chile sin alertas** porque no aplicaste fuente OECE-CL.
- **Lima 7,952 obras · Huari 2,894 (segunda).** Huari es región distante andina — interés narrativo.

---

## 2. Brechas — preguntas reales que el agente NO responde hoy

Cualquiera de éstas son preguntas naturales que un ciudadano peruano haría a WhatsApp:

### A. Avance físico de obra (INFOBRAS)
- "¿En qué porcentaje va la obra X?"
- "Obras estancadas en Cusco" (avance <50% y empezadas hace >1 año)
- "Obras retrasadas" (fecha_fin_real > fecha_fin_programada o `fecha_fin_programada < NOW()` sin cierre)
- "Obras sin avance reportado este mes"
- "¿Cuándo se supone que termina esta obra?"

### B. Análisis visual / evidencia
- "Muéstrame fotos de la obra X"
- "¿Hay imagen satelital antes/después?"
- "Obras con expediente grande pero sin foto reciente" (sospechoso)

### C. Supervisión / auditoría
- "¿Quién supervisa esta obra?"
- "Obras del supervisor [nombre]"
- "Supervisores que avalan obras con red_flag" (conflicto interés)
- "¿Esta obra tiene informe de Contraloría?"

### D. Sobrecostos / discrepancias monto
- "Obras donde el contrato superó al monto referencial"
- "Top 10 sobrecostos en Piura"
- "Diferencia monto adjudicado vs ejecutado en mi región"

### E. Concentración / cárteles
- "Contratistas con >50% obras de una entidad" (favoritismo)
- "RUC con más adjudicaciones directas"
- "Top entidades que más usan adjudicación directa"
- "Concursos con un solo postor" (cuando data lo permita)

### F. Geográficas avanzadas
- "Obras en mi distrito [escribe el nombre]" — usa `buyer_locality` o `direccion`
- "Obras en avenida [X]" — usa `buyer_street`
- "Obras cerca del [referencia]" (escuela, hospital, parque) — geocoding inverso

### G. Temporales / comparativos
- "Cómo evolucionó la corrupción en Lima 2020-2025"
- "Año con más adjudicaciones directas"
- "Comparar Perú vs Chile" (cuando CL crezca)
- "Gasto público obras vs población del departamento" (per cápita)

### H. Suscripción / notificación push
- "Avísame si agregan obra en mi distrito"
- "Alerta si [contratista] gana nueva obra"
- "Resumen mensual de obras de mi región"
- *Requiere: tabla `subscriptions` + cron + Kapso send proactivo*

### I. Cruces OECE más profundos
- "Contratistas inhabilitados que siguen ganando" (alarma fuerte)
- "RUC sancionado — ¿cuándo expira?"
- "Tipos de sanción más comunes" (categórico de `red_flags.tipo`)

### J. Multi-turn / refinamiento sucesivo
- *Hoy:* "obras en Lima 2024" → 5 obras → "el primero" → detalle.
- *Faltante:* "obras en Lima 2024" → "ahora solo las activas" → "y de >S/10M" → "cuál tiene supervisor sospechoso".
- Necesita session.lastFilters acumulativo + intent `REFINAR_BUSQUEDA`.

### K. Civic literacy / educacional
- "¿Qué es una adjudicación directa?"
- "¿Cuándo es legal una obra por contratación directa?"
- "¿Cómo denuncio una obra paralizada?"
- "¿Quién audita estas obras?"
- *Implementar:* `EXPLICAR` intent con definiciones canónicas; cae en `lookup_definition` tool del nuevo tool registry.

### L. Outputs ricos
- "Generar PDF de obra X" (compartible)
- "Envíame el link público" → `https://transparentape.app/obras/{ocid}`
- "Resumen ejecutivo en 3 líneas" (ya implementable con synthesis)

### M. Participación ciudadana / crowdsourcing
- "Reportar obra paralizada cerca de mí" (input ciudadano)
- "Subir foto de obra [opcional, requiere storage]"
- "Calificar transparencia de esta obra" (1-5 estrellas)
- *Requiere: tabla `citizen_reports` + canal de envío a Contraloría/Defensoría*

### N. Métricas regulatorias para periodistas / activistas
- "% adjudicación directa por entidad" (umbral legal MEF)
- "Días entre adjudicación y contrato firmado" (anomalías procesales)
- "Obras con cambio de RUC supplier" (cesión de contrato)
- "Distribución de montos: percentil 90 por entidad"

### O. Reputación de entidad compradora
- "Cómo se compara mi municipio con otros del mismo tamaño"
- "Ranking transparencia por gobierno regional"
- "Entidad con más obras canceladas"

---

## 3. Casuísticas priorizadas (impacto × factibilidad)

Matriz simple. Verde = quick win (≤ 1 día). Amarillo = medio (2-5 días). Rojo = big (semana+).

### 🟢 Quick wins (impacto alto, datos ya existen)

1. **`AVANCE_OBRA`** — query a `infobras_full` por `cui` o `infobras_code`. Devuelve `avance_fisico_pct`, fechas, supervisor. 579 obras viables.
2. **`SUPERVISOR_OBRA`** — same tabla, extrae `supervisor_nombre` + `supervisor_ruc`.
3. **`SOBRECOSTOS`** — query: `WHERE contract_amount > tender_amount * 1.1 ORDER BY ratio DESC`. Universo entero.
4. **`OBRAS_ACTIVAS`** — filtro `contract_status = 'active'`. Ya hay 10K. Trivial.
5. **`EXPLICAR`** definiciones — tool `lookup_definition` que ya está en `tools.ts`. Catálogo estático ~20 términos (adjudicación directa, OCDS, red flag, RUC, OECE, etc.).
6. **Link compartible** — agregar a `fmtDetalle` el URL `https://transparentape.app/obras/{ocid}` para que el user comparta por WhatsApp.
7. **Filtros encadenados básicos** — agregar a `session` un `lastFilters` y un intent `REFINAR_BUSQUEDA` que merge filtros sobre `session.lastFilters`.

### 🟡 Medio (necesita queries más complejas + datos cruzados)

8. **`CONCENTRACION_CONTRATISTA`** — "Top contratistas por entidad" cruzando `supplier_ruc` ↔ `buyer_name` con HAVING > umbral.
9. **`OBRAS_RETRASADAS`** — `infobras_full.fecha_fin_programada < NOW() AND avance_fisico_pct < 100`.
10. **`INHABILITADOS_ACTIVOS`** — `red_flags.vigente = TRUE` AND existe `obras.supplier_ruc = red_flags.ruc` con `contract_start` reciente.
11. **`COMPARATIVA_REGIONAL`** — "Lima vs Arequipa", agg counts + montos por region.
12. **Geo distrito/calle** — `parseIntent` extrae nombre lugar y filtra `buyer_locality ILIKE` o `buyer_street ILIKE`.
13. **Reportar a Contraloría** — `intent` que toma denuncia + número del user + obra y la registra en tabla `citizen_reports`. (No envía a Contraloría aún — solo persiste.)

### 🔴 Big (requiere infra nueva)

14. **Suscripciones push proactivas** — tabla `subscriptions(wa_id, filter_json, last_sent_at)` + cron job + Kapso send template (requiere template approval). Mercado: 1000s de usuarios.
15. **Subir foto / multimedia inbound** — manejar `image` type, almacenar en Supabase Storage, asociar a obra. Requiere matching obra-foto (geo, OCR de cartel).
16. **Reporte PDF generado on-demand** — endpoint `/api/obra/[ocid]/pdf` con `puppeteer` o `react-pdf`. Devuelve link.
17. **Civic ranking** — métrica compuesta `ai_score` style aplicada a todas las 70K obras. Necesita compute batch + columna nueva.
18. **Cross-country normalization** — Chile schema map, agregar fuente sanciones CL/CMF, escalar a Colombia (cuando llegue).

---

## 4. Recomendaciones de UX conversacional

### Plantillas de cierre con acción siguiente

Hoy la mayoría de respuestas terminan secas. Agregar **1 línea de "qué más puedes hacer"** específica al contexto:

- Después de `BUSCAR_OBRAS`: *"¿Quieres ver el detalle de alguna? Responde 1, 2 o 3."*
- Después de `VER_DETALLE`: *"¿Te interesa el avance físico, supervisor o sobrecostos?"*
- Después de `INVESTIGAR_CONTRATISTA`: *"¿Quieres ver sus obras o sus sanciones?"*

### Bot que confiesa límites

Cuando intent cae en `PREGUNTA_LIBRE` o no hay match:
> *"No tengo eso aún. Sí puedo responder: obras por región, sobrecostos, contratistas, sanciones."*

Mejor que un fallback genérico "no entendí" — convierte fricción en pedagogía.

### Marcar fuente en cada respuesta

WhatsApp users no saben de dónde viene el dato. Footer:
> *Fuente: OCDS Perú · datos al 17 mayo 2026*

Aumenta confianza, baja accusations de "datos inventados".

### Conversación con tono de auxiliar, no de policía

Hoy el bot tiende a sonar técnico. Para ciudadano promedio:
- "obras con alerta" → "obras donde detectamos algo raro"
- "adjudicación directa" → "adjudicación directa (sin concurso público)"
- "red_flag_types: sancion_inhabilitacion" → "🚨 contratista sancionado por OECE"

---

## 5. Roadmap propuesto (siguientes 4 sprints)

### Sprint 1 (1-2 días) — completar tool-use loop con tools nuevos
- Conectar `tools.ts` al webhook (`PREGUNTA_LIBRE` → `runChatPipeline` con tools).
- Agregar 4 tools nuevos en `tools.ts`: `obras_activas`, `sobrecostos`, `avance_obra`, `supervisor_obra` (necesita join `obras` ↔ `infobras_full` por `infobras_code`).
- Agregar `lookup_definition` tool con 20 términos cívicos.

### Sprint 2 (2-3 días) — refinamiento + UX
- Intent `REFINAR_BUSQUEDA` con merge de `session.lastFilters`.
- Link compartible en `fmtDetalle`.
- Footer fuente en todos los `fmt*`.
- Plantillas de cierre con next-action sugerido.

### Sprint 3 (3-5 días) — cruces avanzados
- Tool `concentracion_contratista` (entidad ↔ supplier).
- Tool `inhabilitados_activos` (cruce `red_flags` + `obras` recientes).
- Intent `COMPARAR` (region A vs region B).

### Sprint 4 (1 semana) — proactivo
- Tabla `subscriptions(wa_id, filter, last_sent_at)`.
- Cron Vercel diario que busca obras nuevas que matchean filtros activos.
- Template Meta aprobado para notificación push.
- Intent `SUSCRIBIRME` / `DESUSCRIBIRME`.

---

## 6. Mapeo a la arquitectura nueva (tool-use loop)

Cada casuística mapea limpio a un `Tool` del registry `lib/agent/tools.ts`:

| Casuística | Tool name | Source data |
|---|---|---|
| Búsqueda básica obras | `buscar_obras` ✅ | `obras` |
| Detalle por ID | `get_obra` ✅ | `obras` |
| Stats país | `stats_por_pais` ✅ | `obras` |
| Ranking contratistas | `ranking_contratistas` ✅ | `obras` agg |
| Inhabilitados | `inhabilitados` ✅ | `red_flags` vigentes |
| Investigar empresa | `investigar_contratista` ✅ | `obras` + `red_flags` |
| Adjudicación directa | `adjudicacion_directa` ✅ | `obras` |
| Ranking entidades | `ranking_entidades` ✅ | `obras` agg |
| Monto en riesgo | `monto_en_riesgo` ✅ | `obras` |
| **Avance físico** | `avance_obra` 🆕 | `infobras_full` |
| **Supervisor** | `supervisor_obra` 🆕 | `infobras_full` |
| **Sobrecostos** | `sobrecostos` 🆕 | `obras` (cálculo) |
| **Obras activas/retrasadas** | `obras_activas` 🆕 | `obras.contract_status` |
| **Inhabilitados activos** | `inhabilitados_ganando` 🆕 | join `red_flags` ↔ `obras` |
| **Concentración** | `concentracion_contratista` 🆕 | `obras` agg con HAVING |
| **Comparar regiones** | `comparar_regiones` 🆕 | `obras` agg paralelo |
| **Definiciones cívicas** | `lookup_definition` 🆕 | tabla estática |
| **Generar link público** | (formatter) | `obras.ocid` |
| **Suscripciones** | `suscribir` / `desuscribir` 🆕🔴 | nueva tabla |
| **Reportar obra** | `reportar` 🆕🔴 | nueva tabla |

Cada `🆕` = tool nuevo a agregar. El registry pattern soporta esto sin tocar `runChatPipeline`.

---

## 7. Bottom line

**Estado actual:** el agente cubre las 9 queries OCDS canónicas correctamente. Es producto-mercado para "consulta básica de contratos por ciudadano informado".

**Lo más alto en ROI:**
1. **Enchufar `infobras_full`** (579 obras enriquecidas) — abre 4 nuevos tools: avance, supervisor, sobrecostos, fotos.
2. **`lookup_definition`** — costo bajo, valor cívico alto. Convierte el bot en herramienta educativa, no solo consulta.
3. **Filtros encadenados** (`REFINAR_BUSQUEDA`) — multiplica utilidad de cada `BUSCAR_OBRAS` ×3.
4. **Links compartibles + footer fuente** — kill switch para confianza.

**Lo más estratégico (no quick win, pero define el producto a 6 meses):**
- **Suscripciones push** — convierte usuarios pasivos (consultan 1 vez) en activos (reciben alerta semanal). Crece retención.
- **Crowdsourcing inbound** — ciudadanos suben fotos / denuncias → cierra el loop OCDS ↔ realidad. Diferencial vs cualquier otro civic-tech LatAm.
- **Cross-country** — Chile ya tiene 1K obras, Colombia/México next. El agente ya está hecho `country`-aware; falta data.

**Lo que NO hacer ahora:**
- Generación de PDF on-demand — caro, poca demanda comprobada.
- AI Vision masivo (10 obras solo) — no escala sin Anthropic budget mucho mayor.
- Cárteles automáticos — falsa precisión sin contexto humano, alto riesgo legal.
