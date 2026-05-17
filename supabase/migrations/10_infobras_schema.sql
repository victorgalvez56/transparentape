-- INFOBRAS full data table
-- Populated by etl/09_infobras_scrape.py

CREATE TABLE IF NOT EXISTS infobras_full (
    codigo_infobras         INTEGER PRIMARY KEY,
    cui                     TEXT,
    snip                    TEXT,
    nombre                  TEXT,
    modalidad               TEXT,
    estado                  TEXT,

    -- Progress
    avance_fisico_pct       NUMERIC,
    fecha_ultimo_avance     TEXT,
    n_avances_mensuales     INTEGER DEFAULT 0,
    n_modificaciones_plazo  INTEGER DEFAULT 0,
    n_fotos                 INTEGER DEFAULT 0,

    -- Dates
    fecha_inicio            TEXT,
    fecha_fin_programada    TEXT,
    fecha_fin_real          TEXT,
    fecha_aprobacion        TEXT,

    -- Amounts
    monto_aprobacion        NUMERIC,
    monto_expediente        NUMERIC,
    doc_aprobacion          TEXT,

    -- Entities
    entidad_nombre          TEXT,
    entidad_ruc             TEXT,
    contratista_nombre      TEXT,
    contratista_ruc         TEXT,
    supervisor_nombre       TEXT,
    supervisor_ruc          TEXT,
    contrato_numero         TEXT,
    contrato_fecha          TEXT,

    -- Location
    ubicacion_geografica    TEXT,
    direccion               TEXT,
    lat                     DOUBLE PRECISION,
    lng                     DOUBLE PRECISION,

    -- JSON blobs
    avances_mensuales       JSONB DEFAULT '[]',
    documentos              JSONB DEFAULT '[]',
    fotos                   JSONB DEFAULT '[]',
    imagenes_aereas         JSONB DEFAULT '[]',
    informes_control        JSONB,
    procesos_seleccion      JSONB,
    comentarios             JSONB,

    -- Flags
    tiene_informe_control   BOOLEAN DEFAULT FALSE,

    -- Meta
    raw_html_size           INTEGER,
    scraped_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_infobras_cui    ON infobras_full(cui);
CREATE INDEX IF NOT EXISTS idx_infobras_estado ON infobras_full(estado);
CREATE INDEX IF NOT EXISTS idx_infobras_nombre ON infobras_full USING gin(to_tsvector('spanish', coalesce(nombre, '')));

-- Disable RLS (same as other tables)
ALTER TABLE infobras_full DISABLE ROW LEVEL SECURITY;
