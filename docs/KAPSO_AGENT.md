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
- [Modelo de memoria y contexto](#modelo-de-memoria-y-contexto)
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
8. **Carga paralela** de sesión y perfil:
   `const [session, profile] = await Promise.all([getSession(from), getProfile(from)])`.
9. **`handleMessage(text, from, phoneNumberId, to, session, profile)`** llama
   a `parseIntent` y despacha al handler correspondiente.
   - Resolución de país: explícito en mensaje → sesión → perfil → `"PE"`.
   - BUSCAR_OBRAS usa `effectiveSearchFilters` (filtros acumulados de turnos
     previos).
   - Saludo personalizado por nombre si es la primera respuesta tras un gap
     de sesión.
10. **`kapso.messages.sendText`** envía la respuesta (truncada a
    `AGENT.limits.waMaxChars`).
11. **`appendHistoryAtomic`** persiste el par (user, assistant) en
    `agent_sessions.last_messages` con un UPSERT atómico.
12. **`propagateContext`** (fire-and-forget, post-respuesta):
    - Mergea filtros activos (o los limpia si fue topic break).
    - Extrae y acumula entidades mencionadas.
    - Bumpea contadores en `user_profile` (intent, country, region).
    - Si `shouldResummarize(session)` → llama a Groq y guarda
      `session_summary` nuevo.
13. **`agent_logs`** registra `{ from: redactPhone(...), text_len }`, latencia
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

## Modelo de memoria y contexto

El agente opera con **cuatro capas de memoria** apiladas. Cada capa es
ortogonal a las demás y se consulta solo si la anterior no alcanza.

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SESIÓN VIVA — agent_sessions, TTL 24h                    │
│    last_messages, last_result_ids, last_location,            │
│    active_filters (acumulativos), mentioned_entities,        │
│    session_summary, summary_msg_count                        │
├─────────────────────────────────────────────────────────────┤
│ 2. PERFIL PERSISTENTE — user_profile, sin TTL                │
│    display_name, default_country, default_region,            │
│    language, total_queries, common_topics (counter JSONB)    │
├─────────────────────────────────────────────────────────────┤
│ 3. RESUMEN ROLLING — session_summary (Groq, 2-3 frases)      │
│    Se regenera cada N pares nuevos; el resumen previo se     │
│    realimenta para mantener la cadena.                       │
├─────────────────────────────────────────────────────────────┤
│ 4. (opcional) MEMORIA SEMÁNTICA — pgvector                   │
│    No implementada todavía. Hook listo en buildUserContext.  │
└─────────────────────────────────────────────────────────────┘
```

### Capa 1 — Sesión viva (`agent_sessions`)

| Campo                 | Tipo               | Uso                                                    |
| --------------------- | ------------------ | ------------------------------------------------------ |
| `conversation_id`     | `TEXT PK`          | número de teléfono                                     |
| `country`             | `TEXT`             | país activo                                            |
| `last_query`          | `TEXT`             | último texto del usuario                               |
| `last_result_ids`     | `INTEGER[]`        | IDs de la última lista → resuelve "el primero"         |
| `last_messages`       | `JSONB`            | últimos `historyPairs*2` pares user/asst               |
| `last_location`       | `JSONB`            | `{ lat, lng }` compartida vía WhatsApp                 |
| `active_filters`      | `JSONB`            | filtros acumulados de búsqueda (q, year, red_flag, …)  |
| `mentioned_entities`  | `JSONB`            | `{ regions, rucs, companies, years }` deduped, cap 10  |
| `session_summary`     | `TEXT`             | resumen rolling de la conversación                     |
| `summary_msg_count`   | `INT`              | nº de mensajes ya incluidos en `session_summary`       |
| `updated_at`          | `TIMESTAMPTZ`      | TTL filter (24h)                                       |

#### Filtros acumulados

El gran cambio: cuando el usuario hace una búsqueda y luego la refina, los
filtros se acumulan en `active_filters` en lugar de empezar de cero.

```
usuario: "obras en Lima"           → active_filters = { q: "lima" }
usuario: "ahora 2024"              → active_filters = { q: "lima", year: 2024 }
usuario: "con alerta"              → active_filters = { q: "lima", year: 2024, red_flag: true }
usuario: "ahora Piura"             → active_filters = { q: "piura", year: 2024, red_flag: true }
usuario: "estadísticas Perú" (STATS) → active_filters = NULL (topic break)
```

`mergeFilters(active, parsed, intent)` en `context.ts` codifica las reglas:
- Intents de búsqueda (BUSCAR_OBRAS, BUSCAR_CERCANOS, VER_DETALLE,
  CONTEXTO_DETALLE) acumulan.
- Topic-break intents (STATS, RANKING_*, AYUDA, INVESTIGAR_*, etc.) limpian.

#### Entidades mencionadas

`mentioned_entities` lleva un registro running de qué regiones / RUCs /
empresas / años se han mencionado en la sesión, deduped case-insensitive y
cap a 10 por bucket. Se inyecta en el prompt de cada llamada al LLM bajo
"Mencionado en este chat — regiones: …; empresas: …".

### Capa 2 — Perfil persistente (`user_profile`)

| Campo            | Tipo          | Uso                                              |
| ---------------- | ------------- | ------------------------------------------------ |
| `phone`          | `TEXT PK`     | número de teléfono (consistente con sesión)      |
| `display_name`   | `TEXT`        | nombre de WhatsApp (si Kapso lo expone)          |
| `default_country`| `TEXT`        | país preferido — se autorellena con el primer uso |
| `default_region` | `TEXT`        | región habitual — derivada de `common_topics`    |
| `language`       | `TEXT`        | `es` por default                                 |
| `total_queries`  | `INT`         | contador para "usuario recurrente"               |
| `common_topics`  | `JSONB`       | counter map `{ "BUSCAR_OBRAS": 12, "region:piura": 8, ... }` |
| `first_seen`     | `TIMESTAMPTZ` | primera interacción                              |
| `last_seen`      | `TIMESTAMPTZ` | última interacción                               |

Sin TTL — sobrevive cuando la sesión expira. Un ciudadano que vuelve a las
2 semanas conserva su nombre, país y región habitual.

`bumpProfile(phone, topicDelta, opts)` mergea el counter map atómicamente
en SQL (sin race) y autorellena `display_name` / `default_country` la
primera vez.

### Capa 3 — Resumen rolling (`session_summary`)

`shouldResummarize(session)` devuelve `true` cuando hay `historyPairs`
pares nuevos que no entraron al resumen anterior. Entonces
`summarizeHistory(history, previousSummary)` llama a `llama-3.1-8b-instant`
con un prompt que pide UNA frase (≤200 chars) y guarda el resultado.

El resumen previo se realimenta como `(resumen previo) …` para mantener la
cadena: el modelo no parte de cero, va comprimiendo iterativamente.

Se ejecuta **después** de mandar la respuesta al usuario (fire-and-forget
en `propagateContext`). No afecta la latencia.

### Inyección en los prompts

`buildUserContext(profile, session)` arma un bloque < 600 chars que se
prepende a los **cuatro** system prompts del motor LLM (router, context,
sql, synthesis). Ejemplo de salida:

```
CONTEXTO DEL USUARIO:
Usuario — nombre: Victor, región habitual: Cusco, usuario recurrente (7 consultas).
Resumen previo: Usuario consulta obras en Cusco con alertas.
Mencionado en este chat — regiones: cusco; empresas: Odebrecht; años: 2024.
Filtros activos: zona=cusco, año=2024, con alerta.
```

Empty string cuando no hay nada que decir (usuario nuevo, sesión vacía).

### Operaciones en `session.ts`

```ts
// Sesión
getSession(conversationId): Promise<Session>
updateSession(conversationId, patch): Promise<void>       // COALESCE upsert atómico
appendHistoryAtomic(conversationId, userMsg, asstMsg)     // append + slice en SQL
clearActiveFilters(conversationId)                        // pivot de tema, NO toca entidades
resetSessionContext(conversationId)                       // full reset

// Perfil
getProfile(phone): Promise<UserProfile | null>
bumpProfile(phone, topicDelta, opts)                      // merge atómico de contadores
setProfileDefaults(phone, patch)                          // setea defaultCountry/Region/language
```

### Race conditions resueltas

1. **Patches concurrentes a distintos campos** — handler A escribe
   `lastLocation`, handler B escribe `lastQuery`. **Resuelto** por
   `updateSession` con `COALESCE($N, agent_sessions.col)` por columna.
2. **Patches concurrentes al historial** — dos handlers leen la misma
   `last_messages`, ambos hacen append, el segundo pierde el par del
   primero. **Resuelto** por `appendHistoryAtomic` que hace el append +
   slice todo en SQL contra `EXCLUDED.last_messages`.
3. **Bumps concurrentes al counter map** — dos handlers incrementan
   `common_topics`. **Resuelto** por `bumpProfile` que hace
   `UNION ALL + GROUP BY + SUM` en una sola sentencia.

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

### `agent_sessions` (migraciones 06, 07, 09, 10)

```sql
CREATE TABLE agent_sessions (
  conversation_id     TEXT PRIMARY KEY,
  country             TEXT NOT NULL DEFAULT 'PE',
  last_query          TEXT,
  last_result_ids     INTEGER[],
  last_messages       JSONB,    -- migración 07
  last_location       JSONB,    -- migración 09
  active_filters      JSONB,    -- migración 10
  mentioned_entities  JSONB,    -- migración 10
  session_summary     TEXT,     -- migración 10
  summary_msg_count   INT NOT NULL DEFAULT 0,  -- migración 10
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_sessions_updated ON agent_sessions (updated_at);
```

### `user_profile` (migración 11)

```sql
CREATE TABLE user_profile (
  phone            TEXT PRIMARY KEY,
  display_name     TEXT,
  default_country  TEXT,
  default_region   TEXT,
  language         TEXT NOT NULL DEFAULT 'es',
  total_queries    INT  NOT NULL DEFAULT 0,
  common_topics    JSONB,
  first_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_profile_last_seen ON user_profile (last_seen DESC);
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
supabase/migrations/04_disable_rls.sql            (intencional: demo)
supabase/migrations/05_agent_indexes.sql
supabase/migrations/06_agent_sessions.sql
supabase/migrations/07_agent_sessions_history.sql
supabase/migrations/08_webhook_dedup.sql
supabase/migrations/09_agent_sessions_location.sql
supabase/migrations/10_agent_sessions_context.sql
supabase/migrations/11_user_profile.sql
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

**Cinco capas**, donde L1, L1+, L4 y L5 son puras (no requieren DB ni Groq):

| Capa  | Qué cubre                                                            | I/O |
| ----- | -------------------------------------------------------------------- | --- |
| L1    | `parseIntent` casos básicos (15 intents, países, años, filtros)      | ❌ |
| L1+   | Edge cases (mayúsculas, acentos, signos `¿¡`, ordinales bare `#1`)  | ❌ |
| L4    | Capa de contexto: `mergeFilters`, `extractTurnEntities`,             |     |
|       | `mergeEntities`, `buildUserContext`, `shouldResummarize`             | ❌ |
| L5    | Conversaciones simuladas — búsqueda cumulativa multi-turno,          |     |
|       | acumulación de entidades, usuario que vuelve con perfil              | ❌ |
| L2    | Queries reales contra Supabase                                       | ✅ DB |
| L3    | `chatEngine` end-to-end con Groq + DB (incluye SQL injection test)   | ✅ DB+LLM |

Sin `DATABASE_URL` ni `GROQ_API_KEY`, las capas puras (L1, L1+, L4, L5)
corren igual y reportan **123 assertions OK**. Las L2/L3 se saltan con un
error visible pero sin abortar la suite.

### Conversaciones de ejemplo cubiertas en L5

```
# Búsqueda cumulativa
"hola"                            → AYUDA
"obras en Lima"                   → filtros = { q: lima }
"ahora 2024"                      → filtros = { q: lima, year: 2024 }
"con alerta"                      → filtros = { q: lima, year: 2024, red_flag: true }
"el primero"                      → resuelve contra last_result_ids
"estadísticas Perú"               → topic break, filtros = NULL
"obras en Cusco 2023"             → filtros = { q: cusco, year: 2023 }

# Acumulación de entidades
"obras en Lima 2024"              → entities += { regions: [lima], years: [2024] }
"ahora Piura 2023"                → entities += { regions: [piura], years: [2023] }
"investigar Odebrecht"            → entities += { companies: [Odebrecht] }
"y el RUC 20123456789?"           → entities += { rucs: [20123456789] }

# Usuario que vuelve
Profile { name: María, region: Arequipa, totalQueries: 12 }
Session vacía (TTL expiró)
→ buildUserContext muestra "María", "Arequipa", "usuario recurrente"
```

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

## Cómo se ve el contexto en una conversación real

Supongamos una usuaria María, que ya consultó el bot 12 veces. Tercera vez
que entra hoy. Su perfil tiene `display_name=María`, `default_country=PE`,
`default_region=Arequipa`. La sesión está vacía (gap > 24h).

**Turno 1** — `"hola"`
```
parseIntent → AYUDA
buildUserContext (que se prepende al system prompt):
  CONTEXTO DEL USUARIO:
  Usuario — nombre: María, región habitual: Arequipa,
  usuario recurrente (12 consultas).
```
Respuesta: `"Hola María 👋\n\n[botones de ayuda]"`. propagateContext:
bumpea `total_queries=13`, common_topics["AYUDA"]+=1.

**Turno 2** — `"obras este año"`
```
parseIntent → BUSCAR_OBRAS, filters={year: 2026}
effectiveSearchFilters → { country: PE, year: 2026 }   # no q aún
buildUserContext incluye "región habitual: Arequipa"
```
El LLM lee el contexto y puede sugerir "¿obras en Arequipa este año?".
propagateContext: active_filters = { year: 2026 }.

**Turno 3** — `"con alerta en Arequipa"`
```
parseIntent → BUSCAR_OBRAS (alert modifier + obra-keyword implícito), 
              filters={ q: "arequipa", red_flag: true }
mergeFilters → active_filters = { q: arequipa, year: 2026, red_flag: true }
              # year heredado del turno anterior
```
Búsqueda con los 3 filtros combinados.

**Turno 4** — `"el primero"`
```
parseIntent → CONTEXTO_DETALLE, contextPosition=1
            → resuelve session.lastResultIds[0]
```
No toca filtros (sigue siendo intent de búsqueda).

**Turno 5** — `"investigar Odebrecht"`
```
parseIntent → INVESTIGAR_CONTRATISTA, contratista="Odebrecht"
mergeFilters → topic break → active_filters = NULL
mentioned_entities += { companies: [Odebrecht] }
```

Después del turno 5 (5 pares en historial), `shouldResummarize` dispara:
```
session_summary = "Usuaria María consultó obras en Arequipa 2026 con
alertas y luego pidió investigación sobre Odebrecht."
```

En el turno 6, ese resumen aparece en `buildUserContext` y el LLM ya no
necesita los 10 mensajes raw para entender el hilo.

---

## Pendientes / mejoras futuras

| Prioridad | Tarea                                                              |
| --------- | ------------------------------------------------------------------ |
| Media     | `pg_cron` para purgar `webhook_dedup` cada 24h                     |
| Media     | Rate-limit por `conversation_id` (ej: 10 msgs/min)                 |
| Media     | Derivar `default_region` automáticamente de `common_topics`        |
|           | cuando una región domine > 50% de las queries del usuario          |
| Baja      | Mover `test-agent.ts` y `load-test.ts` a `web/scripts/`            |
| Baja      | Estrechar `type Country` para sacar `\| string`                    |
| Baja      | Comando explícito "guarda Arequipa como mi región" → setProfileDefaults |
| Baja      | Detección de idioma (es/qu/en) y respuesta en el idioma detectado  |
| Baja      | Suscripciones temáticas + cron de notificaciones                   |
| Futuro    | Capa 4 — pgvector con embeddings de mensajes para recall semántico |
| Futuro    | Re-habilitar RLS con policies cuando se salga de la demo           |
