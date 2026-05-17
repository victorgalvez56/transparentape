"""
Step 10: Cross-reference obras (OCDS) ↔ infobras_full.

Matching strategy per obra:
  1. CUI exact match (extracted from tender_description via regex)
  2. Distinctive name substring + amount band ±60%
  3. Tie-break by contratista name similarity

Also updates obras.lat/lng when INFOBRAS has real coordinates and the obra
currently has buyer-office coordinates (common geocoding problem in the OCDS data).

Usage:
  DATABASE_URL='postgresql://...' python etl/10_infobras_crossref.py
  DATABASE_URL='postgresql://...' python etl/10_infobras_crossref.py --limit 200
  DATABASE_URL='postgresql://...' python etl/10_infobras_crossref.py --reset
  DATABASE_URL='postgresql://...' python etl/10_infobras_crossref.py --update-coords
"""

import argparse
import os
import re
import sys
import time
import unicodedata
from typing import Optional

import psycopg2

CUI_RE = re.compile(
    r"(?:CUI|C[óo]digo\s+(?:Único|Unico)\s+de\s+Inversi[óo]n)[\s°N°.:]*(\d{6,8})",
    re.IGNORECASE,
)


def get_db():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL env var not set")
    conn = psycopg2.connect(url)
    conn.autocommit = True
    return conn


def extract_cui(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    m = CUI_RE.search(text)
    return m.group(1) if m else None


def normalize(s: Optional[str]) -> str:
    if not s:
        return ""
    nfkd = unicodedata.normalize("NFKD", s)
    ascii_s = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Z0-9 ]", " ", ascii_s.upper())


def best_chunk(desc: str) -> str:
    cleaned = re.sub(
        r"^[\s,;:.\-\"']*(EJECUCION|EJECUCIÓN|CONTRATACION|CONTRATACIÓN|CONSULTORIA|"
        r"CONSULTORÍA|SERVICIO|OBRA|SUPERVISION|SUPERVISIÓN)\s+"
        r"(DE\s+(LA\s+)?(OBRA|EJECUCIÓN|EJECUCION)\s*)?[,:;.\s\-]*",
        "",
        desc,
        flags=re.IGNORECASE,
    ).strip()
    return cleaned[:60]


def cross_one(cur, obra: dict) -> Optional[int]:
    desc = obra.get("tender_description") or ""
    supplier = obra.get("supplier_name") or ""
    amount = float(obra.get("contract_amount") or obra.get("tender_amount") or 0)

    # 1) CUI exact match
    cui = extract_cui(desc)
    if cui:
        cur.execute(
            "SELECT codigo_infobras FROM infobras_full WHERE cui = %s LIMIT 1", (cui,)
        )
        row = cur.fetchone()
        if row:
            return row[0]

    # 2) Distinctive chunk + amount band
    chunk = best_chunk(desc)
    if len(chunk) < 20:
        return None

    if amount > 0:
        cur.execute(
            """
            SELECT codigo_infobras, contratista_nombre
              FROM infobras_full
             WHERE nombre ILIKE %s
               AND monto_aprobacion BETWEEN %s AND %s
             LIMIT 5
            """,
            (f"%{chunk[:50]}%", amount * 0.4, amount * 2.5),
        )
    else:
        cur.execute(
            "SELECT codigo_infobras, contratista_nombre FROM infobras_full "
            "WHERE nombre ILIKE %s LIMIT 5",
            (f"%{chunk[:50]}%",),
        )

    candidates = cur.fetchall()
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0][0]

    # 3) Tie-break by contratista name similarity
    sup_norm = normalize(supplier)
    if sup_norm:
        for cod, contratista in candidates:
            cn = normalize(contratista)
            if cn and (cn[:10] in sup_norm or sup_norm[:10] in cn):
                return cod

    return candidates[0][0]


def run_crossref(conn, limit: Optional[int], reset: bool):
    cur = conn.cursor()

    if reset:
        print("Reset: clearing all infobras_code values...")
        cur.execute("UPDATE obras SET infobras_code = NULL WHERE infobras_code IS NOT NULL")
        print(f"  cleared {cur.rowcount} rows")

    cur.execute(
        """
        SELECT id, tender_description, buyer_name, supplier_name,
               contract_amount, tender_amount
          FROM obras
         WHERE country = 'PE'
           AND infobras_code IS NULL
         ORDER BY contract_amount DESC NULLS LAST
        """
        + (f" LIMIT {int(limit)}" if limit else "")
    )
    rows = cur.fetchall()
    cols = [c[0] for c in cur.description]
    obras = [dict(zip(cols, r)) for r in rows]
    print(f"Pending obras: {len(obras):,}", flush=True)

    matched = no_match = 0
    start = time.time()
    last_log = start

    for i, obra in enumerate(obras, 1):
        try:
            cod = cross_one(cur, obra)
            if cod is not None:
                cur.execute(
                    "UPDATE obras SET infobras_code = %s WHERE id = %s",
                    (str(cod), obra["id"]),
                )
                matched += 1
            else:
                no_match += 1
        except Exception as e:
            print(f"  ERR id={obra['id']}: {str(e)[:80]}", file=sys.stderr)
            no_match += 1

        now = time.time()
        if now - last_log > 5 or i == len(obras):
            last_log = now
            rate = i / (now - start) if now > start else 0
            eta = (len(obras) - i) / rate if rate > 0 else 0
            print(
                f"  [{time.strftime('%H:%M:%S')}] {i:>6}/{len(obras)} · "
                f"matched={matched} no_match={no_match} · "
                f"hit_rate={100*matched/i:.0f}% · {rate:.0f}/s · ETA {eta/60:.0f}min",
                flush=True,
            )

    print(f"\nDONE: {matched:,} matched · {no_match:,} no_match · "
          f"{100*matched/max(1, len(obras)):.0f}% hit rate")
    cur.close()


def run_update_coords(conn):
    """
    Copy lat/lng from infobras_full to obras when:
    - The obra has an infobras_code match
    - infobras_full has non-null coordinates
    - The current obra coordinates look like a Lima centroid (buyer office geocoding)
    """
    cur = conn.cursor()

    # Lima centroid area: many obras geocoded to ~(-12.04, -77.04) ± 0.02
    cur.execute(
        """
        UPDATE obras o
           SET lat = i.lat,
               lng = i.lng
          FROM infobras_full i
         WHERE o.infobras_code = i.codigo_infobras::text
           AND i.lat IS NOT NULL
           AND i.lng IS NOT NULL
           AND (
               -- current coords are buyer-office centroid (Lima downtown square)
               o.lat BETWEEN -12.06 AND -12.02
               AND o.lng BETWEEN -77.06 AND -77.02
           )
        RETURNING o.id
        """
    )
    updated = cur.rowcount
    print(f"Updated coordinates for {updated:,} obras from INFOBRAS real locations")
    cur.close()


def main():
    ap = argparse.ArgumentParser(description="Cross-reference obras ↔ infobras_full")
    ap.add_argument("--limit", type=int, help="Process only first N obras (for testing)")
    ap.add_argument("--reset", action="store_true",
                    help="Clear all infobras_code values before processing")
    ap.add_argument("--update-coords", action="store_true",
                    help="Update obras.lat/lng from INFOBRAS real coordinates")
    args = ap.parse_args()

    if not os.environ.get("DATABASE_URL"):
        print("ERROR: DATABASE_URL env var required", file=sys.stderr)
        sys.exit(2)

    conn = get_db()

    if args.update_coords:
        run_update_coords(conn)
    else:
        run_crossref(conn, args.limit, args.reset)

    conn.close()


if __name__ == "__main__":
    main()
