# ObraLima — Guía de ejecución hackathon day

> Tiempo total estimado: 6–8 horas desde cero hasta demo en vivo con WhatsApp.
> El código ya existe. Este documento es SOLO sobre ejecutar, configurar y deployar.

---

## ⚠️ PREPARAR ANTES DEL DÍA (no se pueden crear en el hacka)

Estas cuentas requieren email verification o tarjeta de crédito. Créalas la noche anterior.

| Cuenta | URL | Notas |
|--------|-----|-------|
| Supabase | supabase.com | Free tier alcanza |
| Google Cloud | console.cloud.google.com | Necesita tarjeta (no cobra si usas menos de $200) |
| Anthropic | console.anthropic.com | Necesita tarjeta. $5 de crédito es suficiente para el demo |
| Vercel | vercel.com | Free, con GitHub |
| Kapso | kapso.ai | Free tier |
| GitHub | github.com | Repo público (requisito del track) |

**Keys que debes tener listas antes del día:**
```
SUPABASE_URL              → Supabase → Settings → API → Project URL
SUPABASE_ANON_KEY         → Supabase → Settings → API → anon public
SUPABASE_SERVICE_ROLE_KEY → Supabase → Settings → API → service_role (secret)
GOOGLE_MAPS_KEY           → Google Cloud → APIs & Services → Credentials
                            (habilitar: Street View Static API + Maps JavaScript API)
ANTHROPIC_API_KEY         → console.anthropic.com → API Keys
```

---

## BLOQUE 0 — Setup inicial (15 min)

### 0.1 Clonar el repo

```bash
git clone https://github.com/TU_USUARIO/hackindie.git
cd hackindie
```

### 0.2 Crear el .env del ETL

Crear archivo `/hackindie/.env`:
```
DATABASE_URL=postgresql://postgres.XXXX:PASSWORD@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```
> La URL completa la encuentras en Supabase → Settings → Database → Connection string → URI.
> Reemplaza `[YOUR-PASSWORD]` con tu contraseña del proyecto.

### 0.3 Crear el .env.local del frontend

Crear archivo `/hackindie/web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://XXXX.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-api03-...
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIza...
GOOGLE_MAPS_KEY=AIza...
AGENT_API_SECRET=c66d3ff4286e8ff869fdd6c36e416b0a941a3f5af68c0a7bb145f746bf667e19
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```
> El AGENT_API_SECRET ya está generado, úsalo. O genera uno nuevo: `openssl rand -hex 32`

### 0.4 Instalar dependencias Python

```bash
cd hackindie
pip install ijson pandas requests tqdm sqlalchemy psycopg2-binary python-dotenv
```

### 0.5 Instalar dependencias frontend

```bash
cd hackindie/web
npm install
```

**Verificar que funciona:**
```bash
npm run dev
```
Debe abrir en http://localhost:3000 — va a salir el mapa vacío (sin datos), eso es normal.

---

## BLOQUE 1 — Base de datos (30 min)

### 1.1 Crear el schema en Supabase

> **Diseño multi-país desde el día 1**: el schema incluye `country` (ISO 3166-1, ej. `'PE'`) y
> `city` (slug, ej. `'lima'`) en lugar de un boolean `is_lima`. El MVP carga Peru/Lima, pero
> agregar Colombia Bogotá o Chile Santiago solo requiere correr el ETL con otro parámetro.
> La columna `is_lima` se mantiene para compatibilidad con el código existente.

Ir a **Supabase → SQL Editor** y ejecutar en orden:

