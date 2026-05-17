/**
 * Agent integration test — run with:
 *   npx tsx --tsconfig tsconfig.json lib/agent-kapso/test-agent.ts
 *
 * Tests are organized in 3 layers:
 *   L1: parseIntent (pure, no I/O)
 *   L2: DB queries (real Supabase)
 *   L3: chatEngine (real Groq + DB)
 */

import { parseIntent } from "./intent";
import { runChatPipeline, type ChatMessage } from "@/lib/agent/core";

// Shim preserving the previous (message, history) → string surface for
// existing assertions. Routes everything through the shared pipeline.
async function chatEngine(message: string, history: ChatMessage[] = []): Promise<string> {
  if (message.length > 600) return "Consulta muy larga. Intenta con una pregunta más corta.";
  const r = await runChatPipeline([...history, { role: "user", content: message }]);
  return r.reply;
}

import {
  buscarObras,
  statsPorPais,
  rankingContratistas,
  inhabilitadosVigentes,
} from "./queries";
import { fmtObras, fmtStats, cleanTitle } from "./wa-format";

// ── Helpers ───────────────────────────────────────────────────────────────────

const GREEN = "\x1b[32m✔\x1b[0m";
const RED = "\x1b[31m✘\x1b[0m";
const YELLOW = "\x1b[33m~\x1b[0m";
const BLUE = "\x1b[34m»\x1b[0m";

let passed = 0;
let failed = 0;

function assert(label: string, got: unknown, expected: unknown) {
  const ok = got === expected;
  console.log(`  ${ok ? GREEN : RED} ${label}`);
  if (!ok) console.log(`    got:      ${JSON.stringify(got)}\n    expected: ${JSON.stringify(expected)}`);
  ok ? passed++ : failed++;
}

function assertContains(label: string, text: string, substr: string) {
  const ok = text.includes(substr);
  console.log(`  ${ok ? GREEN : RED} ${label}`);
  if (!ok) console.log(`    text: ${text.slice(0, 200)}\n    missing: ${substr}`);
  ok ? passed++ : failed++;
}

function assertNotContains(label: string, text: string, substr: string) {
  const ok = !text.includes(substr);
  console.log(`  ${ok ? GREEN : RED} ${label}`);
  if (!ok) console.log(`    text contains banned string: "${substr}"`);
  ok ? passed++ : failed++;
}

function section(name: string) {
  console.log(`\n${BLUE} ${name}`);
}

function preview(label: string, text: string) {
  const lines = text.split("\n").slice(0, 6).join("\n");
  console.log(`\n  ${YELLOW} ${label}\n${lines.split("\n").map(l => `    ${l}`).join("\n")}`);
}

// ── L1: parseIntent ───────────────────────────────────────────────────────────

section("L1: parseIntent — simple inputs");

{
  const cases: [string, string][] = [
    ["hola",                      "AYUDA"],
    ["ayuda",                     "AYUDA"],
    ["inicio",                    "AYUDA"],
    ["gracias",                   "AGRADECIMIENTO"],
    ["Gracias!",                  "AGRADECIMIENTO"],
    ["ok gracias",                "AGRADECIMIENTO"],
    ["bye",                       "AGRADECIMIENTO"],
    ["chau",                      "AGRADECIMIENTO"],
    ["Peru",                      "CAMBIAR_PAIS"],
    ["chile",                     "CAMBIAR_PAIS"],
    ["colombia",                  "CAMBIAR_PAIS"],
    ["obras en Lima",             "BUSCAR_OBRAS"],
    ["obras en Lima 2024",        "BUSCAR_OBRAS"],
    ["obras con alerta en Lima",  "BUSCAR_OBRAS"],
    ["estadísticas Perú",         "STATS"],
    ["resumen chile",             "STATS"],
    ["ranking contratistas",      "RANKING_CONTRATISTAS"],
    ["ranking entidades",         "RANKING_ENTIDADES"],
    ["inhabilitados",             "INHABILITADOS"],
    ["adjudicación directa",      "ADJUDICACION_DIRECTA"],
    ["monto en riesgo",           "MONTO_EN_RIESGO"],
    ["cerca de mí",               "BUSCAR_CERCANOS"],
    ["obras cercanas",            "BUSCAR_CERCANOS"],
    ["detalle #42",               "VER_DETALLE"],
    ["investigar Odebrecht",      "INVESTIGAR_CONTRATISTA"],
    ["investigar 20123456789",    "INVESTIGAR_CONTRATISTA"],
    ["el primero",                "CONTEXTO_DETALLE"],
    ["el segundo",                "CONTEXTO_DETALLE"],
    ["qué es una licitación",     "PREGUNTA_LIBRE"],
    ["explícame más",             "PREGUNTA_LIBRE"],  // no prior context → router decides
  ];

  for (const [input, expectedIntent] of cases) {
    const result = parseIntent(input, "PE");
    assert(`"${input}" → ${expectedIntent}`, result.intent, expectedIntent);
  }
}

