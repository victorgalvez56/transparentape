# Agente Kapso — *Transparentape*

Bot de WhatsApp que permite consultar obras públicas de países latinoamericanos
(Perú, Chile, Colombia, México, Argentina, Brasil) usando lenguaje natural.

Vive en `web/lib/agent-kapso/` + `web/app/api/kapso/webhook/route.ts`.
La persistencia (sesión, dedup, logs) está en `agent_sessions`, `webhook_dedup`
y `agent_logs` de Supabase.

---

## Tabla de contenidos

- [Visión general](#visión-general)
- [Flujo de un mensaje](#flujo-de-un-mensaje)
- [Sistema de intents](#sistema-de-intents)
- [Motor LLM (3 pasos)](#motor-llm-3-pasos)
- [Sesión y contexto](#sesión-y-contexto)
- [Concurrencia y mensajes paralelos](#concurrencia-y-mensajes-paralelos)
- [Seguridad](#seguridad)
- [Base de datos](#base-de-datos)
- [Configuración](#configuración)
- [Operaciones](#operaciones)
- [Testing](#testing)
- [Pendientes / mejoras futuras](#pendientes--mejoras-futuras)

---

## Visión general

```
┌──────────────┐   webhook    ┌──────────────────┐
│   WhatsApp   │ ───────────▶ │  /api/kapso/     │
│   (usuario)  │              │     webhook      │
└──────────────┘              └────────┬─────────┘
       ▲                               │ 200 OK (inmediato)
       │                               ▼
       │              ┌─────────────────────────────┐
       │              │ 1. Verificar firma          │
       │              │ 2. Dedup (webhook_dedup)    │
       │              │ 3. parseIntent              │
       │              └──────────────┬──────────────┘
       │                             │
       │           ┌─────────────────┴─────────────┐
       │           │                                │
       │   ┌───────▼──────────┐         ┌──────────▼─────────┐
       │   │ Intent           │         │ PREGUNTA_LIBRE     │
       │   │ determinístico   │         │ → chatEngine (LLM) │
       │   │ (queries.ts +    │         │  - router          │
       │   │  wa-format.ts)   │         │  - SQL gen + exec  │
       │   └───────┬──────────┘         │  - synthesis       │
       │           │                    └──────────┬─────────┘
       │           └────────────┬──────────────────┘
       │                        │
       │                ┌───────▼────────┐
       └────────────────│ kapso.sendText │
                        └────────────────┘
```

**Filosofía**: cubrir el 90% de consultas con regex deterministas (rápido,
barato, predecible) y delegar al LLM solo lo que no encaja en ningún patrón
conocido.

---

## Flujo de un mensaje

`web/app/api/kapso/webhook/route.ts`

1. **POST llega con `rawBody`**.
2. **`checkSignature(rawBody, req)`** verifica `x-hub-signature-256` con
   `KAPSO_WEBHOOK_SECRET`. Falla → `401`.
3. **`normalizeWebhook(payload)`** del SDK de Kapso parsea Meta/Kapso variants.
4. **Validación de `from`** (regex E.164: `/^\+?\d{7,15}$/`) y de `phoneNumberId`.
5. **Dedup** — `INSERT ... ON CONFLICT DO NOTHING RETURNING msg_id` contra
   `webhook_dedup`. Si vuelve vacío, es retry de Kapso → devolvemos `{ dup: true }`.
6. **Tipo de mensaje**:
   - `location` → guarda `lastLocation` en sesión y dispara `BUSCAR_CERCANOS`.
   - `text` → texto crudo del usuario.
   - `interactive` (botón pulsado) → mapea `btn_*` a texto vía `BUTTON_MAP`.
   - `image/audio/video/...` → responde "solo proceso texto" y termina.
7. **Respuesta 200 inmediata** + procesamiento **fire-and-forget** dentro
   de un `(async () => { ... })()`. Esto evita reintentos por timeout de Kapso.
8. **`handleMessage(text, from, phoneNumberId, to)`** llama a `parseIntent` y
   despacha al handler correspondiente.
9. **`kapso.messages.sendText`** envía la respuesta (truncada a
   `AGENT.limits.waMaxChars`).
10. **`appendHistoryAtomic`** persiste el par (user, assistant) en
    `agent_sessions.last_messages` con un UPSERT atómico.
11. **`agent_logs`** registra `{ from: redactPhone(...), text_len }`, latencia
    y `n_resultados`.

---

## Sistema de intents

`web/lib/agent-kapso/intent.ts`

`parseIntent(text, sessionCountry) → ParsedIntent` extrae el intent
**determinísticamente** mediante regex priorizadas, en este orden:

| Prioridad | Intent                     | Trigger                                         |
| --------- | -------------------------- | ----------------------------------------------- |
| 1         | `CAMBIAR_PAIS`             | "cambiar país" / mención de país en ≤3 palabras |
| 2         | `AGRADECIMIENTO`           | "gracias", "ok", "perfecto", "👍"               |
| 3         | `AYUDA`                    | "hola", "ayuda", "menú", "qué puedes hacer"     |
| 4         | `BUSCAR_CERCANOS`          | "cerca", "próximo", "mi ubicación"              |
| 5         | `CONTEXTO_DETALLE`         | "el primero", "el segundo", "más detalle"       |
| 6         | `VER_DETALLE`              | "detalle #42", "obra 99"                        |
| 7         | `INVESTIGAR_CONTRATISTA`   | RUC numérico + "contratista/empresa" o          |
|           |                            | "investigar [nombre]"                            |
| 8         | `INHABILITADOS`            | "inhabilitados", "sancionados"                  |
| 9         | `ADJUDICACION_DIRECTA`     | "adjudicación directa", "contrato directo"      |
| 10        | `RANKING_ENTIDADES`        | "ranking entidades", "mayores compradores"      |
| 11        | `RANKING_CONTRATISTAS`     | "ranking", "top contratistas"                   |
| 12        | `MONTO_EN_RIESGO`          | "monto en riesgo", "dinero en riesgo"           |
| 13        | `STATS`                    | "estadísticas", "resumen", "cuántas obras"      |
| 14        | `BUSCAR_OBRAS`             | "obras/proyectos/licitaciones" o un año (`20XX`) |
| 15        | `PREGUNTA_LIBRE`           | nada de lo anterior → cae al motor LLM           |

Para `BUSCAR_OBRAS`, `buildSearchQuery` también extrae el texto libre
(después de quitar stopwords y números de año) y lo deja en `filters.q`,
que `buscarObras` aplica con `ILIKE` sobre `buyer_region`, `buyer_locality`
y `supplier_name`.

**Detección de país**: `detectCountry(text)` cubre PE/CL/CO/MX/AR/BR.
Si se detecta un país nuevo, sobreescribe `session.country`.

**Detección de año**: `\b20\d{2}\b`, "este año", "año pasado/anterior".

---

## Motor LLM (3 pasos)

`web/lib/agent-kapso/engine.ts` — usado solo cuando `parseIntent` devuelve
`PREGUNTA_LIBRE`.

```
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────┐
│ usuario  │───▶│ STEP 1       │    │ STEP 2a      │    │ STEP 3     │
│ + hist.  │    │ Router       │───▶│ Generador    │───▶│ Synthesis  │
└──────────┘    │ ¿qué hacer?  │ │  │ SQL          │    │ → texto WA │
                │              │ │  └──────┬───────┘    └────────────┘
                │ • CTXT       │ │         │
                │ • SQL        │ │  ┌──────▼───────┐
                │ • CLARIFY    │ │  │ isValidSelect│ ◀── whitelist tablas
                └──────────────┘ │  │ Query()      │     (obras, red_flags)
                                 │  └──────┬───────┘
                                 │         │ exec
                                 │         ▼
                                 │   ┌──────────┐
                                 │   │ Postgres │
                                 │   └────┬─────┘
                                 │        │
                                 ▼        ▼
                         ┌──────────────┐
                         │ STEP 2b      │
                         │ Answer from  │ ← solo si intent=ANSWER_FROM_CONTEXT
                         │ context      │
                         └──────────────┘
```

### Step 1 — Router

Modelo: `llama-3.1-8b-instant` (rápido). Decide entre tres intents:

- `ANSWER_FROM_CONTEXT` — la respuesta está en el historial ("¿cuál era el
  monto del primero?").
- `NEEDS_SQL` — hay que consultar la base ("obras nuevas en Lima").
- `NEEDS_CLARIFICATION` — el mensaje es ambiguo. Genera 3 sugerencias.

Si el router falla o se cuelga, defaultea a `NEEDS_SQL`.

### Step 2a — Generador SQL

Modelo: `llama-3.3-70b-versatile` (preciso). Recibe el esquema de la tabla
`obras` y las últimas `sqlContextWindow=4` mensajes. Devuelve SQL crudo.

Antes de ejecutar pasa por **`isValidSelectQuery`**:

- Debe empezar por `SELECT`.
- Prohibido `;`, `--`, `/* */`.
- Prohibidos keywords destructivos (`INSERT`, `UPDATE`, `DELETE`, `DROP`,
  `ALTER`, `TRUNCATE`, `EXEC`, etc.) y funciones peligrosas (`PG_SLEEP`,
  `PG_READ_FILE`, `LO_IMPORT`).
- Cada referencia `FROM <tabla>` y `JOIN <tabla>` debe estar en la
  whitelist: solo `obras` y `red_flags`. Esto **bloquea** que el LLM lea
  `agent_sessions`, `agent_logs`, `webhook_dedup`, `pg_catalog.*`, etc.,
  aunque un prompt injection lo intente.

### Step 2b — Answer from context

Modelo: `llama-3.1-8b-instant`. Responde basándose solo en el historial,
sin tocar la base.

### Step 3 — Synthesis

Toma los resultados del paso 2a en JSON y los convierte a formato WhatsApp
(viñetas, *negritas*, emojis, `S/ 15M`). Truncado a 800 caracteres.

### Timeouts

Suma del peor caso (router + sql + synthesis) **debe** estar por debajo de
los 30s de `maxDuration` de la función Vercel. Actualmente: 5 + 10 + 8 = 23s.

---

## Sesión y contexto

`web/lib/agent-kapso/session.ts` + tabla `agent_sessions`.

### Estructura

| Campo             | Tipo               | Uso                                          |
| ----------------- | ------------------ | -------------------------------------------- |
| `conversation_id` | `TEXT PRIMARY KEY` | número de teléfono completo                  |
| `country`         | `TEXT`             | país activo para filtros (`PE`, `CL`, ...)   |
| `last_query`      | `TEXT`             | último texto del usuario                     |
| `last_result_ids` | `INTEGER[]`        | IDs de obras mostradas → resuelve ordinales  |
| `last_messages`   | `JSONB`            | últimos `historyPairs*2` pares user/asst     |
| `last_location`   | `JSONB`            | `{ lat, lng }` para `BUSCAR_CERCANOS`        |
| `updated_at`      | `TIMESTAMPTZ`      | usado como TTL filter                        |

### TTL

Configurable en `AGENT.limits.sessionTtlMinutes`. Actualmente **24 horas**.
La expiración es lazy: el `SELECT` filtra por `updated_at > NOW() - ($N * INTERVAL '1 minute')`.
La fila vieja queda en la tabla hasta que se sobreescriba o se limpie a mano
(no hay `pg_cron` configurado).

### Operaciones

```ts
// Lee la sesión (o devuelve default { country: "PE" })
getSession(conversationId: string): Promise<Session>

// UPSERT atómico con COALESCE por columna: campos no incluidos en el patch
// conservan su valor existente. Sin ventana de read-modify-write.
updateSession(conversationId: string, patch: Partial<Session>): Promise<void>

// Append + slice atómico de last_messages, todo en SQL.
appendHistoryAtomic(conversationId, userMsg, assistantMsg): Promise<void>

// (Legacy, conservado por compatibilidad con tests)
appendToHistory(existing, userMsg, assistantMsg): ChatMsg[]
```

### ¿Por qué el `appendHistoryAtomic`?

El patrón anterior (read → append en JS → write) tenía dos races:

1. **Entre campos distintos** — dos handlers concurrentes leen la misma fila,
   uno guarda `lastLocation`, otro guarda `lastQuery`, el segundo escribe sin
   el `lastLocation` del primero. **Resuelto** por el COALESCE-upsert.
2. **En el mismo campo `last_messages`** — los dos handlers leen la misma
   historia, ambos hacen append + slice, el segundo escribe y pierde el par
   del primero. **Resuelto** por `appendHistoryAtomic`, que hace
   `COALESCE(last_messages, '[]'::jsonb) || EXCLUDED.last_messages` dentro
   del SQL y luego slice por ordinal.

---

## Concurrencia y mensajes paralelos

### Fuentes de paralelismo

- **Mismo usuario, dos webhooks casi simultáneos** — usuario manda texto y
  comparte ubicación seguidos.
- **Kapso reintenta por timeout** — el mismo mensaje llega dos veces.
- **Muchos usuarios distintos** — paralelismo natural, no compiten.

### Cómo se manejan

| Riesgo                                  | Mitigación                                  |
| --------------------------------------- | ------------------------------------------- |
| Mismo mensaje procesado dos veces       | `webhook_dedup` con PK por `msg_id`         |
| Dos patches al mismo `conversation_id`  | `updateSession` con COALESCE-upsert atómico |
| Dos appends concurrentes al historial   | `appendHistoryAtomic` (append en SQL)       |
| Función Vercel se cancela a los 30s     | Timeouts LLM sumados ≤ 23s                  |
| BD se cae durante un mensaje            | Fire-and-forget + try/catch + logs          |
| Respuesta tarda > 30s y Kapso reintenta | 200 inmediato + dedup ya logueó el msg_id   |

### Lo que NO se resuelve

- **Orden de mensajes**: si llegan A y B nano-segundos aparte y B termina
  antes que A, el historial puede quedar `[..., B-user, B-asst, A-user, A-asst]`.
  WhatsApp serializa razonablemente bien a nivel de usuario, así que en la
  práctica es raro. No se intenta corregir.
- **Lock por usuario para serializar**: descartado. Implicaría mantener una
  conexión Postgres tomada con `SELECT ... FOR UPDATE` durante hasta 23s
  (las 3 llamadas a Groq), demasiado costoso.

---

## Seguridad

### Verificación de firma

`checkSignature(rawBody, req)` exige `KAPSO_WEBHOOK_SECRET` configurado.
Si falta o si la firma no coincide → `401 invalid signature`. El endpoint
GET (Meta challenge) también exige el secret y el `hub.verify_token`.

### Whitelist de tablas en SQL del agente

Aunque el motor solo acepta `SELECT`, sin esto un prompt injection podría
hacer que el LLM lea `agent_sessions` (PII), `agent_logs` (teléfonos) o
`pg_catalog.*` (enumeración de esquema). La whitelist limita los `FROM`/`JOIN`
a `obras` y `red_flags`.

### Redacción de PII en logs

`agent_logs` no tiene RLS (la migración 04 lo deshabilitó para la demo).
Por eso `redactPhone(from)` reemplaza el teléfono crudo por
`<hash8>…<last4>`. El hash usa SHA-256 con `KAPSO_WEBHOOK_SECRET` como salt,
así que requiere el secret para invertirlo dentro de un set acotado.

### Validación de entrada

- `from` debe matchear `/^\+?\d{7,15}$/` antes de cualquier operación.
- `phoneNumberId` debe estar presente (payload o env).
- `text` se limita a `maxInputChars=600` en `chatEngine`.

---

## Base de datos

Tablas usadas por el agente. Todas viven en Supabase Postgres.

### `agent_sessions` (migraciones 06, 07, 09)

```sql
CREATE TABLE agent_sessions (
  conversation_id  TEXT PRIMARY KEY,
  country          TEXT NOT NULL DEFAULT 'PE',
  last_query       TEXT,
  last_result_ids  INTEGER[],
  last_messages    JSONB,    -- migración 07
  last_location    JSONB,    -- migración 09
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_sessions_updated ON agent_sessions (updated_at);
```

### `agent_logs` (migración 03)

```sql
CREATE TABLE agent_logs (
  id            SERIAL PRIMARY KEY,
  endpoint      TEXT NOT NULL,
  params        TEXT,            -- JSON con datos redactados
  n_resultados  INT,
  latencia_ms   INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Endpoints que se loguean:
- `/api/kapso/webhook` — mensaje procesado OK.
- `/api/kapso/webhook/sig_fail` — firma rechazada.
- `/api/kapso/webhook/skipped` — payload sin mensaje válido.

### `webhook_dedup` (migración 08)

```sql
CREATE TABLE webhook_dedup (
  msg_id      TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_webhook_dedup_created ON webhook_dedup (created_at);
```

Sin job de limpieza automático todavía — crece para siempre. TODO: agregar
`pg_cron` para `DELETE WHERE created_at < NOW() - INTERVAL '24h'`.

---

## Configuración

`web/lib/agent-kapso/config.ts`

```ts
AGENT = {
  models: {
    fast:     "llama-3.1-8b-instant",      // router, context, synthesis
    powerful: "llama-3.3-70b-versatile",   // generación SQL
  },
  temperature: {
    router: 0, context: 0, sql: 0, synthesis: 0,   // todo determinista
  },
  maxTokens: {
    router: 150, context: 400, sql: 350, synthesis: 500,
  },
  timeoutMs: {
    router: 5_000, context: 10_000, sql: 10_000, synthesis: 8_000,
  },
  limits: {
    maxInputChars:    600,    // rechazar mensajes más largos
    maxDbResults:     10,     // filas que ven el synthesis
    sqlContextWindow: 4,      // últimos N msgs al SQL gen
    historyPairs:     5,      // 5 pares = 10 mensajes en sesión
    sessionTtlMinutes: 1440,  // 24h
    waMaxChars:       4096,   // cap WhatsApp
  },
}
```

---

## Operaciones

### Variables de entorno requeridas

| Variable                  | Para qué                                                      |
| ------------------------- | ------------------------------------------------------------- |
| `KAPSO_API_KEY`           | Auth contra `api.kapso.ai/meta/whatsapp` (`sendText`, etc.)   |
| `KAPSO_WEBHOOK_SECRET`    | Verificación HMAC SHA-256 de `x-hub-signature-256` + salt PII |
| `KAPSO_PHONE_NUMBER_ID`   | Fallback si el payload no incluye `phoneNumberId`             |
| `GROQ_API_KEY`            | Auth contra Groq para los 3 modelos LLM                        |
| `DATABASE_URL`            | Connection string a Supabase Postgres                          |

### Endpoints

- `GET  /api/kapso/webhook` — verificación de challenge de Meta.
- `POST /api/kapso/webhook` — recepción de mensajes (`runtime: "nodejs"`,
  `maxDuration: 30`).

### Migraciones a aplicar (en orden)

```
supabase/migrations/03_agent_logs.sql
supabase/migrations/04_disable_rls.sql           (intencional: demo)
supabase/migrations/05_agent_indexes.sql
supabase/migrations/06_agent_sessions.sql
supabase/migrations/07_agent_sessions_history.sql
supabase/migrations/08_webhook_dedup.sql
supabase/migrations/09_agent_sessions_location.sql
```

### Dependencias npm relevantes

```
@kapso/whatsapp-cloud-api  — cliente WhatsApp + verifySignature + normalizeWebhook
groq-sdk                   — cliente Groq LLM
pg                         — conexión Postgres
next                       — runtime de la ruta API
```

---

## Testing

### `test-agent.ts` — tests de integración manuales

```bash
cd web
npx tsx --tsconfig tsconfig.json lib/agent-kapso/test-agent.ts
```

Tres capas:

- **L1**: `parseIntent` puro (sin I/O) — todos los regex de intent, países,
  filtros, `cleanTitle`.
- **L2**: queries reales contra Supabase — `statsPorPais`, `buscarObras`,
  `rankingContratistas`, `inhabilitadosVigentes`.
- **L3**: `chatEngine` completo (Groq + DB) — incluye un intento de
  SQL injection (`obras en Lima; DROP TABLE obras; --`) que debe ser
  rechazado.

### `load-test.ts` — prueba de concurrencia

```bash
cd web
npx tsx lib/agent-kapso/load-test.ts http://localhost:3000 10
```

Lanza 10 mensajes simultáneos firmados correctamente contra el webhook
local y reporta latencias p50/p95/max. Lee `KAPSO_WEBHOOK_SECRET` y
`DATABASE_URL` del entorno.

> ⚠️ Estos scripts viven dentro de `lib/agent-kapso/` porque comparten tipos
> con el agente. No los importa nadie en runtime; Next.js no los empaca.
> Moverlos a `web/scripts/` queda como mejora.

---

## Pendientes / mejoras futuras

| Prioridad | Tarea                                                      |
| --------- | ---------------------------------------------------------- |
| Media     | `pg_cron` para purgar `webhook_dedup` cada 24h             |
| Media     | Rate-limit por `conversation_id` (ej: 10 msgs/min)         |
| Baja      | Mover `test-agent.ts` y `load-test.ts` a `web/scripts/`    |
| Baja      | Estrechar `type Country` para sacar `| string`             |
| Baja      | Sumarización rolling cuando la historia llega a 5 pares    |
| Baja      | Tabla `user_profile` con país preferido / región habitual  |
| Futuro    | Re-habilitar RLS con policies cuando se salga de la demo   |
