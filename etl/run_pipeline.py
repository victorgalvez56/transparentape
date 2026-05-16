"""
Run the full ETL pipeline for all years (2019-2026).

Steps per year:
  1. Filter Lima obras from downloaded JSONL
  2. Load filtered obras into Supabase
After all years:
  3. Load red flags and cross-reference obras
  4. Geocode obras without lat/lng

Usage:
    python etl/run_pipeline.py                    # all years
    python etl/run_pipeline.py --from-year 2022   # 2022 onwards
    python etl/run_pipeline.py --year 2024         # single year
"""

import argparse
import gzip
import json
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

parser = argparse.ArgumentParser()
parser.add_argument("--year",      type=int, help="Single year")
parser.add_argument("--from-year", type=int, default=2019)
parser.add_argument("--to-year",   type=int, default=2026)
args = parser.parse_args()

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / "etl" / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set — copy etl/.env.example to etl/.env")

YEARS = [args.year] if args.year else list(range(args.from_year, args.to_year + 1))

RAW_DIR = ROOT / "data" / "raw" / "ocds"
PROC_DIR = ROOT / "data" / "processed"
PROC_DIR.mkdir(parents=True, exist_ok=True)

# 43 distritos Lima Metropolitana
LIMA_TERMS = [
    "MIRAFLORES", "SAN ISIDRO", "SANTIAGO DE SURCO", "BARRANCO", "SAN BORJA",
    "LA MOLINA", "SAN MIGUEL", "MAGDALENA DEL MAR", "PUEBLO LIBRE",
    "JESUS MARIA", "LINCE", "SURQUILLO", "CHORRILLOS",
    "VILLA MARIA DEL TRIUNFO", "SAN JUAN DE MIRAFLORES", "VILLA EL SALVADOR",
    "LURIN", "PACHACAMAC", "PUNTA HERMOSA", "PUNTA NEGRA", "SAN BARTOLO",
    "SANTA MARIA DEL MAR", "PUCUSANA", "BREÑA", "BRENA", "RIMAC",
    "SAN MARTIN DE PORRES", "LOS OLIVOS", "INDEPENDENCIA", "CARABAYLLO",
    "COMAS", "PUENTE PIEDRA", "SANTA ROSA", "ANCON",
    "ATE", "CHACLACAYO", "LURIGANCHO", "SANTA ANITA", "EL AGUSTINO",
    "SAN JUAN DE LURIGANCHO", "LA VICTORIA", "SAN LUIS",
    "MUNICIPALIDAD METROPOLITANA DE LIMA", "MUNICIPALIDAD PROVINCIAL DE LIMA",
]

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
    contract_amount = EXCLUDED.contract_amount,
    contract_status = EXCLUDED.contract_status,
    n_amendments    = EXCLUDED.n_amendments,
    supplier_name   = EXCLUDED.supplier_name
