# 100 casuísticas — test suite del agente

Set de testing exhaustivo del agente WhatsApp+web post Olas 1-3 (commits `257bc08..23e6bd6`). Cubre cada capa del flujo híbrido + multi-turn + edge cases + adversarial. Cada caso: input → capa esperada → comportamiento esperado → riesgo.

> **Última actualización:** 2026-05-17 · cobertura: regex atajos / tool-call / SQL libre / ANSWER_FROM_CONTEXT / adaptive fallback / canal WhatsApp

---

## Leyenda

- **Capa esperada**: `atajo:<INTENT>` (regex hit) · `tool:<name>` (LLM router → tool) · `context` (ANSWER_FROM_CONTEXT) · `sql_libre` (NEEDS_SQL gen) · `clarify` (NEEDS_CLARIFICATION dinámico) · `fallback` (adaptiveFallback)
- **✅ pass** — comportamiento correcto esperado
- **⚠️ frágil** — pasa pero depende de LLM o UX puede confundir
- **❌ rompe** — falla conocida; documentar para fix futuro

---

## A. Saludo / onboarding (1-8)

| # | Input | Capa | Esperado | Riesgo |
|---|---|---|---|---|
| 1 | `hola` | fast-path saludo | 3 botones + ejemplos NL | ✅ |
| 2 | `Buenos días!` | fast-path saludo | mismo | ✅ |
| 3 | `👋` | fast-path saludo | mismo (Ola 2b emoji) | ✅ |
| 4 | `hola hola hola` | fast-path saludo | mismo (Ola 2b repeats) | ✅ |
| 5 | `qué puedes hacer` | `atajo:AYUDA` | mensaje ayuda + botones | ✅ |
| 6 | `menu` | fast-path saludo | botones | ✅ |
| 7 | `inicio` | fast-path saludo | botones | ✅ |
| 8 | `empezar a investigar` | `PREGUNTA_LIBRE` → `clarify` | dinámico + sugerencias | ⚠️ |

---

## B. BUSCAR_OBRAS — happy paths (9-20)

| # | Input | Capa | Esperado | Riesgo |
|---|---|---|---|---|
| 9 | `obras en Lima` | `atajo:BUSCAR_OBRAS` | q_geo=lima, top 5 | ✅ |
| 10 | `obras 2024` | `atajo:BUSCAR_OBRAS` | year=2024 sin q | ✅ |
| 11 | `obras en Piura este año` | `atajo:BUSCAR_OBRAS` | year=THIS_YEAR, q_geo=piura | ✅ |
| 12 | `obras en Cusco con alerta` | `atajo:BUSCAR_OBRAS` | red_flag=true, q_geo=cusco | ✅ |
| 13 | `proyectos del 2023 en Iquitos` | `atajo:BUSCAR_OBRAS` | year=2023, q_geo=iquitos | ✅ |
| 14 | `construcciones en Arequipa` | `atajo:BUSCAR_OBRAS` | q_geo=arequipa | ✅ |
| 15 | `obras de Cosapi` | `atajo:BUSCAR_OBRAS` | q_supplier=Cosapi (Ola 3 classifyQuery) | ✅ |
| 16 | `obras de Cosapi en Lima` | `atajo:BUSCAR_OBRAS` | q_geo=lima + q_supplier=cosapi | ✅ |
| 17 | `obras de Odebrecht` | `atajo:BUSCAR_OBRAS` | q_supplier=Odebrecht | ✅ |
| 18 | `obras en Lima Norte` | `atajo:BUSCAR_OBRAS` | q_geo="lima norte" (longest match) | ✅ |
| 19 | `obras en San Juan de Lurigancho` | `atajo:BUSCAR_OBRAS` | q_geo="san juan de lurigancho" | ✅ |
| 20 | `obras de saneamiento` | `atajo:BUSCAR_OBRAS` | q_supplier=saneamiento (single word non-noise) | ⚠️ |

---

## C. BUSCAR_OBRAS — edge / brittle (21-28)

