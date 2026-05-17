# Agente WhatsApp Kapso — Transparentape

Documentación viva del agente conversacional de WhatsApp que conecta usuarios con la base de obras públicas (OCDS Perú, Chile, Colombia, México, Argentina, Brasil).

> **Última actualización:** 2026-05-17 · commit `e908305`

---

## Arquitectura — visión general

```
┌────────────┐     webhook POST     ┌─────────────────────┐
│  WhatsApp  │ ───────────────────▶ │  /api/kapso/webhook │
│   User     │ ◀──────────────────  │   (Next.js route)   │
└────────────┘    Kapso send API    └──────┬──────────────┘
                                            │
                          ┌─────────────────┼──────────────────┐
                          ▼                 ▼                  ▼
                  ┌──────────────┐  ┌──────────────┐   ┌────────────┐
                  │  parseIntent │  │ runChatPipe- │   │  Supabase  │
                  │  (regex)     │  │ line (Groq)  │   │  Postgres  │
                  └──────────────┘  └──────────────┘   └────────────┘
                          │                 │                  │
                          └────────┬────────┘                  │
                                   ▼                           │
                         ┌──────────────────┐                  │
                         │  queries.ts      │ ─────────────────┘
                         │  (SQL canónico)  │
                         └──────────────────┘
```

**Dos cerebros, una BD:**
- **Determinístico (`parseIntent` + `queries.ts`)** — 14 intents reconocidos por regex. Respuestas formateadas con SQL pre-escrito. Rápido (<1s), predecible, sin LLM.
- **Generativo (`runChatPipeline` en `lib/agent/core.ts`)** — Fallback para `PREGUNTA_LIBRE`. Pipeline Groq: router → SQL gen → synthesis. Compartido con `/api/chat` (web).

---

## Archivos clave

| Archivo | Responsabilidad |
|---|---|
| `web/app/api/kapso/webhook/route.ts` | Endpoint principal. Recibe POST de Kapso, verifica firma, dedup, ruta a handler, envía respuesta. |
| `web/lib/agent-kapso/intent.ts` | `parseIntent(text, country)` — regex-based intent classification. |
| `web/lib/agent-kapso/queries.ts` | SQL canónico: `buscarObras`, `buscarCercanas`, `rankingContratistas`, `investigarContratista`, `inhabilitadosVigentes`, `adjudicacionDirectaAlertas`, `rankingEntidades`, `montoEnRiesgo`, `statsPorPais`, `getObraResumen`, `yearsDisponibles`. |
| `web/lib/agent-kapso/wa-format.ts` | Formateadores de salida (`fmtObras`, `fmtDetalle`, `fmtStats`, etc.). |
| `web/lib/agent-kapso/session.ts` | `getSession`/`updateSession` sobre tabla `agent_sessions`. Persistencia entre mensajes. |
| `web/lib/agent-kapso/config.ts` | `AGENT.models` / `AGENT.timeoutMs` / `AGENT.limits` — constantes. |
| `web/lib/agent-kapso/engine.ts` | Pipeline legacy (mantenido como **fallback** del `PREGUNTA_LIBRE`). A retirar cuando `core.ts` sea estable. |
| `web/lib/agent/core.ts` | `runChatPipeline(history)` — pipeline compartido web + WhatsApp. Router + SQL gen + synthesis con timeouts + guardrails. |
| `web/app/api/chat/route.ts` | Adapter thin del web chat. Llama `runChatPipeline`. |

---

## Flujo del webhook (POST `/api/kapso/webhook`)

1. **Lee `rawBody`** — necesario para verificación HMAC byte-exact.
2. **Verifica firma** (`checkSignature`):
   - Header `x-hub-signature-256` (formato Meta `sha256=<hex>`) **o** `x-webhook-signature` (formato Kapso `hex` raw).
   - HMAC-SHA256(rawBody, `KAPSO_WEBHOOK_SECRET`) comparado en `timingSafeEqual`.
   - **Falla → loguea `/api/kapso/webhook/sig_fail` y continúa** (TODO: retornar 401 cuando firma esté 100% validada en prod).
3. **`normalizeWebhook(payload)`** del SDK Kapso — convierte payload Meta/Kapso a estructura uniforme.
4. **Si `!msg || !msg.from`** → loguea `/skipped` y retorna 200. (Status updates: delivery/read receipts caen aquí.)
5. **`isDuplicate()`** — INSERT en `webhook_dedup(msg_id)`. Si ya existe → return early. Movido a `waitUntil` para no bloquear el 200.
6. **Tipo de mensaje:**
   - `location` → `BUSCAR_CERCANOS` automático.
   - `interactive` → `interactive.buttonReply.id` o `interactive.listReply.id` → `BUTTON_MAP[id] ?? id` (los IDs de lista son la pregunta completa).
   - `image|audio|video|document|sticker|voice` → responde "solo proceso texto".
   - `text` → `text.body`.
