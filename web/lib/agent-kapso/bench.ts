/**
 * Micro-benchmark for the pure (non-I/O) parts of the agent.
 * Run: npx tsx lib/agent-kapso/bench.ts
 *
 * Measures only what we can without DB/Groq: parseIntent, mergeFilters,
 * extractTurnEntities, buildUserContext. These are the hot CPU paths
 * inside every webhook turn.
 */

import { parseIntent } from "./intent";
import {
  mergeFilters,
  extractTurnEntities,
  mergeEntities,
  buildUserContext,
  effectiveSearchFilters,
} from "./context";
import type {
  ActiveFilters,
  MentionedEntities,
  Session,
  UserProfile,
} from "./session";

function bench(name: string, iters: number, fn: () => void) {
  // warmup
  for (let i = 0; i < 100; i++) fn();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) fn();
  const t1 = process.hrtime.bigint();
  const totalMs = Number(t1 - t0) / 1_000_000;
  const perOp = totalMs / iters;
  const perOpUs = perOp * 1000;
  console.log(
    `  ${name.padEnd(38)} ${iters.toString().padStart(7)} iters → ${perOpUs.toFixed(2).padStart(7)} µs/op (${(iters / (totalMs / 1000)).toFixed(0)} ops/sec)`
  );
}

console.log("\n── Pure CPU paths (no I/O) ─────────────────────────────────────");

bench("parseIntent simple",      100_000, () => parseIntent("obras en Lima 2024", "PE"));
bench("parseIntent ordinal",     100_000, () => parseIntent("el primero", "PE"));
bench("parseIntent ayuda",       100_000, () => parseIntent("hola", "PE"));
bench("parseIntent pregunta libre", 100_000, () => parseIntent("¿quién construyó el aeropuerto?", "PE"));

const filters: ActiveFilters = { q: "lima", year: 2024 };
bench("mergeFilters accumulate", 100_000, () =>
  mergeFilters(filters, { red_flag: true }, "BUSCAR_OBRAS")
);
bench("mergeFilters topic break", 100_000, () =>
  mergeFilters(filters, undefined, "STATS")
);

bench("effectiveSearchFilters",  100_000, () =>
  effectiveSearchFilters(filters, { red_flag: true }, "PE")
);

const parsed = parseIntent("obras en Piura 2024 alerta", "PE");
bench("extractTurnEntities",     100_000, () =>
  extractTurnEntities("obras en Piura 2024 alerta", parsed)
);

const entities: MentionedEntities = {
  regions: ["lima", "piura", "cusco"],
  rucs: ["20100", "20200"],
  companies: ["Odebrecht"],
  years: [2024, 2023],
};
bench("mergeEntities",           100_000, () =>
  mergeEntities(entities, { regions: ["arequipa"], years: [2022] })
);

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
  mentionedEntities: entities,
  sessionSummary: "Usuario consulta obras en Cusco con alertas.",
  updatedAt: Date.now(),
};
bench("buildUserContext full",   100_000, () => buildUserContext(profile, session));
bench("buildUserContext empty",  100_000, () => buildUserContext(null, { country: "PE", updatedAt: Date.now() }));

console.log("\n── End-to-end per turn (CPU only, no I/O) ──────────────────────");

// Simulates everything parseIntent → mergeFilters → extractEntities →
// mergeEntities → buildUserContext does on each turn. This is what runs
// synchronously inside handleMessage before any DB/LLM call.
bench("full per-turn CPU work",  50_000, () => {
  const p = parseIntent("ahora 2024 con alerta", "PE");
  const f = mergeFilters(filters, p.filters, p.intent);
  const e = mergeEntities(entities, extractTurnEntities("ahora 2024 con alerta", p));
  buildUserContext(profile, { ...session, activeFilters: f, mentionedEntities: e });
});

console.log();
