"""
Step 9: Scrape full INFOBRAS data per obra (no authentication required).

Endpoints (all public):
  GET /InfobrasWeb/Mapa/Sumario?obraId=X
  GET /InfobrasWeb/Mapa/DatosEjecucion?obraId=X
  GET /InfobrasWeb/ImagenAerea/GetImagenesAereasJson?codigoObra=X

Usage:
  # Test one obra and print JSON
  python etl/09_infobras_scrape.py 113620

  # Scrape one and save to DB
  DATABASE_URL='postgresql://...' python etl/09_infobras_scrape.py 113620 --save

  # Batch from a CSV with column 'codigo_infobras'
  DATABASE_URL='postgresql://...' python etl/09_infobras_scrape.py --batch ids.csv --save

  # Discover IDs from obras table (CUI-based) then scrape
  DATABASE_URL='postgresql://...' python etl/09_infobras_scrape.py --from-db --save
"""

import argparse
import concurrent.futures
import csv
import html as html_mod
import json
import os
import re
import sys
import threading
import time
from typing import Any, Optional
from urllib.parse import unquote

import requests
from bs4 import BeautifulSoup

BASE = "https://infobras.contraloria.gob.pe/InfobrasWeb"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

from requests.adapters import HTTPAdapter

session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept-Language": "es-PE,es;q=0.9,en;q=0.8"})
_adapter = HTTPAdapter(pool_connections=50, pool_maxsize=50)
session.mount("https://", _adapter)
session.mount("http://", _adapter)


# ── helpers ──────────────────────────────────────────────────────────────────

def clean(s: Optional[str]) -> Optional[str]:
    if not s:
        return s
    s = html_mod.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def fetch(path: str, retries: int = 3) -> str:
    url = f"{BASE}/{path}"
    for i in range(retries):
        try:
            r = session.get(url, timeout=30)
            if r.status_code == 200:
                return r.text
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(1 + i)
    raise RuntimeError(f"failed to fetch {url}")


def _safe_json(path: str) -> dict:
    try:
        return json.loads(fetch(path))
    except Exception:
        return {}


def label_value_pairs(soup: BeautifulSoup) -> dict[str, str]:
    out: dict[str, str] = {}

    def first_text_after(node, max_steps=8):
        cur = node
        for _ in range(max_steps):
            cur = cur.find_next(["div", "h4", "h5", "h6", "span", "p"])
            if not cur:
                return None
            txt = cur.get_text(" ", strip=True)
            if txt:
                return cur, txt
        return None

    for h in soup.find_all(["h4", "h5"]):
        label = h.get_text(" ", strip=True)
        if not label or len(label) > 80:
            continue
        nxt = first_text_after(h)
        if nxt:
            el, val = nxt
            if val and val != label and label not in out:
                out[label] = val

    for d in soup.find_all("div"):
        cls = d.get("class") or []
        if "description-text" in cls and "heading-text" in cls:
            label = d.get_text(" ", strip=True)
            if label and len(label) <= 80:
                sib = d.find_next("h4")
                if sib:
                    val = sib.get_text(" ", strip=True)
                    if val and val != label:
                        out[label] = val

    return out