7. **Fast-path saludo** (`GREETING_RE`): si texto es `hola|holi|hey|buenos días|menu|...` → directo a `sendAyudaWithButtons` (skip `getSession` + `parseIntent`). ~1s ahorrado.
8. **`handleMessage`** dentro de `waitUntil`:
   - `getSession(from)` — carga `agent_sessions`.
   - `resolveIndexFromText(text, session.lastSuggestions)` — si texto es `"1"`, `"2"`, `"1️⃣"`, `"opción 2"`, `"#3"` → expande a la sugerencia original.
   - `parseIntent(effectiveText, session.country)` — clasifica.
   - `switch` por intent → handler correspondiente.
9. **`sendText` / `sendInteractiveButtons` / `sendInteractiveList`** vía `getKapso().messages.*`.
10. **Logueo final** en `agent_logs` con `steps: {start, handle_done, send_done}` para diagnóstico.

---

## Intents soportados (14)

| Intent | Trigger ejemplo | Handler |
|---|---|---|
| `AYUDA` | "hola", "ayuda", "menu" | `sendAyudaWithButtons` (3 botones interactive) |
| `AGRADECIMIENTO` | "gracias", "ok", "perfecto" | Texto fijo |
| `CAMBIAR_PAIS` | "cambiar a Chile", "Perú" (suelto) | Cambia `session.country` |
| `BUSCAR_OBRAS` | "obras en Lima 2024" | `buscarObras` + `fmtObras` |
| `BUSCAR_CERCANOS` | "obras cerca de mí" (o `location` msg) | `buscarCercanas` (usa `session.lastLocation`) |
| `CONTEXTO_DETALLE` | "el primero", "#3", "más detalle" | `getObraResumen(session.lastResultIds[N])` |
| `VER_DETALLE` | "detalle #15059" | `getObraResumen(id)` |
| `STATS` | "estadísticas Perú" | `statsPorPais` + `fmtStats` |
| `MONTO_EN_RIESGO` | "monto en riesgo", "dinero en riesgo" | `montoEnRiesgo` |
| `RANKING_CONTRATISTAS` | "ranking contratistas", "top contratistas" | `rankingContratistas` (por monto o alertas) |
| `RANKING_ENTIDADES` | "ranking entidades", "mayores compradores" | `rankingEntidades` |
| `ADJUDICACION_DIRECTA` | "adjudicación directa", "contratos directos" | `adjudicacionDirectaAlertas` |
| `INVESTIGAR_CONTRATISTA` | "investigar Odebrecht", "ruc 20100..." | `investigarContratista` (cruza OECE sanciones) |
| `INHABILITADOS` | "inhabilitados", "sancionados" | `inhabilitadosVigentes` |
| `PREGUNTA_LIBRE` | cualquier otro texto | `runChatPipeline` (Groq) → fallback `chatEngine` legacy |

---

## Pipeline generativo (`runChatPipeline`)

Definido en `lib/agent/core.ts`. Compartido entre `/api/chat` (web) y `PREGUNTA_LIBRE` del webhook.

```
┌──────────────────┐
│ Router (8s tmo)  │  llama-3.1-8b-instant, temp 0, JSON response
│ → intent: ANSWER_FROM_CONTEXT | NEEDS_SQL | NEEDS_CLARIFICATION
│ → suggested_questions[] (cuando NEEDS_CLARIFICATION)
└────┬─────────────┘
     │
     ├──▶ NEEDS_CLARIFICATION → return reply + suggestions
     │
     ├──▶ ANSWER_FROM_CONTEXT (8s) → llama-3.1-8b-instant sobre historial
     │
     └──▶ NEEDS_SQL:
          1. SQL gen (10s) — llama-3.3-70b-versatile, temp 0
          2. isValidSelectQuery() — bloquea DML, semicolons
          3. query() a Postgres
          4. Synthesis (10s) — llama-3.1-8b-instant sobre resultados
```

**Guardrails:**
- `isValidSelectQuery`: rechaza si no empieza con `SELECT`, si contiene `;`, o si matchea `DANGEROUS_SQL` (`INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE|COPY|VACUUM|ANALYZE`).
- Timeouts por step → ningún call Groq puede colgar la conversación.
- Cada path tiene `try/catch` con fallback (mensaje útil + sugerencias).

