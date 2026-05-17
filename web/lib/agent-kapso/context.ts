import Groq from "groq-sdk";
import { AGENT } from "./config";
import type {
  ActiveFilters,
  ChatMsg,
  MentionedEntities,
  Session,
  UserProfile,
} from "./session";
import { appendEntity, appendEntityNum } from "./session";
import type { ParsedIntent } from "./intent";
import type { Intent } from "./intent";
import type { BuscarObrasFilters, Country } from "./queries";

// Lazy — context.ts is imported from pure consumers (tests, benches) that
// don't need Groq. Initializing at module load would crash them when
// GROQ_API_KEY isn't set.
let groqClient: Groq | null = null;
function getGroq(): Groq {
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

// ── Filter accumulation ───────────────────────────────────────────────────────

// Intents that share a "search session" — we keep filters alive across these.
const SEARCH_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  "BUSCAR_OBRAS",
  "BUSCAR_CERCANOS",
  "CONTEXTO_DETALLE",
  "VER_DETALLE",
]);

// Intents that imply the user moved to a different topic — reset filters.
const TOPIC_BREAK_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  "AYUDA",
  "STATS",
  "MONTO_EN_RIESGO",
  "RANKING_CONTRATISTAS",
  "RANKING_ENTIDADES",
  "ADJUDICACION_DIRECTA",
  "INVESTIGAR_CONTRATISTA",
  "INHABILITADOS",
]);

export function mergeFilters(
  active: ActiveFilters | undefined,
  parsed: BuscarObrasFilters | undefined,
  intent: Intent
): ActiveFilters | undefined {
  // Topic break wipes the search context entirely.
  if (TOPIC_BREAK_INTENTS.has(intent)) return undefined;

  // Only accumulate for search-related intents.
  if (!SEARCH_INTENTS.has(intent)) return active;

  if (!parsed) return active;
  const merged: ActiveFilters = { ...(active ?? {}) };

  // Each field follows "new value wins, otherwise keep previous". `q` is the
  // free-text geo term; replacing it is correct when the user moves regions.
  if (parsed.country) merged.country = parsed.country;
  if (parsed.year !== undefined) merged.year = parsed.year;
  if (parsed.red_flag !== undefined) merged.red_flag = parsed.red_flag;
  if (parsed.contratista) merged.contratista = parsed.contratista;
  if (parsed.ruc) merged.ruc = parsed.ruc;
  if (parsed.procurement_method) merged.procurement_method = parsed.procurement_method;
  if (parsed.q) merged.q = parsed.q;
  return merged;
}

// Returns the filter set to actually execute for a BUSCAR_OBRAS turn:
// the merged-active filters (cumulative across turns). If parsing extracted
// nothing new, prior filters still apply ("ahora con alerta" → keeps q+year).
export function effectiveSearchFilters(
  active: ActiveFilters | undefined,
  parsed: BuscarObrasFilters | undefined,
  country: Country
): BuscarObrasFilters {
  const base = mergeFilters(active, parsed, "BUSCAR_OBRAS") ?? {};
  return { country, ...base };
}

// ── Entity extraction ─────────────────────────────────────────────────────────

// Pulls entities out of a single parsed turn. No LLM, no DB calls — just uses
// what parseIntent already extracted plus a numeric regex for stray RUCs/years.
export function extractTurnEntities(
  text: string,
  parsed: ParsedIntent
): Partial<MentionedEntities> {
  const out: Partial<MentionedEntities> = {};

  // Region: parsed.filters.q is the cleaned free-text term from the user.
  if (parsed.filters?.q) out.regions = [parsed.filters.q];

  // RUC: from parsed (preferred) or from a bare numeric in text.
  const rucs: string[] = [];
  if (parsed.ruc) rucs.push(parsed.ruc);
  if (parsed.filters?.ruc) rucs.push(parsed.filters.ruc);
  const numericRuc = text.match(/\b\d{8,12}\b/);
  if (numericRuc && !rucs.includes(numericRuc[0])) rucs.push(numericRuc[0]);
  if (rucs.length) out.rucs = rucs;

  // Company name from INVESTIGAR_CONTRATISTA.
  if (parsed.contratista) out.companies = [parsed.contratista];
  if (parsed.filters?.contratista) {
    out.companies = [...(out.companies ?? []), parsed.filters.contratista];
  }

  // Years from parsed or text.
  const years: number[] = [];
  if (parsed.filters?.year) years.push(parsed.filters.year);
  const yearMatch = text.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1]);
    if (!years.includes(y)) years.push(y);
  }
  if (years.length) out.years = years;

  return out;
}