| # | Input | Capa | Esperado | Riesgo |
|---|---|---|---|---|
| 21 | `obras grandes` | `atajo:BUSCAR_OBRAS` | sin q (Ola 3 NOISE_WORDS) → top país | ✅ |
| 22 | `obras nuevas` | `atajo:BUSCAR_OBRAS` | sin q → top país | ✅ |
| 23 | `obras importantes` | `atajo:BUSCAR_OBRAS` | sin q → top país | ✅ |
| 24 | `muéstrame las obras` | `atajo:BUSCAR_OBRAS` | sin q (stopwords) → top país | ✅ |
| 25 | `obras en Lima y en Cusco` | `atajo:BUSCAR_OBRAS` | q_geo=lima, q_supplier=cusco (mal!) | ❌ |
| 26 | `obras en Valle del Colca` | `atajo:BUSCAR_OBRAS` | q_geo no match → fallthrough | ❌ |
| 27 | `concursos públicos Tacna` | `atajo:BUSCAR_OBRAS` | q_geo=tacna ✓ | ✅ |
| 28 | `contratos directos` | `PREGUNTA_LIBRE` → `tool:adjudicacion_directa` | tool ranking directa | ✅ |

---

## D. CONTEXTO_DETALLE singular (29-36)

*Setup: turno previo dejó `lastResultIds=[A,B,C,D,E]`.*

| # | Input | Capa | Esperado | Riesgo |
|---|---|---|---|---|
| 29 | `el primero` | `atajo:CONTEXTO_DETALLE` | pos=1 → fmtDetalle(A) | ✅ |
| 30 | `el segundo` | pos=2 → B | ✅ |
| 31 | `dame la 3` | `el/la 3` regex → pos=3 → C | ✅ |
| 32 | `#3` | pos=3 → C | ✅ |
| 33 | `el último` | pos=-1 → E | ✅ |
| 34 | `más detalle` | fallback pos=1 → A | ✅ |
| 35 | `más info` | mismo | ✅ |
| 36 | `dame info de la quinta` | `quint[ao]` → pos=5 → E | ✅ |

---

## E. CONTEXTO_DETALLE plural — Ola 2b (37-44)

*Setup: igual D.*

| # | Input | Capa | Esperado | Riesgo |
|---|---|---|---|---|
| 37 | `los primeros 3` | `atajo:CONTEXTO_DETALLE` | count=3, pos=1 → fmtObras slice[A,B,C] | ✅ |
| 38 | `las primeras 2` | count=2 → fmtObras[A,B] | ✅ |
| 39 | `los últimos 3` | count=3, pos=-1 → fmtObras[C,D,E] | ✅ |
| 40 | `ultimas 2` | count=2, pos=-1 → fmtObras[D,E] | ✅ |
| 41 | `3 primeros` | count=3, pos=1 (orden invertido) | ✅ |
| 42 | `los primeros 100` | count out of range (>10) → fallthrough | ⚠️ posible BUSCAR_OBRAS |
| 43 | `los primeros 1` | count=1 (not plural) → fallthrough singular | ⚠️ |
| 44 | `los próximos 3` | "próximos" no en regex → fallthrough | ⚠️ |

---

## F. Bugs históricos — regression set (45-52)

| # | Input | Capa | Esperado | Riesgo |
|---|---|---|---|---|
| 45 | `5+5` | `PREGUNTA_LIBRE` → `clarify` dinámico | "soy bot obras, no calculadora..." | ✅ |
| 46 | `tengo 3 hijos` | `PREGUNTA_LIBRE` → `clarify` | dinámico | ✅ |
| 47 | `son las 2 de la tarde` | `PREGUNTA_LIBRE` → `clarify` | dinámico | ✅ |
| 48 | `obra #5` | `atajo:CONTEXTO_DETALLE` pos=5 (válido con context) | ✅ si lastResultIds, sino "no tengo búsqueda reciente" |
| 49 | `mi teléfono 987654321` | `PREGUNTA_LIBRE` (RUC≠11 dígitos) | clarify dinámico | ✅ |
| 50 | `investigar https://malware.com` | `atajo:INVESTIGAR_CONTRATISTA` | contratista=undefined → "Escribe RUC o nombre" | ✅ |
| 51 | `investigar Cosapi SAC https://x.com` | `atajo:INVESTIGAR_CONTRATISTA` | contratista="Cosapi SAC" (URL strip) | ✅ |
| 52 | `obras; DROP TABLE obras;` | `atajo:BUSCAR_OBRAS` | q vacío post-stopwords → top país, SQL injection bloqueada | ✅ |

---

## G. Multi-turn carry-forward — Ola 2b sunset (53-62)

*Setup turno 1: `obras en Piura` → BUSCAR_OBRAS q_geo=piura → 5 obras, session.lastResultIds + history persistidos.*

