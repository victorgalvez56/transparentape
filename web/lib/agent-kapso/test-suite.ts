/**
 * Comprehensive agent test suite — real-world inputs + latency profiling.
 *
 * Run: set -a && source .env && set +a && npx tsx --tsconfig tsconfig.json lib/agent-kapso/test-suite.ts
 *
 * Layers:
 *   L1: parseIntent — typos, multi-country, ambiguity, edge cases (sync, no I/O)
 *   L2: queries — DB latency per query type
 *   L3: chatEngine — LLM latency per path (router / context / SQL+synthesis)
 *   L4: end-to-end — full handleMessage flow with timing
 */

import { parseIntent, type Intent } from "./intent";
import { runChatPipeline, type ChatMessage } from "@/lib/agent/core";
import {
  buscarObras,
  buscarCercanas,
  statsPorPais,
  rankingContratistas,
  rankingEntidades,
  inhabilitadosVigentes,
  investigarContratista,
  adjudicacionDirectaAlertas,
  montoEnRiesgo,
  yearsDisponibles,
} from "./queries";

// ── Helpers ───────────────────────────────────────────────────────────────────

const GREEN = "\x1b[32m✔\x1b[0m";
const RED = "\x1b[31m✘\x1b[0m";
const YELLOW = "\x1b[33m~\x1b[0m";
const BLUE = "\x1b[34m»\x1b[0m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
let failed = 0;
const failures: string[] = [];

interface Timing {
  label: string;
  ms: number;
  ok: boolean;
}
const timings: Timing[] = [];

function assert(label: string, got: unknown, expected: unknown) {
  const ok = got === expected;
  console.log(`  ${ok ? GREEN : RED} ${label}`);
  if (!ok) {
    console.log(`    got:      ${JSON.stringify(got)}\n    expected: ${JSON.stringify(expected)}`);
    failures.push(label);
  }
  ok ? passed++ : failed++;
}

function section(name: string) {
  console.log(`\n${BLUE} ${name}`);
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    timings.push({ label, ms, ok: true });
    console.log(`  ${DIM}${ms.toString().padStart(5)}ms${RESET}  ${label}`);
    return result;
  } catch (e) {
    const ms = Date.now() - t0;
    timings.push({ label, ms, ok: false });
    console.log(`  ${RED} ${ms}ms  ${label} — ${e}`);
    failed++;
    throw e;
  }
}

function timedSync<T>(label: string, fn: () => T): T {
  const t0 = process.hrtime.bigint();
  const result = fn();
  const ns = Number(process.hrtime.bigint() - t0);
  const ms = ns / 1_000_000;
  timings.push({ label, ms, ok: true });
  return result;
}

// ── L1: parseIntent — wide real-world coverage ────────────────────────────────

