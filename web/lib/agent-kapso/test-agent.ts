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
import { chatEngine } from "./engine";
import {
  buscarObras,
  statsPorPais,
  rankingContratistas,
  inhabilitadosVigentes,
} from "./queries";
import { fmtObras, fmtStats, cleanTitle } from "./wa-format";
import {
  mergeFilters,
  effectiveSearchFilters,
  extractTurnEntities,
  mergeEntities,
  buildUserContext,
  shouldResummarize,
} from "./context";
import type { Session, UserProfile, MentionedEntities, ActiveFilters } from "./session";

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
  // "adjudicación directa" matches the dedicated intent — the filter is implied
  // by the intent itself; no need for filters.procurement_method.
  const r3 = parseIntent("adjudicación directa Lima", "PE");
  assert("intent=ADJUDICACION_DIRECTA", r3.intent, "ADJUDICACION_DIRECTA");
  const r4 = parseIntent("detalle #99", "PE");
  assert("obraId=99",         r4.obraId, 99);
}

section("L1: cleanTitle (wa-format)");
{
  // Short articles ("de", "en") stay lowercase by design — natural Title Case.
  assert(
    "ALLCAPS → Title Case (short words stay lowercase)",
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

// ── L1+: parseIntent — edge cases ─────────────────────────────────────────────

section("L1+: parseIntent — edge cases");
{
  const cases: [string, string, string?][] = [
    // Mixed-case + punctuation
    ["OBRAS EN LIMA!!!",          "BUSCAR_OBRAS", "shouty caps"],
    ["¿obras en Piura?",          "BUSCAR_OBRAS", "spanish punctuation"],
    ["obras en piura.",           "BUSCAR_OBRAS", "trailing period"],
    // Multi-word regions (compound names with prepositions)
    ["obras en San Juan de Lurigancho", "BUSCAR_OBRAS", "preposition inside name"],
    ["obras en Valle del Colca",  "BUSCAR_OBRAS", "valle del"],
    // Year-only triggers BUSCAR_OBRAS even without keyword
    ["2024",                       "BUSCAR_OBRAS", "year alone"],
    ["¿qué hay del 2023?",         "BUSCAR_OBRAS", "implicit year"],
    // Relative year
    ["obras este año",             "BUSCAR_OBRAS", "relative year"],
    ["obras el año pasado",        "BUSCAR_OBRAS", "year pasado"],
    // Investigation by name
    ["investigar Odebrecht",       "INVESTIGAR_CONTRATISTA", "by company"],
    ["investiga a Graña y Montero", "INVESTIGAR_CONTRATISTA", "by company with 'a'"],
    // Ranking variants
    ["top contratistas",           "RANKING_CONTRATISTAS", "top variant"],
    ["mayores contratistas",       "RANKING_CONTRATISTAS", "mayores variant"],
    ["ranking de contratistas con alertas", "RANKING_CONTRATISTAS", "ranking + alerta keyword"],
    // Ordinal context
    ["dame el primero",            "CONTEXTO_DETALLE", "ordinal"],
    ["#1",                          "CONTEXTO_DETALLE", "hashtag number"],
    ["el último",                  "CONTEXTO_DETALLE", "last"],
    // Gratitude variants
    ["👍",                          "AGRADECIMIENTO", "thumbs up alone"],
    ["perfecto, gracias",          "AGRADECIMIENTO", "perfecto+gracias"],
    // Help variants
    ["menú",                       "AYUDA", "menu accented"],
    ["¿qué puedes hacer?",         "AYUDA", "what can you do"],
    // Free questions cae a PREGUNTA_LIBRE (LLM)
    ["¿quién construyó el aeropuerto?", "PREGUNTA_LIBRE", "open question"],
    ["compara Piura y Lambayeque", "PREGUNTA_LIBRE", "comparison no keyword"],
    // Edge: empty / minimal
    ["?",                          "PREGUNTA_LIBRE", "single char punct"],
    ["ok",                         "AGRADECIMIENTO", "bare ok"],
  ];

  for (const [input, expectedIntent, note] of cases) {
    const result = parseIntent(input, "PE");
    const label = note ? `"${input}" → ${expectedIntent} (${note})` : `"${input}" → ${expectedIntent}`;
    assert(label, result.intent, expectedIntent);
  }
}

// ── L4: context layer — pure functions, no I/O ────────────────────────────────

section("L4: context — mergeFilters (cumulative search)");
{
  // First turn: "obras en Lima"
  const t1 = mergeFilters(undefined, { q: "lima" }, "BUSCAR_OBRAS");
  assert("turn 1 stores q",          t1?.q,    "lima");

  // Second turn: "ahora 2024" — should keep lima, add year
  const t2 = mergeFilters(t1, { year: 2024 }, "BUSCAR_OBRAS");
  assert("turn 2 keeps q",           t2?.q,    "lima");
  assert("turn 2 adds year",         t2?.year, 2024);

  // Third turn: "con alerta" — keep both, add red_flag
  const t3 = mergeFilters(t2, { red_flag: true }, "BUSCAR_OBRAS");
  assert("turn 3 keeps q",           t3?.q,        "lima");
  assert("turn 3 keeps year",        t3?.year,     2024);
  assert("turn 3 adds red_flag",     t3?.red_flag, true);

  // Fourth turn: topic break to STATS — filters wiped
  const t4 = mergeFilters(t3, undefined, "STATS");
  assert("turn 4 (STATS) wipes filters", t4, undefined);

  // Fifth turn: user changes region "ahora Piura" — replaces q
  const t5 = mergeFilters(t3, { q: "piura" }, "BUSCAR_OBRAS");
  assert("turn 5 replaces q",        t5?.q,        "piura");
  assert("turn 5 keeps year",        t5?.year,     2024);
}

section("L4: context — effectiveSearchFilters injects country");
{
  const filters: ActiveFilters = { q: "lima", year: 2024 };
  const eff = effectiveSearchFilters(filters, undefined, "PE");
  assert("country injected",         eff.country, "PE");
  assert("q preserved",              eff.q,       "lima");
  assert("year preserved",           eff.year,    2024);

  // Edge: no active, no parsed → only country
  const empty = effectiveSearchFilters(undefined, undefined, "CL");
  assert("empty + country",          empty.country, "CL");
}

section("L4: context — extractTurnEntities");
{
  const parsed1 = parseIntent("obras en Piura 2024", "PE");
  const e1 = extractTurnEntities("obras en Piura 2024", parsed1);
  assert("region extracted",         e1.regions?.[0]?.toLowerCase().includes("piura"), true);
  assert("year extracted",           e1.years?.[0], 2024);

  const parsed2 = parseIntent("investigar Odebrecht", "PE");
  const e2 = extractTurnEntities("investigar Odebrecht", parsed2);
  assert("company extracted",        e2.companies?.[0], "Odebrecht");

  const parsed3 = parseIntent("RUC contratista 20123456789", "PE");
  const e3 = extractTurnEntities("RUC contratista 20123456789", parsed3);
  assert("RUC extracted",            e3.rucs?.includes("20123456789"), true);
}

section("L4: context — mergeEntities dedupes and caps");
{
  const start: MentionedEntities = { regions: ["lima"], rucs: [], companies: [], years: [] };
  const m1 = mergeEntities(start, { regions: ["piura"] });
  assert("appended new region",      m1.regions.length, 2);
  assert("order preserved",          m1.regions[1],     "piura");

  // Dedupe: re-mentioning lima should not duplicate
  const m2 = mergeEntities(m1, { regions: ["LIMA"] });
  assert("dedupe case-insensitive",  m2.regions.length, 2);

  // Cap at MAX_ENTITIES (10)
  let acc: MentionedEntities = { regions: [], rucs: [], companies: [], years: [] };
  for (let i = 0; i < 15; i++) {
    acc = mergeEntities(acc, { regions: [`region${i}`] });
  }
  assert("capped at 10",             acc.regions.length, 10);
  assert("kept latest",              acc.regions[9],     "region14");
}

section("L4: context — buildUserContext prompt prefix");
{
  // No profile, no session state → empty prefix
  const empty = buildUserContext(null, { country: "PE", updatedAt: Date.now() });
  assert("empty when nothing",       empty, "");

  // Profile with name
  const profile: UserProfile = {
    phone: "+51999",
    displayName: "Victor",
    defaultCountry: "PE",
    defaultRegion: "Cusco",
    language: "es",
    totalQueries: 7,
    firstSeen: Date.now() - 86400000,
    lastSeen: Date.now(),
  };
  const session: Session = {
    country: "PE",
    activeFilters: { q: "cusco", year: 2024 },
    mentionedEntities: { regions: ["cusco"], rucs: ["20100"], companies: ["Odebrecht"], years: [2024] },
    sessionSummary: "Usuario consulta obras en Cusco con alertas.",
    updatedAt: Date.now(),
  };
  const built = buildUserContext(profile, session);
  assertContains("contains name",            built, "Victor");
  assertContains("contains region",          built, "Cusco");
  assertContains("recurring user note",      built, "recurrente");
  assertContains("session summary",          built, "Resumen previo");
  assertContains("entities listed",          built, "Odebrecht");
  assertContains("active filters listed",    built, "zona=cusco");
  // Token budget: stay under ~600 chars (≈150 tokens)
  assert("stays compact",                    built.length < 600, true);
}

section("L4: context — shouldResummarize triggers every historyPairs");
{
  const base: Session = { country: "PE", updatedAt: Date.now() };

  assert("no history → no",   shouldResummarize(base), false);
  assert("2 msgs (1 pair) → no", shouldResummarize({ ...base, lastMessages: makeMsgs(2) }), false);
  // historyPairs is 5 → at 10 msgs we summarize for the first time
  assert("10 msgs → yes",     shouldResummarize({ ...base, lastMessages: makeMsgs(10) }), true);
  // After summarizing 10, the count is set; next 10 msgs trigger again
  assert("10 msgs, just summarized → no",
    shouldResummarize({ ...base, lastMessages: makeMsgs(10), summaryMsgCount: 10 }),
    false
  );
  assert("20 msgs since last summary → yes",
    shouldResummarize({ ...base, lastMessages: makeMsgs(20), summaryMsgCount: 10 }),
    true
  );
}

function makeMsgs(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `msg ${i}`,
  }));
}

