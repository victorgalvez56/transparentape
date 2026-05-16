"""
Load OECE sanctions into red_flags table and cross-reference obras by RUC.

Expected input files in data/raw/oece/:
    penalidades.csv              (delimiter: |)
    sancionados.csv              (delimiter: |)
    inhabilitaciones_judiciales.csv  (delimiter: |)

Download from: datosabiertos.gob.pe → search "OECE inhabilitados" / "penalidades contratistas"

After loading, updates obras.is_red_flag and obras.red_flag_types for matching supplier_ruc.

Usage:
    python etl/04_load_red_flags.py
"""

import csv
import io
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / "etl" / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set — copy etl/.env.example to etl/.env")

OECE_DIR = ROOT / "data" / "raw" / "oece"
BATCH_SIZE = 100


def read_csv(path: Path, delimiter: str = "|") -> list[dict]:
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            text = path.read_text(encoding=encoding)
            return list(csv.DictReader(io.StringIO(text), delimiter=delimiter))
        except Exception:
            continue
    return []


def insert_flags(cur, rows: list[tuple], tipo: str, fuente: str) -> int:
    sql = """
        INSERT INTO red_flags (country, ruc, nombre, tipo, descripcion, fecha_inicio, fecha_fin, vigente, fuente)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT DO NOTHING
    """
    data = [(row[0], row[1], row[2], tipo, row[3], row[4], row[5], row[6], fuente) for row in rows]
    cur.executemany(sql, data)
    return len(data)


def load_penalidades(cur) -> int:
    path = OECE_DIR / "penalidades.csv"
    if not path.exists():
        print("  [skip] penalidades.csv not found")
        return 0

    rows_raw = read_csv(path)
    rows = []
    for r in rows_raw:
        ruc = (r.get("RUC CONTRATISTA") or "").strip()
        if not ruc:
            continue
        rows.append((
            "PE", ruc,
            (r.get("ENTIDAD CONTRATANTE") or "")[:200],
            (r.get("DESCRIPCION/MOTIVO") or "")[:300],
            r.get("FECHA PENALIDAD") or None,
            None, None,
        ))
    n = insert_flags(cur, rows, "penalidad", "OECE-penalidades")
    print(f"  penalidades:               {n:,}")
    return n


def load_sancionados(cur) -> int:
    path = OECE_DIR / "sancionados.csv"
    if not path.exists():
        print("  [skip] sancionados.csv not found")
        return 0

    rows_raw = read_csv(path)
    rows = []
    for r in rows_raw:
        ruc = (r.get("RUC") or "").strip()
        if not ruc:
            continue
        fecha_fin = (r.get("FECHA_FIN") or "").strip() or None
        rows.append((
            "PE", ruc,
            (r.get("NOMBRE_RAZONODENOMINACIONSOCIAL") or "")[:200],
            (r.get("DE_MOTIVO_INFRACCION") or "")[:200],
            r.get("FECHA_INICIO") or None,
            fecha_fin,
            fecha_fin is None,  # vigente if no end date
        ))
    n = insert_flags(cur, rows, "sancion_inhabilitacion", "OECE-sancionados")
    print(f"  sancionados:               {n:,}")
    return n


def load_inhabilitaciones(cur) -> int:
    path = OECE_DIR / "inhabilitaciones_judiciales.csv"
    if not path.exists():
        print("  [skip] inhabilitaciones_judiciales.csv not found")
        return 0

    rows_raw = read_csv(path)
    rows = []
    for r in rows_raw:
        ruc = (r.get("RUC_DNI") or r.get("RUC/DNI") or "").strip()
        if not ruc:
            continue
        fecha_fin = (r.get("FECHA_FIN") or r.get("FechaFinInhabilitacion") or "").strip() or None
        rows.append((
            "PE", ruc,
            (r.get("NOMBRE_RAZONODENOMINACIONSOCIAL") or r.get("RazonSocial/Nombre") or "")[:200],
            (r.get("ORGANO_JURISDICCIONAL") or r.get("OrganoJurisdiccional") or "")[:200],
            r.get("FECHA_INICIO") or r.get("FechaInicioInhabilitacion") or None,
            fecha_fin,
            fecha_fin is None,
        ))
    n = insert_flags(cur, rows, "inhabilitacion_judicial", "OECE-inhabilitacion-judicial")
    print(f"  inhabilitaciones judiciales: {n:,}")
    return n


def cross_reference(cur) -> int:
    """Mark obras whose supplier_ruc appears in red_flags."""
    cur.execute("SELECT DISTINCT ruc FROM red_flags WHERE country = 'PE'")
    rucs = [row[0] for row in cur.fetchall()]
    print(f"\n  Unique RUCs in red_flags: {len(rucs):,}")

    updated = 0
    for i in range(0, len(rucs), 50):
        chunk = rucs[i : i + 50]
        cur.execute("""
            UPDATE obras SET
                is_red_flag    = TRUE,
                red_flag_types = (
                    SELECT ARRAY_AGG(DISTINCT rf.tipo)
                    FROM red_flags rf
                    WHERE rf.ruc = obras.supplier_ruc AND rf.country = 'PE'
                )
            WHERE supplier_ruc = ANY(%s)
        """, (chunk,))
        updated += cur.rowcount

    return updated


def run():
    OECE_DIR.mkdir(parents=True, exist_ok=True)

    conn = psycopg.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    print("Loading red flags...")
    cur.execute("TRUNCATE red_flags")

    load_penalidades(cur)
    load_sancionados(cur)
    load_inhabilitaciones(cur)
    conn.commit()

    print("\nCross-referencing obras by RUC...")
    updated = cross_reference(cur)
    conn.commit()

    print(f"  obras flagged: {updated:,}")

    cur.execute("SELECT COUNT(*) FROM obras WHERE is_red_flag = TRUE AND is_lima = TRUE")
    lima_flagged = cur.fetchone()[0]
    print(f"  Lima obras flagged: {lima_flagged:,}")

    cur.close()
    conn.close()
    print("\n[ok] Done")


if __name__ == "__main__":
    run()
