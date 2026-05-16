"""
Load Chile public procurement data from ChileCompra OCDS API into obras table.

Fetches licitaciones (tenders) for Santiago (Región Metropolitana) from 2024-2025.
Uses concurrent requests to avoid spending hours on individual API calls.

Target: ~500-1000 Santiago contracts for presentation demo.

Usage:
    python etl/07_load_chile.py
    python etl/07_load_chile.py --months 3  # last N months
    python etl/07_load_chile.py --limit 500 # max records to insert
"""

import argparse
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path

import psycopg
import requests
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / "etl" / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set")

BASE_LIST  = "https://api.mercadopublico.cl/APISOCDS/OCDS/listaOCDSAgnoMes/{year}/{month}/0/{limit}"
BASE_TENDER = "https://api.mercadopublico.cl/APISOCDS/OCDS/tender/{code}"
BASE_AWARD  = "https://api.mercadopublico.cl/APISOCDS/OCDS/award/{code}"

SANTIAGO_REGION = "Región Metropolitana de Santiago"
PAGE_SIZE   = 1000
WORKERS     = 15
TIMEOUT     = 20

# Santiago comunas centroids for geocoding
SANTIAGO_CENTROIDS = {
    "SANTIAGO":           (-33.4372, -70.6506),
    "PROVIDENCIA":        (-33.4326, -70.6141),
    "LAS CONDES":         (-33.4079, -70.5765),
    "VITACURA":           (-33.3830, -70.5833),
    "LO BARNECHEA":       (-33.3500, -70.5167),
    "ÑUÑOA":              (-33.4561, -70.5997),
    "NUNOA":              (-33.4561, -70.5997),
    "LA FLORIDA":         (-33.5167, -70.5833),
    "MAIPU":              (-33.5133, -70.7697),
    "MAIPÚ":              (-33.5133, -70.7697),
    "PUDAHUEL":           (-33.4333, -70.7500),
    "PENALOLEN":          (-33.4833, -70.5333),
    "PEÑALOLÉN":          (-33.4833, -70.5333),
    "MACUL":              (-33.4833, -70.5833),
    "SAN MIGUEL":         (-33.4972, -70.6525),
    "LA CISTERNA":        (-33.5250, -70.6639),
    "EL BOSQUE":          (-33.5667, -70.6667),
    "PEDRO AGUIRRE CERDA":(-33.5000, -70.6667),
    "LO ESPEJO":          (-33.5167, -70.7000),
    "CERRILLOS":          (-33.5000, -70.7333),
    "ESTACION CENTRAL":   (-33.4667, -70.6833),
    "ESTACIÓN CENTRAL":   (-33.4667, -70.6833),
    "QUINTA NORMAL":      (-33.4333, -70.7000),
    "LO PRADO":           (-33.4500, -70.7167),
    "CERRO NAVIA":        (-33.4167, -70.7333),
    "RENCA":              (-33.3833, -70.7333),
    "QUILICURA":          (-33.3667, -70.7333),
    "CONCHALI":           (-33.3833, -70.6667),
    "CONCHALÍ":           (-33.3833, -70.6667),
    "HUECHURABA":         (-33.3500, -70.6500),
    "RECOLETA":           (-33.4167, -70.6333),
    "INDEPENDENCIA":      (-33.4167, -70.6500),
    "LA GRANJA":          (-33.5333, -70.6167),
    "LA PINTANA":         (-33.5833, -70.6167),
    "SAN RAMON":          (-33.5333, -70.6333),
    "SAN RAMÓN":          (-33.5333, -70.6333),
    "LA REINA":           (-33.4500, -70.5667),
    "SAN BERNARDO":       (-33.6000, -70.7000),
    "PUENTE ALTO":        (-33.6167, -70.5833),
    "COLINA":             (-33.2000, -70.6833),
    "LAMPA":              (-33.2833, -70.8833),
    "BUIN":               (-33.7333, -70.7333),
    "PAINE":              (-33.8167, -70.7500),
    "PADRE HURTADO":      (-33.5667, -70.8333),
    "ISLA DE MAIPO":      (-33.7500, -70.9000),
    "EL MONTE":           (-33.6833, -71.0167),
    "MELIPILLA":          (-33.6833, -71.2167),
    "TALAGANTE":          (-33.6667, -70.9333),
    "PEÑAFLOR":           (-33.6000, -70.9000),
    "PENALOR":            (-33.6000, -70.9000),
}