---

## Respuestas con sugerencias indexadas

Cuando `runChatPipeline` retorna `suggested_questions[]`:

1. `sendReplyWithSuggestions` envía `sendInteractiveList` (Meta):
   - `bodyText` = reply
   - `buttonText` = "Ver opciones"
   - Cada row: `title` = `"1️⃣ Opción 1"` (24 chars max), `description` = pregunta completa (72 chars max), `id` = pregunta completa (200 chars max).
2. Persiste `session.lastSuggestions = [...]` (columna JSONB `last_suggestions`).
3. **El usuario puede responder de 3 formas:**
   - **Tap la fila** → `listReply.id` = pregunta completa → flujo normal.
   - **Escribir `"1"` / `"2"` / `"3"`** → `resolveIndexFromText` mapea a `lastSuggestions[N-1]`.
   - **Escribir `"1️⃣"` o `"opción 2"` o `"#3"` o `"la 1"`** → mismo mapeo.
4. Cualquier respuesta no-índice limpia `lastSuggestions = []` para evitar stale match.

**Fallback** si el tier del número no soporta interactive list: envía texto plano numerado (`1️⃣ pregunta 1\n2️⃣ pregunta 2 …`).

---

## Sesión (tabla `agent_sessions`)

```sql
CREATE TABLE agent_sessions (
  conversation_id text PRIMARY KEY,    -- = wa_id del usuario
  country         text DEFAULT 'PE',
  last_query      text,
  last_result_ids integer[],           -- IDs de obras del último resultado (para "el primero" etc)
  last_messages   jsonb,               -- historial de chat [{role, content}, ...] (max 6 msgs)
  last_location   jsonb,               -- {lat, lng} de GPS share
  last_suggestions jsonb,              -- [string, ...] preguntas sugeridas activas
  updated_at      timestamptz
);
```

TTL: 30 min (`AGENT.limits.sessionTtlMinutes`). Sesión expirada → vuelve a default (`PE`, todo null).

---

## Deduplicación (tabla `webhook_dedup`)

Kapso/Meta pueden reentregar el mismo webhook (at-least-once delivery). El `msg.id` es estable por mensaje original.

```sql
CREATE TABLE webhook_dedup (
  msg_id     text PRIMARY KEY,
  created_at timestamptz DEFAULT NOW()
);
```

`INSERT ... ON CONFLICT DO NOTHING RETURNING msg_id`: si retorna fila → primera vez (proceder); si retorna vacío → duplicado (skip).

El INSERT corre dentro de `waitUntil` para no bloquear el 200 (ahorra ~500ms cold).

---

## Configuración Kapso (cliente)

```ts
new WhatsAppClient({
  baseUrl: "https://api.kapso.ai/meta/whatsapp",
  kapsoApiKey: process.env.KAPSO_API_KEY,
});
```

- Auth header: `X-API-Key: <KAPSO_API_KEY>` (NO Bearer).
- Métodos usados: `sendText`, `sendInteractiveButtons`, `sendInteractiveList`.
- Singleton lazy `_kapso` para reutilizar entre invocaciones (warm starts).

**Webhook config en Kapso:**
- URL: `https://transparentape.app/api/kapso/webhook`
- Verify token: valor de `KAPSO_WEBHOOK_SECRET`.
- Firma: `x-webhook-signature` (HMAC-SHA256 hex raw) o `x-hub-signature-256` (`sha256=hex`).

---

## Variables de entorno requeridas

| Variable | Uso |
|---|---|
| `KAPSO_API_KEY` | Auth con Kapso API (`X-API-Key`). |
| `KAPSO_WEBHOOK_SECRET` | Verificación HMAC del webhook entrante. |
| `KAPSO_PHONE_NUMBER_ID` | Fallback si el payload no incluye `phoneNumberId` (no debería). |
| `DATABASE_URL` | Postgres (Supabase pooler). |
| `GROQ_API_KEY` | LLM para `runChatPipeline` y `chatEngine`. |
| `AGENT_API_SECRET` | Bearer token para endpoints `/api/agent/*` (no webhook). |
| `NEXT_PUBLIC_BASE_URL` | Para OG tags y enlaces públicos. |

**Importante:** después de cambiar env vars en Vercel → **redeploy obligatorio** (Vercel no los hot-reloadea).

---

## Diagnóstico — logs (`agent_logs`)