**Paso A** — Schema principal (si no existe):
```sql
CREATE TABLE IF NOT EXISTS obras (
    id                  SERIAL PRIMARY KEY,
    ocid                TEXT UNIQUE NOT NULL,
    source_year         INTEGER,

    -- Localización multi-país (diseño escalable)
    country             TEXT NOT NULL DEFAULT 'PE',  -- ISO 3166-1 alpha-2
    city                TEXT NOT NULL DEFAULT 'lima', -- slug: lima, bogota, santiago

    -- Entidad compradora
    buyer_id            TEXT,
    buyer_name          TEXT,
    buyer_region        TEXT,
    buyer_locality      TEXT,
    buyer_street        TEXT,

    -- Licitación
    tender_id           TEXT,
    tender_title        TEXT,
    tender_description  TEXT,
    item_classification TEXT,
    procurement_method  TEXT,
    tender_amount       NUMERIC,
    date_published      TEXT,

    -- Adjudicación
    award_date          TEXT,
    award_amount        NUMERIC,

    -- Proveedor/Contratista
    supplier_id         TEXT,
    supplier_name       TEXT,
    supplier_ruc        TEXT,  -- RUC en Peru, NIT en Colombia, RUT en Chile, RFC en Mexico

    -- Contrato
    contract_id         TEXT,
    contract_start      TEXT,
    contract_end        TEXT,
    contract_amount     NUMERIC,
    contract_status     TEXT,
    n_amendments        INTEGER DEFAULT 0,

    -- Compatibilidad backwards con código existente
    is_lima             BOOLEAN GENERATED ALWAYS AS (country = 'PE' AND city = 'lima') STORED,

    -- Enriquecimiento
    lat                 NUMERIC,
    lng                 NUMERIC,
    infobras_code       TEXT,
    streetview_before   TEXT,
    streetview_after    TEXT,
    ai_score            INTEGER,
    ai_description      TEXT,
    is_red_flag         BOOLEAN DEFAULT FALSE,
    red_flag_types      TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_obras_country      ON obras(country);
CREATE INDEX IF NOT EXISTS idx_obras_city         ON obras(city);
CREATE INDEX IF NOT EXISTS idx_obras_country_city ON obras(country, city);
CREATE INDEX IF NOT EXISTS idx_obras_is_lima      ON obras(is_lima);
CREATE INDEX IF NOT EXISTS idx_obras_supplier_ruc ON obras(supplier_ruc);
CREATE INDEX IF NOT EXISTS idx_obras_source_year  ON obras(source_year);
CREATE INDEX IF NOT EXISTS idx_obras_method       ON obras(procurement_method);
CREATE INDEX IF NOT EXISTS idx_obras_red_flag     ON obras(is_red_flag);
```

> **Nota**: `is_lima` es una **columna generada** — se actualiza sola cuando `country='PE' AND city='lima'`.
> Todo el código existente que usa `.eq("is_lima", true)` sigue funcionando sin cambios.

**Paso B** — Red flags:
```sql
CREATE TABLE IF NOT EXISTS red_flags (
    id           SERIAL PRIMARY KEY,
    country      TEXT NOT NULL DEFAULT 'PE',  -- para multi-país
    ruc          TEXT NOT NULL,  -- ID fiscal: RUC(PE), NIT(CO), RUT(CL), RFC(MX)
    nombre       TEXT,
    tipo         TEXT NOT NULL,  -- sancion_inhabilitacion | inhabilitacion_judicial | penalidad
    descripcion  TEXT,
    fecha_inicio TEXT,
    fecha_fin    TEXT,
    vigente      BOOLEAN,
    fuente       TEXT
);

CREATE INDEX IF NOT EXISTS idx_rf_country ON red_flags(country);
CREATE INDEX IF NOT EXISTS idx_rf_ruc     ON red_flags(ruc);
CREATE INDEX IF NOT EXISTS idx_rf_tipo    ON red_flags(tipo);
```

**Paso C** — Agent logs (opcional pero recomendado):
```sql
CREATE TABLE IF NOT EXISTS agent_logs (
    id          SERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    endpoint    TEXT NOT NULL,
    params      JSONB,
    n_resultados INTEGER,
    latencia_ms  INTEGER,
    error       TEXT
);
```

**Verificar:** Ir a Supabase → Table Editor. Debes ver las tablas `obras`, `red_flags`, `agent_logs`.

### 1.2 Deshabilitar RLS (Row Level Security) para la demo

En Supabase → SQL Editor:
```sql
ALTER TABLE obras      DISABLE ROW LEVEL SECURITY;
ALTER TABLE red_flags  DISABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs DISABLE ROW LEVEL SECURITY;
```
> Para producción real se habilitaría con políticas. Para el demo del hackathon, sin RLS es más simple.

---

## BLOQUE 2 — Datos OCDS (1–2 horas según conexión)

> **Estrategia hacka**: descargar solo 2024 (149MB) para tener datos rápido. Después agregar más años.

### 2.1 Descargar datos OCDS

```bash
cd hackindie
mkdir -p data/raw/ocds
python etl/01_explore_ocds.py
```

Esto descarga `data/raw/ocds/2024.jsonl.gz`. Verás en consola cuántas obras hay.

Si quieres más años (hazlo en paralelo en otra terminal):
```bash
# En otra terminal — descarga 2023 (57MB, más rápido)
curl -L "https://data.open-contracting.org/en/publication/135/download?name=2023.jsonl.gz" \
  -o data/raw/ocds/2023.jsonl.gz
```

**Verificar:**
```bash
ls -lh data/raw/ocds/
# Debe mostrar 2024.jsonl.gz (~149MB)
```

### 2.2 Filtrar obras de Lima

```bash
python etl/02_filter_lima_obras.py
```

Esto procesa el JSONL y extrae solo las obras de los 43 distritos de Lima.
Tarda ~3-5 minutos. Al final muestra cuántas obras encontró.

