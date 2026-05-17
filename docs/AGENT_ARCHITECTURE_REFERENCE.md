# Arquitecturas de Agentes IA — Referencia para el Bot WhatsApp

Análisis sintético de patrones de arquitectura de agentes IA producción-grade en 2025-2026, curado como base de referencia para evolución de Transparentape (Spanish WhatsApp bot sobre Postgres + Groq).

> **Generado:** 2026-05-17 · vía investigación web (sources al final)

---

## 1. Patrones fundamentales de agentes

Consenso 2025-2026: elige el patrón más pequeño que cubra tus modos de falla. Escalar es más barato que sobre-arquitecturar.

| Patrón | Resumen 1-líneas | Cuándo encaja | Cuándo es overkill |
|---|---|---|---|
| **ReAct** (Reason+Act) | Loop Thought → Action → Observation, una herramienta por iter | Q&A sobre tools con profundidad acotada (Postgres, retrieval) | Si el intent es 1 de ~5 formas claras → router + handler es más rápido |
| **Plan-and-Execute** | Plan completo upfront, después ejecuta todo | Tareas long-horizon (comparar contratos X años) | Lookups single-shot |
| **Reflexion** | ReAct + self-critique loop al detectar fallos | SQL/code gen donde puedes verificar (run, error → retry) | Sin verificador barato disponible |
| **Orchestrator-Worker** | Orchestrator rutea a workers especializados y agrega | Queries mixtas (SQL + RAG + web) | Una sola tool primaria |
| **Supervisor-Worker (LangGraph)** | Orchestrator formal con checkpointing | Especialización jerárquica + state persistente Postgres | Equipo pequeño + dominio entendido |
| **Multi-agent handoff (Swarm-style)** | Agentes se transfieren control por tool calls | Workflows complejos multi-rol | Bot conversacional simple |
| **Tool-use loop (plain function-calling)** | LLM emite tool calls, ejecutas, loop hasta done | **80% de los "necesito un agente" caen aquí** | Tareas determinísticas sin LLM |

**Para Transparentape:** ReAct + tool-use loop es el stack producción single-agent. Reflexion específicamente alrededor de SQL gen (run → si error/0 rows → re-prompt con error). NO multi-agent aún.