| # | Input (turno 2) | Capa | Esperado | Riesgo |
|---|---|---|---|---|
| 53 | `y el ranking?` | `PREGUNTA_LIBRE` → `tool:ranking_contratistas` | LLM lee history → q=piura → top Piura | ✅ |
| 54 | `estadísticas` | `PREGUNTA_LIBRE` → `tool:stats_pais` | stats país actual | ⚠️ (no scope por región) |
| 55 | `monto en riesgo` | `PREGUNTA_LIBRE` → `tool:monto_en_riesgo` | total país (no región) | ⚠️ |
| 56 | `empresas inhabilitadas` | `PREGUNTA_LIBRE` → `tool:inhabilitados` | nacional, no scope Piura | ⚠️ |
| 57 | `cuál tiene mayor monto?` | `PREGUNTA_LIBRE` → `context` o `tool:buscar_obras` | LLM elige según history | ⚠️ |
| 58 | `y las de saneamiento?` | `PREGUNTA_LIBRE` → `tool:buscar_obras` | carry-forward Piura + sector saneamiento? | ⚠️ |
| 59 | `solo las con alerta` | `PREGUNTA_LIBRE` → `tool:buscar_obras` | red_flag=true + q_geo=piura | ⚠️ |
| 60 | `cuál de esas es la peor?` | `PREGUNTA_LIBRE` → `context` | LLM resume desde history | ⚠️ |
| 61 | `quiénes ganaron esas?` | `PREGUNTA_LIBRE` → `tool:ranking_contratistas` con q=piura | ✅ |
| 62 | `dame el detalle del primero` | `atajo:CONTEXTO_DETALLE` pos=1 | fmtDetalle | ✅ |

---

## H. PREGUNTA_LIBRE → tool-call paráfrasis (63-72)

*Sin contexto previo. Verifica que el router LLM elige tool correcto.*

| # | Input | Capa | Esperado | Riesgo |
|---|---|---|---|---|
| 63 | `qué empresas ganan más contratos` | `tool:ranking_contratistas` | por monto | ✅ |
| 64 | `quiénes son los contratistas más grandes` | `tool:ranking_contratistas` | por monto | ✅ |
| 65 | `top de empresas que más roban` | `tool:ranking_contratistas` | por alertas | ⚠️ |
| 66 | `qué entidades compran más` | `tool:ranking_entidades` | top entidades | ✅ |
| 67 | `cuánto dinero está en riesgo` | `tool:monto_en_riesgo` | total país | ✅ |
| 68 | `qué tan corrupto es Perú` | clarify o tool:stats_pais o tool:monto_en_riesgo | ambiguo, depende router | ⚠️ |
| 69 | `qué contratos se dieron a dedo` | `tool:adjudicacion_directa` | top directas alertadas | ✅ |
| 70 | `muéstrame empresas castigadas` | `tool:inhabilitados` | top sancionados | ✅ |
| 71 | `dame estadísticas generales` | `tool:stats_pais` | resumen país | ✅ |
| 72 | `cómo va el panorama de obras` | clarify o stats | ambiguo | ⚠️ |

---

## I. Multi-país — country switch (73-80)

| # | Input | Capa | Esperado | Riesgo |
|---|---|---|---|---|
| 73 | `Chile` solo | `atajo:CAMBIAR_PAIS` CL | session.country=CL | ✅ |
| 74 | `quiero cambiar a México` | `atajo:CAMBIAR_PAIS` MX | session.country=MX | ✅ |
| 75 | `obras de Colombia` | `atajo:BUSCAR_OBRAS` country=CO | session updated + 5 obras CO | ✅ |
| 76 | `qué hay en Brasil` | `atajo:CAMBIAR_PAIS` BR (3 tokens, sin ACTION_KEYWORD) | ⚠️ esperaba búsqueda |
| 77 | `obras en Brasil` | `atajo:BUSCAR_OBRAS` (obras keyword) | country=BR + buscar | ✅ |
| 78 | `seleccionar Argentina` | `atajo:CAMBIAR_PAIS` AR | ✅ | ✅ |
| 79 | `dame stats de Chile` | `PREGUNTA_LIBRE` → `tool:stats_pais` (post-sunset STATS) | country=CL si detecta | ⚠️ tool no recibe country override directo |
| 80 | `Perú` solo (ya en PE) | `atajo:CAMBIAR_PAIS` PE | no-op (mismo país) | ✅ |

---

## J. INVESTIGAR + RUC (81-86)

