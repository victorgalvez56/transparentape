-- Sanciones e inhabilitaciones de contratistas
-- Fuente PE: OECE datosabiertos.gob.pe
-- El campo ruc almacena el ID fiscal del país: RUC(PE), NIT(CO), RUT(CL), RFC(MX)

CREATE TABLE IF NOT EXISTS red_flags (
    id           SERIAL PRIMARY KEY,
    country      TEXT NOT NULL DEFAULT 'PE',
    ruc          TEXT NOT NULL,
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