Refs: [Redis agent patterns](https://redis.io/blog/ai-agent-architecture-patterns/) · [SitePoint 2026 design patterns](https://www.sitepoint.com/the-definitive-guide-to-agentic-design-patterns-in-2026/) · [LangGraph supervisor](https://github.com/langchain-ai/langgraph-supervisor-py) · [OpenAI Swarm](https://github.com/openai/swarm)

---

## 2. State management conversacional

WhatsApp = async, multi-turn, gaps de horas, multi-device. **Descarta state in-memory.** Necesitas storage durable, thread-keyed, desde día 1.

### Short-term (ventana de mensajes recientes)
- Storage Postgres keyed por `wa_id`. No overthink.
- Cap 10-20 turnos o ~4K tokens. Resumir más viejos.

### Long-term (preferencias, tópicos previos, entities)

| Solución | Pros | Cons |
|---|---|---|
| **Mem0** | 26% mejor que OpenAI Memory en LOCOMO. 91% menos latency. ~80% reducción tokens. | Dependencia externa |
| **LangGraph checkpoints** | Persiste StateGraph completo por `thread_id`. Postgres checkpointer maduro. Encaja con Supabase. | Acopla a LangGraph mental model |
| **OpenAI Assistants threads** | Threads simples | Black box, no migrables, lock-in |
| **BabyAGI** | Histórico | No es chat state, es task decomposition |

### Para WhatsApp específicamente

1. Tabla `conversations` keyed por `wa_id` con last-N messages + rolling summary.
2. Tabla `messages` con WhatsApp message ID como unique (idempotency).
3. Opcional: Mem0 o `user_facts` table (ej: "user de Arequipa, pregunta educación"). Solo si tienes bandwidth.

Refs: [Mem0 benchmark](https://mem0.ai/blog/benchmarked-openai-memory-vs-langmem-vs-memgpt-vs-mem0-for-long-term-memory-here-s-how-they-stacked-up) · [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence) · [Memory frameworks 2026 comparison](https://dev.to/anajuliabit/mem0-vs-zep-vs-langmem-vs-memoclaw-ai-agent-memory-comparison-2026-1l1k)

---

## 3. Arquitectura WhatsApp/messaging bots en producción

**Nadie serio es pure-LLM. Nadie serio es pure-intent. Todos son híbridos.**

| Producto | Arquitectura | Notas |
|---|---|---|
| **Botpress** | Visual flow builder (FSM) + LLM nodes en branches free-text | Flows = FSMs, LLM = fallback classifier + synthesis |
| **Rasa** | Pivot 2024-25: workflows estructurados + LLM para variación natural | Intent classification NO está muerto — se augmenta |
| **Wati / Yalo** | WhatsApp-native, heavy uso de Interactive Messages (buttons, list pickers) | Reducen ambigüedad usando UI nativa |
| **Twilio Studio** | FSM puro drag-and-drop | Bueno transaccional (OTPs), malo Q&A abierta |
| **ManyChat** | Marketing-flow FSM | Messenger-first, débil Q&A |

### Patrón 2025-2026: **two-tier intent recognition**
1. Keyword/regex routing barato para patrones comunes high-confidence (**Transparentape ya hace esto correctamente**).
2. LLM classification para queries ambiguas.

Transparentape ya reinventó la rueda de producción. La validación es: mantenerla.

Refs: [Botpress WhatsApp](https://botpress.com/integrations/whatsapp) · [Rasa LLM chatbot architecture](https://rasa.com/blog/llm-chatbot-architecture) · [Yalo guide](https://yalomedia.com/en/crm/whatsapp-ai-agent-guide/) · [Chatarchitect open-source NLP bots](https://www.chatarchitect.com/news/nlp-chatbot-for-whatsapp-open-source-examples-architecture-and-a-practical-starter-guide)

---

## 4. Patrones LLM-native específicos para chat

### Routing (modelo rápido barato → handler especializado)
- Groq Llama 3.1 8B (~750 t/s) para classification → router en JSON mode.
- Cost negligible.
- Llama 3.3 70B (~276 t/s, TTFT 0.3-1.0s) para gen pesada → 2-call pipeline bajo 2s mayor parte de queries.

### SQL-from-natural-language — non-negotiables

1. **Read-only en boundary DB.** Rol Postgres dedicado con `SELECT` solo sobre views whitelisted. `SET TRANSACTION READ ONLY` a nivel transacción. El LLM no puede saltar lo que el rol no puede.
2. **Single-statement SELECT-only** vía SQL parser (`pg_query_go`, `pglast`) antes de ejecutar. Rechaza multi-statement, anything que no sea SELECT.
3. **`LIMIT` mandatorio** inyectado si ausente.
4. **`statement_timeout`** a nivel conexión.
5. **Retry-on-error loop:** si SQL falla, feed error de vuelta al LLM, 1 retry. Reflexion aplicado estrecho.
6. **Audit log** cada SQL generado + row count + latency.

### RAG vs SQL tools
- **SQL gana** para queries estructuradas repetidas (contratos, montos, fechas, entities). Confiabilidad, interpretabilidad, seguridad.
- **RAG gana** para narrativa abierta ("explica por qué este contrato fue controversial").
- **2025 consensus: híbrido.** SQL para hechos, RAG para contexto (noticias, press releases).

### Citation / source attribution
- Citas fabricadas: 3-13% en producción.
- Mitigaciones:
  1. Generar prosa primero → adjuntar citas en pase de verificación separado que chequea cada claim contra IDs retrieved.
  2. Para SQL: SIEMPRE incluir row count, source table, `contrato_id` o canonical URL.
  3. **No dejar al synthesis paraphrasear números** — pasar verbatim, LLM solo escribe prosa alrededor.

### Hallucination mitigation en synthesis
- **Templated numerics:** synthesis recibe JSON de hechos + prompt "renderiza como prosa en español; NO inventes números, nombres, fechas". Post-hoc validar que cada número en output aparece en input JSON.
- **Verbal uncertainty calibration:** prompt al modelo a hedge ("según los datos disponibles…") cuando row counts bajos.

Refs: [Groq Llama 3.3 benchmark](https://groq.com/blog/new-ai-inference-speed-benchmark-for-llama-3-3-70b-powered-by-groq) · [Read-only enforcement](https://rietta.com/blog/ai-sql-database-data-protection-read-replica/) · [guardrails-ai/valid_sql](https://github.com/guardrails-ai/valid_sql) · [RAG vs SQL agent](https://medium.com/@generative_ai/database-query-rag-sql-generation-vs-a1d4f615064a) · [Hallucination survey](https://arxiv.org/abs/2510.24476)

---

## 5. Latency / async para chatbots serverless

### Webhook ACK-fast es mandatorio
- WhatsApp webhook timeout: 5-10s según BSP.
- Cualquier LLM call inline = retries + duplicate replies garantizados.

**Pattern:**
1. Verify signature
2. INSERT en queue / `inbound_messages` table
3. Return `200 OK` (target <100ms)
4. Procesar en background worker

### Background work options Vercel/Supabase

| Opción | Notas |
|---|---|
| **`waitUntil`** (Vercel) | Native, extiende función después de response. Capped a max_duration de función. Fine para reply en <60s. |
| **Inngest** | Event-driven, durable, retries built-in. ~$40/mo cubre la mayoría de startups. |
| **Trigger.dev** | OSS, long-running jobs, per-run pricing. Mejor cuando jobs individuales son pesados. |
| **Supabase pgmq + Edge Functions** | Si ya en Supabase: queue + worker Edge Function = path más barato. Edge cold start ~400ms (Deno). |

### Streaming?
- WhatsApp Cloud API **NO** soporta streaming tokens.
- Mitigaciones:
  1. **Typing indicators** — `mark_as_read` + typing indicator. Auto-dismiss después de 25s o on reply. **Fire immediately al recibir inbound.** ([Meta typing indicators](https://developers.facebook.com/documentation/business-messaging/whatsapp/typing-indicators/))
  2. **Split long answers** en 2-3 mensajes. Primero confirma comprensión ("Buscando contratos de X..."), segundo carga data. Perceived latency baja dramáticamente.

### Idempotency
- WhatsApp delivers at-least-once.
- WhatsApp message ID como unique en `inbound_messages`. INSERT conflict → ACK 200 + skip.
- Insert dedup record ANTES de side effects, misma transacción que queue enqueue.
- TTL debe exceder Meta retry window (~24h).

### Cold starts
- Vercel Fluid Compute elimina mayor parte para funciones activas.
- Para tráfico cívico-tech (spiky, low volume absoluto): `pg_cron` warm ping cada 4-5 min al webhook.
- Alt: mover worker a Supabase Edge Function long-running, o container Fly.io/Railway $5/mo (sub-100 msg/min: container > serverless).

Refs: [Chatarmin WhatsApp webhooks 2026](https://chatarmin.com/en/blog/whatsapp-webhooks) · [Inngest vs Trigger.dev](https://nextbuild.co/blog/background-jobs-vercel-inngest-trigger) · [Hookdeck idempotency](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency) · [Markaicode Supabase vs Vercel benchmarks](https://markaicode.com/supabase-vs-vercel-functions-performance-benchmarks/)

---

## 6. Observability + evals

### Log per request
- `wa_id`, `message_id`
- Intent decision (regex o LLM)
- Tools called
- SQL emitted + row count
- Tokens in/out por call
- Total wall-clock latency
- Final response

### Alertas
- p95 latency
- 5xx from Meta send API
- SQL error rate
- "I don't know" rate
- Fallback-to-LLM-router rate

### Tools 2026

| Tool | Notas |
|---|---|
| **Langfuse** | MIT-licensed, self-hostable, acquired by ClickHouse Jan 2026. No feature gates. **Mejor balance cost/control para civic-tech.** |
| **Helicone** | 1-line integration (swap base URL). 100k req/mo free. 50-80ms overhead. Fastest time-to-data. |
| **LangSmith** | Solo vale si committed a LangGraph |
| **Arize Phoenix** | OSS, strong en evals, integración más pesada |

### Offline evals
- Set fijo ~50-100 queries español con SQL esperado o facts esperados
- Run nightly
- Track regression en:
  1. Routing accuracy
  2. SQL validity
  3. Numeric faithfulness (cada número en response aparece en SQL result?)

Refs: [Firecrawl observability 2026](https://www.firecrawl.dev/blog/best-llm-observability-tools) · [Helicone guide](https://www.helicone.ai/blog/the-complete-guide-to-LLM-observability-platforms) · [Arize evaluation platforms](https://arize.com/llm-evaluation-platforms-top-frameworks/)

---

## 7. Reference projects GitHub

| Repo | Por qué mirarlo |
|---|---|
| [daveebbelaar/python-whatsapp-bot](https://github.com/daveebbelaar/python-whatsapp-bot) | Baseline más limpio: webhook → AI → reply. **Leer primero.** |
| [wassengerhq/whatsapp-chatgpt-bot-python](https://github.com/wassengerhq/whatsapp-chatgpt-bot-python) | Layout modular (clients, core, http, storage, utils), audio+image input, RAG + MCP tools. Mejor ejemplo de arquitectura por capas. |
| [EvolutionAPI/evolution-api](https://github.com/EvolutionAPI/evolution-api) | Multi-provider event-driven WhatsApp gateway usado por muchos bots LatAm prod. Integra Chatwoot, Typebot, n8n, Flowise. Decomposición event-driven worth reading. |
| [chatwoot/chatwoot](https://github.com/chatwoot/chatwoot) | Omni-channel customer support. **Mejor tratamiento OSS de multi-turn WhatsApp threads + agent-handoff + conversation-state model.** |
| [langchain-ai/langgraph-supervisor-py](https://github.com/langchain-ai/langgraph-supervisor-py) | Aunque no adoptes LangGraph, código de supervisor pattern = referencia canónica para hierarchical orchestration con Postgres checkpoints. |

---

## 8. Recomendación bottom-line para Transparentape

> **Converger en hybrid two-tier router + tool-use loop, hand-rolled, sobre Supabase + Vercel + Groq. NO adoptar framework aún.**

### Reasoning

1. **Tier regex ya existe y funciona.** No tirar — gratis, determinístico, sub-ms, cubre common cases. Lo que Botpress/Rasa/Wati hacen internamente. **Keep as Tier 1.**

2. **Tier 2: Groq Llama 3.1 8B como fast intent router** (~750 t/s, sub-second). Decide entre: `sql_query`, `definition`, `out_of_scope`, `chitchat`. JSON-mode output. Cost negligible.

3. **Tier 3: Tool-use loop con Groq Llama 3.3 70B** + 2 tools: `run_sql(query)` y `lookup_definition(term)`. Reflexion narrow: si SQL falla o 0 rows → retry 1 vez con error en context. Reemplaza pipeline lineal actual `SQL gen → synthesis` con algo que recupera de sus propios errores.

4. **State: Postgres tables, no framework.** `conversations` keyed por `wa_id` con last 10 turns + rolling summary cada 5 turns. Skip Mem0 v1. Agregar v2 si users se quejan. LangGraph checkpoints overkill para chat linear.

5. **Async: webhook → Supabase queue (`pgmq`) → Edge Function worker.** ACK 200 <100ms. Fire `mark_as_read` + typing immediately. Primera reply ("Buscando…") en <1s. Final en 3-5s. WhatsApp message ID como idempotency unique.

6. **Guardrails: read-only Postgres role + SQL parser allowlist + `statement_timeout=5s` + `LIMIT` mandatorio.** Non-negotiable. LLM nunca escribe SQL que *pueda* mutar, regardless de prompt injection.

7. **Observability: Langfuse self-hosted en Supabase.** MIT-licensed, ClickHouse-backed, no lock-in. Civic-tech appropriate. Start con traces full chain router→tool→synthesis. Eval set 50 queries español dentro mes 1.

### Por qué NO

- **¿LangGraph?** Equipo pequeño + dominio entendido. Abstraction tax (DSL learning, debug Pregel execution, fight defaults) > valor de orquestación para single-thread chat. Adopt later solo si vas a >3 agents especializados.
- **¿OpenAI Agents SDK?** Vendor lock-in. Civic-tech. Ya usas Groq por speed/cost.
- **¿Pure-LLM con tool-use, sin tier regex?** Tier rápido = latency gratis + determinismo gratis en queries comunes. Removerlo = cada "hola" es Groq call. Keep.

### El shift arquitectónico grande

**De pipeline lineal `router → SQL gen → synthesis` a tool-use loop** donde 70B puede llamar `run_sql` múltiples veces, ver errores, retry. Single change fixes mayor parte del pain operativo:
- Latency: parallel / early-exit on cache hits
- Retries: reflexion on SQL errors
- Conversational state: loop mantiene su context dentro de turn, Postgres holds across turns

---

## Sources (curado)

**Patrones agentes:**
- [Redis: AI agent architecture patterns](https://redis.io/blog/ai-agent-architecture-patterns/)
- [SitePoint: Agentic Design Patterns 2026](https://www.sitepoint.com/the-definitive-guide-to-agentic-design-patterns-in-2026/)
- [apxml: ReAct, Self-Ask, Plan-and-Execute](https://apxml.com/courses/langchain-production-llm/chapter-2-sophisticated-agents-tools/agent-architectures)
- [LangGraph supervisor](https://github.com/langchain-ai/langgraph-supervisor-py) / [persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [OpenAI Swarm](https://github.com/openai/swarm) / [Cookbook handoffs](https://cookbook.openai.com/examples/orchestrating_agents)

**Memory:**
- [Mem0 benchmark](https://mem0.ai/blog/benchmarked-openai-memory-vs-langmem-vs-memgpt-vs-mem0-for-long-term-memory-here-s-how-they-stacked-up)
- [Memory frameworks 2026 comparison](https://dev.to/anajuliabit/mem0-vs-zep-vs-langmem-vs-memoclaw-ai-agent-memory-comparison-2026-1l1k)

**WhatsApp / chatbots:**
- [Chatarmin webhooks 2026](https://chatarmin.com/en/blog/whatsapp-webhooks)
- [Hookdeck WhatsApp webhooks](https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices)
- [Botpress WhatsApp](https://botpress.com/integrations/whatsapp)
- [Yalo AI Agent guide](https://yalomedia.com/en/crm/whatsapp-ai-agent-guide/)
- [Rasa LLM chatbot architecture](https://rasa.com/blog/llm-chatbot-architecture)

**SQL guardrails:**
- [Rietta read-only LLM SQL](https://rietta.com/blog/ai-sql-database-data-protection-read-replica/)
- [guardrails-ai/valid_sql](https://github.com/guardrails-ai/valid_sql)
- [RAG vs SQL agent](https://medium.com/@generative_ai/database-query-rag-sql-generation-vs-a1d4f615064a)

**Async / latency:**
- [Inngest waitUntil](https://www.inngest.com/blog/vercel-cloudflare-wait-until)
- [Trigger.dev](https://trigger.dev/product) / [Inngest vs Trigger.dev](https://nextbuild.co/blog/background-jobs-vercel-inngest-trigger)
- [Meta typing indicators](https://developers.facebook.com/documentation/business-messaging/whatsapp/typing-indicators/)
- [Hookdeck idempotency](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions/architecture)

**LLM specifics:**
- [Groq Llama 3.3 benchmark](https://groq.com/blog/new-ai-inference-speed-benchmark-for-llama-3-3-70b-powered-by-groq)
- [Artificial Analysis](https://artificialanalysis.ai/models/llama-3-3-instruct-70b/providers)
- [Hallucination survey arxiv 2510.24476](https://arxiv.org/abs/2510.24476)

**Observability:**
- [Firecrawl observability 2026](https://www.firecrawl.dev/blog/best-llm-observability-tools)
- [Helicone guide](https://www.helicone.ai/blog/the-complete-guide-to-LLM-observability-platforms)
- [Arize evaluation platforms](https://arize.com/llm-evaluation-platforms-top-frameworks/)

**Reference projects:**
- [daveebbelaar/python-whatsapp-bot](https://github.com/daveebbelaar/python-whatsapp-bot)
- [wassengerhq/whatsapp-chatgpt-bot-python](https://github.com/wassengerhq/whatsapp-chatgpt-bot-python)
- [EvolutionAPI/evolution-api](https://github.com/EvolutionAPI/evolution-api)
- [chatwoot/chatwoot](https://github.com/chatwoot/chatwoot)