def extract_var_array(html: str, var_name: str) -> Optional[list]:
    m = re.search(re.escape(f"var {var_name}") + r"\s*=\s*(\[.*?\])\s*;", html, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except Exception:
        return None


def extract_progress_pct(html: str) -> Optional[float]:
    m = re.search(r'id="barra-progreso"[^>]*data-porcentaje="([\d.]+)"', html)
    return float(m.group(1)) if m else None


def extract_files(html: str) -> dict[str, list[dict]]:
    pdfs: list[dict] = []
    seen_pdf: set = set()
    for m in re.finditer(
        r'/InfobrasWeb/Mapa/DownloadFile\?filename=([^&"\']+)&(?:amp;)?name=([^&"\']+)'
        r'(?:&(?:amp;)?contentType=([^&"\']+))?(?:&(?:amp;)?extension=([^"\'<>&]+))?',
        html,
    ):
        fn, name = unquote(m.group(1)), unquote(m.group(2))
        key = (fn, name)
        if key in seen_pdf:
            continue
        seen_pdf.add(key)
        ct = unquote(m.group(3)) if m.group(3) else None
        ext = unquote(m.group(4)) if m.group(4) else None
        pdfs.append({
            "filename_id": fn, "name": name, "content_type": ct, "extension": ext,
            "url": f"{BASE}/Mapa/DownloadFile?filename={m.group(1)}&name={m.group(2)}"
                   + (f"&contentType={m.group(3)}" if m.group(3) else "")
                   + (f"&extension={m.group(4)}" if m.group(4) else ""),
        })

    imgs: list[dict] = []
    seen_img: set = set()
    for m in re.finditer(
        r'/InfobrasWeb/Archivo/ShowFile\?filename=([^&"\']+)(?:&(?:amp;)?contentType=([^"\'<>&]+))?',
        html,
    ):
        fn = unquote(m.group(1))
        if fn in seen_img:
            continue
        seen_img.add(fn)
        ct = unquote(m.group(2)) if m.group(2) else None
        imgs.append({
            "filename_id": fn, "content_type": ct,
            "url": f"{BASE}/Archivo/ShowFile?filename={m.group(1)}"
                   + (f"&contentType={m.group(2)}" if m.group(2) else ""),
        })
    return {"pdfs": pdfs, "images": imgs}


def num(s: Optional[str]) -> Optional[float]:
    if not s:
        return None
    s = s.replace("S/", "").replace("S/.", "").replace(",", "").strip()
    s = re.sub(r"[^\d.\-]", "", s)
    try:
        return float(s) if s else None
    except Exception:
        return None


def _find_near_label(soup: BeautifulSoup, label_text: str) -> Optional[str]:
    label_norm = (label_text.upper()
                  .replace("Á","A").replace("Ó","O").replace("Í","I")
                  .replace("Ú","U").replace("É","E"))
    for el in soup.find_all(string=lambda t: t and label_norm in
                            t.upper().replace("Á","A").replace("Ó","O")
                            .replace("Í","I").replace("Ú","U").replace("É","E")):
        parent = el.parent
        nxt = parent.find_next(["h4", "h5", "span", "div"])
        for _ in range(5):
            if nxt and nxt.name in ("h4", "h5"):
                txt = nxt.get_text(strip=True)
                if txt and txt.upper() != label_norm:
                    return txt
            nxt = nxt.find_next(["h4", "h5", "span", "div"]) if nxt else None
            if not nxt:
                break
    return None


# ── core scraping ─────────────────────────────────────────────────────────────

def scrape_obra(codigo: int) -> dict[str, Any]:
    out: dict[str, Any] = {"codigo_infobras": codigo, "scraped_at": time.time()}

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        f_sumario = ex.submit(fetch, f"Mapa/Sumario?obraId={codigo}")
        f_ejec = ex.submit(fetch, f"Mapa/DatosEjecucion?obraId={codigo}")
        f_aereas = ex.submit(_safe_json, f"ImagenAerea/GetImagenesAereasJson?codigoObra={codigo}")
        f_coords = ex.submit(_safe_json, f"Mapa/MapaEstadistico/ZoomObra?param={codigo}")
        sumario_html = f_sumario.result()
        try:
            ejec_html = f_ejec.result()
        except Exception as e:
            ejec_html = ""
            out["_warn_ejec"] = str(e)
        aereas_data = f_aereas.result()
        coords_data = f_coords.result()

    out["raw_html_size"] = len(sumario_html)
    soup = BeautifulSoup(sumario_html, "html.parser")
    pairs = label_value_pairs(soup)

    out["nombre"] = clean(pairs.get("NOMBRE DE OBRA"))
    out["estado"] = clean(pairs.get("ESTADO DE OBRA"))
    out["modalidad"] = clean(pairs.get("MODALIDAD"))
    out["entidad_nombre"] = clean(pairs.get("ENTIDAD RESPONSABLE DE LA OBRA"))
    out["fecha_inicio"] = clean(pairs.get("FECHA DE INICIO"))
    out["fecha_fin_programada"] = clean(pairs.get("FECHA DE FIN"))
    out["fecha_ultimo_avance"] = clean(pairs.get("FECHA DEL ULTIMO AVANCE"))
    out["contrato_numero"] = clean(pairs.get("CONTRATO"))
    out["contrato_fecha"] = clean(pairs.get("FECHA DE CONTRATO"))
    out["contratista_nombre"] = clean(pairs.get("CONTRATISTA"))
    out["doc_aprobacion"] = clean(pairs.get("DOCUMENTO DE APROBACIÓN") or pairs.get("DOCUMENTO DE APROBACION"))
    out["fecha_aprobacion"] = clean(pairs.get("FECHA DE APROBACIÓN") or pairs.get("FECHA DE APROBACION"))
    out["monto_aprobacion"] = num(pairs.get("MONTO DE APROBACIÓN") or pairs.get("MONTO DE APROBACION"))
    out["ubicacion_geografica"] = clean(pairs.get("UBICACIÓN GEOGRÁFICA") or pairs.get("UBICACION GEOGRAFICA"))
    out["direccion"] = clean(pairs.get("DIRECCIÓN") or pairs.get("DIRECCION"))
    out["cui"] = _find_near_label(soup, "CÓDIGO ÚNICO DE INVERSIÓN")
    out["snip"] = out["cui"]
    out["avance_fisico_pct"] = extract_progress_pct(sumario_html)
    out["tiene_informe_control"] = "informes de control gubernamental" in sumario_html.lower()

    if ejec_html:
        avances = extract_var_array(ejec_html, "lAvances") or []
        out["avances_mensuales"] = avances
        out["n_avances_mensuales"] = len(avances)
        ej_files = extract_files(ejec_html)
        modif_pdfs = [p for p in ej_files["pdfs"] if "AmpPlazo" in p["name"] or "ActAPlazo" in p["name"]]
        out["n_modificaciones_plazo"] = len(modif_pdfs)
    else:
        out["avances_mensuales"] = []
        out["n_avances_mensuales"] = 0
        out["n_modificaciones_plazo"] = 0
        ej_files = {"pdfs": [], "images": []}

    out["imagenes_aereas"] = aereas_data.get("Result", []) if isinstance(aereas_data, dict) else []

    # Coordinates: ZoomObra returns Latitud/Longitud with labels swapped;
    # JS code reads: obraLat=coords.Longitud, obraLng=coords.Latitud
    coords_result = coords_data.get("Result", []) if isinstance(coords_data, dict) else []
    if coords_result:
        try:
            c = coords_result[0]
            raw_lat = (c.get("Longitud") or "").replace(",", ".")
            raw_lng = (c.get("Latitud") or "").replace(",", ".")
            out["lat"] = float(raw_lat) if raw_lat else None
            out["lng"] = float(raw_lng) if raw_lng else None
        except (ValueError, TypeError):
            pass

    sumario_files = extract_files(sumario_html)
    all_pdfs = {(p["filename_id"], p["name"]): p for p in sumario_files["pdfs"]}
    all_pdfs.update({(p["filename_id"], p["name"]): p for p in ej_files["pdfs"]})
    all_imgs = {p["filename_id"]: p for p in sumario_files["images"]}
    all_imgs.update({p["filename_id"]: p for p in ej_files["images"]})
    out["documentos"] = list(all_pdfs.values())
    out["fotos"] = list(all_imgs.values())
    out["n_fotos"] = len(out["fotos"])

    return out


# ── database ──────────────────────────────────────────────────────────────────

UPSERT_SQL = """
INSERT INTO infobras_full (
    codigo_infobras, cui, snip, nombre, modalidad, estado,
    avance_fisico_pct, fecha_ultimo_avance,
    fecha_inicio, fecha_fin_programada, fecha_fin_real, fecha_aprobacion,
    monto_aprobacion, monto_expediente, doc_aprobacion,
    entidad_nombre, entidad_ruc, contratista_nombre, contratista_ruc,
    supervisor_nombre, supervisor_ruc, contrato_numero, contrato_fecha,
    ubicacion_geografica, direccion, lat, lng,
    avances_mensuales, documentos, fotos, imagenes_aereas,
    tiene_informe_control, n_modificaciones_plazo, n_avances_mensuales, n_fotos,
    raw_html_size, scraped_at
) VALUES (
    %(codigo_infobras)s, %(cui)s, %(snip)s, %(nombre)s, %(modalidad)s, %(estado)s,
    %(avance_fisico_pct)s, %(fecha_ultimo_avance)s,
    %(fecha_inicio)s, %(fecha_fin_programada)s, %(fecha_fin_real)s, %(fecha_aprobacion)s,
    %(monto_aprobacion)s, %(monto_expediente)s, %(doc_aprobacion)s,
    %(entidad_nombre)s, %(entidad_ruc)s, %(contratista_nombre)s, %(contratista_ruc)s,
    %(supervisor_nombre)s, %(supervisor_ruc)s, %(contrato_numero)s, %(contrato_fecha)s,
    %(ubicacion_geografica)s, %(direccion)s, %(lat)s, %(lng)s,
    %(avances_mensuales)s, %(documentos)s, %(fotos)s, %(imagenes_aereas)s,
    %(tiene_informe_control)s, %(n_modificaciones_plazo)s, %(n_avances_mensuales)s, %(n_fotos)s,
    %(raw_html_size)s, NOW()
)
ON CONFLICT (codigo_infobras) DO UPDATE SET
    cui = EXCLUDED.cui, nombre = EXCLUDED.nombre, modalidad = EXCLUDED.modalidad,
    estado = EXCLUDED.estado, avance_fisico_pct = EXCLUDED.avance_fisico_pct,
    fecha_ultimo_avance = EXCLUDED.fecha_ultimo_avance,
    fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin_programada = EXCLUDED.fecha_fin_programada,
    fecha_aprobacion = EXCLUDED.fecha_aprobacion, monto_aprobacion = EXCLUDED.monto_aprobacion,
    entidad_nombre = EXCLUDED.entidad_nombre, contratista_nombre = EXCLUDED.contratista_nombre,
    ubicacion_geografica = EXCLUDED.ubicacion_geografica, direccion = EXCLUDED.direccion,
    avances_mensuales = EXCLUDED.avances_mensuales, documentos = EXCLUDED.documentos,
    fotos = EXCLUDED.fotos, imagenes_aereas = EXCLUDED.imagenes_aereas,
    tiene_informe_control = EXCLUDED.tiene_informe_control,
    n_modificaciones_plazo = EXCLUDED.n_modificaciones_plazo,
    n_avances_mensuales = EXCLUDED.n_avances_mensuales, n_fotos = EXCLUDED.n_fotos,
    raw_html_size = EXCLUDED.raw_html_size, scraped_at = NOW()
"""

_db_local = threading.local()


def get_db():
    if not hasattr(_db_local, "conn") or _db_local.conn.closed:
        import psycopg2
        url = os.environ.get("DATABASE_URL")
        if not url:
            raise RuntimeError("DATABASE_URL env var not set")
        _db_local.conn = psycopg2.connect(url)
        _db_local.conn.autocommit = True
    return _db_local.conn


def upsert_obra(data: dict[str, Any]) -> None:
    conn = get_db()
    cur = conn.cursor()
    payload = dict(data)
    for jkey in ("avances_mensuales", "documentos", "fotos", "imagenes_aereas"):
        v = payload.get(jkey)
        payload[jkey] = json.dumps(v, default=str, ensure_ascii=False) if v is not None else None
    payload.setdefault("monto_expediente", None)
    payload.setdefault("fecha_fin_real", None)
    payload.setdefault("entidad_ruc", None)
    payload.setdefault("contratista_ruc", None)
    payload.setdefault("supervisor_nombre", None)
    payload.setdefault("supervisor_ruc", None)
    payload.setdefault("lat", None)
    payload.setdefault("lng", None)
    cur.execute(UPSERT_SQL, payload)
    cur.close()


# ── ID discovery via sequential probing ───────────────────────────────────────

CUI_RE = re.compile(
    r"(?:CUI|C[óo]digo\s+(?:Único|Unico)\s+de\s+Inversi[óo]n)[\s°N°.:]*(\d{6,8})",
    re.IGNORECASE,
)

# Known INFOBRAS ID range from observed data: 100k – 600k
PROBE_START = 100_000
PROBE_END = 600_001


def _probe_id(codigo: int) -> Optional[int]:
    """Return codigo if the obra exists, None otherwise.

    Invalid IDs get a 302 redirect in ~80ms.
    Valid IDs get HTTP 200. We use stream=True to check status without
    downloading the 500KB body, keeping probing fast.
    """
    try:
        with session.get(
            f"{BASE}/Mapa/DatosGenerales?obraId={codigo}",
            timeout=10,
            allow_redirects=False,
            stream=True,
        ) as r:
            return codigo if r.status_code == 200 else None
    except Exception:
        pass
    return None


def discover_ids_from_db(probe_limit: int | None = None) -> list[int]:
    """
    Probe sequential ID range to discover all valid INFOBRAS obra IDs.
    probe_limit caps the number of IDs probed (e.g. 1000 for a quick test).

    Observed ID range: 100k – 600k.
    Full probe (~500k IDs, 20 workers): ~7h.
    Use --batch with a pre-built CSV to skip this step after first run.
    """
    end = PROBE_END
    if probe_limit:
        end = PROBE_START + probe_limit
        print(f"Probe limited to IDs {PROBE_START:,}–{end:,} ({probe_limit} IDs)",
              file=sys.stderr)
    else:
        print(f"Probing IDs {PROBE_START:,}–{PROBE_END:,} (this takes several hours)",
              file=sys.stderr)
        print("Tip: save results to a CSV with --save-ids and use --batch next time",
              file=sys.stderr)

    # Persist probe state inside the repo (etl/data/) so a session/machine
    # restart resumes instead of losing hours of probing (was /tmp, which
    # gets wiped on restart).
    _STATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    os.makedirs(_STATE_DIR, exist_ok=True)

    # Load already-found IDs to resume from a partial run
    save_ids_path = os.path.join(_STATE_DIR, "infobras_ids_partial.csv")
    ids: list[int] = []
    already_done: set[int] = set()
    if os.path.exists(save_ids_path):
        with open(save_ids_path) as f:
            for line in f:
                line = line.strip()
                if line.isdigit():
                    ids.append(int(line))
                    already_done.add(int(line))
        # Also load already-probed IDs range so we can skip them
        pass  # We'll skip based on a checkpoint file

    checkpoint_path = os.path.join(_STATE_DIR, "infobras_probe_checkpoint.txt")
    log_path = os.path.join(_STATE_DIR, "infobras_probe.log")
    resume_from = PROBE_START
    if os.path.exists(checkpoint_path):
        try:
            resume_from = int(open(checkpoint_path).read().strip())
            print(f"Resuming from ID {resume_from:,} ({resume_from - PROBE_START:,} already probed)",
                  file=sys.stderr)
            sys.stderr.flush()
        except Exception:
            resume_from = PROBE_START

    lock = threading.Lock()
    done = resume_from - PROBE_START  # count already-done
    start = time.time()
    total = end - PROBE_START

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
        futures = {ex.submit(_probe_id, i): i for i in range(resume_from, end)}
        for fut in concurrent.futures.as_completed(futures):
            result = fut.result()
            with lock:
                done += 1
                if result:
                    ids.append(result)
                    # Append immediately to partial CSV so we never lose a found ID
                    try:
                        with open(save_ids_path, "a") as _f:
                            _f.write(f"{result}\n")
                    except Exception:
                        pass

            if done % 1000 == 0 or done == total:
                rate = (done - (resume_from - PROBE_START)) / (time.time() - start) if time.time() > start else 0
                eta = (total - done) / rate if rate > 0 else 0
                line = (
                    f"  Probed {done:,}/{total:,} · found {len(ids):,} valid IDs · "
                    f"{rate:.0f}/s · ETA {eta/3600:.1f}h"
                )
                sys.stderr.write(line + "\n")
                sys.stderr.flush()
                # Save checkpoint (highest ID confirmed probed)
                try:
                    with open(checkpoint_path, "w") as _cf:
                        _cf.write(str(PROBE_START + done))
                    with open(log_path, "a") as _lf:
                        _lf.write(line + "\n")
                        _lf.flush()
                except Exception:
                    pass

    print(f"Discovery complete: {len(ids):,} valid INFOBRAS IDs", file=sys.stderr)
    sys.stderr.flush()
    return sorted(ids)


# ── batch runner ──────────────────────────────────────────────────────────────

def scrape_and_save(codigo: int, save: bool):
    try:
        data = scrape_obra(codigo)
        if save:
            upsert_obra(data)
        return ("ok", codigo, data.get("n_avances_mensuales", 0), data.get("n_fotos", 0))
    except Exception as e:
        return ("err", codigo, str(e)[:120], 0)


def run_batch(codes: list[int], save: bool, workers: int, skip_existing: bool):
    if save and skip_existing:
        import psycopg2
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = conn.cursor()
        cur.execute("SELECT codigo_infobras FROM infobras_full")
        existing = {r[0] for r in cur.fetchall()}
        before = len(codes)
        codes = [c for c in codes if c not in existing]
        print(f"Skip-existing: {before - len(codes):,} already in DB, {len(codes):,} pending",
              file=sys.stderr)
        cur.close(); conn.close()

    start = time.time()
    ok = err = 0
    last_print = start
    print_lock = threading.Lock()
    total = len(codes)

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(scrape_and_save, c, save): c for c in codes}
        for fut in concurrent.futures.as_completed(futures):
            res = fut.result()
            if res[0] == "ok":
                ok += 1
            else:
                err += 1
                with print_lock:
                    print(f"  ERR {res[1]}: {res[2]}", file=sys.stderr)
            done = ok + err
            now = time.time()
            if now - last_print > 5 or done == total:
                last_print = now
                rate = done / (now - start) if now > start else 0
                eta = (total - done) / rate if rate > 0 else 0
                with print_lock:
                    print(
                        f"  [{time.strftime('%H:%M:%S')}] {done:>6}/{total} · "
                        f"ok={ok} err={err} · {rate:.2f}/s · "
                        f"ETA {int(eta//3600)}h {int((eta%3600)//60):02d}m",
                        file=sys.stderr,
                    )

    elapsed = time.time() - start
    print(f"\nDONE: {ok} ok, {err} err in {elapsed/60:.1f} min", file=sys.stderr)


