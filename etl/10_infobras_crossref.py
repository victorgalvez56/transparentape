"""
Step 10: Cross-reference obras (OCDS) ↔ infobras_full.

Matching strategy:
  Pass 1 (SQL): CUI regex extracted from tender_description matched against
                infobras_full.cui — one bulk UPDATE, instant.
  Pass 2 (Python): For each unmatched infobras record, search obras by
                   distinctive name chunk + amount band ±60%, tie-break by
                   contratista similarity.  Only 575 iterations max.

Also updates obras.lat/lng when INFOBRAS has real coordinates and the obra
currently has buyer-office coordinates (common geocoding problem in OCDS data).

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


def get_db():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL env var not set")
    conn = psycopg2.connect(url)
    conn.autocommit = True
    return conn


def normalize(s: Optional[str]) -> str:
    if not s:
        return ""
    nfkd = unicodedata.normalize("NFKD", s)
    ascii_s = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Z0-9 ]", " ", ascii_s.upper())


def best_chunk(name: str) -> str:
    """Extract a distinctive 50-char chunk from an obra name for ILIKE matching."""
    cleaned = re.sub(
        r"^[\s,;:.\-\"']*(EJECUCION|EJECUCIÓN|CONTRATACION|CONTRATACIÓN|CONSULTORIA|"
        r"CONSULTORÍA|SERVICIO|OBRA|SUPERVISION|SUPERVISIÓN)\s+"
        r"(DE\s+(LA\s+)?(OBRA|EJECUCIÓN|EJECUCION)\s*)?[,:;.\s\-]*",
        "",
        name,
        flags=re.IGNORECASE,
    ).strip()
    return cleaned[:50]


# ── Pass 1: bulk CUI match in SQL ────────────────────────────────────────────

CUI_SQL = r"""
WITH cui_extracted AS (
    SELECT id,
           (regexp_matches(
               COALESCE(tender_description, ''),
               '(?:CUI|C[Óó]digo\s+(?:[UÚú]nico)\s+de\s+Inversi[Óó]n)[\s°N°.:]*(\d{6,8})',
               'i'
           ))[1] AS cui
    FROM obras
    WHERE country = 'PE'
      AND infobras_code IS NULL
)
UPDATE obras o
   SET infobras_code = i.codigo_infobras::text
  FROM cui_extracted c
  JOIN infobras_full i ON i.cui = c.cui
 WHERE o.id = c.id
   AND c.cui IS NOT NULL
RETURNING o.id
"""


def pass1_cui(cur) -> int:
    print("Pass 1: CUI bulk match (SQL)...", flush=True)
    cur.execute(CUI_SQL)
    n = cur.rowcount
    print(f"  → {n:,} obras matched by CUI", flush=True)
    return n


# ── Pass 2: iterate infobras records, search obras ───────────────────────────

def pass2_fuzzy(cur, limit: Optional[int]) -> int:
    cur.execute(
        """
        SELECT codigo_infobras, nombre, monto_aprobacion, contratista_nombre
          FROM infobras_full
         WHERE codigo_infobras::text NOT IN (
             SELECT infobras_code FROM obras WHERE infobras_code IS NOT NULL
         )
        """
        + (f" LIMIT {int(limit)}" if limit else "")
    )
    rows = cur.fetchall()
    print(f"Pass 2: fuzzy match for {len(rows):,} unmatched infobras records...", flush=True)

    matched = 0
    start = time.time()

    for i, (codigo, nombre, monto, contratista) in enumerate(rows, 1):
        chunk = best_chunk(nombre or "")
        if len(chunk) < 20:
            continue

        amount = float(monto or 0)

        if amount > 0:
            cur.execute(
                """
                SELECT id, supplier_name
                  FROM obras
                 WHERE country = 'PE'
                   AND infobras_code IS NULL
                   AND tender_description ILIKE %s
                   AND COALESCE(contract_amount, tender_amount) BETWEEN %s AND %s
                 LIMIT 5
                """,
                (f"%{chunk}%", amount * 0.4, amount * 2.5),
            )
        else:
            cur.execute(
                """
                SELECT id, supplier_name
                  FROM obras
                 WHERE country = 'PE'
                   AND infobras_code IS NULL
                   AND tender_description ILIKE %s
                 LIMIT 5
                """,
                (f"%{chunk}%",),
            )

        candidates = cur.fetchall()
        if not candidates:
            continue

        obra_id = candidates[0][0]

        # tie-break by contratista similarity
        if len(candidates) > 1 and contratista:
            cn = normalize(contratista)
            for cid, supplier in candidates:
                sn = normalize(supplier or "")
                if sn and (cn[:10] in sn or sn[:10] in cn):
                    obra_id = cid
                    break

        cur.execute(
            "UPDATE obras SET infobras_code = %s WHERE id = %s",
            (str(codigo), obra_id),
        )
        matched += 1

        if i % 50 == 0 or i == len(rows):
            elapsed = time.time() - start
            rate = i / elapsed if elapsed > 0 else 0
            print(
                f"  [{time.strftime('%H:%M:%S')}] {i:>4}/{len(rows)} · "
                f"matched={matched} · {rate:.1f}/s",
                flush=True,
            )

    print(f"  → {matched:,} obras matched by fuzzy name+amount", flush=True)
    return matched


# ── Coordinate update ─────────────────────────────────────────────────────────

def run_update_coords(conn):
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE obras o
           SET lat = i.lat,
               lng = i.lng
          FROM infobras_full i
         WHERE o.infobras_code = i.codigo_infobras::text
           AND i.lat IS NOT NULL
           AND i.lng IS NOT NULL
           AND o.lat BETWEEN -12.06 AND -12.02
           AND o.lng BETWEEN -77.06 AND -77.02
        RETURNING o.id
        """
    )
    updated = cur.rowcount
    print(f"Updated coordinates for {updated:,} obras from INFOBRAS real locations")
    cur.close()


# ── Main ──────────────────────────────────────────────────────────────────────

def run_crossref(conn, limit: Optional[int], reset: bool):
    cur = conn.cursor()

    if reset:
        print("Reset: clearing all infobras_code values...")
        cur.execute("UPDATE obras SET infobras_code = NULL WHERE infobras_code IS NOT NULL")
        print(f"  cleared {cur.rowcount} rows")

    t0 = time.time()
    n1 = pass1_cui(cur)
    n2 = pass2_fuzzy(cur, limit)

    cur.execute("SELECT COUNT(*) FROM obras WHERE infobras_code IS NOT NULL")
    total_linked = cur.fetchone()[0]

    print(
        f"\nDONE in {time.time()-t0:.1f}s: {n1+n2:,} new matches "
        f"({n1} CUI + {n2} fuzzy) · {total_linked:,} obras total linked"
    )
    cur.close()


def main():
    ap = argparse.ArgumentParser(description="Cross-reference obras ↔ infobras_full")
    ap.add_argument("--limit", type=int, help="Cap Pass 2 infobras records (for testing)")
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