async function testIntent() {
  section("L1: parseIntent — greetings & gratitude variants");
  const greetings: [string, Intent][] = [
    ["hola", "AYUDA"],
    ["Hola!", "AYUDA"],
    ["HOLA", "AYUDA"],
    ["holi", "AYUDA"],
    ["buenos días", "AYUDA"],
    ["buenas tardes", "AYUDA"],
    ["buenas", "AYUDA"],
    ["hey", "AYUDA"],
    ["qué tal", "AYUDA"],
    ["ayuda", "AYUDA"],
    ["menu", "AYUDA"],
    ["inicio", "AYUDA"],
    ["start", "AYUDA"],
    ["??", "AYUDA"],
    ["qué puedes hacer", "AYUDA"],
    ["gracias", "AGRADECIMIENTO"],
    ["Gracias!", "AGRADECIMIENTO"],
    ["ok gracias", "AGRADECIMIENTO"],
    ["perfecto", "AGRADECIMIENTO"],
    ["genial", "AGRADECIMIENTO"],
    ["chau", "AGRADECIMIENTO"],
    ["adiós", "AGRADECIMIENTO"],
    ["bye", "AGRADECIMIENTO"],
    ["hasta luego", "AGRADECIMIENTO"],
    ["👍", "AGRADECIMIENTO"],
  ];
  for (const [input, expected] of greetings) {
    const r = timedSync(`intent:${input}`, () => parseIntent(input, "PE"));
    assert(`"${input}" → ${expected}`, r.intent, expected);
  }

  section("L1: parseIntent — search queries");
  const searches: [string, Intent][] = [
    ["obras en Lima", "BUSCAR_OBRAS"],
    ["obras en Lima 2024", "BUSCAR_OBRAS"],
    ["obras este año", "BUSCAR_OBRAS"],
    ["obras año pasado", "BUSCAR_OBRAS"],
    ["proyectos en Cusco", "BUSCAR_OBRAS"],
    ["licitaciones Arequipa", "BUSCAR_OBRAS"],
    ["contratos 2025", "BUSCAR_OBRAS"],
    ["construcción de carreteras Piura", "BUSCAR_OBRAS"],
    ["obras con alerta en Lima", "BUSCAR_OBRAS"],
    ["obras sospechosas", "BUSCAR_OBRAS"],
    ["dame obras de Piura", "BUSCAR_OBRAS"],
    ["muéstrame obras en Tacna", "BUSCAR_OBRAS"],
    ["busco obras en Loreto", "BUSCAR_OBRAS"],
    ["quiero ver obras en Junín", "BUSCAR_OBRAS"],
    ["obras de Odebrecht", "BUSCAR_OBRAS"],
  ];
  for (const [input, expected] of searches) {
    const r = timedSync(`intent:${input}`, () => parseIntent(input, "PE"));
    assert(`"${input}" → ${expected}`, r.intent, expected);
  }

  section("L1: parseIntent — country handling");
  // Country switch (short, no action keywords)
  assert("chile (solo) → CAMBIAR_PAIS",   parseIntent("chile", "PE").intent, "CAMBIAR_PAIS");
  assert("Colombia → CAMBIAR_PAIS",       parseIntent("Colombia", "PE").intent, "CAMBIAR_PAIS");
  assert("México → CAMBIAR_PAIS",         parseIntent("México", "PE").intent, "CAMBIAR_PAIS");
  // Country + action = should NOT switch (was buggy before ACTION_KEYWORDS guard)
  assert("obras chile → BUSCAR_OBRAS",    parseIntent("obras chile", "PE").intent, "BUSCAR_OBRAS");
  assert("ranking chile → RANKING",       parseIntent("ranking contratistas chile", "PE").intent, "RANKING_CONTRATISTAS");
  assert("estadísticas Colombia",         parseIntent("estadísticas Colombia", "PE").intent, "STATS");
  // Country extraction
  assert("Perú → PE",                     parseIntent("estadísticas Perú", "CL").country, "PE");
  assert("session fallback CL",           parseIntent("obras en Santiago", "CL").country, "CL");
  assert("session fallback PE",           parseIntent("estadísticas", "PE").country, "PE");

  section("L1: parseIntent — context / ordinals");
  const ctx: [string, Intent, number | undefined][] = [
    ["el primero", "CONTEXTO_DETALLE", 1],
    ["el segundo", "CONTEXTO_DETALLE", 2],
    ["el tercero", "CONTEXTO_DETALLE", 3],
    ["el cuarto", "CONTEXTO_DETALLE", 4],
    ["el quinto", "CONTEXTO_DETALLE", 5],
    ["el último", "CONTEXTO_DETALLE", -1],
    ["el ultimo", "CONTEXTO_DETALLE", -1],
    ["más detalle", "CONTEXTO_DETALLE", undefined],
  ];
  for (const [input, expectedIntent, expectedPos] of ctx) {
    const r = parseIntent(input, "PE");
    assert(`"${input}" → ${expectedIntent}`, r.intent, expectedIntent);
    if (expectedPos !== undefined) {
      assert(`  pos=${expectedPos}`, r.contextPosition, expectedPos);
    }
  }

  section("L1: parseIntent — rankings, stats, investigations");
  const cmds: [string, Intent][] = [
    ["estadísticas", "STATS"],
    ["estadísticas Perú", "STATS"],
    ["resumen", "STATS"],
    ["resumen Chile", "STATS"],
    ["cuántas obras hay", "STATS"],
    ["ranking", "RANKING_CONTRATISTAS"],
    ["ranking contratistas", "RANKING_CONTRATISTAS"],
    ["top contratistas", "RANKING_CONTRATISTAS"],
    ["mayores contratistas", "RANKING_CONTRATISTAS"],
    ["ranking entidades", "RANKING_ENTIDADES"],
    ["top entidades", "RANKING_ENTIDADES"],
    ["mayores compradores", "RANKING_ENTIDADES"],
    ["entidades compradoras", "RANKING_ENTIDADES"],
    ["inhabilitados", "INHABILITADOS"],
    ["sancionados", "INHABILITADOS"],
    ["adjudicación directa", "ADJUDICACION_DIRECTA"],
    ["adjudicaciones directas", "ADJUDICACION_DIRECTA"],
    ["monto en riesgo", "MONTO_EN_RIESGO"],
    ["cuanto está en riesgo", "MONTO_EN_RIESGO"],
    ["dinero en riesgo", "MONTO_EN_RIESGO"],
    ["investigar Odebrecht", "INVESTIGAR_CONTRATISTA"],
    ["investigar 20123456789", "INVESTIGAR_CONTRATISTA"],
    ["detalle #42", "VER_DETALLE"],
    ["ver obra 99", "VER_DETALLE"],
    ["obra id: 100", "VER_DETALLE"],
    ["cerca de mí", "BUSCAR_CERCANOS"],
    ["mi ubicación", "BUSCAR_CERCANOS"],
    ["obras cercanas", "BUSCAR_CERCANOS"],
    ["lo más próximo", "BUSCAR_CERCANOS"],
  ];
  for (const [input, expected] of cmds) {
    const r = parseIntent(input, "PE");
    assert(`"${input}" → ${expected}`, r.intent, expected);
  }

  section("L1: parseIntent — filter & free-query extraction");
  const r1 = parseIntent("obras en Lima 2024", "PE");
  assert("year=2024",                     r1.filters?.year, 2024);
  assert("q=Lima",                        r1.filters?.q?.toLowerCase(), "lima");

  const r2 = parseIntent("obras con alerta en Piura", "PE");
  assert("red_flag=true",                 r2.filters?.red_flag, true);
  assert("q=Piura",                       r2.filters?.q?.toLowerCase(), "piura");

  const r3 = parseIntent("obras este año Cusco", "PE");
  const thisYear = new Date().getFullYear();
  assert(`year=${thisYear}`,              r3.filters?.year, thisYear);

  const r4 = parseIntent("obras año pasado", "PE");
  assert(`year=${thisYear - 1}`,          r4.filters?.year, thisYear - 1);

  const r5 = parseIntent("obras en Valle del Colca", "PE");
  assert("preserves 'del' mid-string",    r5.filters?.q, "Valle del Colca");

  const r6 = parseIntent("obras en San Juan de Lurigancho", "PE");
  assert("preserves 'de' mid-string",     r6.filters?.q, "San Juan de Lurigancho");

  const r7 = parseIntent("obras en Piura", "PE");
  assert("no dangling preposition",       r7.filters?.q, "Piura");

  section("L1: parseIntent — edge cases & noise");
  // Empty / whitespace
  assert("empty → PREGUNTA_LIBRE",        parseIntent("", "PE").intent, "PREGUNTA_LIBRE");
  assert("whitespace → PREGUNTA_LIBRE",   parseIntent("   ", "PE").intent, "PREGUNTA_LIBRE");
  // Pure noise
  assert("random → PREGUNTA_LIBRE",       parseIntent("asdfqwer", "PE").intent, "PREGUNTA_LIBRE");
  // Question without keywords
  assert("free question → PREGUNTA_LIBRE", parseIntent("qué es una licitación", "PE").intent, "PREGUNTA_LIBRE");
  // Numbers alone (could be misread as year)
  const r8 = parseIntent("2024", "PE");
  assert("bare year → BUSCAR_OBRAS",       r8.intent, "BUSCAR_OBRAS");
  assert("  year=2024",                    r8.filters?.year, 2024);
  // SQL injection in text
  const r9 = parseIntent("obras en Lima; DROP TABLE obras", "PE");
  assert("inj → BUSCAR_OBRAS",             r9.intent, "BUSCAR_OBRAS");
  // No country in DB but referenced
  assert("Ecuador unknown",                parseIntent("obras en Ecuador", "PE").intent, "BUSCAR_OBRAS");
  // Mixed case + accents
  assert("ÉSTADISTICAS PERÚ",              parseIntent("ÉSTADISTICAS PERÚ", "PE").intent, "STATS");
  // Number with hash
  assert("#5 → CONTEXTO_DETALLE",          parseIntent("#5", "PE").intent, "CONTEXTO_DETALLE");
  assert("uno → CONTEXTO_DETALLE",         parseIntent("uno", "PE").intent, "CONTEXTO_DETALLE");
}

