-- Tabla principal de obras públicas
-- Diseño multi-país desde el día 1: country (ISO 3166-1) + city (slug)
-- MVP carga PE/lima; agregar CO/bogota solo requiere correr el ETL con otro parámetro.

CREATE TABLE IF NOT EXISTS obras (
    id                  SERIAL PRIMARY KEY,
    ocid                TEXT UNIQUE NOT NULL,
    source_year         INTEGER,

    -- Localización multi-país
    country             TEXT NOT NULL DEFAULT 'PE',   -- ISO 3166-1 alpha-2
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
    supplier_ruc        TEXT,  -- RUC(PE), NIT(CO), RUT(CL), RFC(MX)

    -- Contrato
    contract_id         TEXT,
    contract_start      TEXT,
    contract_end        TEXT,
    contract_amount     NUMERIC,
    contract_status     TEXT,
    n_amendments        INTEGER DEFAULT 0,

    -- Columna generada para backwards-compat con código que usa is_lima=true
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
