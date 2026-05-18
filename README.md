# Transparentape

> **El billete deja huella. Lo grabamos.**
> Mapa abierto de obras públicas con detección automática de irregularidades.

[![Deploy](https://img.shields.io/badge/demo-transparentape.app-00C853?style=flat-square)](https://transparentape.app/)
[![Hackathon](https://img.shields.io/badge/hack%40latam-Tech%20for%20Good-111?style=flat-square)](https://hack.indies.la/)
[![Track](https://img.shields.io/badge/track-Transparencia%20%26%20Corrupci%C3%B3n-d32f2f?style=flat-square)](https://hack.indies.la/)

🔗 **Demo en vivo:** **https://transparentape.app/**
🏆 Construido para **[hack@latam](https://hack.indies.la/)** (15–17 mayo 2026) · Track *Transparencia & Corrupción*

---

## El problema

En Perú y LATAM la plata pública existe en datos abiertos (OCDS, OECE, INFOBRAS),
pero está fragmentada, en formatos crudos y sin cruzar. Un ciudadano no puede
saber, en segundos, **a quién se le pagó, cuánto, si la obra existe y si el
contratista tiene sanciones**. La corrupción se esconde en la fricción de buscar.

## La solución

**Transparentape** cruza esas fuentes y las pone sobre un mapa que cualquiera
entiende: cada punto es un contrato real con coordenadas, monto, entidad,
contratista y RUC. El sistema **marca automáticamente las obras con señales de
riesgo** (red flags) y deja preguntarle a la data por WhatsApp, en español.

> *"Porque la plata pública debería tener GPS."*

---

## Qué construimos

| | Feature |
|---|---|
| 🌎 | **Globo 3D interactivo** de obras públicas (Perú + Chile), con filtros por país, región y nivel de riesgo |
| 🚩 | **Detección automática de red flags** — cruce RUC ↔ sanciones / penalidades / inhabilitaciones judiciales (OECE) |
| 🔬 | **Panel forense** por obra: score de severidad ponderado + línea de tiempo de eventos |
| 🛰️ | **Cruce OCDS ↔ INFOBRAS**: avance físico real, fotos de obra y coordenadas reales de Contraloría |
| 📸 | **Street View + comparador antes/después** y **vista inmersiva 360° / VR** de la ubicación de la obra |
| 🎬 | **Cold open cinematográfico** (GSAP) que aterriza el dato abstracto en una narrativa |
| 💬 | **Agente de WhatsApp en español** — pregúntale a la base de datos en lenguaje natural |
| 🔁 | **CronJobs** que re-ingieren las fuentes periódicamente: la data se mantiene viva, no es un snapshot |
| 🌐 | **Multi-país desde el día 1** — esquema con `country` / `city`, escalable a toda LATAM |

### El agente de WhatsApp

Bot conversacional sobre Postgres con arquitectura híbrida producción-grade:

- **Two-tier intent recognition** — Tier 1 regex barato para patrones frecuentes; Tier 2 LLM para consultas ambiguas.
- **ReAct + tool-use loop** con ~14 herramientas tipadas (`buscar_obras`, `ranking_contratistas`, `investigar_contratista`, `inhabilitados`, `comparar_regiones`, `streetview_obra`, etc.).
- **Carry-forward conversacional**: *"obras en Piura"* → *"¿y el ranking?"* razona sobre Piura, no un ranking nacional ciego.
- **State durable** keyed por `wa_id` con dedup por message ID e indicador de *typing*.
- Modelos vía **Groq**: `llama-3.1-8b-instant` (router/síntesis) + `llama-3.3-70b-versatile` (generación SQL), con `statement_timeout` y `LIMIT` obligatorios.

---

## Arquitectura

```
Fuentes abiertas            ETL (Python)              Base de datos        App + Agente
─────────────────           ────────────              ─────────────        ────────────
OCDS  (Open Contracting) ┐                          ┌─ obras            ┌─ Next.js 16 / React 19
OECE  (sanciones)        ├─►  download → filter  ──► ├─ red_flags    ──► ├─ Globo 3D + forense
INFOBRAS (Contraloría)   │    geocode → crossref     ├─ infobras_full    ├─ API routes
ChileCompra              ┘    load → cron refresh    └─ agent/convos     └─ WhatsApp (Kapso + Groq)
                                                       (Supabase /
                                                        Postgres)
```

**Flujo WhatsApp:** `Usuario → Kapso → /api/kapso/webhook → fast-path → Tier 1 (regex) | Tier 2 (LLM + tools) → respuesta`

## Stack

- **Frontend:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · GSAP · Motion
- **3D / Mapas:** three.js · react-three-fiber · @react-three/xr · cobe · MapLibre GL
- **Backend:** Next.js API routes · PostgreSQL (Supabase) · `pg`
- **IA:** Groq (Llama 3.1 / 3.3) · Anthropic SDK
- **WhatsApp:** Kapso WhatsApp Cloud API
- **ETL:** Python · psycopg · ijson · pandas · requests · BeautifulSoup
- **Infra:** Vercel · Cron Jobs

## Fuentes de datos

| Fuente | Qué aporta |
|---|---|
| **OCDS** — Open Contracting Partnership (Perú 2019–2026) | Contratos: entidad, monto referencial/adjudicado, contratista, RUC |
| **OECE** — datos abiertos | Sancionados, penalidades e inhabilitaciones judiciales (base de red flags) |
| **INFOBRAS** — Contraloría | Avance físico real, fotos, coordenadas, ejecución mensual |
| **ChileCompra** — OCDS API | Licitaciones públicas de Chile (multi-país) |

---

## Correr el proyecto localmente

> Guía completa de despliegue paso a paso (cuentas, claves, Supabase, Kapso, Vercel) en **[`HACKATHON_DAY.md`](./HACKATHON_DAY.md)**.

```bash
git clone https://github.com/victorgalvez56/transparentape.git
cd transparentape

# 1) Frontend
cd web
cp .env.local.example .env.local   # completar SUPABASE / GROQ / GOOGLE_MAPS / KAPSO
npm install
npm run dev                        # http://localhost:3000

# 2) ETL (opcional — poblar la base)
cd ../etl
pip install -r requirements.txt
cp .env.example .env               # DATABASE_URL de Supabase
python run_pipeline.py             # descarga + carga + red flags + geocode
```

## Estructura del repo

```
.
├── web/        Next.js app — UI, API routes, agente WhatsApp (lib/agent, lib/agent-kapso)
├── etl/        Pipeline Python — OCDS, OECE, INFOBRAS, Chile, cross-reference
├── data/       Datos crudos y procesados
├── docs/       Arquitectura del agente, planes y notas técnicas
└── HACKATHON_DAY.md   Runbook completo de despliegue
```

---

## Equipo

Hecho con café en hack@latam 2026.

| | Rol |
|---|---|
| **[Victor Galvez](https://github.com/victorgalvez56)** — `@victorgalvez56` | Producto, frontend, agente |
| **[Junior Rodriguez](https://github.com/isjunrod)** — `@isjunrod` | Backend, ETL, datos |
| **[Daniel Santos](https://github.com/danzstorm-hacker)** — `@danzstorm-hacker` | Datos, ETL, agente |
| **[Jose Quispe](https://github.com/JoxAQC35)** — `@JoxAQC35` | Frontend, integración |

## Licencia

Proyecto open source desarrollado para hack@latam (requisito del track).
Datos públicos bajo sus respectivas licencias de datos abiertos (OCDS / OECE / INFOBRAS / ChileCompra).
