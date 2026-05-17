# Agente WhatsApp Kapso — Transparentape

Documentación viva del agente conversacional de WhatsApp. Source-of-truth de qué hace cada archivo, cómo fluyen los mensajes y qué intents existen hoy.

> **Última actualización:** 2026-05-17 · commit `ede6080` (post tool-registry + engine.ts retired)

---

## Arquitectura — visión actual

```
┌────────────┐     webhook POST     ┌─────────────────────┐
│  WhatsApp  │ ───────────────────▶ │  /api/kapso/webhook │
│   User     │ ◀──────────────────  │   (Next.js route)   │
└────────────┘    Kapso send API    └──────┬──────────────┘
                                            │
                ┌───── fast-path: greeting / dedup / typing
                │
                ├───── Tier 1 (regex): parseIntent → handler determinístico
                │
                └───── Tier 2 (LLM): runChatPipeline(history, { tools })
                                      │
                                      ├─ TOOL_CALL → tools.ts ejecuta
                                      ├─ ANSWER_FROM_CONTEXT (synthesis)
                                      ├─ NEEDS_SQL (último recurso)
                                      └─ NEEDS_CLARIFICATION + suggestions
```

**Cambio clave reciente:** seis intents regex (`STATS`, `MONTO_EN_RIESGO`, `RANKING_CONTRATISTAS`, `RANKING_ENTIDADES`, `ADJUDICACION_DIRECTA`, `INHABILITADOS`) **fueron retirados** del fast-path determinístico. Ahora caen en `PREGUNTA_LIBRE` → LLM router → `TOOL_CALL`. Esto desbloquea **carry-forward conversacional**: "obras en Piura" → "y el ranking?" ahora razona sobre Piura específicamente en vez de un ranking nacional ciego.

---

## Archivos del agente

| Archivo | Responsabilidad |
|---|---|
| `web/app/api/kapso/webhook/route.ts` | Endpoint POST/GET. Firma HMAC, dedup, typing indicator, fast-path saludo, dispatch a Tier 1/Tier 2, send reply. |
| `web/lib/agent-kapso/intent.ts` | `parseIntent(text, country)`. 9 intents regex (más abajo). Plural ordinals (`los primeros 3`). Usa `classifyQuery` de `places.ts`. |
| `web/lib/agent-kapso/queries.ts` | SQL canónico tipado. `statement_timeout=5s` + LIMIT mandatorio. |
| `web/lib/agent-kapso/wa-format.ts` | Formatters de salida WhatsApp. |
| `web/lib/agent-kapso/session.ts` | `getSession`/`updateSession` sobre `agent_sessions`. |
| `web/lib/agent-kapso/config.ts` | `AGENT.models` / `AGENT.timeoutMs` / `AGENT.limits`. |
| `web/lib/agent-kapso/places.ts` | Allowlist de lugares (PE/CL/CO/MX/AR/BR) + `classifyQuery` que separa `q_geo` (region/locality) de `q_supplier` (company). |
| `web/lib/agent-kapso/index.ts` | Barrel exports — fachada del módulo. |
| `web/lib/agent-kapso/test-agent.ts` · `test-suite.ts` · `load-test.ts` | Tests internos del agente. |
| `web/lib/agent/core.ts` | `runChatPipeline(history, { tools, toolContext })` — pipeline LLM compartido (web + WhatsApp). |
| `web/lib/agent/tools.ts` | Tool registry. 9 tools tipados que envuelven `queries.ts` + `wa-format.ts`. |
| ~~`web/lib/agent-kapso/engine.ts`~~ | **Eliminado** — pipeline legacy retirado tras tool-registry probado. |

---

## Flujo del webhook (POST `/api/kapso/webhook`)