// ── L2: DB queries — latency + correctness ────────────────────────────────────

async function testQueries() {
  section("L2: DB latency per query type");

  const stats = await timed("statsPorPais PE", () => statsPorPais("PE"));
  assert("stats has total", Number(stats?.total ?? 0) > 0, true);

  const obras = await timed("buscarObras PE q=lima limit=5", () =>
    buscarObras({ country: "PE", q: "lima", limit: 5 })
  );
  assert("obras returned", obras.length > 0, true);

  await timed("buscarObras PE year=2024 limit=5", () =>
    buscarObras({ country: "PE", year: 2024, limit: 5 })
  );

  await timed("buscarObras PE red_flag=true limit=5", () =>
    buscarObras({ country: "PE", red_flag: true, limit: 5 })
  );

  await timed("buscarCercanas Lima -12,-77", () =>
    buscarCercanas(-12.04, -77.04, "PE", 5)
  );

  await timed("yearsDisponibles PE", () => yearsDisponibles("PE"));

  await timed("rankingContratistas PE monto", () =>
    rankingContratistas("PE", "monto", 5)
  );

  await timed("rankingContratistas PE alertas", () =>
    rankingContratistas("PE", "alertas", 5)
  );

  await timed("rankingEntidades PE", () => rankingEntidades("PE", 5));

  await timed("inhabilitadosVigentes PE", () =>
    inhabilitadosVigentes("PE", 5)
  );

  await timed("adjudicacionDirectaAlertas PE", () =>
    adjudicacionDirectaAlertas("PE", 5)
  );

  await timed("montoEnRiesgo PE", () => montoEnRiesgo("PE"));

  await timed("investigarContratista 'Odebrecht'", () =>
    investigarContratista("Odebrecht", "PE")
  );
}

