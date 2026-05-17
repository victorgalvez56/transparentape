/**
 * Backfill obras.has_panorama probing Google Street View Metadata API.
 *
 * The /vr Audit Room only lists obras WHERE has_panorama = TRUE. Street View
 * availability is a live Google call, so we persist it once here.
 *
 * Resumable: only touches rows WHERE panorama_checked_at IS NULL, so you can
 * Ctrl-C and re-run; it continues. Network errors leave a row unchecked so it
 * retries on the next run. Metadata requests are free per Google's pricing.
 *
 * Run from web/:
 *   node --env-file=.env.local scripts/backfill-panorama.mjs [--limit N] [--concurrency C]
 *
 * Needs DATABASE_URL and GOOGLE_MAPS_KEY in .env.local.
 */
import pg from "pg";

const KEY = (process.env.GOOGLE_MAPS_KEY ?? "").trim();
const DB = process.env.DATABASE_URL;
if (!DB) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
if (!KEY) {
  console.error("GOOGLE_MAPS_KEY not set");
  process.exit(1);
}

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const LIMIT = Number(getArg("--limit", "0")) || Infinity; // 0 = all unchecked
const CONCURRENCY = Number(getArg("--concurrency", "12"));
const FETCH_BATCH = 500; // rows pulled from DB per round
const FLUSH_EVERY = 200; // results buffered before a bulk UPDATE
const RADII = [50, 150]; // metadata radius fallback (meters)

const pool = new pg.Pool({
  connectionString: DB,
  max: 4,
  ssl: { rejectUnauthorized: false },
});

const SV_META = "https://maps.googleapis.com/maps/api/streetview/metadata";

let stop = false;
process.on("SIGINT", () => {
  console.log("\n⏹  SIGINT — flushing & exiting…");
  stop = true;
});

/** @returns {Promise<{found:boolean, panoId:string|null}|null>} null = transient error, retry later */
async function probe(lat, lng) {
  for (const r of RADII) {
    let res;
    try {
      res = await fetch(
        `${SV_META}?location=${lat},${lng}&radius=${r}&source=outdoor&key=${KEY}`,
        { signal: AbortSignal.timeout(8000) }
      );
    } catch {
      return null; // network/timeout — don't mark checked
    }
    if (!res.ok) return null;
    const d = await res.json().catch(() => null);
    if (!d) return null;
    if (d.status === "OK") return { found: true, panoId: d.pano_id ?? null };
    if (d.status === "ZERO_RESULTS") continue; // try wider radius
    if (d.status === "OVER_QUERY_LIMIT") {
      console.error("⚠️  OVER_QUERY_LIMIT — backing off 30s");
      await new Promise((s) => setTimeout(s, 30000));
      return null;
    }
    if (d.status === "REQUEST_DENIED" || d.status === "INVALID_REQUEST") {
      console.error(`❌ fatal Google status: ${d.status} ${d.error_message ?? ""}`);
      process.exit(1);
    }
    return null;
  }
  return { found: false, panoId: null }; // all radii returned ZERO_RESULTS
}

async function fetchBatch() {
  const { rows } = await pool.query(
    `SELECT id, lat, lng FROM obras
      WHERE lat IS NOT NULL AND lng IS NOT NULL
        AND panorama_checked_at IS NULL
      ORDER BY is_red_flag DESC NULLS LAST, contract_amount DESC NULLS LAST
      LIMIT $1`,
    [FETCH_BATCH]
  );
  return rows;
}

async function flush(buf) {
  if (buf.length === 0) return;
  const ids = buf.map((b) => b.id);
  const has = buf.map((b) => b.found);
  const pano = buf.map((b) => b.panoId);
  await pool.query(
    `UPDATE obras o SET
        has_panorama = v.has,
        panorama_pano_id = v.pano,
        panorama_checked_at = now()
       FROM (SELECT unnest($1::int[]) AS id,
                    unnest($2::bool[]) AS has,
                    unnest($3::text[]) AS pano) v
      WHERE o.id = v.id`,
    [ids, has, pano]
  );
  buf.length = 0;
}

async function main() {
  const t0 = Date.now();
  let processed = 0;
  let withPano = 0;
  let remaining = (
    await pool.query(
      `SELECT COUNT(*)::int n FROM obras
        WHERE lat IS NOT NULL AND lng IS NOT NULL AND panorama_checked_at IS NULL`
    )
  ).rows[0].n;
  console.log(
    `🛰  backfill-panorama · unchecked=${remaining} · limit=${
      LIMIT === Infinity ? "all" : LIMIT
    } · concurrency=${CONCURRENCY}`
  );

  const buf = [];

  while (!stop && processed < LIMIT) {
    const batch = await fetchBatch();
    if (batch.length === 0) break;

    let cursor = 0;
    async function worker() {
      while (!stop && cursor < batch.length && processed < LIMIT) {
        const row = batch[cursor++];
        const r = await probe(Number(row.lat), Number(row.lng));
        if (r === null) continue; // transient — leave unchecked
        buf.push({ id: row.id, found: r.found, panoId: r.panoId });
        processed++;
        if (r.found) withPano++;
        if (buf.length >= FLUSH_EVERY) await flush(buf);
        if (processed % 500 === 0) {
          const rate = processed / ((Date.now() - t0) / 1000);
          const eta = rate > 0 ? Math.round((remaining - processed) / rate) : 0;
          console.log(
            `  ${processed} done · ${withPano} con panorámica · ${rate.toFixed(
              1
            )}/s · ETA ~${Math.floor(eta / 60)}m`
          );
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    await flush(buf);
  }
  await flush(buf);

  const total = (
    await pool.query(
      `SELECT COUNT(*) FILTER (WHERE has_panorama) pano,
              COUNT(*) FILTER (WHERE panorama_checked_at IS NOT NULL) checked
         FROM obras`
    )
  ).rows[0];
  console.log(
    `✅ done · this run: ${processed} probed, ${withPano} with panorama · ` +
      `DB totals: ${total.pano} con panorámica / ${total.checked} chequeadas`
  );
  await pool.end();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