1. **Lee `rawBody`** (necesario para HMAC byte-exact).
2. **`checkSignature`** — acepta `x-hub-signature-256` (Meta `sha256=<hex>`) o `x-webhook-signature` (Kapso hex raw). Falla → log `sig_fail`, continúa procesando (TODO restaurar 401).
3. **`normalizeWebhook(payload)`** del SDK Kapso.
4. **`!msg || !msg.from`** → log `skipped` + return 200. Atrapa status updates Meta (delivery/read receipts).
5. **`showTyping(phoneNumberId, msgId)`** — fire-and-forget `markRead({typingIndicator:{type:"text"}})`. Cliente ve ✓✓ + "escribiendo…" hasta 25s o hasta enviar respuesta real.
6. **`isDuplicate()` dentro de `waitUntil`** — INSERT en `webhook_dedup`. No bloquea el 200.
7. **Tipo:**
   - `location` → `BUSCAR_CERCANOS`.
   - `interactive` → `buttonReply.id` / `listReply.id` → `BUTTON_MAP[id] ?? id` (list ids son la pregunta completa).
   - `image|audio|video|...` → respuesta canned "solo proceso texto".
   - `text` → `text.body`.
8. **Fast-path `GREETING_RE`** (`hola|holi|hey|menu|...`) → `sendAyudaWithButtons` directo. Sin `getSession`, sin `parseIntent`. ~1s ahorrado.
9. **`handleMessage(text, conversationId, phoneNumberId, to)`** dentro de `waitUntil`:
   - `getSession(from)`.
   - **`resolveIndexFromText(text, session.lastSuggestions)`** — expande `"1"`/`"2"`/`"1️⃣"`/`"opción 3"` a la sugerencia stored.
   - `parseIntent(effectiveText, session.country)`.
   - `meta.layer = "atajo:" + intent` para el log.
   - **Switch por intent:**
     - `CAMBIAR_PAIS`, `BUSCAR_OBRAS`, `BUSCAR_CERCANOS`, `VER_DETALLE`, `CONTEXTO_DETALLE`, `INVESTIGAR_CONTRATISTA`, `AYUDA`, `AGRADECIMIENTO` → handler determinístico.
     - `PREGUNTA_LIBRE` (default) → **`runChatPipeline(history, { tools: TOOLS, toolContext: { country } })`**.
10. **Logueo `/api/kapso/webhook`** con `steps`, `meta.layer`, `tool` cuando aplica.

---

## Intents actuales (9, era 15 — sunset de 6)

### Regex fast-path (Tier 1) — `intent.ts`

| Intent | Trigger ejemplo | Handler |
|---|---|---|
| `AYUDA` | "hola", "ayuda", "menu" | `sendAyudaWithButtons` (3 botones interactive) |
| `AGRADECIMIENTO` | "gracias", "ok", "perfecto" | Texto fijo |
| `CAMBIAR_PAIS` | "cambiar a Chile", `"Perú"` suelto (≤3 palabras, sin action keyword) | Update `session.country` |
| `BUSCAR_OBRAS` | "obras en Lima 2024" (debe contener `obras\|proyectos\|...` o año) | `buscarObras` + `fmtObras` |
| `BUSCAR_CERCANOS` | "obras cerca de mí" o mensaje tipo `location` | `buscarCercanas(session.lastLocation)` |
| `CONTEXTO_DETALLE` | "el primero", "más detalle", "los primeros 3", "últimas 2" | `getObraResumen(session.lastResultIds[N])`. Plural slice persiste el subset. |
| `VER_DETALLE` | "detalle #15059", "obra 15100" | `getObraResumen(id)` |
| `INVESTIGAR_CONTRATISTA` | "investigar Odebrecht", "ruc 20100..." | `investigarContratista` |
| `PREGUNTA_LIBRE` | todo lo demás | `runChatPipeline` con tools (ver abajo) |

### Tools (Tier 2) — `tools.ts` registry

Ejecutables por LLM router al detectar `TOOL_CALL`:

| Tool name | Wraps | Devuelve |
|---|---|---|
| `buscar_obras` | `buscarObras` | Obras + `obraIds` |
| `ver_detalle` | `getObraResumen` | Obra resumida |
| `stats_pais` | `statsPorPais` | Stats país |
| `ranking_contratistas` | `rankingContratistas` | Top contratistas (por monto o alertas) |
| `ranking_entidades` | `rankingEntidades` | Top entidades compradoras |
| `adjudicacion_directa` | `adjudicacionDirectaAlertas` | Obras directas con red_flag |
| `investigar_contratista` | `investigarContratista` | Cruce obras + sanciones OECE |
| `inhabilitados` | `inhabilitadosVigentes` | Lista contratistas inhabilitados |
| `monto_en_riesgo` | `montoEnRiesgo` | Total $ en obras red_flag |