Salida esperada:
```
Procesando 2024.jsonl.gz...
Total registros procesados: 180,432
Obras Lima encontradas: 8,241
Guardado en data/processed/lima_obras_2024.csv
```

**Si falla con error de memoria**: edita `02_filter_lima_obras.py` y reduce el batch size.

### 2.3 Cargar a Supabase

```bash
python etl/03_load_db.py
```

Tarda ~5-10 minutos dependiendo de cuántas obras. Carga en batches de 100.

Salida esperada:
```
Cargando obras a Supabase...
[████████████████████] 8,241/8,241 obras cargadas
Listo.
```

**Verificar en Supabase:**
```sql
SELECT COUNT(*), source_year FROM obras GROUP BY source_year ORDER BY source_year;
```
Debe mostrar filas con conteos.

### 2.4 (Opcional) Repetir para 2023

Si descargaste 2023:
```bash
python etl/02_filter_lima_obras.py --year 2023
python etl/03_load_db.py --year 2023
```

---

## BLOQUE 3 — Red flags OECE (30 min)

### 3.1 Descargar CSVs de OECE

Ir manualmente a datosabiertos.gob.pe y descargar estos archivos a `data/raw/oece/`:

| Archivo | URL base |
|---------|----------|
| Proveedores inhabilitados (judicial) | datosabiertos.gob.pe → buscar "inhabilitados OECE" |
| Proveedores sancionados (OECE) | datosabiertos.gob.pe → buscar "sancionados contrataciones" |
| Penalidades contratistas | datosabiertos.gob.pe → buscar "penalidades contratistas" |

> Alternativa rápida: busca en Google "OECE inhabilitados CSV datosabiertos.gob.pe 2024"

Los nombres de archivo esperados por el script son algo como:
- `inhabilitados_judicial.csv`
- `sancionados_oece.csv`
- `penalidades.csv`

**Si no encuentras los archivos exactos:** el sistema funciona sin red flags, solo no muestra las alertas rojas. Puedes continuar y volver a esto después.

### 3.2 Cargar red flags

```bash
python etl/04_load_red_flags.py
```

Esto carga las sanciones a la tabla `red_flags` Y actualiza `is_red_flag` / `red_flag_types` en la tabla `obras`.

**Verificar:**
```sql
SELECT COUNT(*) FROM red_flags;
SELECT COUNT(*) FROM obras WHERE is_red_flag = TRUE;
```

---

## BLOQUE 4 — Geocoding (15 min)

```bash
python etl/05_geocode_lima.py
```

Asigna lat/lng a las obras usando centroides de los 43 distritos de Lima. Rápido (~1 min).

**Verificar:**
```sql
SELECT COUNT(*) FROM obras WHERE lat IS NOT NULL;
-- Debe ser casi igual al total de obras Lima
```

---

## BLOQUE 5 — Frontend local funcional (15 min)

### 5.1 Correr el frontend

```bash
cd hackindie/web
npm run dev
```

Abrir http://localhost:3000

**Lo que debes ver:**
- Globo 3D con puntos de colores sobre Lima
- Click en un punto → panel derecho con datos de la obra
- Panel de lista a la derecha con búsqueda
- Botón "Investigar este caso" → abre panel de forensics
- Street View carga al seleccionar una obra con lat/lng (llama a Google Maps API)
- Botón "🥽 Ver inmersivo 360°" aparece cuando hay Street View disponible

**Si el mapa está vacío:**
```bash
# Verificar que las obras tienen lat/lng
# En Supabase SQL Editor:
SELECT COUNT(*) FROM obras WHERE lat IS NOT NULL AND is_lima = TRUE;
```

**Si el Street View no carga:** verificar que `GOOGLE_MAPS_KEY` en `.env.local` es correcto y tiene las APIs habilitadas (Street View Static API + Maps JavaScript API).

**Si el panel AI falla:** verificar `ANTHROPIC_API_KEY`. El mapa funciona sin IA, solo no muestra el score.

### 5.2 Probar OG images

Abrir en el browser:
```
http://localhost:3000/api/og?ocid=<OCID_DE_UNA_OBRA>
```

Para obtener un OCID válido:
```sql
SELECT ocid FROM obras WHERE is_lima = TRUE AND lat IS NOT NULL LIMIT 1;
```

Debes ver una imagen 1200×630 con datos de la obra.

### 5.3 Probar página individual de obra

```
http://localhost:3000/obras/<OCID_DE_UNA_OBRA>
```

Debes ver la página mobile-first con los datos completos.

---

## BLOQUE 6 — Deploy a Vercel (20 min)

### 6.1 Subir el código a GitHub

```bash
cd hackindie
git add .
git commit -m "feat: hackathon day deploy"
git push origin main
```