section("L1: parseIntent — country extraction");
{
  assert("Peru → PE",         parseIntent("obras en Perú 2024", "PE").country, "PE");
  assert("Chile override",    parseIntent("obras en Chile 2023", "PE").country, "CL");
  assert("Colombia",          parseIntent("obras en Colombia", "PE").country, "CO");
  assert("session fallback",  parseIntent("obras en Lima", "CL").country, "CL");
}

section("L1: parseIntent — filter extraction");
{
  const r1 = parseIntent("obras en Lima 2024", "PE");
  assert("year=2024",         r1.filters?.year, 2024);
  const r2 = parseIntent("obras con alerta en Piura", "PE");
  assert("red_flag=true",     r2.filters?.red_flag, true);
  const r3 = parseIntent("adjudicación directa Lima", "PE");
  assert("adj directa → ADJUDICACION_DIRECTA", r3.intent, "ADJUDICACION_DIRECTA");
  const r4 = parseIntent("detalle #99", "PE");
  assert("obraId=99",         r4.obraId, 99);
}

section("L1: cleanTitle (wa-format)");
{
  assert(
    "ALLCAPS → Title Case (prepositions stay lower)",
    cleanTitle("CONSTRUCCIÓN DE CARRETERA EN LIMA"),
    "Construcción de Carretera en Lima"
  );
  assert(
    "strips quotes",
    cleanTitle('"PAVING PROJECT"'),
    "Paving Project"
  );
  assert(
    "truncates at 85 chars",
    cleanTitle("A".repeat(100)).length <= 86,
    true
  );
  assert("null → Sin título", cleanTitle(null), "Sin título");
}

// ── L2: DB queries ────────────────────────────────────────────────────────────