Cada tool retorna `{ data, formatted, obraIds? }`. `formatted` es WhatsApp-ready. `obraIds` se persisten en `session.lastResultIds` para "el primero" después de un TOOL_CALL.

**Importante:** ninguno de estos 9 tools tiene regex fast-path. El LLM router siempre decide. Eso permite que "y ahora dame el ranking" use Piura del turno anterior en vez de un ranking nacional.

---

## Pipeline generativo (`runChatPipeline`)

`lib/agent/core.ts`. Compartido entre `/api/chat` (web) y `PREGUNTA_LIBRE` (WhatsApp).

```
┌──────────────────┐
│ Router (8s tmo)  │  llama-3.1-8b-instant, temp 0, JSON response
│ Prompt: con catálogo de tools si se pasaron en opts.tools
│ → intent: TOOL_CALL | ANSWER_FROM_CONTEXT | NEEDS_SQL | NEEDS_CLARIFICATION
│ → tool: "<nombre>", args: {...} si TOOL_CALL
│ → suggested_questions[] si NEEDS_CLARIFICATION
└────┬─────────────┘
     │
     ├──▶ TOOL_CALL → findTool(name).run(args, ctx) → { reply, tool, obra_ids }
     │       └─ fallback a NEEDS_SQL si tool desconocido o run() throws
     │
     ├──▶ NEEDS_CLARIFICATION → return reply + suggestions
     │
     ├──▶ ANSWER_FROM_CONTEXT (8s) → llama-3.1-8b-instant sobre historial
     │       └─ fallback adaptive a clarify si timeout
     │
     └──▶ NEEDS_SQL:
          1. SQL gen (10s) — llama-3.3-70b-versatile, temp 0
          2. isValidSelectQuery() — bloquea DML, semicolons
          3. query() a Postgres (con statement_timeout=5s + LIMIT inyectado si falta)
          4. Synthesis (10s) — llama-3.1-8b-instant sobre resultados
          └─ Adaptive fallback en cada paso (commit 0a3d51e)
```

**Guardrails:**

- `isValidSelectQuery` rechaza si no empieza con `SELECT`, contiene `;`, o matchea `DANGEROUS_SQL` (`INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE|COPY|VACUUM|ANALYZE`).
- **`statement_timeout=5s`** a nivel pool — ninguna query puede colgar (commit `257bc08`).
- **LIMIT mandatorio inyectado** si el SQL gen lo omite (mismo commit).
- Timeouts por step → ningún Groq call cuelga la conversación.
- **Adaptive LLM fallback** en cada error path — degrada a clarify con sugerencias en vez de crashear (commit `0a3d51e`).

---

## Lugares y companies (`places.ts`)

`classifyQuery(q)` separa input mixto en:

```
"obras de Cosapi en Lima"
        │
        ▼ buildSearchQuery limpia stopwords
"Cosapi en Lima"
        │
        ▼ classifyQuery
{ q_geo: "Lima", q_supplier: "Cosapi" }
```

Cada uno filtra su columna correcta (`buyer_region|buyer_locality` vs `supplier_name`). Sin esto el ILIKE `%Cosapi en Lima%` devolvía 0 rows.

**Allowlist por país** — PE, CL, CO, MX, AR, BR. Drops `q` si no parece lugar AND no parece company (evita "obras grandes" → ILIKE `%grandes%`).

---

## Respuestas con sugerencias indexadas

Cuando `runChatPipeline` retorna `suggested_questions[]`:

1. `sendReplyWithSuggestions` envía `sendInteractiveList`:
   - `bodyText` = reply
   - `buttonText` = "Ver opciones"
   - Rows: `title="1️⃣ Opción 1"`, `description=pregunta` (72 chars), `id=pregunta completa` (200 chars).
2. Persiste `session.lastSuggestions = [...]` (columna JSONB `last_suggestions`).
3. **3 vías de respuesta:**
   - **Tap row** → `listReply.id` = pregunta completa → flujo normal.
   - **Escribir `"1"` / `"2"` / `"3"`** → `resolveIndexFromText` mapea a `lastSuggestions[N-1]`.
   - **Escribir `"1️⃣"` / `"opción 2"` / `"#3"` / `"la 1"`** → mismo mapeo.
4. Respuesta no-index limpia `lastSuggestions = []` (evita stale match).

Fallback texto numerado si tier de número no soporta interactive list.