# ── coordinate backfill ───────────────────────────────────────────────────────

def _fetch_coords(codigo: int) -> tuple[int, Optional[float], Optional[float]]:
    """Fetch lat/lng from ZoomObra for a single codigo. Returns (codigo, lat, lng)."""
    try:
        data = _safe_json(f"Mapa/MapaEstadistico/ZoomObra?param={codigo}")
        results = data.get("Result", []) if isinstance(data, dict) else []
        if results:
            c = results[0]
            raw_lat = (c.get("Longitud") or "").replace(",", ".")
            raw_lng = (c.get("Latitud") or "").replace(",", ".")
            lat = float(raw_lat) if raw_lat else None
            lng = float(raw_lng) if raw_lng else None
            return (codigo, lat, lng)
    except Exception:
        pass
    return (codigo, None, None)


def _backfill_coords(workers: int = 4):
    """Fetch and update lat/lng for all rows in infobras_full that have NULL coords."""
    import psycopg2

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL required", file=sys.stderr)
        sys.exit(2)

    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SELECT codigo_infobras FROM infobras_full WHERE lat IS NULL ORDER BY 1")
    codes = [r[0] for r in cur.fetchall()]
    print(f"Backfilling coords for {len(codes):,} rows...", file=sys.stderr)

    updated = 0
    start = time.time()
    lock = threading.Lock()
    last_print = start

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(_fetch_coords, c): c for c in codes}
        for i, fut in enumerate(concurrent.futures.as_completed(futures), 1):
            codigo, lat, lng = fut.result()
            if lat is not None and lng is not None:
                cur.execute(
                    "UPDATE infobras_full SET lat = %s, lng = %s WHERE codigo_infobras = %s",
                    (lat, lng, codigo),
                )
                with lock:
                    updated += 1
            now = time.time()
            with lock:
                if now - last_print > 5 or i == len(codes):
                    last_print = now
                    rate = i / (now - start) if now > start else 0
                    eta = (len(codes) - i) / rate if rate > 0 else 0
                    print(
                        f"  [{time.strftime('%H:%M:%S')}] {i:>5}/{len(codes)} · "
                        f"updated={updated} · {rate:.1f}/s · ETA {int(eta//60):02d}m",
                        file=sys.stderr,
                    )

    cur.close()
    conn.close()
    print(f"\nDONE: {updated:,} rows got coordinates in {(time.time()-start)/60:.1f} min",
          file=sys.stderr)


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Scrape INFOBRAS obra data into PostgreSQL")
    ap.add_argument("codigo", nargs="?", type=int, help="Single obra codigo_infobras")
    ap.add_argument("--save", action="store_true", help="Persist to DB (requires DATABASE_URL)")
    ap.add_argument("--batch", help="CSV file with column 'codigo_infobras'")
    ap.add_argument("--from-db", action="store_true",
                    help="Discover IDs via CUI lookup from obras table, then scrape")
    ap.add_argument("--workers", type=int, default=4, help="Concurrent workers (default 4)")
    ap.add_argument("--limit", type=int, help="Cap scrape batch size for testing")
    ap.add_argument("--probe-limit", type=int, help="Cap CUI probe count (for quick testing)")
    ap.add_argument("--skip-existing", action="store_true",
                    help="Skip codes already in infobras_full")
    ap.add_argument("--out", help="Write single-mode output JSON to file")
    ap.add_argument("--save-ids", help="Save discovered IDs to CSV file (e.g. infobras_ids.csv)")
    ap.add_argument("--backfill-coords", action="store_true",
                    help="Fetch coords from ZoomObra and UPDATE lat/lng for existing rows")
    args = ap.parse_args()

    if args.backfill_coords:
        _backfill_coords(args.workers)
        return

    if args.save and not os.environ.get("DATABASE_URL"):
        print("ERROR: --save requires DATABASE_URL env var", file=sys.stderr)
        sys.exit(2)

    # Single mode
    if args.codigo and not args.batch and not args.from_db:
        data = scrape_obra(args.codigo)
        if args.save:
            upsert_obra(data)
            print(f"Saved codigo={args.codigo}", file=sys.stderr)
        output = json.dumps(data, indent=2, ensure_ascii=False, default=str)
        if args.out:
            with open(args.out, "w") as f:
                f.write(output)
            print(f"Written to {args.out}", file=sys.stderr)
        else:
            print(output)
        return

    # Collect IDs
    codes: list[int] = []

    if args.batch:
        with open(args.batch, encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                v = (row.get("codigo_infobras") or row.get("Código INFOBRAS")
                     or row.get("Codigo INFOBRAS") or "").strip().replace('"', '')
                if v.isdigit():
                    codes.append(int(v))
        print(f"Loaded {len(codes):,} codes from {args.batch}", file=sys.stderr)

    if args.from_db:
        db_ids = discover_ids_from_db(probe_limit=args.probe_limit)
        print(f"Discovered {len(db_ids):,} codes from probe", file=sys.stderr)
        if args.save_ids:
            with open(args.save_ids, "w") as f:
                f.write("codigo_infobras\n")
                for id_ in db_ids:
                    f.write(f"{id_}\n")
            print(f"Saved IDs to {args.save_ids}", file=sys.stderr)
        codes = sorted(set(codes) | set(db_ids))

    if not codes:
        ap.print_help()
        return

    if args.limit:
        codes = codes[:args.limit]
        print(f"Limited to {len(codes):,} codes", file=sys.stderr)

    run_batch(codes, args.save, args.workers, args.skip_existing)


if __name__ == "__main__":
    main()