// ── L3: chat pipeline — LLM latency per path ──────────────────────────────────

// Thin shim preserving the old (message, history) → string surface so the
// test assertions stay readable. Calls into the shared pipeline used by both
// web and WhatsApp.
async function runPipelineReply(message: string, history: ChatMessage[] = []): Promise<string> {
  const r = await runChatPipeline([...history, { role: "user", content: message }]);
  return r.reply;
}

async function testChatEngine() {
  section("L3: runChatPipeline latency per path");

  // NEEDS_CLARIFICATION (only router LLM)
  await timed("pipeline: ambiguous (router only)", () =>
    runPipelineReply("xyz random gibberish", [])
  );

  // NEEDS_SQL (router + SQL + synthesis = 3 LLM calls)
  const reply1 = await timed("pipeline: NEEDS_SQL obras Piura", () =>
    runPipelineReply("obras en Piura 2024", [])
  );
  assert("reply non-empty", reply1.length > 0, true);
  assert("no raw SQL leak", reply1.includes("SELECT"), false);

  // ANSWER_FROM_CONTEXT (router + context = 2 LLM calls)
  const history: ChatMessage[] = [
    { role: "user", content: "obras en Lima 2024" },
    { role: "assistant", content: "1. *Av. Javier Prado* — S/ 12.3M\n2. *Puente San Martín* — S/ 8.1M" },
  ];
  const reply2 = await timed("pipeline: ANSWER_FROM_CONTEXT follow-up", () =>
    runPipelineReply("cuánto era el primero?", history)
  );
  assert("ctx reply non-empty", reply2.length > 0, true);
}

// ── Summary ───────────────────────────────────────────────────────────────────

function summarize() {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`${GREEN} ${passed} passed   ${RED} ${failed} failed`);
  if (failures.length) {
    console.log(`\nFailures:`);
    failures.forEach((f) => console.log(`  - ${f}`));
  }

  // Latency report
  console.log(`\n── Latency report ────────────────────────────────────────`);
  const intentTimes = timings.filter((t) => t.label.startsWith("intent:"));
  if (intentTimes.length) {
    const sorted = intentTimes.map((t) => t.ms).sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1];
    const max = sorted[sorted.length - 1];
    console.log(`  parseIntent (${intentTimes.length} calls): p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`);
  }
  const ioTimes = timings.filter((t) => !t.label.startsWith("intent:"));
  for (const t of ioTimes) {
    const tag = t.label.startsWith("chatEngine") ? "🤖" : "💾";
    console.log(`  ${tag} ${t.ms.toString().padStart(5)}ms  ${t.label}`);
  }

  if (failed > 0) process.exit(1);
}

// ── Run ───────────────────────────────────────────────────────────────────────

async function run() {
  const t0 = Date.now();
  await testIntent();
  await testQueries();
  await testChatEngine();
  summarize();
  console.log(`\nTotal wall time: ${Date.now() - t0}ms`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
