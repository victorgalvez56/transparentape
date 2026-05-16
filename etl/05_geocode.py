"""
Assign lat/lng to obras using Lima district centroids (instant) with
Nominatim as fallback for obras that have a specific street address.

Adds a small random jitter to centroid coordinates so points don't stack
on the globe map.

Usage:
    python etl/05_geocode.py
"""

import os
import random
import time
from pathlib import Path

import psycopg
import requests
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / "etl" / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set — copy etl/.env.example to etl/.env")

# Centroids for Lima Metropolitana's 43 districts (lat, lng)
CENTROIDS: dict[str, tuple[float, float]] = {
    "MIRAFLORES":                       (-12.1191, -77.0282),
    "SAN ISIDRO":                       (-12.0974, -77.0378),
    "SANTIAGO DE SURCO":                (-12.1528, -76.9936),
    "SURCO":                            (-12.1528, -76.9936),
    "BARRANCO":                         (-12.1452, -77.0217),
    "SAN BORJA":                        (-12.1097, -76.9978),
    "LA MOLINA":                        (-12.0864, -76.9453),
    "SAN MIGUEL":                       (-12.0773, -77.0904),
    "MAGDALENA DEL MAR":                (-12.0893, -77.0709),
    "PUEBLO LIBRE":                     (-12.0742, -77.0606),
    "JESUS MARIA":                      (-12.0708, -77.0500),
    "LINCE":                            (-12.0844, -77.0353),
    "SURQUILLO":                        (-12.1116, -77.0158),
    "CHORRILLOS":                       (-12.1700, -77.0200),
    "VILLA MARIA DEL TRIUNFO":          (-12.1620, -76.9477),
    "SAN JUAN DE MIRAFLORES":           (-12.1553, -76.9698),
    "VILLA EL SALVADOR":                (-12.2122, -76.9414),
    "LURIN":                            (-12.2759, -76.8691),
    "PACHACAMAC":                       (-12.2324, -76.8703),
    "PUNTA HERMOSA":                    (-12.3371, -76.8178),
    "PUNTA NEGRA":                      (-12.3749, -76.7899),
    "SAN BARTOLO":                      (-12.3793, -76.7717),
    "SANTA MARIA DEL MAR":              (-12.4042, -76.7613),
    "PUCUSANA":                         (-12.4803, -76.7977),
    "BREÑA":                            (-12.0633, -77.0531),
    "BRENA":                            (-12.0633, -77.0531),
    "RIMAC":                            (-12.0272, -77.0308),
    "SAN MARTIN DE PORRES":             (-12.0225, -77.0892),
    "LOS OLIVOS":                       (-11.9939, -77.0736),
    "INDEPENDENCIA":                    (-12.0027, -77.0572),
    "CARABAYLLO":                       (-11.8869, -77.0303),
    "COMAS":                            (-11.9352, -77.0517),
    "PUENTE PIEDRA":                    (-11.8673, -77.0747),
    "SANTA ROSA":                       (-11.7882, -77.1630),
    "ANCON":                            (-11.7752, -77.1597),
    "ATE":                              (-12.0236, -76.9243),
    "ATE - VITARTE":                    (-12.0236, -76.9243),
    "CHACLACAYO":                       (-11.9723, -76.7719),
    "LURIGANCHO":                       (-11.9903, -76.8442),
    "LURIGANCHO (CHOSICA)":             (-11.9903, -76.8442),
    "SANTA ANITA":                      (-12.0461, -76.9714),
    "EL AGUSTINO":                      (-12.0419, -77.0050),
    "SAN JUAN DE LURIGANCHO":           (-11.9853, -77.0072),
    "LA VICTORIA":                      (-12.0706, -77.0197),
    "SAN LUIS":                         (-12.0817, -76.9999),
    "CIENEGUILLA":                      (-12.0548, -76.8200),
    "LIMA":                             (-12.0464, -77.0428),
    "CERCADO DE LIMA":                  (-12.0464, -77.0428),
}