Todos los logs van a la tabla `agent_logs(endpoint, params, n_resultados, latencia_ms, created_at)`.

| `endpoint` | Cuándo se loguea |
|---|---|
| `/api/kapso/webhook` | Procesamiento OK. `params` incluye `from`, `text`, `steps: {start, handle_done, send_done}` o `fast_path: "greeting"`. |
| `/api/kapso/webhook/sig_fail` | Firma HMAC inválida. `params: {sig_header, body_preview}`. |
| `/api/kapso/webhook/skipped` | Sin `msg.from` (status updates de Meta). |
| `/api/kapso/webhook/error` | Excepción no controlada en handler. `params` incluye `err`. |
| `/api/kapso/webhook/ayuda_failed` | Tanto `sendInteractiveButtons` como `sendText` fallback fallaron. `params` incluye `interactiveErr`, `fallbackErr`, `has_api_key`, `api_key_len`. |
| `/api/kapso/webhook/ayuda_fallback` | Interactive falló, pero fallback texto OK. |

Query útil para tail:

```sql
SELECT endpoint, params->>'text' AS msg, params->>'steps' AS steps, latencia_ms, created_at
FROM agent_logs
WHERE endpoint LIKE '/api/kapso%'
ORDER BY created_at DESC
LIMIT 20;
```

---

## Migraciones aplicadas

Bajo `supabase/migrations/`:

- `06_agent_sessions.sql` — tabla base de sesiones.
- `07_agent_sessions_history.sql` — columna `last_messages` JSONB.
- `08_webhook_dedup.sql` — tabla de idempotencia.
- `09_agent_sessions_location.sql` — columna `last_location` JSONB.
- `11_agent_sessions_suggestions.sql` — columna `last_suggestions` JSONB.

(La `10_infobras_schema.sql` no es del agente.)

---

## Optimizaciones aplicadas

| Cambio | Commit | Beneficio |
|---|---|---|
| `waitUntil` envuelve fire-and-forget | `76af16e` | Vercel ya no mata I/O al `return 200`. Antes: replies perdidos. |
| Custom HMAC verify (Meta + Kapso) | `76af16e` | SDK `verifySignature` solo aceptaba formato Meta. |
| Step logs (`start`, `handle_done`, `send_done`) | `76af16e` | Identificar dónde se gasta latencia. |
| `runChatPipeline` extraído a `core.ts` | `b06e7a8` | Web y WhatsApp comparten cerebro + guardrails. |
| `sendInteractiveList` para sugerencias | `b06e7a8` + `f424daf` | Reemplaza texto numerado con UI nativa Meta. |
| Sugerencias indexadas en session | `d20029d` | Usuario puede responder `"1"` `"2"` `"3"` sin retipear. |
| Fast-path saludo | `20ea997` | Salta `getSession` + `parseIntent` para `hola` → ~1s ahorrado. |
| Dedup INSERT en background | `20ea997` | ~500ms ahorrado en critical path. |
| Typing indicator + read receipt | (próximo commit) | `markRead({typingIndicator:{type:"text"}})` fire-and-forget al recibir. WhatsApp muestra ✓✓ azul + "escribiendo…" hasta 25s. Esconde latencia cold-start + LLM. |

---

## Pendientes / problemas conocidos

- **Restaurar 401 en `sig_fail`** una vez que la firma esté 100% validada en producción (actualmente retorna 200 para que Kapso no entre en backoff hostil).
- **Cold start Vercel** ~1-2s en hobby. Opciones: upgrade Pro, cron warm-keep cada 4 min, o aceptar.
- **Engine.ts legacy** — eliminar cuando `core.ts` tenga ≥ 1 semana sin issues en prod.
- **`webhook_dedup` housekeeping** — agregar índice o cron de limpieza si crece mucho (>1M rows).
- **No usa Kapso Workflows nativos** — todo el routing es código custom. Decisión consciente para mantener control + un solo lenguaje.

---

## Referencias rápidas

- Production URL: https://transparentape.app
- Webhook: https://transparentape.app/api/kapso/webhook
- Número WhatsApp: +1 201-899-2743 (`phone_number_id`: `1035188399688492`)
- Kapso project: `transparentape` (`922b7f6a-b20d-4ca5-a7e9-5fade4cdb8c2`)
- DB host: `aws-1-us-west-1.pooler.supabase.com`
- Vercel project: `transparentape` (cuenta `victorgalvez56s-projects`)
- Repo: https://github.com/victorgalvez56/sigue-el-billete