> **Importante:** verificar que `.gitignore` incluye `.env`, `.env.local`, `data/`. No commitear keys ni datos.

### 6.2 Crear proyecto en Vercel

```bash
cd hackindie/web
npx vercel --prod
```

Responder a las preguntas:
- Set up and deploy → `Y`
- Which scope → tu cuenta personal
- Link to existing project → `N`
- Project name → `obralima` (o lo que quieras)
- In which directory is your code → `.` (punto)
- Override settings → `N`

Al final te da una URL tipo `https://obralima-xxxx.vercel.app`

### 6.3 Configurar variables de entorno en Vercel

```bash
# Agregar cada variable de entorno a Vercel:
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add ANTHROPIC_API_KEY production
npx vercel env add NEXT_PUBLIC_GOOGLE_MAPS_KEY production
npx vercel env add GOOGLE_MAPS_KEY production
npx vercel env add AGENT_API_SECRET production
npx vercel env add NEXT_PUBLIC_BASE_URL production
# Para NEXT_PUBLIC_BASE_URL poner la URL de Vercel: https://obralima-xxxx.vercel.app
```

> Alternativa más rápida: ir a vercel.com → tu proyecto → Settings → Environment Variables → pegar todas juntas.

### 6.4 Re-deployar con las variables

```bash
npx vercel --prod
```

### 6.5 Verificar deploy

Abrir la URL de Vercel. Debe funcionar igual que localhost.

**Test rápido:**
```bash
# Reemplaza con tu URL real
curl "https://obralima-xxxx.vercel.app/api/obras?lima_only=true" | head -c 200
# Debe retornar JSON con obras
```

---

## BLOQUE 7 — Kapso + WhatsApp (45 min)

> Prerequisito: tener la URL de Vercel funcionando del bloque anterior.

### 7.1 Crear agente en Kapso

1. Ir a kapso.ai → Log in
2. En el sidebar: **Automate → Workflows**
3. Click en "New workflow" o "Create"
4. Nombrar: "ObraLima Bot"

### 7.2 Configurar las Functions (tools HTTP)

Ir a **Automate → Functions** → New Function:

**Function 1: buscar_obras**
```
Name: buscar_obras
Type: HTTP Request
Method: GET
URL: https://TU-URL.vercel.app/api/agent/obras
Headers:
  Authorization: Bearer c66d3ff4286e8ff869fdd6c36e416b0a941a3f5af68c0a7bb145f746bf667e19

Parameters:
  q         (string)  - Búsqueda libre en nombre de obra
  distrito  (string)  - Nombre del distrito en mayúsculas (MIRAFLORES, SURCO, etc.)
  year      (integer) - Año del contrato (2019-2026)
  red_flag  (boolean) - true para solo obras con alertas
  contratista (string)- Nombre parcial del contratista
  sort      (string)  - "riesgo" | "monto" | "reciente"
  limit     (integer) - Número de resultados (1-10, usar 3 por defecto)
```

**Function 2: ver_detalle_obra**
```
Name: ver_detalle_obra
Type: HTTP Request
Method: GET
URL: https://TU-URL.vercel.app/api/agent/detalle
Headers:
  Authorization: Bearer c66d3ff4286e8ff869fdd6c36e416b0a941a3f5af68c0a7bb145f746bf667e19

Parameters:
  id (integer, requerido) - ID numérico de la obra
```

### 7.3 Configurar el Workflow con LLM

En el workflow "ObraLima Bot":
1. Agregar nodo **LLM / AI**
2. Modelo: el que Kapso ofrezca (GPT-4o, Claude, etc.)
3. En el campo **System Prompt**, pegar esto:

```
Eres ObraBot, el asistente de transparencia de ObraLima — plataforma que monitorea obras públicas en Lima, Perú.

## MISIÓN
Que cualquier ciudadano pueda saber en segundos qué se construyó con dinero público en su distrito, quién lo hizo, y si hay irregularidades.

## REGLAS
1. Responde SIEMPRE en español simple. Máximo 5 líneas por respuesta.
2. NUNCA inventes cifras, nombres ni fechas. Si no tienes datos, dilo.
3. Usa emojis para nivel de riesgo: 🔴 alto · 🟡 medio · 🟢 sin alertas
4. Muestra máximo 3 obras por mensaje. Si hay más, ofrece ver más.
5. Cuando el usuario quiera ver fotos, manda el link_web de la obra.
6. Si preguntan algo fuera de obras públicas en Lima, redirige amablemente.

## FORMATO PARA MOSTRAR UNA OBRA
[emoji_riesgo] *[nombre, máximo 60 caracteres]*
📍 [distrito] · 💰 S/ [monto formateado]
⚠️ [alerta principal en 1 frase, solo si tiene alertas]
🔗 [link_web]

## CUÁNDO USAR CADA HERRAMIENTA
- buscar_obras: cuando el usuario menciona un distrito, año, empresa, o pide obras sospechosas
- ver_detalle_obra: cuando dice "la primera", "cuéntame más", "esa obra", o da un nombre específico

## EJEMPLOS
Usuario: "obras en miraflores"
→ Llama buscar_obras con distrito=MIRAFLORES, limit=3, sort=riesgo

Usuario: "obras sospechosas en surco 2022"
→ Llama buscar_obras con distrito=SURCO, year=2022, red_flag=true

Usuario: "la primera" / "cuéntame más de esa"
→ Llama ver_detalle_obra con el id de la obra que mostraste antes

Usuario: "obras de esa empresa"
→ Llama buscar_obras con contratista=[nombre del contratista mencionado antes]
```

