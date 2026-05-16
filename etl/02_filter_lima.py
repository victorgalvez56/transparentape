"""
Filter OCDS records down to Lima Metropolitana public works (obras).

Strategy:
- mainProcurementCategory == "works"
- buyer.name contains a Lima district name or "MUNICIPALIDAD METROPOLITANA DE LIMA"

Usage:
    python etl/02_filter_lima.py                  # reads 2024.jsonl.gz
    python etl/02_filter_lima.py --year 2023

Output:
    data/processed/lima_obras_<year>.json
"""

import argparse
import gzip
import json
from collections import Counter
from pathlib import Path

import ijson

parser = argparse.ArgumentParser()
parser.add_argument("--year", type=int, default=2024)
args = parser.parse_args()

ROOT = Path(__file__).parent.parent
INPUT = ROOT / "data" / "raw" / "ocds" / f"{args.year}.jsonl.gz"
OUT_DIR = ROOT / "data" / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT = OUT_DIR / f"lima_obras_{args.year}.json"

# 43 distritos de Lima Metropolitana + entidades metro
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


def is_lima(buyer_name: str) -> bool:
    name = buyer_name.upper()
    if "MUNICIPALIDAD" not in name and "LIMA" not in name:
        return False
    return any(term in name for term in LIMA_TERMS)


def extract(rec: dict) -> dict | None:
    tender = rec.get("tender", {})
    buyer = rec.get("buyer", {})

    if tender.get("mainProcurementCategory") != "works":
        return None
    if not is_lima(buyer.get("name", "")):
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

    items = tender.get("items") or []
    item = items[0] if items else {}
    classification = (item.get("classification") or {}).get("description", "")

    ruc = supplier.get("id", "").replace("PE-RUC-", "")

    return {
        "ocid":                rec.get("ocid", ""),
        "source_year":         args.year,
        "country":             "PE",
        "city":                "lima",
        "buyer_id":            buyer.get("id", ""),
        "buyer_name":          buyer.get("name", ""),
        "buyer_region":        address.get("region", ""),
        "buyer_locality":      address.get("locality", ""),
        "buyer_street":        address.get("streetAddress", ""),
        "tender_id":           tender.get("id", ""),
        "tender_title":        tender.get("title", ""),
        "tender_description":  tender.get("description", ""),
        "item_classification": classification,
        "procurement_method":  tender.get("procurementMethod", ""),
        "tender_amount":       (tender.get("value") or {}).get("amount"),
        "date_published":      tender.get("datePublished", ""),
        "award_date":          award.get("date", ""),
        "award_amount":        (award.get("value") or {}).get("amount"),
        "supplier_id":         supplier.get("id", ""),
        "supplier_name":       supplier.get("name", ""),
        "supplier_ruc":        ruc,
        "contract_id":         contract.get("id", ""),
        "contract_start":      (contract.get("period") or {}).get("startDate", ""),
        "contract_end":        (contract.get("period") or {}).get("endDate", ""),
        "contract_amount":     (contract.get("value") or {}).get("amount"),
        "contract_status":     contract.get("status", ""),
        "n_amendments":        len(contract.get("amendments") or []),
    }


def run():
    if not INPUT.exists():
        print(f"[error] {INPUT} not found — run 01_download_ocds.py first")
        return

    print(f"Scanning {INPUT.name}...")
    records = []
    total = 0
    methods: Counter = Counter()

    with gzip.open(INPUT, "rb") as f:
        for rec in ijson.items(f, "", multiple_values=True):
            total += 1
            row = extract(rec)
            if row:
                records.append(row)
                methods[row["procurement_method"]] += 1
            if total % 50_000 == 0:
                print(f"  {total:,} scanned | {len(records):,} Lima obras found", flush=True)

    print(f"\nTotal scanned:    {total:,}")
    print(f"Lima obras found: {len(records):,}")
    print("\nProcurement methods:")
    for method, count in methods.most_common():
        print(f"  {method or 'N/A':20s} {count:,}")

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False)

    print(f"\n[ok] Saved to {OUTPUT}")


if __name__ == "__main__":
    run()