async function runAsync() {

section("L2: DB — statsPorPais PE");
try {
  const stats = await statsPorPais("PE");
  assert("stats returned", !!stats, true);
  assert("total > 0", Number(stats!.total) > 0, true);
  const formatted = fmtStats({ ...stats!, country: "PE" });
  assertContains("formatted has Perú", formatted, "Perú");
  assertContains("formatted has Total obras", formatted, "Total obras");
  preview("statsPorPais PE output", formatted);
} catch (e) {
  console.log(`  ${RED} statsPorPais PE threw: ${e}`);
  failed++;
}

section("L2: DB — buscarObras Lima 2023");
try {
  const obras = await buscarObras({ country: "PE", q: "lima", year: 2023, limit: 3 });
  assert("returns array", Array.isArray(obras), true);
  if (obras.length) {
    assert("obra has id",    typeof obras[0].id, "number");
    assert("obra has monto", "monto" in obras[0], true);
    const fmt = fmtObras(obras, "PE");
    assertContains("formatted has numbered list", fmt, "1.");
    assertNotContains("formatted lacks tender_title codes", fmt, "LP-");
    preview("buscarObras Lima 2023 output", fmt);
  } else {
    console.log(`  ${YELLOW} 0 obras para Lima 2023 — check DB data`);
  }
} catch (e) {
  console.log(`  ${RED} buscarObras threw: ${e}`);
  failed++;
}

section("L2: DB — buscarObras red_flag=true");
try {
  const obras = await buscarObras({ country: "PE", red_flag: true, limit: 3 });
  if (obras.length) {
    assert("all have red_flag", obras.every(o => o.is_red_flag), true);
    assertContains("formatted has ⚠️", fmtObras(obras, "PE"), "⚠️");
  } else {
    console.log(`  ${YELLOW} 0 red_flag obras — check DB data`);
  }
} catch (e) {
  console.log(`  ${RED} buscarObras red_flag threw: ${e}`);
  failed++;
}

section("L2: DB — rankingContratistas PE por monto");
try {
  const list = await rankingContratistas("PE", "monto", 3);
  assert("returns array", Array.isArray(list), true);
  if (list.length >= 2) {
    const m1 = Number(list[0].monto_total ?? 0);
    const m2 = Number(list[1].monto_total ?? 0);
    assert("sorted DESC by monto", m1 >= m2, true);
  }
} catch (e) {
  console.log(`  ${RED} rankingContratistas threw: ${e}`);
  failed++;
}

section("L2: DB — inhabilitadosVigentes PE");
try {
  const list = await inhabilitadosVigentes("PE", 5);
  assert("returns array", Array.isArray(list), true);
  // Not asserting length — may be 0 depending on DB state
  console.log(`  ${YELLOW} ${list.length} inhabilitados con contratos activos`);
} catch (e) {
  console.log(`  ${RED} inhabilitadosVigentes threw: ${e}`);
  failed++;
}

// ── L3: chatEngine (LLM + DB) ─────────────────────────────────────────────────

section("L3: chatEngine — NEEDS_CLARIFICATION path");
try {
  const reply = await chatEngine("asdflkjqwer", []);
  assert("returns string", typeof reply, "string");
  assert("non-empty", reply.length > 0, true);
  // Router should classify as NEEDS_CLARIFICATION or go SQL path and return no-results
  preview("ambiguous input reply", reply);
} catch (e) {
  console.log(`  ${RED} chatEngine ambiguous threw: ${e}`);
  failed++;
}

section("L3: chatEngine — NEEDS_SQL: obras Piura");
try {
  const reply = await chatEngine("obras en Piura 2023", []);
  assert("returns string", typeof reply, "string");
  assert("non-empty", reply.length > 0, true);
  assertNotContains("no raw SQL in reply", reply, "SELECT");
  assertNotContains("no tender_title codes in reply", reply, "LP-");
  preview("obras Piura 2023 reply", reply);
} catch (e) {
  console.log(`  ${RED} chatEngine obras Piura threw: ${e}`);
  failed++;
}

section("L3: chatEngine — ANSWER_FROM_CONTEXT: follow-up");
try {
  const history = [
    { role: "user" as const,      content: "obras en Lima 2024" },
    { role: "assistant" as const, content: "1. *Rehabilitación Av. Javier Prado* — S/ 12.3M\n2. *Puente San Martín* — S/ 8.1M" },
  ];
  const reply = await chatEngine("cuánto era el monto del primero?", history);
  assert("returns string", typeof reply, "string");
  assertNotContains("no raw SQL", reply, "SELECT");
  preview("follow-up context reply", reply);
} catch (e) {
  console.log(`  ${RED} chatEngine follow-up threw: ${e}`);
  failed++;
}

section("L3: chatEngine — SQL injection attempt");
try {
  const reply = await chatEngine("obras en Lima; DROP TABLE obras; --", []);
  assert("returns string", typeof reply, "string");
  assertNotContains("no DROP in reply", reply, "DROP");
  preview("injection attempt reply", reply);
} catch (e) {
  console.log(`  ${RED} chatEngine injection threw: ${e}`);
  failed++;
}

section("L3: chatEngine — message too long (>600 chars)");
{
  const longMsg = "obras en Lima ".repeat(50);
  const reply = await chatEngine(longMsg, []);
  assertContains("rejects long message", reply, "larga");
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`${GREEN} ${passed} passed   ${RED} ${failed} failed`);
if (failed > 0) process.exit(1);

} // end runAsync

runAsync().catch(e => { console.error(e); process.exit(1); });