"""


def is_lima(buyer_name: str, region: str = "", locality: str = "") -> bool:
    """Match Lima obras by buyer name OR address (region/locality)."""
    haystack = f"{buyer_name} {region} {locality}".upper()
    # Must have at least one Lima signal
    if "LIMA" not in haystack and not any(t in haystack for t in LIMA_TERMS):
        return False
    # Exclude other Peruvian departments that contain "LIMA" in entity names
    # (e.g. "LIMA" appears in some non-Lima province names too)
    # Allow anything that explicitly mentions a Lima district OR "LIMA" in region/locality
    return (
        any(t in haystack for t in LIMA_TERMS)
        or "LIMA" in f"{region} {locality}".upper()
    )


def extract(rec: dict, year: int) -> dict | None:
    tender = rec.get("tender", {})
    buyer = rec.get("buyer", {})

    if tender.get("mainProcurementCategory") != "works":
        return None

    awards = rec.get("awards") or []
    award = next((a for a in awards if a.get("status") == "active"), awards[0] if awards else {})
    suppliers = award.get("suppliers") or []
    supplier = suppliers[0] if suppliers else {}

    contracts = rec.get("contracts") or []
    contract = contracts[0] if contracts else {}

    parties = rec.get("parties") or []
    buyer_party = next((p for p in parties if p.get("id") == buyer.get("id")), {})
    address = buyer_party.get("address", {})
    region   = address.get("region", "")
    locality = address.get("locality", "")

    items = tender.get("items") or []
    item = items[0] if items else {}
    classification = (item.get("classification") or {}).get("description", "")
    ruc = supplier.get("id", "").replace("PE-RUC-", "")

    # Derive city from region: 'lima' if LIMA department, else lowercased region
    city = "lima" if "LIMA" in (region or "").upper() else (region or "peru").lower()

    def num(val):
        try: return float(val) if val not in (None, "", "None") else None
        except: return None

    def txt(val):
        return val if val else None

    return {
        "ocid":                txt(rec.get("ocid")),
        "source_year":         year,
        "country":             "PE",
        "city":                city,
        "buyer_id":            txt(buyer.get("id")),
        "buyer_name":          txt(buyer.get("name")),
        "buyer_region":        txt(address.get("region")),
        "buyer_locality":      txt(address.get("locality")),
        "buyer_street":        txt(address.get("streetAddress")),
        "tender_id":           txt(tender.get("id")),
        "tender_title":        txt(tender.get("title")),
        "tender_description":  txt(tender.get("description")),
        "item_classification": txt(classification),
        "procurement_method":  txt(tender.get("procurementMethod")),
        "tender_amount":       num((tender.get("value") or {}).get("amount")),
        "date_published":      txt(tender.get("datePublished")),
        "award_date":          txt(award.get("date")),
        "award_amount":        num((award.get("value") or {}).get("amount")),
        "supplier_id":         txt(supplier.get("id")),
        "supplier_name":       txt(supplier.get("name")),
        "supplier_ruc":        txt(ruc),
        "contract_id":         txt(contract.get("id")),
        "contract_start":      txt((contract.get("period") or {}).get("startDate")),
        "contract_end":        txt((contract.get("period") or {}).get("endDate")),
        "contract_amount":     num((contract.get("value") or {}).get("amount")),
        "contract_status":     txt(contract.get("status")),
        "n_amendments":        len(contract.get("amendments") or []),
    }


def process_year(year: int, conn) -> int:
    filepath = RAW_DIR / f"{year}.jsonl.gz"
    if not filepath.exists():
        print(f"  [skip] {year}.jsonl.gz not found")
        return 0

    import ijson
    print(f"\n--- {year} ---")
    records = []
    total = 0

    with gzip.open(filepath, "rb") as f:
        for rec in ijson.items(f, "", multiple_values=True):
            total += 1
            row = extract(rec, year)
            if row:
                records.append(row)
            if total % 50_000 == 0:
                print(f"  scanned {total:,} | found {len(records):,}", flush=True)

    print(f"  scanned {total:,} total | {len(records):,} obras")

    if not records:
        return 0

    cur = conn.cursor()
    inserted = skipped = 0
    batch_size = 200

    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
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

    print(f"  inserted {inserted:,} | skipped {skipped}")
    cur.close()
    return inserted


def run():
    print(f"Pipeline years: {YEARS}")
    conn = psycopg.connect(DATABASE_URL)

    total_inserted = 0
    for year in YEARS:
        total_inserted += process_year(year, conn)

    conn.close()

    print(f"\n{'='*40}")
    print(f"Total inserted: {total_inserted:,}")

    # Quick DB summary
    conn2 = psycopg.connect(DATABASE_URL)
    cur = conn2.cursor()
    cur.execute("SELECT source_year, COUNT(*) FROM obras GROUP BY source_year ORDER BY source_year")
    print("\nObras por año en DB:")
    for year, count in cur.fetchall():
        print(f"  {year}: {count:,}")
    cur.execute("SELECT COUNT(*) FROM obras")
    print(f"Total Perú: {cur.fetchone()[0]:,}")
    cur.execute("SELECT COUNT(*) FROM obras WHERE is_lima = TRUE")
    print(f"Total Lima: {cur.fetchone()[0]:,}")
    cur.close()
    conn2.close()

    print("\nNext steps:")
    print("  python etl/04_load_red_flags.py   # load OECE sanctions")
    print("  python etl/05_geocode.py           # assign lat/lng")


if __name__ == "__main__":
    run()
