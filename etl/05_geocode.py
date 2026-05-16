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

# Peru region/province centroids (buyer_region in OCDS uses province names)
PERU_DEPT_CENTROIDS: dict[str, tuple[float, float]] = {
    # Departments
    "AMAZONAS":            (-6.2304, -77.8706),
    "ANCASH":              (-9.5240, -77.5306),
    "APURIMAC":            (-13.6385, -73.0875),
    "AREQUIPA":            (-16.3988, -71.5350),
    "AYACUCHO":            (-13.1588, -74.2236),
    "CAJAMARCA":           (-7.1638, -78.5004),
    "CALLAO":              (-12.0566, -77.1184),
    "CUSCO":               (-13.5319, -71.9675),
    "CUZCO":               (-13.5319, -71.9675),
    "HUANCAVELICA":        (-12.7853, -74.9731),
    "HUANUCO":             (-9.9306, -76.2420),
    "HUÁNUCO":             (-9.9306, -76.2420),
    "ICA":                 (-14.0672, -75.7286),
    "JUNIN":               (-11.1578, -75.9926),
    "JUNÍN":               (-11.1578, -75.9926),
    "LA LIBERTAD":         (-8.1120, -79.0270),
    "LAMBAYEQUE":          (-6.7011, -79.9071),
    "LIMA":                (-11.9890, -76.7920),
    "LORETO":              (-4.0085, -73.2532),
    "MADRE DE DIOS":       (-12.5933, -69.1891),
    "MOQUEGUA":            (-17.1939, -70.9324),
    "PASCO":               (-10.6851, -76.2599),
    "PIURA":               (-5.1945, -80.6328),
    "PUNO":                (-15.8402, -70.0219),
    "SAN MARTIN":          (-6.5000, -76.3667),
    "SAN MARTÍN":          (-6.5000, -76.3667),
    "TACNA":               (-18.0066, -70.2503),
    "TUMBES":              (-3.5662, -80.4520),
    "UCAYALI":             (-8.3791, -74.5539),
    # Provinces (buyer_region often uses province/city name)
    "HUARI":               (-9.4347, -77.1736),   # Ancash
    "SANTA":               (-9.0853, -78.5781),   # Ancash (Chimbote)
    "TRUJILLO":            (-8.1120, -79.0270),   # La Libertad
    "CHINCHA":             (-13.4108, -76.1307),  # Ica
    "CHICLAYO":            (-6.7714, -79.8446),   # Lambayeque
    "HUANCAYO":            (-12.0651, -75.2049),  # Junín
    "CAÑETE":              (-13.0769, -76.3647),  # Lima prov
    "CANETE":              (-13.0769, -76.3647),
    "NAZCA":               (-14.8354, -74.9414),  # Ica
    "NASCA":               (-14.8354, -74.9414),
    "CORONEL PORTILLO":    (-8.3791, -74.5539),   # Ucayali (Pucallpa)
    "MAYNAS":              (-3.7747, -73.2538),   # Loreto (Iquitos)
    "SANCHEZ CARRION":     (-7.8019, -77.9833),   # La Libertad
    "SÁNCHEZ CARRIÓN":     (-7.8019, -77.9833),
    "TAYACAJA":            (-12.4500, -74.9167),  # Huancavelica
    "CHOTA":               (-6.5614, -78.6511),   # Cajamarca
    "HUAURA":              (-11.0945, -77.6058),  # Lima prov
    "PATAZ":               (-8.0000, -77.4000),   # La Libertad
    "SATIPO":              (-11.2550, -74.6364),  # Junín
    "PISCO":               (-13.7089, -76.2027),  # Ica
    "CHACHAPOYAS":         (-6.2281, -77.8714),   # Amazonas
    "CUTERVO":             (-6.3806, -78.8150),   # Cajamarca
    "MORROPON":            (-5.1780, -79.9744),   # Piura
    "MORROPE":             (-6.5253, -80.0158),   # Lambayeque
    "BARRANCA":            (-10.7531, -77.7617),  # Lima prov
    "HUARAZ":              (-9.5270, -77.5284),   # Ancash
    "HUAROCHIRI":          (-12.1500, -76.2167),  # Lima prov
    "HUAROCHIRÍ":          (-12.1500, -76.2167),
    "CANGALLO":            (-13.6167, -74.0000),  # Ayacucho
    "ANDAHUAYLAS":         (-13.6560, -73.3878),  # Apurímac
    "ABANCAY":             (-13.6359, -72.8814),  # Apurímac
    "ESPINAR":             (-14.7897, -71.4083),  # Cusco
    "URUBAMBA":            (-13.3000, -72.1167),  # Cusco
    "QUISPICANCHIS":       (-13.6750, -71.5583),  # Cusco
    "QUISPICANCHI":        (-13.6750, -71.5583),
    "CANCHIS":             (-14.1667, -71.2500),  # Cusco
    "CALCA":               (-13.3333, -71.9667),  # Cusco
    "LA CONVENCIÓN":       (-12.8667, -72.7000),  # Cusco
    "LA CONVENCION":       (-12.8667, -72.7000),
    "ANTA":                (-13.4667, -72.1500),  # Cusco
    "PARINACOCHAS":        (-15.1167, -73.7167),  # Ayacucho
    "SUCRE":               (-14.0500, -73.6333),  # Ayacucho
    "LUCANAS":             (-14.3833, -74.2333),  # Ayacucho
    "HUANTA":              (-12.9333, -74.2500),  # Ayacucho
    "LA MAR":              (-12.9167, -73.8333),  # Ayacucho
    "VILCAS HUAMAN":       (-13.6667, -73.9333),  # Ayacucho
    "VILCASHUAMAN":        (-13.6667, -73.9333),
    "AZANGARO":            (-14.9064, -70.1936),  # Puno
    "MELGAR":              (-14.5275, -70.3644),  # Puno
    "SAN ROMAN":           (-15.5000, -70.1333),  # Puno (Juliaca)
    "SAN ROMÁN":           (-15.5000, -70.1333),
    "CHUCUITO":            (-16.1667, -69.5000),  # Puno
    "EL COLLAO":           (-16.6833, -69.8833),  # Puno
    "HUANCANE":            (-15.1847, -69.7558),  # Puno
    "HUANCANÉ":            (-15.1847, -69.7558),
    "YUNGUYO":             (-16.2333, -69.0833),  # Puno
    "MOYOBAMBA":           (-6.0339, -76.9736),   # San Martín
    "RIOJA":               (-6.0647, -77.1614),   # San Martín
    "LAMAS":               (-6.4194, -76.5200),   # San Martín
    "TOCACHE":             (-8.1833, -76.5167),   # San Martín
    "MARISCAL CACERES":    (-7.5000, -76.5833),   # San Martín
    "MARISCAL CÁCERES":    (-7.5000, -76.5833),
    "BELLAVISTA":          (-7.0609, -76.5897),   # San Martín
    "PICOTA":              (-6.9197, -76.3244),   # San Martín
    "HUALLAGA":            (-6.8558, -76.6803),   # San Martín
    "EL DORADO":           (-6.6000, -76.5833),   # San Martín
    "TARAPOTO":            (-6.4850, -76.3600),   # San Martín
    "REQUENA":             (-5.0500, -73.8667),   # Loreto
    "ALTO AMAZONAS":       (-5.0000, -76.0000),   # Loreto
    "DATEM DEL MARAÑON":   (-4.5000, -76.5000),   # Loreto
    "MARISCAL RAMON CASTILLA": (-4.0000, -70.2000), # Loreto
    "PUTUMAYO":            (-1.0000, -73.8333),   # Loreto
    "ATALAYA":             (-10.7333, -73.7667),  # Ucayali
    "PADRE ABAD":          (-8.8833, -75.0167),   # Ucayali
    "PURUS":               (-10.0667, -70.5333),  # Ucayali
    "CONTUMAZA":           (-7.3667, -78.8167),   # Cajamarca
    "CONTUMAZÁ":           (-7.3667, -78.8167),
    "JAEN":                (-5.7089, -78.8075),   # Cajamarca
    "JAÉN":                (-5.7089, -78.8075),
    "SAN IGNACIO":         (-5.1436, -79.0022),   # Cajamarca
    "SAN MIGUEL":          (-6.9783, -79.0300),   # Cajamarca
    "SAN MARCOS":          (-7.3333, -78.1667),   # Cajamarca
    "CELENDIN":            (-6.8667, -78.1667),   # Cajamarca
    "CELENDÍN":            (-6.8667, -78.1667),
    "GRAN CHIMU":          (-7.6667, -78.6667),   # La Libertad
    "GRAN CHIMÚ":          (-7.6667, -78.6667),
    "ASCOPE":              (-7.7167, -79.1000),   # La Libertad
    "BOLIVAR":             (-7.1833, -77.6667),   # La Libertad
    "BOLÍVAR":             (-7.1833, -77.6667),
    "OTUZCO":              (-7.9000, -78.5667),   # La Libertad
    "VIRU":                (-8.4167, -78.7500),   # La Libertad
    "VIRÚ":                (-8.4167, -78.7500),
    "JULCAN":              (-8.0500, -78.4833),   # La Libertad
    "JULCÁN":              (-8.0500, -78.4833),
    "CHEPEN":              (-7.2258, -79.4308),   # La Libertad
    "CHEPÉN":              (-7.2258, -79.4308),
    "PACASMAYO":           (-7.3997, -79.5697),   # La Libertad
    "FERREÑAFE":           (-6.6372, -79.7858),   # Lambayeque
    "FERRENAFE":           (-6.6372, -79.7858),
    "SULLANA":             (-4.9017, -80.6850),   # Piura
    "TALARA":              (-4.5772, -81.2717),   # Piura
    "PAITA":               (-5.0875, -81.1144),   # Piura
    "AYABACA":             (-4.6367, -79.7175),   # Piura
    "HUANCABAMBA":         (-5.2333, -79.4500),   # Piura
    "SECHURA":             (-5.5567, -80.8178),   # Piura
    "CASTILLA":            (-5.3000, -80.6167),   # Piura (Catacaos area)
    "CONTRALMIRANTE VILLAR": (-3.8000, -80.6167), # Tumbes
    "ZARUMILLA":           (-3.5000, -80.2667),   # Tumbes
    "TACNA":               (-18.0066, -70.2503),  # already above
    "JORGE BASADRE":       (-17.9500, -70.8667),  # Tacna
    "CANDARAVE":           (-17.2667, -70.2333),  # Tacna
    "TARATA":              (-17.4667, -70.0333),  # Tacna
    "MARISCAL NIETO":      (-17.1939, -70.9324),  # Moquegua
    "GENERAL SANCHEZ CERRO": (-16.3333, -70.7167), # Moquegua
    "ILO":                 (-17.6394, -71.3383),  # Moquegua
    "ISLAY":               (-17.0000, -72.0000),  # Arequipa
    "CAMANA":              (-16.6217, -72.7097),  # Arequipa
    "CAMANÁ":              (-16.6217, -72.7097),
    "CAYLLOMA":            (-15.1833, -71.7667),  # Arequipa
    "CASTILLA":            (-15.5000, -72.0000),  # Arequipa (also Piura above, same key)
    "CONDESUYOS":          (-15.5000, -72.5000),  # Arequipa
    "LA UNION":            (-15.3833, -73.0000),  # Arequipa
    "LA UNIÓN":            (-15.3833, -73.0000),
    "CARAVELI":            (-15.7667, -73.3667),  # Arequipa
    "CARAVELÍ":            (-15.7667, -73.3667),
    "YAUYOS":              (-12.4817, -75.9167),  # Lima prov
    "CAJATAMBO":           (-10.4500, -77.0000),  # Lima prov
    "OYON":                (-10.6667, -76.7667),  # Lima prov
    "OYÓN":                (-10.6667, -76.7667),
    "RECUAY":              (-9.7167, -77.4333),   # Ancash
    "OCROS":               (-10.3833, -77.3667),  # Ancash
    "BOLOGNESI":           (-10.1000, -77.2333),  # Ancash
    "HUAMALIES":           (-9.0000, -76.5000),   # Huánuco
    "HUAMALÍES":           (-9.0000, -76.5000),
    "LEONCIO PRADO":       (-9.2833, -76.0000),   # Huánuco (Tingo María)
    "AMBO":                (-10.1333, -76.2000),  # Huánuco
    "DOS DE MAYO":         (-9.5500, -76.7833),   # Huánuco
    "MARAÑON":             (-9.5000, -76.5000),   # Huánuco
    "MARAÑÓN":             (-9.5000, -76.5000),
    "PACHITEA":            (-9.8167, -76.0000),   # Huánuco
    "PUERTO INCA":         (-9.3833, -74.9667),   # Huánuco
    "YAROWILCA":           (-9.7667, -76.7833),   # Huánuco
    "DANIEL ALCIDES CARRION": (-10.6833, -76.6667), # Pasco
    "DANIEL ALCIDES CARRIÓN": (-10.6833, -76.6667),
    "OXAPAMPA":            (-10.5833, -75.4000),  # Pasco
    "CHANCHAMAYO":         (-11.0667, -75.3167),  # Junín
    "CONCEPCION":          (-11.9167, -75.3167),  # Junín
    "CONCEPCIÓN":          (-11.9167, -75.3167),
    "CHUPACA":             (-12.0667, -75.2833),  # Junín
    "JAUJA":               (-11.7789, -75.4978),  # Junín
    "JUNIN":               (-11.1578, -75.9926),  # already above
    "TARMA":               (-11.4194, -75.6881),  # Junín
    "YAULI":               (-11.6667, -75.9167),  # Junín
    "CHINCHEROS":          (-13.6500, -73.7833),  # Apurímac
    "COTABAMBAS":          (-13.8333, -72.2833),  # Apurímac
    "AYMARAES":            (-14.2167, -73.2000),  # Apurímac
    "ANTABAMBA":           (-14.3667, -72.8833),  # Apurímac
    "GRAU":                (-14.1500, -72.5667),  # Apurímac
    "CASTROVIRREYNA":      (-13.4833, -75.2333),  # Huancavelica
    "CHURCAMPA":           (-12.6667, -74.5167),  # Huancavelica
    "HUANCAVELICA":        (-12.7853, -74.9731),  # already above
    "ANGARAES":            (-12.9167, -74.6667),  # Huancavelica
    "ACOBAMBA":            (-12.8500, -74.5667),  # Huancavelica
    "LIRCAY":              (-12.9667, -74.7167),  # Huancavelica (capital Angaraes)
    "CARAVELÍ":            (-15.7667, -73.3667),
    "ESPINAR":             (-14.7897, -71.4083),
    "ANDOAS":              (-3.8333, -75.8333),   # Loreto
    "LANCONES":            (-4.6408, -80.5439),   # Piura
    "CAHUAPANAS":          (-5.3000, -77.0000),   # Loreto
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
