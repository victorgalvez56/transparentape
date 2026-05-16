"""
Download OCDS bulk data from Open Contracting Partnership (Peru).

Usage:
    python etl/01_download_ocds.py                        # all years 2019-2026
    python etl/01_download_ocds.py --year 2024            # single year
    python etl/01_download_ocds.py --from-year 2022       # 2022 onwards

Output:
    data/raw/ocds/<year>.jsonl.gz
"""

import argparse
from pathlib import Path

import requests
from tqdm import tqdm

parser = argparse.ArgumentParser()
parser.add_argument("--year",      type=int, help="Download a single year")
parser.add_argument("--from-year", type=int, default=2019, help="Start of range (default 2019)")
parser.add_argument("--to-year",   type=int, default=2026, help="End of range (default 2026)")
args = parser.parse_args()

ROOT = Path(__file__).parent.parent
OUT_DIR = ROOT / "data" / "raw" / "ocds"
OUT_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL = "https://data.open-contracting.org/en/publication/135/download"

YEARS = [args.year] if args.year else list(range(args.from_year, args.to_year + 1))


def download(year: int):
    filename = f"{year}.jsonl.gz"
    filepath = OUT_DIR / filename

    if filepath.exists():
        mb = filepath.stat().st_size / 1_000_000
        print(f"[skip] {filename} already exists ({mb:.1f} MB)")
        return

    url = f"{BASE_URL}?name={filename}"
    print(f"\nDownloading {filename}...")

    try:
        resp = requests.get(url, stream=True, timeout=60)
        resp.raise_for_status()
    except requests.HTTPError as e:
        print(f"[warn] {filename} not available ({e}) — skipping")
        return

    total = int(resp.headers.get("content-length", 0))
    with open(filepath, "wb") as f, tqdm(total=total, unit="B", unit_scale=True, desc=filename) as bar:
        for chunk in resp.iter_content(chunk_size=16_384):
            f.write(chunk)
            bar.update(len(chunk))

    mb = filepath.stat().st_size / 1_000_000
    print(f"[ok] {filename} — {mb:.1f} MB")


if __name__ == "__main__":
    print(f"Downloading years: {YEARS}")
    for year in YEARS:
        download(year)

    print("\nFiles in data/raw/ocds/:")
    total_mb = 0
    for f in sorted(OUT_DIR.glob("*.jsonl.gz")):
        mb = f.stat().st_size / 1_000_000
        total_mb += mb
        print(f"  {f.name}: {mb:.1f} MB")
    print(f"  Total: {total_mb:.1f} MB")
