"""
Download OCDS bulk data from Open Contracting Partnership (Peru).

Usage:
    python etl/01_download_ocds.py           # downloads 2024 (default)
    python etl/01_download_ocds.py --year 2023

Output:
    data/raw/ocds/<year>.jsonl.gz
"""

import argparse
import sys
from pathlib import Path

import requests
from tqdm import tqdm

parser = argparse.ArgumentParser()
parser.add_argument("--year", type=int, default=2024)
args = parser.parse_args()

ROOT = Path(__file__).parent.parent
OUT_DIR = ROOT / "data" / "raw" / "ocds"
OUT_DIR.mkdir(parents=True, exist_ok=True)

FILENAME = f"{args.year}.jsonl.gz"
FILEPATH = OUT_DIR / FILENAME
BASE_URL = "https://data.open-contracting.org/en/publication/135/download"


def download():
    if FILEPATH.exists():
        mb = FILEPATH.stat().st_size / 1_000_000
        print(f"[skip] {FILENAME} already exists ({mb:.1f} MB)")
        return

    url = f"{BASE_URL}?name={FILENAME}"
    print(f"Downloading {FILENAME} from Open Contracting Partnership...")

    resp = requests.get(url, stream=True, timeout=60)
    resp.raise_for_status()

    total = int(resp.headers.get("content-length", 0))
    with open(FILEPATH, "wb") as f, tqdm(total=total, unit="B", unit_scale=True, desc=FILENAME) as bar:
        for chunk in resp.iter_content(chunk_size=16_384):
            f.write(chunk)
            bar.update(len(chunk))

    mb = FILEPATH.stat().st_size / 1_000_000
    print(f"[ok] Saved to {FILEPATH} ({mb:.1f} MB)")


def peek(n=3):
    """Print the first N records to verify structure."""
    import gzip, json

    print(f"\nFirst {n} records:\n" + "-" * 40)
    with gzip.open(FILEPATH, "rt", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= n:
                break
            rec = json.loads(line)
            buyer = rec.get("buyer", {})
            tender = rec.get("tender", {})
            print(f"  ocid:   {rec.get('ocid', 'N/A')}")
            print(f"  buyer:  {buyer.get('name', 'N/A')}")
            print(f"  method: {tender.get('procurementMethod', 'N/A')}")
            print(f"  cat:    {tender.get('mainProcurementCategory', 'N/A')}")
            print()


if __name__ == "__main__":
    download()
    peek()