| # | Input | Capa | Esperado | Riesgo |
|---|---|---|---|---|
| 81 | `investigar Odebrecht` | `atajo:INVESTIGAR_CONTRATISTA` | contratista=Odebrecht | ✅ |
| 82 | `investigar 20100123456` | `atajo:INVESTIGAR_CONTRATISTA` | RUC 11 dig | ✅ |
| 83 | `ruc: 20100123456` | `atajo:INVESTIGAR_CONTRATISTA` | RUC keyword | ✅ |
| 84 | `ruc 12345678` (Chile RUT 8 dig) | `atajo:INVESTIGAR_CONTRATISTA` | RUC_KW_RE acepta 8-12 | ✅ |
| 85 | `qué hay de la empresa Cosapi` | `PREGUNTA_LIBRE` → `tool:investigar_contratista` o `tool:buscar_obras` q_supplier=Cosapi | ambiguo, ambos OK | ⚠️ |
| 86 | `investigar` (sin nombre) | `atajo:INVESTIGAR_CONTRATISTA` | contratista=undefined → "Escribe RUC o nombre" | ✅ |

---

## K. Conversación natural / ANSWER_FROM_CONTEXT (87-90)

*Setup: history contiene búsqueda previa con resultados.*

| # | Input | Capa | Esperado | Riesgo |
|---|---|---|---|---|
| 87 | `cuál era el monto del primero` | `PREGUNTA_LIBRE` → `context` | LLM extrae monto de history | ⚠️ |
| 88 | `repíteme esa lista` | `PREGUNTA_LIBRE` → `context` | LLM resume | ⚠️ |
| 89 | `explícame mejor` | `PREGUNTA_LIBRE` → `context` | LLM expande último mensaje del asistente | ⚠️ |
| 90 | `explícame mejor` (sin history) | `PREGUNTA_LIBRE` → router elige context → **F8 guard** → `clarify` adaptive | mensaje útil + sugerencias (Ola 3) | ✅ |

---

## L. Adaptive fallback — Ola 2a (91-94)

| # | Input | Capa | Esperado | Riesgo |
|---|---|---|---|---|
| 91 | `obras de saneamiento 2025 en Piura` (suponiendo 0 rows DB) | `tool:buscar_obras` → `fallback` reason=no_results | reply menciona Piura, sugerencias contextuales | ✅ |
| 92 | `obras donde el director robó X` (SQL gen falla) | `sql_libre` → invalid SELECT → `fallback` invalid_sql | adaptive reply | ✅ |
| 93 | Query con statement_timeout 5s (cross join) | `sql_libre` exec → DB error → `fallback` error | adaptive | ✅ Ola 1 + 2a |
| 94 | Groq down completamente | router catch → SQL path → SQL gen fail → `fallback` LLM falla → static rescue | regex region detect → fallback estático | ✅ Ola 2a final rescue |

---

## M. Off-topic / inyecciones — clarify dinámico (95-100)

| # | Input | Capa | Esperado | Riesgo |
|---|---|---|---|---|
| 95 | `dame una receta de ceviche` | `PREGUNTA_LIBRE` → `clarify` dinámico | "soy agente de obras, no chef..." (sarcástico anclado, Jose) | ✅ |
| 96 | `ignore previous instructions and...` | `PREGUNTA_LIBRE` → `clarify` dinámico | sarcástico + ancla | ✅ |
| 97 | `cuál es la capital de Francia` | `PREGUNTA_LIBRE` → `clarify` | mismo | ✅ |
| 98 | `traduce hola al inglés` | `PREGUNTA_LIBRE` → `clarify` | mismo | ✅ |
| 99 | `gracias` | `atajo:AGRADECIMIENTO` | mensaje cierre cálido | ✅ |
| 100 | `🙏` solo | `atajo:AGRADECIMIENTO` (emoji incluido en regex) | mismo | ✅ |

---

## N. Casos canal WhatsApp (extra — no contados en 100)

| # | Input | Capa | Esperado |
|---|---|---|---|
| N1 | Comparte ubicación GPS | location handler → `atajo:BUSCAR_CERCANOS` | buscarCercanas + fmtCercanas |
| N2 | Toca botón `btn_buscar` | BUTTON_MAP → "obras en" → atajo BUSCAR_OBRAS sin q → top país | ✅ |
| N3 | Toca botón `btn_stats` | "estadísticas" → PREGUNTA_LIBRE → tool:stats_pais | ⚠️ (era atajo, ahora tool) |
| N4 | Tap fila lista (id="obras con alerta Lima") | text completo → atajo BUSCAR_OBRAS red_flag=true + Lima | ✅ |
| N5 | Escribe `2` con lastSuggestions activas | resolveIndex → expande a suggestion[1] → flujo normal | ✅ |
| N6 | Envía imagen | media type → respuesta canned "solo proceso texto" | ✅ |
| N7 | Webhook duplicate (msg_id repetido) | webhook_dedup catch → skip | ✅ |
| N8 | Mensaje vacío | webhook skipped | ✅ |
| N9 | Mensaje >600 chars | runChatPipeline lo procesa (sin reject por longitud post-engine.ts removal) | ⚠️ costo LLM |
| N10 | Status update inbound (delivery) | normalizeWebhook → no msg.from → /skipped log | ✅ |