4. Conectar las dos functions al nodo LLM (como "tools" disponibles)
5. Conectar la entrada (mensaje WhatsApp) → nodo LLM → salida (respuesta WhatsApp)

### 7.4 Conectar WhatsApp

En Kapso → **Integrate → Phone numbers**:
1. Click "Add number" o "Start"
2. Seguir el proceso de WhatsApp Business API
3. Para la demo del hackathon: Kapso ofrece un **Sandbox** de WhatsApp (número de prueba)
4. El sandbox te da un número al que le mandas un mensaje de activación

### 7.5 Probar el agente

En el sandbox de Kapso, enviar mensajes de prueba:

```
"obras en miraflores"
→ debe responder con 3 obras formateadas

"obras sospechosas"
→ debe filtrar red_flag=true

"la primera"
→ debe llamar ver_detalle_obra y responder con perfil completo

"obras en san borja 2023"
→ debe filtrar por distrito + año

"obras de [nombre de contratista]"
→ debe filtrar por contratista
```

**Si el agente no llama las tools**: revisar que las functions estén conectadas al nodo LLM. En algunos LLM nodes hay que activar "Tool use" o "Function calling" explícitamente.

**Si retorna 401**: el `AGENT_API_SECRET` en el header no coincide con el del `.env.local`. Verificar que son iguales.

**Si retorna 500**: hay un problema con Supabase. Verificar que `SUPABASE_SERVICE_ROLE_KEY` esté correctamente configurada en Vercel.

---

## BLOQUE 8 — Verificación final (15 min)

### Checklist completo antes de la demo

**Base de datos:**
```sql
SELECT COUNT(*) FROM obras WHERE is_lima = TRUE;          -- > 5,000 idealmente
SELECT COUNT(*) FROM obras WHERE lat IS NOT NULL;         -- > 4,000
SELECT COUNT(*) FROM obras WHERE is_red_flag = TRUE;      -- > 100
SELECT COUNT(*) FROM red_flags;                           -- > 0 (si cargaste OECE)
```

**Frontend web:**
- [ ] http://TU-URL.vercel.app carga el mapa con puntos
- [ ] Click en obra → muestra panel con datos
- [ ] Street View carga (puede tardar 5-10 seg)
- [ ] Botón "🥽 Ver inmersivo 360°" funciona
- [ ] Botón "Investigar este caso" abre panel de forensics
- [ ] Botón compartir en Twitter abre tweet con texto + link
- [ ] http://TU-URL.vercel.app/obras/[un_ocid] muestra página individual
- [ ] http://TU-URL.vercel.app/api/og?ocid=[un_ocid] muestra imagen OG

**API agent:**
```bash
# Test buscar (debe retornar obras JSON)
curl -H "Authorization: Bearer c66d3ff4286e8ff869fdd6c36e416b0a941a3f5af68c0a7bb145f746bf667e19" \
  "https://TU-URL.vercel.app/api/agent/obras?distrito=MIRAFLORES&limit=3"

# Test detalle (reemplaza 1 con un ID real)
curl -H "Authorization: Bearer c66d3ff4286e8ff869fdd6c36e416b0a941a3f5af68c0a7bb145f746bf667e19" \
  "https://TU-URL.vercel.app/api/agent/detalle?id=1"

# Test sin token (debe retornar 401)
curl "https://TU-URL.vercel.app/api/agent/obras?distrito=MIRAFLORES"
```

**WhatsApp:**
- [ ] Mandar "obras en miraflores" → responde con 3 obras en formato correcto
- [ ] Mandar "la primera" → responde con detalle completo
- [ ] Mandar "obras sospechosas" → responde con obras con red flags

---

## PLAN DE CONTINGENCIA (si algo falla)

### "No tengo los datos de OECE"
→ El mapa funciona sin red flags. Las obras rojas solo no aparecen. Continúa.