export function mergeEntities(
  existing: MentionedEntities | undefined,
  turn: Partial<MentionedEntities>
): MentionedEntities {
  const base: MentionedEntities = {
    regions: existing?.regions ?? [],
    rucs: existing?.rucs ?? [],
    companies: existing?.companies ?? [],
    years: existing?.years ?? [],
  };
  for (const r of turn.regions ?? []) base.regions = appendEntity(base.regions, r);
  for (const r of turn.rucs ?? []) base.rucs = appendEntity(base.rucs, r);
  for (const c of turn.companies ?? []) base.companies = appendEntity(base.companies, c);
  for (const y of turn.years ?? []) base.years = appendEntityNum(base.years, y);
  return base;
}

// ── User context prompt prefix ────────────────────────────────────────────────

// Builds a compact context block to prepend to LLM system prompts so the model
// has the user's identity and active state without us shoving the whole
// session into every call. Stays under ~150 tokens.
export function buildUserContext(profile: UserProfile | null, session: Session): string {
  const lines: string[] = [];

  if (profile) {
    const who: string[] = [];
    if (profile.displayName) who.push(`nombre: ${profile.displayName}`);
    if (profile.defaultCountry && profile.defaultCountry !== session.country) {
      who.push(`país por defecto: ${profile.defaultCountry}`);
    }
    if (profile.defaultRegion) who.push(`región habitual: ${profile.defaultRegion}`);
    if (profile.totalQueries >= 5) who.push(`usuario recurrente (${profile.totalQueries} consultas)`);
    if (who.length) lines.push(`Usuario — ${who.join(", ")}.`);
  }

  if (session.sessionSummary) {
    lines.push(`Resumen previo: ${session.sessionSummary}`);
  }

  const ent = session.mentionedEntities;
  if (ent) {
    const parts: string[] = [];
    if (ent.regions?.length) parts.push(`regiones: ${ent.regions.slice(-3).join(", ")}`);
    if (ent.companies?.length) parts.push(`empresas: ${ent.companies.slice(-3).join(", ")}`);
    if (ent.rucs?.length) parts.push(`RUCs: ${ent.rucs.slice(-3).join(", ")}`);
    if (ent.years?.length) parts.push(`años: ${ent.years.slice(-3).join(", ")}`);
    if (parts.length) lines.push(`Mencionado en este chat — ${parts.join("; ")}.`);
  }

  const af = session.activeFilters;
  if (af && Object.keys(af).length > 0) {
    const parts: string[] = [];
    if (af.q) parts.push(`zona=${af.q}`);
    if (af.year) parts.push(`año=${af.year}`);
    if (af.red_flag) parts.push(`con alerta`);
    if (af.procurement_method) parts.push(`método=${af.procurement_method}`);
    if (af.contratista) parts.push(`contratista=${af.contratista}`);
    if (af.ruc) parts.push(`RUC=${af.ruc}`);
    if (parts.length) lines.push(`Filtros activos: ${parts.join(", ")}.`);
  }

  return lines.length ? `CONTEXTO DEL USUARIO:\n${lines.join("\n")}\n\n` : "";
}

// ── Rolling summary ───────────────────────────────────────────────────────────

const SUMMARY_PROMPT = `Eres un sumarizador. Recibirás los últimos mensajes de una conversación entre un ciudadano y un bot de obras públicas. Devuelve UN solo párrafo de 1-2 frases (máximo 200 caracteres) capturando: qué buscaba el usuario, qué información clave ya recibió, y qué temas siguen abiertos. No incluyas saludos, formato ni comillas. Solo el resumen plano.`;

// Returns the new summary string, or null if the call failed or there's nothing
// new to summarize. Pure function — caller persists it.
export async function summarizeHistory(
  history: ChatMsg[],
  previousSummary?: string
): Promise<string | null> {
  if (!history.length) return null;

  // If we already have a summary, fold it in as the "prior context" so the
  // new summary picks up the thread instead of repeating it.
  const promptHistory: ChatMsg[] = previousSummary
    ? [{ role: "assistant", content: `(resumen previo) ${previousSummary}` }, ...history]
    : history;

  try {
    const res = await Promise.race([
      getGroq().chat.completions.create({
        messages: [
          { role: "system", content: SUMMARY_PROMPT },
          ...promptHistory.map((m) => ({ role: m.role, content: m.content })),
        ],
        model: AGENT.models.fast,
        temperature: 0,
        max_tokens: 120,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("summary timeout")), 6_000)
      ),
    ]);
    const text = res.choices[0]?.message?.content?.trim();
    if (!text) return null;
    // Hard cap so a chatty model can't blow the budget.
    return text.slice(0, 240);
  } catch (e) {
    console.error("[context] summarizeHistory error:", e);
    return null;
  }
}

// Decides whether it's time to rebuild the rolling summary.
// Triggers every `historyPairs` new pairs that haven't been folded in yet.
export function shouldResummarize(session: Session): boolean {
  const totalPairs = Math.floor((session.lastMessages?.length ?? 0) / 2);
  const lastSummarizedPairs = Math.floor((session.summaryMsgCount ?? 0) / 2);
  return totalPairs - lastSummarizedPairs >= AGENT.limits.historyPairs;
}