// ── L5: simulated multi-turn conversations (intent + state, no I/O) ───────────

section("L5: simulated conversation — cumulative filter search");
{
  // User progressively narrows down a search.
  type Turn = { input: string; expectIntent: string; expectFilterDesc?: string };
  const turns: Turn[] = [
    { input: "hola",                      expectIntent: "AYUDA" },
    { input: "obras en Lima",             expectIntent: "BUSCAR_OBRAS", expectFilterDesc: "q=lima" },
    { input: "ahora 2024",                expectIntent: "BUSCAR_OBRAS", expectFilterDesc: "q=lima, year=2024" },
    { input: "con alerta",                expectIntent: "BUSCAR_OBRAS", expectFilterDesc: "q=lima, year=2024, red_flag=true" },
    { input: "el primero",                expectIntent: "CONTEXTO_DETALLE" },
    { input: "estadísticas Perú",         expectIntent: "STATS" },                  // topic break
    { input: "obras en Cusco 2023",       expectIntent: "BUSCAR_OBRAS", expectFilterDesc: "q=cusco, year=2023" },
  ];

  let active: ActiveFilters | undefined;
  let session: Session = { country: "PE", updatedAt: Date.now() };

  for (const t of turns) {
    const parsed = parseIntent(t.input, session.country);
    assert(`"${t.input}" intent`, parsed.intent, t.expectIntent);
    active = mergeFilters(active, parsed.filters, parsed.intent);
    session = { ...session, activeFilters: active };

    if (t.expectFilterDesc) {
      const got = `${active?.q ? "q=" + active.q : ""}${active?.year ? ", year=" + active.year : ""}${active?.red_flag ? ", red_flag=true" : ""}`.replace(/^, /, "");
      assert(`  filter state matches`,  got.toLowerCase(), t.expectFilterDesc.toLowerCase());
    }
  }
}