### "El Street View no carga"
→ Verifica que en Google Cloud Console tenés habilitado "Street View Static API" y "Maps JavaScript API". Si no, el mapa funciona igual pero sin fotos.

### "La IA de Claude no responde"
→ El mapa y Kapso funcionan sin Claude Vision. El score simplemente no aparece. Continúa.

### "Kapso no conecta a WhatsApp"
→ Usa el sandbox de Kapso (número de prueba). Para la demo es suficiente.

### "Vercel da error de build"
→ Ir a web/next.config.ts y verificar que `ignoreBuildErrors: true` y `ignoreDuringBuilds: true` están activos (ya deberían estar).

### "No hay tiempo para el ETL completo"
→ Carga solo 2024 con los 5 distritos prioritarios (Miraflores, Surco, San Borja, Barranco, San Miguel). Editar `02_filter_lima_obras.py` y agregar filtro de distritos.

---

## ORDEN DE PRIORIDAD (si el tiempo es limitado)

Si solo tienes 3 horas:

1. **Base de datos + ETL 2024** (1h) → mapa funciona
2. **Deploy Vercel** (20min) → URL pública
3. **Kapso básico** (40min) → WhatsApp funciona
4. Dejar para después: red flags, INFOBRAS, múltiples años

Si solo tienes 1 hora (modo emergencia):

1. Supabase schema (10min)
2. ETL load 500 obras de muestra (20min) — editar script para limitar
3. Deploy Vercel (10min)
4. Demo con el mapa con datos mínimos (20min)

---

## BLOQUE 9 — Multi-país (después de que el MVP Peru funciona)

> Prerequisito: BLOQUE 1–8 completos con Lima funcionando.
> Tiempo estimado por país adicional: 1.5–3 horas según tamaño del dataset.

---

### Arquitectura: por qué `country + city` en lugar de `is_lima`

El schema ya creado en BLOQUE 1 está diseñado para esto. La clave es:

```
obras.country = 'PE' + obras.city = 'lima'   → Peru Lima (MVP)
obras.country = 'CO' + obras.city = 'bogota' → Colombia Bogotá
obras.country = 'CL' + obras.city = 'santiago'
obras.country = 'MX' + obras.city = 'cdmx'
```

El código existente usa `.eq("is_lima", true)` — eso sigue funcionando porque
`is_lima` es una columna generada que vale `TRUE` cuando `country='PE' AND city='lima'`.
Para el frontend multi-país solo se agrega un filtro adicional.

---

### 9.1 Fuentes OCDS disponibles por país

El estándar OCDS (Open Contracting Data Standard) es el mismo que usamos para Peru.
El ETL funciona igual — solo cambia la URL de descarga y el filtro de ciudad.

| País | Ciudad demo | URL descarga OCDS | Tamaño aprox | Calidad |
|------|-------------|-------------------|--------------|---------|
| 🇵🇪 Peru | Lima | `data.open-contracting.org/publication/135` | 150MB/año | ⭐⭐⭐⭐⭐ |
| 🇨🇴 Colombia | Bogotá | `data.open-contracting.org/publication/co-secop` | 800MB/año | ⭐⭐⭐⭐ |
| 🇨🇱 Chile | Santiago | `data.open-contracting.org/publication/cl-chilecompra` | 400MB/año | ⭐⭐⭐⭐⭐ |
| 🇲🇽 México | CDMX | `data.open-contracting.org/publication/mx-compranet` | 2GB/año | ⭐⭐⭐ |
| 🇵🇾 Paraguay | Asunción | `data.open-contracting.org/publication/py-dncp` | 200MB/año | ⭐⭐⭐⭐ |
| 🇭🇳 Honduras | Tegucigalpa | `data.open-contracting.org/publication/hn-oncae` | 100MB/año | ⭐⭐⭐ |
| 🇨🇷 Costa Rica | San José | `data.open-contracting.org/publication/cr-sicop` | 150MB/año | ⭐⭐⭐ |

> Para encontrar la URL exacta: ir a `data.open-contracting.org/en/publishers/`
> → buscar el país → copiar la URL de descarga del año que necesitas.

**ID fiscal por país** (equivalente al RUC peruano):
```
Peru      → RUC  (11 dígitos)
Colombia  → NIT  (9-10 dígitos, campo: parties[].identifier.id)
Chile     → RUT  (8-9 dígitos)
Mexico    → RFC  (12-13 dígitos)
Paraguay  → RUC  (mismo nombre, diferente formato)
Honduras  → RTN  (14 dígitos)
```

---

### 9.2 ETL para un segundo país

El script generalizado está en `etl/02_filter_city_obras.py`. Si no existe aún, créalo:

```bash
# Verificar que existe
ls etl/02_filter_city_obras.py
```

Si no existe, crearlo con este contenido:

```python
"""
ETL generalizado para cualquier ciudad/país con datos OCDS.
Uso:
  python etl/02_filter_city_obras.py \
    --input data/raw/ocds/colombia_2024.jsonl.gz \
    --country CO \
    --city bogota \
    --filter-term "BOGOT"   # substring del buyer.address.region o buyer.name
    --year 2024
"""

import ijson, gzip, json, csv, argparse, os
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--input",       required=True)
parser.add_argument("--country",     required=True)   # ISO: PE, CO, CL, MX
parser.add_argument("--city",        required=True)   # slug: lima, bogota
parser.add_argument("--filter-term", required=True)   # substring para filtrar buyer
parser.add_argument("--year",        type=int, required=True)
args = parser.parse_args()

out_path = f"data/processed/{args.country}_{args.city}_obras_{args.year}.csv"
Path("data/processed").mkdir(parents=True, exist_ok=True)

FIELDS = [
    "ocid","source_year","country","city",
    "buyer_id","buyer_name","buyer_region","buyer_locality",
    "tender_description","item_classification","procurement_method",
    "tender_amount","date_published","award_date",
    "supplier_name","supplier_ruc",
    "contract_start","contract_end","contract_amount","contract_status",
    "n_amendments",
]

def extract(release: dict, country: str, city: str, year: int) -> dict | None:
    ocid = release.get("ocid","")
    buyer = release.get("buyer") or {}
    address = buyer.get("address") or {}
    region = (address.get("region") or buyer.get("name") or "").upper()

    # Filtrar por ciudad
    if args.filter_term.upper() not in region:
        return None

    tender = release.get("tender") or {}
    items = tender.get("items") or [{}]
    classification = (items[0].get("classification") or {}).get("description","")

    # Solo obras (works)
    if tender.get("mainProcurementCategory","").lower() not in ("works","obras","obra"):
        # Intentar por clasificación si la categoría no está
        if not any(w in classification.upper() for w in ("OBRA","CONSTRUCCI","PAVIMENT","VIAL","EDIFICACI")):
            return None

    awards = release.get("awards") or [{}]
    award = awards[0] if awards else {}
    suppliers = award.get("suppliers") or [{}]
    supplier = suppliers[0] if suppliers else {}

    contracts = release.get("contracts") or [{}]
    contract = contracts[0] if contracts else {}

    # ID fiscal: intentar en orden de campos comunes OCDS
    tax_id = (
        supplier.get("identifier", {}).get("id") or
        supplier.get("id") or ""
    )

    return {
        "ocid":                ocid,
        "source_year":         year,
        "country":             country,
        "city":                city,
        "buyer_id":            buyer.get("id",""),
        "buyer_name":          buyer.get("name",""),
        "buyer_region":        address.get("region",""),
        "buyer_locality":      address.get("locality",""),
        "tender_description":  tender.get("description") or tender.get("title",""),
        "item_classification": classification,
        "procurement_method":  tender.get("procurementMethod",""),
        "tender_amount":       (tender.get("value") or {}).get("amount",""),
        "date_published":      release.get("date",""),
        "award_date":          award.get("date",""),
        "supplier_name":       supplier.get("name",""),
        "supplier_ruc":        tax_id,
        "contract_start":      contract.get("period",{}).get("startDate",""),
        "contract_end":        contract.get("period",{}).get("endDate",""),
        "contract_amount":     (contract.get("value") or {}).get("amount",""),
        "contract_status":     contract.get("status",""),
        "n_amendments":        len(contract.get("amendments") or []),
    }

total = found = 0
with gzip.open(args.input, "rb") as f, open(out_path, "w", newline="") as out:
    writer = csv.DictWriter(out, fieldnames=FIELDS)
    writer.writeheader()
    for release in ijson.items(f, "item"):
        total += 1
        row = extract(release, args.country, args.city, args.year)
        if row:
            writer.writerow(row)
            found += 1
        if total % 10000 == 0:
            print(f"  {total:,} procesados | {found:,} encontrados...", flush=True)

print(f"\nListo: {found:,} obras de {args.city.upper()} ({args.country}) en {out_path}")
```

---

### 9.3 Pasos completos para agregar Colombia Bogotá

**Descargar datos:**
```bash
mkdir -p data/raw/ocds
curl -L "https://data.open-contracting.org/en/publication/co-secop/download?name=2024.jsonl.gz" \
  -o data/raw/ocds/colombia_2024.jsonl.gz
```

**Filtrar obras de Bogotá:**
```bash
python etl/02_filter_city_obras.py \
  --input data/raw/ocds/colombia_2024.jsonl.gz \
  --country CO \
  --city bogota \
  --filter-term "BOGOT" \
  --year 2024
```

