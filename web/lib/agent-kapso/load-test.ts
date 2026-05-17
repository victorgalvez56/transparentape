/**
 * Concurrent load test for the Kapso webhook.
 * Simulates N users sending messages simultaneously.
 *
 * Usage:
 *   npx tsx lib/agent-kapso/load-test.ts [url] [concurrency]
 *
 * Examples:
 *   npx tsx lib/agent-kapso/load-test.ts http://localhost:3000 5
 *   npx tsx lib/agent-kapso/load-test.ts https://transparentape.app 10
 */

const TARGET_URL = process.argv[2] ?? "http://localhost:3000";
const CONCURRENCY = parseInt(process.argv[3] ?? "5");
const WEBHOOK_SECRET = process.env.KAPSO_WEBHOOK_SECRET ?? "";

import { createHmac } from "crypto";

// ── Payload builder ───────────────────────────────────────────────────────────

function makePayload(phoneFrom: string, text: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "TEST_ENTRY",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                phone_number_id: "1035188399688492",
                display_phone_number: "+12018992743",
              },
              messages: [
                {
                  id: `wamid.TEST_${phoneFrom}_${Date.now()}`,
                  from: phoneFrom,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function sign(body: string): string {
  if (!WEBHOOK_SECRET) return "sha256=unsigned";
  const hmac = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  return `sha256=${hmac}`;
}

// ── Test scenarios ────────────────────────────────────────────────────────────

const SCENARIOS = [
  { phone: "51900000001", msg: "hola" },
  { phone: "51900000002", msg: "obras en Lima este año" },
  { phone: "51900000003", msg: "estadísticas Perú" },
  { phone: "51900000004", msg: "ranking contratistas" },
  { phone: "51900000005", msg: "obras en Piura 2025" },
  { phone: "51900000006", msg: "obras en Arequipa con alerta" },
  { phone: "51900000007", msg: "monto en riesgo" },
  { phone: "51900000008", msg: "inhabilitados" },
  { phone: "51900000009", msg: "obras en Cusco" },
  { phone: "51900000010", msg: "gracias" },
];

// ── Single request ─────────────────────────────────────────────────────────────

interface Result {
  phone: string;
  msg: string;
  status: number;
  latencyMs: number;
  error?: string;
}

async function sendWebhook(phone: string, msg: string): Promise<Result> {
  const body = JSON.stringify(makePayload(phone, msg));
  const t0 = Date.now();
  try {
    const res = await fetch(`${TARGET_URL}/api/kapso/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": sign(body),
      },
      body,
    });
    return { phone, msg, status: res.status, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { phone, msg, status: 0, latencyMs: Date.now() - t0, error: String(e) };
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────

async function run() {
  const scenarios = SCENARIOS.slice(0, CONCURRENCY);
  console.log(`\n🚀 Load test — ${TARGET_URL}`);
  console.log(`   Concurrency: ${scenarios.length} simultaneous users\n`);

  const t0 = Date.now();
  const results = await Promise.all(
    scenarios.map(({ phone, msg }) => sendWebhook(phone, msg))
  );
  const totalMs = Date.now() - t0;

  // ── Report ──
  const ok = results.filter(r => r.status === 200).length;
  const fail = results.filter(r => r.status !== 200).length;
  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? latencies[latencies.length - 1];
  const max = latencies[latencies.length - 1];

  console.log("── Per-request ──────────────────────────────");
  for (const r of results) {
    const icon = r.status === 200 ? "✅" : "❌";
    console.log(
      `${icon} ${r.phone.slice(-4)} "${r.msg.slice(0, 30).padEnd(30)}" → ${r.status} (${r.latencyMs}ms)${r.error ? " ERR: " + r.error : ""}`
    );
  }

  console.log("\n── Summary ──────────────────────────────────");
  console.log(`   Total wall time : ${totalMs}ms`);
  console.log(`   Passed          : ${ok}/${results.length}`);
  console.log(`   Failed          : ${fail}/${results.length}`);
  console.log(`   Latency p50     : ${p50}ms`);
  console.log(`   Latency p95     : ${p95}ms`);
  console.log(`   Latency max     : ${max}ms`);

  if (fail > 0) {
    console.log("\n⚠️  Some requests failed. Check:");
    console.log("   - Is the server running?");
    console.log("   - Is KAPSO_WEBHOOK_SECRET set correctly?");
    console.log("   - Check agent_logs table for sig_fail entries");
  } else {
    console.log("\n✅ All requests accepted (200). Note: bot responses are");
    console.log("   async — check Kapso inbox to verify actual replies sent.");
  }

  // ── DB check ──
  console.log("\n── DB check (agent_logs last 30s) ───────────");
  try {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    const res = await pool.query(
      `SELECT endpoint, COUNT(*) as n, ROUND(AVG(latencia_ms)) as avg_ms
       FROM agent_logs
       WHERE created_at > NOW() - INTERVAL '30 seconds'
       GROUP BY endpoint ORDER BY n DESC`
    );
    if (res.rows.length) {
      res.rows.forEach(r =>
        console.log(`   ${r.endpoint} — ${r.n} requests, avg ${r.avg_ms}ms`)
      );
    } else {
      console.log("   No logs found in last 30s (requests may not have completed yet)");
    }
    await pool.end();
  } catch {
    console.log("   (DB check skipped — set DATABASE_URL to enable)");
  }

  console.log();
}

run().catch(console.error);