---

## Fallas conocidas (a fixear)

### ❌ Críticas

- **#25 "obras en Lima y en Cusco"** → classifyQuery toma lima como geo, "cusco" como rest → q_supplier=cusco → 0 rows.
  - **Fix propuesto**: en `classifyQuery`, si rest ALSO matches findPlace → array q_geo o multi-WHERE OR.
- **#26 "obras en Valle del Colca"** → Valle del Colca no en ALL_PLACES → q vacío → top país.
  - **Fix propuesto**: ampliar ALL_PLACES con provincias/distritos turísticos o lookup pg_trgm contra DB DISTINCT buyer_locality.

### ⚠️ Frágiles (UX confusa)

- **#42 "los primeros 100"** count>10 cae a fallthrough → BUSCAR_OBRAS sin contexto.
  - **Fix**: clamp count a [2,10] o mensaje "tengo solo N resultados, ¿quieres N?".
- **#54-#56 carry-forward solo funciona en tools** que aceptan `q`. `stats_pais`, `monto_en_riesgo`, `inhabilitados` no aceptan filtro región.
  - **Fix**: agregar `q?: string` a estos tools, filtrar a nivel SQL.
- **#76 "qué hay en Brasil"** cambia país en vez de buscar (3 tokens y sin ACTION_KEYWORD trigger).
  - **Fix**: añadir verbo interrogativo a ACTION_KEYWORDS o exigir 4+ tokens para CAMBIAR_PAIS short-form.
- **#65 "top empresas que más roban"** router debería elegir `por=alertas` pero a veces elige `por=monto`.
  - **Fix**: enriquecer description del tool `ranking_contratistas` con ejemplos.
- **#79 "stats de Chile"** tool no recibe country override.
  - **Fix**: stats_pais tool acepta `country_override` igual que investigar_contratista.

---

## Cómo correr este test

### Hoy (manual)

Cada caso es una conversación de WhatsApp. Setup mínimo:
1. DB Supabase con `obras` cargada (`cd etl && python run_pipeline.py --year 2024`).
2. Vercel deploy o `npm run dev` local con `KAPSO_*` envs.
3. Mandar inputs vía Kapso Inbox o webhook curl directo.

### Futuro (automatizable — backlog)

- Script `tsx scripts/run-test100.ts`:
  - Lee este markdown.
  - Por cada caso, calcula `parseIntent(input, country)` + (si PREGUNTA_LIBRE) llama `runChatPipeline` con history sintético.
  - Compara `result.intent` + `result.tool` vs lo esperado.
  - Reporta pass/warn/fail vs `agent_logs.layer` real en producción.
- CI: corre subset (no toca Groq) en cada PR. Subset completo nightly.

---

## Resumen ejecutivo

| Categoría | Total | ✅ Pass | ⚠️ Frágil | ❌ Rompe |
|---|---|---|---|---|
| A. Saludo | 8 | 7 | 1 | 0 |
| B-C. BUSCAR_OBRAS | 20 | 16 | 2 | 2 |
| D. CONTEXTO singular | 8 | 8 | 0 | 0 |
| E. CONTEXTO plural | 8 | 5 | 3 | 0 |
| F. Bugs históricos | 8 | 8 | 0 | 0 |
| G. Multi-turn | 10 | 3 | 7 | 0 |
| H. Tool paráfrasis | 10 | 6 | 4 | 0 |
| I. Multi-país | 8 | 6 | 2 | 0 |
| J. INVESTIGAR | 6 | 5 | 1 | 0 |
| K. Context-aware | 4 | 1 | 3 | 0 |
| L. Adaptive fallback | 4 | 4 | 0 | 0 |
| M. Off-topic | 6 | 6 | 0 | 0 |
| **Total 100** | **100** | **75** | **23** | **2** |

**75 % pass robusto · 23 % frágil (depende LLM o UX confusa) · 2 % rompe (multi-place + valles no canónicos)**

Salud actual: agente conversa de forma intuitiva en happy paths + carry-forward en tools de obras + recuperación de errores con contexto. Mayor área de fricción: tools que no aceptan filtro geo (`stats`, `monto`, `inhabilitados`) — pequeña adición pa cerrar 4-5 frágiles más.