section("L5: simulated — entity accumulation across turns");
{
  let entities: MentionedEntities = { regions: [], rucs: [], companies: [], years: [] };
  const inputs = [
    "obras en Lima 2024",
    "ahora Piura 2023",
    "investigar Odebrecht",
    "y el RUC 20123456789?",
  ];

  for (const text of inputs) {
    const parsed = parseIntent(text, "PE");
    const turn = extractTurnEntities(text, parsed);
    entities = mergeEntities(entities, turn);
  }

  assertContains("regions has lima",     entities.regions.join("|").toLowerCase(), "lima");
  assertContains("regions has piura",    entities.regions.join("|").toLowerCase(), "piura");
  assertContains("companies has Odebrecht", entities.companies.join("|"),        "Odebrecht");
  assert("years contains 2024",          entities.years.includes(2024),            true);
  assert("years contains 2023",          entities.years.includes(2023),            true);
}

section("L5: simulated — returning user with profile defaults");
{
  // First visit: user doesn't have a profile yet.
  const profile1: UserProfile | null = null;
  const session1: Session = { country: "PE", updatedAt: Date.now() };
  const ctx1 = buildUserContext(profile1, session1);
  assert("new user → empty context",     ctx1, "");

  // Second visit: profile populated, session is empty (24h passed).
  const profile2: UserProfile = {
    phone: "+51999",
    displayName: "María",
    defaultCountry: "PE",
    defaultRegion: "Arequipa",
    language: "es",
    totalQueries: 12,
    firstSeen: Date.now() - 30 * 86400000,
    lastSeen: Date.now() - 86400000,
  };
  const session2: Session = { country: "PE", updatedAt: Date.now() };
  const ctx2 = buildUserContext(profile2, session2);
  assertContains("returning user shown name",      ctx2, "María");
  assertContains("returning user shown region",    ctx2, "Arequipa");
  assertContains("recurring flag",                 ctx2, "recurrente");
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
