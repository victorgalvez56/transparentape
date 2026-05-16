"""
Load filtered Lima obras into Supabase.

Reads DATABASE_URL from etl/.env (copy from .env.example).
Assumes the schema from supabase/migrations/01_obras.sql is already applied.

Usage:
    python etl/03_load_supabase.py              # loads lima_obras_2024.json
    python etl/03_load_supabase.py --year 2023

On conflict (same ocid) the row is updated in place.
"""

import argparse
import json
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

parser = argparse.ArgumentParser()
parser.add_argument("--year", type=int, default=2024)
args = parser.parse_args()

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / "etl" / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set — copy etl/.env.example to etl/.env and fill it in")

INPUT = ROOT / "data" / "processed" / f"lima_obras_{args.year}.json"

INSERT_SQL = """
INSERT INTO obras (
    ocid, source_year, country, city,
    buyer_id, buyer_name, buyer_region, buyer_locality, buyer_street,
    tender_id, tender_title, tender_description, item_classification,
    procurement_method, tender_amount, date_published,
    award_date, award_amount,
    supplier_id, supplier_name, supplier_ruc,
    contract_id, contract_start, contract_end,
    contract_amount, contract_status, n_amendments
) VALUES (
    %(ocid)s, %(source_year)s, %(country)s, %(city)s,
    %(buyer_id)s, %(buyer_name)s, %(buyer_region)s, %(buyer_locality)s, %(buyer_street)s,
    %(tender_id)s, %(tender_title)s, %(tender_description)s, %(item_classification)s,
    %(procurement_method)s, %(tender_amount)s, %(date_published)s,
    %(award_date)s, %(award_amount)s,
    %(supplier_id)s, %(supplier_name)s, %(supplier_ruc)s,
    %(contract_id)s, %(contract_start)s, %(contract_end)s,
    %(contract_amount)s, %(contract_status)s, %(n_amendments)s
)
ON CONFLICT (ocid) DO UPDATE SET
    contract_amount   = EXCLUDED.contract_amount,
    contract_status   = EXCLUDED.contract_status,
    n_amendments      = EXCLUDED.n_amendments,
    supplier_name     = EXCLUDED.supplier_name
"""

BATCH_SIZE = 200


def clean(rec: dict) -> dict:
    """Normalize empty strings to None and cast numeric fields."""
    for key in ("tender_amount", "award_amount", "contract_amount"):
        val = rec.get(key)
        rec[key] = float(val) if val not in (None, "", "None") else None
    for key in ("n_amendments",):
        rec[key] = int(rec.get(key) or 0)
    for key in list(rec.keys()):
        if rec[key] == "":
            rec[key] = None
    return rec


def run():
    if not INPUT.exists():
        print(f"[error] {INPUT} not found — run 02_filter_lima.py first")
        return

    with open(INPUT, encoding="utf-8") as f:
        records = json.load(f)

    print(f"Loaded {len(records):,} records from {INPUT.name}")

    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

    inserted = skipped = 0

    for i in range(0, len(records), BATCH_SIZE):
        batch = [clean(r) for r in records[i : i + BATCH_SIZE]]
        try:
            cur.executemany(INSERT_SQL, batch)
            conn.commit()
            inserted += len(batch)
        except Exception:
            conn.rollback()
            for row in batch:
                try:
                    cur.execute(INSERT_SQL, row)
                    conn.commit()
                    inserted += 1
                except Exception:
                    conn.rollback()
                    skipped += 1

        print(f"  {inserted:,} inserted | {skipped} skipped", end="\r", flush=True)

    print(f"\n[ok] {inserted:,} rows inserted, {skipped} skipped")

    cur.execute("SELECT COUNT(*), source_year FROM obras GROUP BY source_year ORDER BY source_year")
    print("\nDB totals by year:")
    for count, year in cur.fetchall():
        print(f"  {year}: {count:,}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    run()