---

## Sesión (tabla `agent_sessions`)

```sql
CREATE TABLE agent_sessions (
  conversation_id  text PRIMARY KEY,    -- wa_id del usuario
  country          text DEFAULT 'PE',
  last_query       text,
  last_result_ids  integer[],           -- IDs obras del último resultado (ordinal follow-up)
  last_messages    jsonb,               -- historial chat [{role, content}, ...] max 6 msgs
  last_location    jsonb,               -- {lat, lng} de GPS share
  last_suggestions jsonb,               -- preguntas sugeridas activas (resolveIndex)
  updated_at       timestamptz
);
```

TTL: 30 min (`AGENT.limits.sessionTtlMinutes`). Expirada → reset a default (`PE`, todo null).

**`last_result_ids` se actualiza desde:**
- Handler determinístico `BUSCAR_OBRAS` / `CONTEXTO_DETALLE` / `BUSCAR_CERCANOS`.
- Tool execution si `result.obra_ids` no vacío.

Eso garantiza que "el primero" funciona después de TOOL_CALL `buscar_obras` igual que después de regex `BUSCAR_OBRAS`.

---

## Deduplicación (`webhook_dedup`)

```sql
CREATE TABLE webhook_dedup (
  msg_id     text PRIMARY KEY,
  created_at timestamptz DEFAULT NOW()
);
```

`INSERT ... ON CONFLICT DO NOTHING RETURNING msg_id` — primera vez retorna fila, dup retorna vacío.

Corre en `waitUntil` para no bloquear el 200 (ahorra ~500ms cold start).

---

## Configuración Kapso

```ts
new WhatsAppClient({
  baseUrl: "https://api.kapso.ai/meta/whatsapp",
  kapsoApiKey: process.env.KAPSO_API_KEY,
});
```

- Auth: header `X-API-Key` (NO Bearer).
- Métodos usados: `sendText`, `sendInteractiveButtons`, `sendInteractiveList`, `markRead`.
- Singleton lazy para warm starts.

**Webhook Kapso side:**
- URL: `https://transparentape.app/api/kapso/webhook`
- Verify token: `KAPSO_WEBHOOK_SECRET`
- Firma: `x-webhook-signature` (hex raw) o `x-hub-signature-256` (`sha256=hex`)

---

## Env vars

| Variable | Uso |
|---|---|
| `KAPSO_API_KEY` | Auth Kapso (`X-API-Key`) |
| `KAPSO_WEBHOOK_SECRET` | Verificación HMAC webhook |
| `KAPSO_PHONE_NUMBER_ID` | Fallback si payload omite `phoneNumberId` |
| `DATABASE_URL` | Postgres (Supabase pooler) |
| `GROQ_API_KEY` | Router + SQL gen + synthesis |
| `AGENT_API_SECRET` | Bearer para `/api/agent/*` (no webhook) |
| `NEXT_PUBLIC_BASE_URL` | OG tags + links públicos |

Cambios en env vars Vercel → **redeploy obligatorio**.

---

## Diagnóstico — `agent_logs`

```sql
agent_logs(endpoint, params, n_resultados, latencia_ms, created_at)
```

| `endpoint` | Cuándo |
|---|---|
| `/api/kapso/webhook` | OK. `params` incluye `from`, `text`, `steps`, `meta.layer` (`atajo:BUSCAR_OBRAS` / `tool:buscar_obras` / `context` / `sql_libre` / `clarify`), `fast_path` cuando aplica |
| `/api/kapso/webhook/sig_fail` | HMAC inválida. `params: {sig_header, body_preview}` |
| `/api/kapso/webhook/skipped` | Sin `msg.from` (status updates) |
| `/api/kapso/webhook/error` | Excepción no controlada |
| `/api/kapso/webhook/ayuda_failed` | Tanto interactive como text fallback fallaron |
| `/api/kapso/webhook/ayuda_fallback` | Interactive falló, fallback texto OK |

Query útil tail:

```sql
SELECT
  endpoint,
  params->>'text' AS msg,
  params->'meta'->>'layer' AS layer,
  params->>'tool' AS tool,
  latencia_ms,
  created_at
FROM agent_logs
WHERE endpoint LIKE '/api/kapso%'
ORDER BY created_at DESC
LIMIT 20;
```