Salida esperada:
```
180,000 procesados | 12,400 encontrados...
Listo: 12,400 obras de BOGOTA (CO) en data/processed/CO_bogota_obras_2024.csv
```

**Cargar a Supabase:**
```bash
python etl/03_load_db.py \
  --input data/processed/CO_bogota_obras_2024.csv \
  --country CO \
  --city bogota
```

**Geocodificar Bogotá:**
```bash
python etl/05_geocode_lima.py \
  --country CO \
  --city bogota
```

> Para geocodificar ciudades fuera de Lima, el script usa Google Geocoding API
> en lugar de centroides hardcodeados. Asegúrate de que `GOOGLE_MAPS_KEY` tenga
> habilitado "Geocoding API" en Google Cloud Console.

**Verificar en Supabase:**
```sql
SELECT country, city, COUNT(*), AVG(contract_amount)
FROM obras
GROUP BY country, city
ORDER BY country, city;
```
Debes ver dos filas: Peru lima + Colombia bogota.

---

### 9.4 Cambios mínimos en el código para mostrar múltiples países

> **Solo necesario si quieres el selector de país en el UI del hackathon.**
> El mapa YA muestra todos los puntos — el globo no tiene restricciones geográficas.
> Si no haces estos cambios, los datos de Colombia igual aparecen en el mapa.

**En `/api/obras/route.ts`** — agregar filtro de country/city:
```typescript
// Agregar después de los filtros existentes:
const country = searchParams.get("country");
const city    = searchParams.get("city");

// En el loop de queries, agregar:
if (country) q = q.eq("country", country);
if (city)    q = q.eq("city", city);
// Si no viene country ni city → el query actual usa lima_only (is_lima=true)
// Los datos de otros países aparecen al no poner lima_only=true
```

**En `/components/ObrasListPanel.tsx`** — agregar dropdown de país:
- Agregar `<select>` con opciones: "Todos", "Peru Lima", "Colombia Bogotá", etc.
- Al cambiar → refetch con `?country=CO&city=bogota`

**En los endpoints de Kapso `/api/agent/obras`** — ya tienen filtro por `distrito` y `q`, 
los datos de Colombia aparecen automáticamente si el LLM no pone filtro de `is_lima`. 
No se necesita cambio para que Kapso funcione con múltiples países.

---

### 9.5 Red flags para otros países

No todos los países tienen datos de sanciones en formato descargable.

| País | Fuente | Disponibilidad |
|------|--------|----------------|
| 🇵🇪 Peru | OECE datosabiertos.gob.pe | ✅ CSV descargable |
| 🇨🇴 Colombia | SIRI secop.gov.co | ✅ API REST |
| 🇨🇱 Chile | ChileProveedores | ✅ CSV descargable |
| 🇲🇽 México | SESNA/SFP | ⚠️ Parcial, requiere scraping |
| 🇵🇾 Paraguay | DNCP | ✅ CSV descargable |
| 🇭🇳 Honduras | ONCAE | ❌ No disponible públicamente |

**Para cargar red flags de otro país:**
```bash
# Mismo script, pasando el country code
python etl/04_load_red_flags.py --country CO --input data/raw/oece/colombia_sancionados.csv
```

El script ya espera el parámetro `country` y lo guarda en la columna `red_flags.country`.

---

### 9.6 Tiempo estimado por país adicional

| Paso | Tiempo |
|------|--------|
| Descargar OCDS (~400MB) | 10–20 min (depende de conexión) |
| Filtrar ciudad | 3–8 min |
| Cargar a Supabase | 5–15 min |
| Geocodificar (Google API) | 5–10 min |
| Red flags (si existen) | 20–30 min |
| Verificar en el mapa | 5 min |
| **Total** | **~1–1.5 horas** |

---

### 9.7 Demo script multi-país para el pitch

Si tienes Peru + Colombia cargados, el pitch puede ser:

> "Esto no es solo Lima — el mismo sistema funciona para cualquier ciudad en LATAM
> que publique datos OCDS. Agregamos Bogotá en 1 hora. La misma IA, los mismos
> red flags, el mismo antes/después."

En el mapa: zoom out para mostrar el globo con puntos en Lima Y Bogotá simultáneamente.
En WhatsApp: "obras en bogota" → el agente responde igual.

---

## DATOS DE CONTACTO RÁPIDO PARA EL DÍA

```
Repo:        github.com/TU_USUARIO/hackindie
App deploy:  https://obralima-xxxx.vercel.app   ← actualizar cuando tengas la URL
Supabase:    https://supabase.com/dashboard/project/TU_PROJECT_ID
Kapso:       kapso.ai → proyecto "ObraLima Bot"

Token agente: c66d3ff4286e8ff869fdd6c36e416b0a941a3f5af68c0a7bb145f746bf667e19
```