# Department-level centroids for all 25 Peru regions
PERU_DEPT_CENTROIDS: dict[str, tuple[float, float]] = {
    "AMAZONAS":       (-6.2304, -77.8706),
    "ANCASH":         (-9.5240, -77.5306),
    "APURIMAC":       (-13.6385, -73.0875),
    "AREQUIPA":       (-16.3988, -71.5350),
    "AYACUCHO":       (-13.1588, -74.2236),
    "CAJAMARCA":      (-7.1638, -78.5004),
    "CALLAO":         (-12.0566, -77.1184),
    "CUSCO":          (-13.5319, -71.9675),
    "HUANCAVELICA":   (-12.7853, -74.9731),
    "HUANUCO":        (-9.9306, -76.2420),
    "HUÁNUCO":        (-9.9306, -76.2420),
    "ICA":            (-14.0672, -75.7286),
    "JUNIN":          (-11.1578, -75.9926),
    "JUNÍN":          (-11.1578, -75.9926),
    "LA LIBERTAD":    (-8.1120, -79.0270),
    "LAMBAYEQUE":     (-6.7011, -79.9071),
    "LIMA":           (-11.9890, -76.7920),  # Lima province (not metro)
    "LORETO":         (-4.0085, -73.2532),
    "MADRE DE DIOS":  (-12.5933, -69.1891),
    "MOQUEGUA":       (-17.1939, -70.9324),
    "PASCO":          (-10.6851, -76.2599),
    "PIURA":          (-5.1945, -80.6328),
    "PUNO":           (-15.8402, -70.0219),
    "SAN MARTIN":     (-6.5000, -76.3667),
    "SAN MARTÍN":     (-6.5000, -76.3667),
    "TACNA":          (-18.0066, -70.2503),
    "TUMBES":         (-3.5662, -80.4520),
    "UCAYALI":        (-8.3791, -74.5539),
}

JITTER = 0.008  # ~900 m radius spread around centroid


def nominatim(address: str) -> tuple[float, float] | tuple[None, None]:
    try:
        r = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": address, "format": "json", "limit": 1, "countrycodes": "pe"},
            headers={"User-Agent": "SigueElBillete/1.0"},
            timeout=10,
        )
        data = r.json()
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        pass
    return None, None


def reconnect() -> tuple:
    conn = psycopg.connect(DATABASE_URL)
    return conn, conn.cursor()


def run():
    conn, cur = reconnect()

    cur.execute("""
        SELECT id, buyer_locality, buyer_street, buyer_region, is_lima
        FROM obras
        WHERE lat IS NULL
        ORDER BY contract_amount DESC NULLS LAST
    """)
    pending = cur.fetchall()
    print(f"Obras to geocode: {len(pending):,}")

    centroid_hits = nominatim_hits = failed = 0

    for i, (obra_id, locality, street, region, is_lima_flag) in enumerate(pending):
        lat, lng = None, None
        locality_key = (locality or "").upper().strip()
        region_key   = (region or "").upper().strip()

        if is_lima_flag and locality_key in CENTROIDS:
            lat, lng = CENTROIDS[locality_key]
            lat += random.uniform(-JITTER, JITTER)
            lng += random.uniform(-JITTER, JITTER)
            centroid_hits += 1
        elif region_key in PERU_DEPT_CENTROIDS:
            lat, lng = PERU_DEPT_CENTROIDS[region_key]
            lat += random.uniform(-JITTER * 10, JITTER * 10)  # wider jitter for departments
            lng += random.uniform(-JITTER * 10, JITTER * 10)
            centroid_hits += 1
        elif street and nominatim_hits < 500:
            time.sleep(1.1)
            query = f"{street}, {locality}, {region}, Peru" if region else f"{street}, {locality}, Peru"
            lat, lng = nominatim(query)
            if lat:
                nominatim_hits += 1
            else:
                failed += 1
        else:
            failed += 1

        if lat and lng:
            for attempt in range(3):
                try:
                    cur.execute("UPDATE obras SET lat = %s, lng = %s WHERE id = %s", (lat, lng, obra_id))
                    break
                except psycopg.OperationalError:
                    print(f"  [reconnect] lost connection at {i+1}, reconnecting…", flush=True)
                    try:
                        conn.close()
                    except Exception:
                        pass
                    conn, cur = reconnect()

        if (i + 1) % 100 == 0:
            for attempt in range(3):
                try:
                    conn.commit()
                    break
                except psycopg.OperationalError:
                    print(f"  [reconnect] commit failed at {i+1}, reconnecting…", flush=True)
                    try:
                        conn.close()
                    except Exception:
                        pass
                    conn, cur = reconnect()
            print(f"  {i+1:,}/{len(pending):,} — centroid:{centroid_hits} nominatim:{nominatim_hits} failed:{failed}", flush=True)

    for attempt in range(3):
        try:
            conn.commit()
            break
        except psycopg.OperationalError:
            conn, cur = reconnect()

    # Final count via fresh connection to avoid stale state
    conn2, cur2 = reconnect()
    cur2.execute("SELECT COUNT(*) FROM obras WHERE lat IS NOT NULL")
    geocoded = cur2.fetchone()[0]
    cur2.execute("SELECT COUNT(*) FROM obras WHERE lat IS NOT NULL AND is_lima = TRUE")
    geocoded_lima = cur2.fetchone()[0]
    print(f"\n[ok] Geocoded total: {geocoded:,} ({geocoded_lima:,} Lima)")
    print(f"     centroid: {centroid_hits} | nominatim: {nominatim_hits} | failed: {failed}")

    cur.close()
    conn.close()
    cur2.close()
    conn2.close()


if __name__ == "__main__":
    run()