---

## Migraciones del agente

| Migración | Cambio |
|---|---|
| `06_agent_sessions.sql` | Tabla base |
| `07_agent_sessions_history.sql` | Columna `last_messages` |
| `08_webhook_dedup.sql` | Tabla idempotencia |
| `09_agent_sessions_location.sql` | Columna `last_location` |
| `11_agent_sessions_suggestions.sql` | Columna `last_suggestions` |

(`10_infobras_schema.sql` no es del agente — ETL.)

---

## Optimizaciones aplicadas (timeline)

| Commit | Cambio | Beneficio |
|---|---|---|
| `76af16e` | `waitUntil` + custom HMAC + step logs | Vercel ya no mata I/O al return 200. Sig acepta Kapso + Meta. |
| `b06e7a8` | `runChatPipeline` extraído a `core.ts` | Web + WhatsApp comparten cerebro |
| `f424daf` | List rows con índice "1️⃣ Opción 1" | UI nativa Meta para sugerencias |
| `d20029d` | `last_suggestions` JSONB → `resolveIndexFromText` | User responde con "1"/"2" |
| `20ea997` | Fast-path greeting + dedup en background | ~1.5s menos en cold "hola" |
| `2c65d36` | `markRead` + typing indicator | UX viva durante cold start + LLM |
| `87a7332` | Tool registry `tools.ts` + TOOL_CALL intent | Router LLM despacha sin regex per case |
| `fd3ce76` | Webhook usa tool registry, `engine.ts` borrado | Single cerebro, fin de la duplicación |
| `5517e31` | Tools wired a `/api/chat` + region-aware ranking | Misma lógica web + WhatsApp |
| `257bc08` | `statement_timeout=5s` + LIMIT injection | Ninguna query cuelga; SQL siempre acotada |
| `0a3d51e` | Adaptive LLM fallback en cada error path | Crashes → clarify graceful |
| `b1bd36a` | Sunset 6 regex intents + plural ordinals + looser greeting | Carry-forward conversacional |

---

## Decisiones de diseño

- **Sin Kapso Workflows nativos.** Todo el routing es código custom en el webhook. Mantiene un solo lenguaje + control total.
- **No framework agéntico** (LangGraph, OpenAI Agents SDK, etc). Equipo pequeño, dominio entendido. Hand-roll wins.
- **Tier híbrido (regex + LLM tool-use)** vs pure-LLM-tool-use. Regex cubre saludos, ordinales y geo-keyword obvio sin gastar Groq. LLM cubre todo lo demás.
- **engine.ts retirado** — ya no se justifica un fallback paralelo. `runChatPipeline` adaptive fallback cubre los casos antes manejados por engine.

---

## Pendientes / gaps conocidos

- **Restaurar 401 en sig_fail** una vez que firma esté 100% validada en prod (hoy retorna 200 + log para no entrar en backoff Kapso).
- **Cold start Vercel** ~1-2s en hobby. Mitigaciones disponibles: typing indicator esconde percepción; warm-keep cron (fuera de scope del agente); upgrade Pro.
- **`webhook_dedup` housekeeping** — agregar índice o cron de limpieza si crece > 1M rows.
- **Tools sobre `infobras_full`** (avance físico, supervisor) — datos existen, tools aún no. Ver `AGENT_KAPSO_ROADMAP.md` Milestone B.
- **Multi-país data** — agente ya es country-aware; falta ETL Chile/Colombia (fuera de scope).

---

## Referencias rápidas

- Production URL: https://transparentape.app
- Webhook: https://transparentape.app/api/kapso/webhook
- Número WhatsApp: +1 201-899-2743 (`phone_number_id`: `1035188399688492`)
- Kapso project: `transparentape` (`922b7f6a-b20d-4ca5-a7e9-5fade4cdb8c2`)
- DB host: `aws-1-us-west-1.pooler.supabase.com`
- Repo: https://github.com/victorgalvez56/sigue-el-billete

**Docs hermanos:**
- `AGENT_KAPSO_ROADMAP.md` — qué viene siguiente, scope agente.
- `AGENT_ARCHITECTURE_REFERENCE.md` — análisis de patrones de agentes IA en general (referencia conceptual).
- `AGENT_NEW_FLOWS.md` — análisis de casuísticas posibles basado en data Supabase.