parser = argparse.ArgumentParser()
parser.add_argument("--months", type=int, default=6, help="How many recent months to fetch")
parser.add_argument("--limit",  type=int, default=1000, help="Max records to insert")
args = parser.parse_args()

session = requests.Session()
session.headers.update({"User-Agent": "SigueElBillete/1.0"})


def get_json(url: str) -> dict | None:
    try:
        r = session.get(url, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def fetch_tender(item: dict) -> dict | None:
    ocid = item["ocid"]
    code = ocid.replace("ocds-70d2nz-", "")

    tender_data = get_json(BASE_TENDER.format(code=code))
    if not tender_data:
        return None
    releases = tender_data.get("releases") or []
    if not releases:
        return None
    r = releases[0]

    # Filter for Santiago
    parties = r.get("parties") or []
    buyer_party = next((p for p in parties if "buyer" in (p.get("roles") or [])), {})
    address = buyer_party.get("address") or {}
    region = address.get("region") or ""
    if SANTIAGO_REGION not in region:
        return None

    # Also fetch award
    award_data = get_json(BASE_AWARD.format(code=code))
    award_releases = (award_data or {}).get("releases") or []
    ar = award_releases[0] if award_releases else {}

    awards    = ar.get("awards") or []
    contracts = ar.get("contracts") or []
    award     = next((a for a in awards if a.get("status") == "active"), awards[0] if awards else {})
    contract  = contracts[0] if contracts else {}
    suppliers = award.get("suppliers") or []
    supplier  = suppliers[0] if suppliers else {}

    tender = r.get("tender") or {}
    items  = tender.get("items") or []
    item0  = items[0] if items else {}
    ruc    = supplier.get("id", "").replace("CL-RUT-", "")

    def num(val):
        try: return float(val) if val not in (None, "", "None") else None
        except: return None

    def txt(val):
        return val if val else None

    import random
    locality = address.get("locality") or ""
    lat, lng = None, None
    key = locality.upper().strip()
    if key in SANTIAGO_CENTROIDS:
        lat, lng = SANTIAGO_CENTROIDS[key]
    else:
        # Default to Santiago metro area centroid with wide jitter
        lat, lng = -33.4489, -70.6693
    lat += random.uniform(-0.08, 0.08)
    lng += random.uniform(-0.08, 0.08)

    return {
        "ocid":                txt(ocid),
        "source_year":         int(r.get("date", "2024")[:4]) if r.get("date") else 2024,
        "country":             "CL",
        "city":                "santiago",
        "buyer_id":            txt(buyer_party.get("id")),
        "buyer_name":          txt(buyer_party.get("name")),
        "buyer_region":        txt(region),
        "buyer_locality":      txt(locality),
        "buyer_street":        txt(address.get("streetAddress")),
        "tender_id":           txt(tender.get("id")),
        "tender_title":        txt(tender.get("title")),
        "tender_description":  txt(tender.get("description")),
        "item_classification": txt((item0.get("classification") or {}).get("description")),
        "procurement_method":  txt(tender.get("procurementMethod")),
        "tender_amount":       num((tender.get("value") or {}).get("amount")),
        "date_published":      txt(tender.get("datePublished") or r.get("date")),
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
        "lat":                 lat,
        "lng":                 lng,
    }


INSERT_SQL = """
INSERT INTO obras (
    ocid, source_year, country, city,
    buyer_id, buyer_name, buyer_region, buyer_locality, buyer_street,
    tender_id, tender_title, tender_description, item_classification,
    procurement_method, tender_amount, date_published,
    award_date, award_amount,
    supplier_id, supplier_name, supplier_ruc,
    contract_id, contract_start, contract_end,
    contract_amount, contract_status, n_amendments,
    lat, lng
) VALUES (
    %(ocid)s, %(source_year)s, %(country)s, %(city)s,
    %(buyer_id)s, %(buyer_name)s, %(buyer_region)s, %(buyer_locality)s, %(buyer_street)s,
    %(tender_id)s, %(tender_title)s, %(tender_description)s, %(item_classification)s,
    %(procurement_method)s, %(tender_amount)s, %(date_published)s,
    %(award_date)s, %(award_amount)s,
    %(supplier_id)s, %(supplier_name)s, %(supplier_ruc)s,
    %(contract_id)s, %(contract_start)s, %(contract_end)s,
    %(contract_amount)s, %(contract_status)s, %(n_amendments)s,
    %(lat)s, %(lng)s
)
ON CONFLICT (ocid) DO UPDATE SET
    contract_amount = EXCLUDED.contract_amount,
    contract_status = EXCLUDED.contract_status,
    supplier_name   = EXCLUDED.supplier_name,
    lat             = COALESCE(obras.lat, EXCLUDED.lat),
    lng             = COALESCE(obras.lng, EXCLUDED.lng)
"""


def fetch_month_items(year: int, month: int) -> list[dict]:
    """Fetch all OCIDs for a given month (paginated)."""
    items = []
    offset = 0
    while True:
        url = f"https://api.mercadopublico.cl/APISOCDS/OCDS/listaOCDSAgnoMes/{year}/{month}/{offset}/{offset + PAGE_SIZE}"
        data = get_json(url)
        if not data:
            break
        page = data.get("data") or []
        items.extend(page)
        total = data.get("pagination", {}).get("total", 0)
        offset += len(page)
        if offset >= total or not page:
            break
    return items


def get_months(n: int) -> list[tuple[int, int]]:
    months = []
    d = datetime.now()
    for _ in range(n):
        months.append((d.year, d.month))
        d = d.replace(day=1) - timedelta(days=1)
    return months


def run():
    months = get_months(args.months)
    print(f"Fetching months: {months}")
    print(f"Target: up to {args.limit} Santiago records\n")

    all_items = []
    for year, month in months:
        items = fetch_month_items(year, month)
        print(f"  [{year}/{month:02d}] {len(items):,} OCIDs")
        all_items.extend(items)

    print(f"\nTotal OCIDs to process: {len(all_items):,}")
    print(f"Fetching full records concurrently ({WORKERS} workers)...\n")

    results = []
    fetched = 0
    found   = 0

    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = {executor.submit(fetch_tender, item): item for item in all_items}
        for future in as_completed(futures):
            fetched += 1
            row = future.result()
            if row:
                results.append(row)
                found += 1
            if fetched % 200 == 0:
                print(f"  {fetched:,}/{len(all_items):,} fetched | {found:,} Santiago found", flush=True)
            if found >= args.limit:
                # Cancel remaining futures
                for f in futures:
                    f.cancel()
                break

    print(f"\nSantiago records found: {len(results):,}")

    if not results:
        print("[warn] No records found")
        return

    conn = psycopg.connect(DATABASE_URL)
    cur  = conn.cursor()
    inserted = skipped = 0

    batch_size = 50
    for i in range(0, len(results), batch_size):
        batch = results[i:i + batch_size]
        try:
            cur.executemany(INSERT_SQL, batch)
            conn.commit()
            inserted += len(batch)
        except Exception as e:
            conn.rollback()
            for row in batch:
                try:
                    cur.execute(INSERT_SQL, row)
                    conn.commit()
                    inserted += 1
                except Exception:
                    conn.rollback()
                    skipped += 1

    cur.execute("SELECT COUNT(*) FROM obras WHERE country = 'CL'")
    total_cl = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM obras WHERE country = 'CL' AND lat IS NOT NULL")
    geocoded_cl = cur.fetchone()[0]

    print(f"\n[ok] Inserted: {inserted:,} | Skipped: {skipped:,}")
    print(f"     Chile total in DB: {total_cl:,} ({geocoded_cl:,} geocoded)")

    cur.close()
    conn.close()


if __name__ == "__main__":
    run()
