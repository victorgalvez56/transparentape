import { query, queryOne } from "../db";
import { AGENT } from "./config";
import type { BuscarObrasFilters } from "./queries";

export type Country = "PE" | "CL" | string;

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

// Filters that survive across turns within the same BUSCAR_OBRAS thread.
// Reset when the user starts a clearly unrelated topic.
export type ActiveFilters = Omit<BuscarObrasFilters, "limit">;

export interface MentionedEntities {
  regions: string[];   // free-text geographic terms (last N, deduped)
  rucs: string[];      // 8-12 digit fiscal IDs
  companies: string[]; // contractor names from INVESTIGAR_CONTRATISTA
  years: number[];     // years referenced
}

export interface Session {
  country: Country;
  lastQuery?: string;
  lastResultIds?: number[];
  lastMessages?: ChatMsg[];
  lastLocation?: { lat: number; lng: number };
  activeFilters?: ActiveFilters;
  mentionedEntities?: MentionedEntities;
  sessionSummary?: string;
  summaryMsgCount?: number;
  updatedAt: number;
}

export interface UserProfile {
  phone: string;
  displayName?: string;
  defaultCountry?: Country;
  defaultRegion?: string;
  language: string;
  totalQueries: number;
  commonTopics?: Record<string, number>;
  firstSeen: number;
  lastSeen: number;
}

const MAX_HISTORY = AGENT.limits.historyPairs * 2;
const MAX_ENTITIES = 10; // per-bucket cap for mentioned_entities

export async function getSession(conversationId: string): Promise<Session> {
  try {
    const row = await queryOne<{
      country: string;
      last_query: string | null;
      last_result_ids: number[] | null;
      last_messages: ChatMsg[] | null;
      last_location: { lat: number; lng: number } | null;
      active_filters: ActiveFilters | null;
      mentioned_entities: MentionedEntities | null;
      session_summary: string | null;
      summary_msg_count: number | null;
      updated_at: string;
    }>(
      `SELECT country, last_query, last_result_ids, last_messages, last_location,
              active_filters, mentioned_entities, session_summary, summary_msg_count,
              updated_at
       FROM agent_sessions WHERE conversation_id = $1
         AND updated_at > NOW() - ($2 * INTERVAL '1 minute')`,
      [conversationId, AGENT.limits.sessionTtlMinutes]
    );
    if (row) {
      return {
        country: row.country as Country,
        lastQuery: row.last_query ?? undefined,
        lastResultIds: row.last_result_ids ?? undefined,
        lastMessages: row.last_messages ?? undefined,
        lastLocation: row.last_location ?? undefined,
        activeFilters: row.active_filters ?? undefined,
        mentionedEntities: row.mentioned_entities ?? undefined,
        sessionSummary: row.session_summary ?? undefined,
        summaryMsgCount: row.summary_msg_count ?? 0,
        updatedAt: new Date(row.updated_at).getTime(),
      };
    }
  } catch (e) {
    console.error("[session] getSession error:", e);
  }
  return { country: "PE", updatedAt: Date.now() };
}

export async function updateSession(
  conversationId: string,
  patch: Partial<Session>
): Promise<void> {
  // Atomic upsert: COALESCE per column means a patch that omits a field
  // preserves its existing value, without a read-then-write race window.
  // Pass NULL for fields not in the patch; existing row keeps its value.
  try {
    await query(
      `INSERT INTO agent_sessions(conversation_id, country, last_query, last_result_ids,
                                  last_messages, last_location, active_filters,
                                  mentioned_entities, session_summary, summary_msg_count,
                                  updated_at)
       VALUES ($1, COALESCE($2, 'PE'), $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 0), NOW())
       ON CONFLICT (conversation_id) DO UPDATE SET
         country            = COALESCE($2, agent_sessions.country),
         last_query         = COALESCE($3, agent_sessions.last_query),
         last_result_ids    = COALESCE($4, agent_sessions.last_result_ids),
         last_messages      = COALESCE($5::jsonb, agent_sessions.last_messages),
         last_location      = COALESCE($6::jsonb, agent_sessions.last_location),
         active_filters     = COALESCE($7::jsonb, agent_sessions.active_filters),
         mentioned_entities = COALESCE($8::jsonb, agent_sessions.mentioned_entities),
         session_summary    = COALESCE($9, agent_sessions.session_summary),
         summary_msg_count  = COALESCE($10, agent_sessions.summary_msg_count),
         updated_at         = NOW()`,
      [
        conversationId,
        patch.country ?? null,
        patch.lastQuery ?? null,
        patch.lastResultIds ?? null,
        patch.lastMessages ? JSON.stringify(patch.lastMessages) : null,
        patch.lastLocation ? JSON.stringify(patch.lastLocation) : null,
        patch.activeFilters ? JSON.stringify(patch.activeFilters) : null,
        patch.mentionedEntities ? JSON.stringify(patch.mentionedEntities) : null,
        patch.sessionSummary ?? null,
        patch.summaryMsgCount ?? null,
      ]
    );
  } catch (e) {
    console.error("[session] updateSession error:", e);
  }
}

// Clears only active_filters (and last_result_ids since the ordinal references
// no longer apply). Used when the user pivots to a different topic but we
// still want to keep entities/summary/history accumulated.
export async function clearActiveFilters(conversationId: string): Promise<void> {
  try {
    await query(
      `UPDATE agent_sessions SET active_filters = NULL, last_result_ids = NULL,
                                  updated_at = NOW()
       WHERE conversation_id = $1`,
      [conversationId]
    );
  } catch (e) {
    console.error("[session] clearActiveFilters error:", e);
  }
}

// Hard reset for session-level state (active filters, entities, summary, history).
// Used when the user clearly starts a new topic. Preserves profile-derived fields
// (country) and connection metadata.
export async function resetSessionContext(conversationId: string): Promise<void> {
  try {
    await query(
      `UPDATE agent_sessions SET
         last_query         = NULL,
         last_result_ids    = NULL,
         last_messages      = NULL,
         active_filters     = NULL,
         mentioned_entities = NULL,
         session_summary    = NULL,
         summary_msg_count  = 0,
         updated_at         = NOW()
       WHERE conversation_id = $1`,
      [conversationId]
    );
  } catch (e) {
    console.error("[session] resetSessionContext error:", e);
  }
}

export function appendToHistory(
  existing: ChatMsg[] | undefined,
  userMsg: string,
  assistantMsg: string
): ChatMsg[] {
  const history = existing ?? [];
  const next: ChatMsg[] = [
    ...history,
    { role: "user", content: userMsg },
    { role: "assistant", content: assistantMsg },
  ];
  return next.slice(-MAX_HISTORY);
}

// Atomic alternative to read-modify-write via appendToHistory + updateSession.
// Two concurrent webhooks for the same user can otherwise both read the same
// last_messages, both append their pair, and the second write loses the first.
// This does the append + slice entirely in SQL so the existing row is the
// only source of truth.
export async function appendHistoryAtomic(
  conversationId: string,
  userMsg: string,
  assistantMsg: string
): Promise<void> {
  const pair = JSON.stringify([
    { role: "user", content: userMsg },
    { role: "assistant", content: assistantMsg },
  ]);
  try {
    await query(
      `INSERT INTO agent_sessions (conversation_id, country, last_messages, updated_at)
       VALUES ($1, 'PE', $2::jsonb, NOW())
       ON CONFLICT (conversation_id) DO UPDATE SET
         last_messages = (
           WITH combined AS (
             SELECT value, ord
             FROM jsonb_array_elements(
               COALESCE(agent_sessions.last_messages, '[]'::jsonb) || EXCLUDED.last_messages
             ) WITH ORDINALITY AS t(value, ord)
           )
           SELECT COALESCE(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
           FROM combined
           WHERE ord > (SELECT COUNT(*) FROM combined) - $3
         ),
         updated_at = NOW()`,
      [conversationId, pair, MAX_HISTORY]
    );
  } catch (e) {
    console.error("[session] appendHistoryAtomic error:", e);
  }
}

// Dedups + appends to a string array, keeping the last MAX_ENTITIES.
export function appendEntity(arr: string[] | undefined, value: string | undefined | null): string[] {
  if (!value) return arr ?? [];
  const v = value.trim();
  if (!v) return arr ?? [];
  const without = (arr ?? []).filter((x) => x.toLowerCase() !== v.toLowerCase());
  return [...without, v].slice(-MAX_ENTITIES);
}

export function appendEntityNum(arr: number[] | undefined, value: number | undefined | null): number[] {
  if (value == null || !Number.isFinite(value)) return arr ?? [];
  const without = (arr ?? []).filter((x) => x !== value);
  return [...without, value].slice(-MAX_ENTITIES);
}

// ─── User profile (persistent, no TTL) ────────────────────────────────────────

export async function getProfile(phone: string): Promise<UserProfile | null> {
  try {
    const row = await queryOne<{
      phone: string;
      display_name: string | null;
      default_country: string | null;
      default_region: string | null;
      language: string;
      total_queries: number;
      common_topics: Record<string, number> | null;
      first_seen: string;
      last_seen: string;
    }>(
      `SELECT phone, display_name, default_country, default_region, language,
              total_queries, common_topics, first_seen, last_seen
       FROM user_profile WHERE phone = $1`,
      [phone]
    );
    if (!row) return null;
    return {
      phone: row.phone,
      displayName: row.display_name ?? undefined,
      defaultCountry: (row.default_country ?? undefined) as Country | undefined,
      defaultRegion: row.default_region ?? undefined,
      language: row.language,
      totalQueries: row.total_queries,
      commonTopics: row.common_topics ?? undefined,
      firstSeen: new Date(row.first_seen).getTime(),
      lastSeen: new Date(row.last_seen).getTime(),
    };
  } catch (e) {
    console.error("[session] getProfile error:", e);
    return null;
  }
}

// Bumps total_queries, updates last_seen, and merges a topic counter delta
// (e.g. { "BUSCAR_OBRAS": 1, "PE": 1, "piura": 1 }) into common_topics.
// Optionally sets display_name and default_country if currently NULL.
export async function bumpProfile(
  phone: string,
  topicDelta: Record<string, number>,
  opts: { displayName?: string; defaultCountry?: Country } = {}
): Promise<void> {
  try {
    await query(
      `INSERT INTO user_profile (phone, display_name, default_country, common_topics,
                                  total_queries, first_seen, last_seen)
       VALUES ($1, $2, $3, $4::jsonb, 1, NOW(), NOW())
       ON CONFLICT (phone) DO UPDATE SET
         display_name    = COALESCE(user_profile.display_name, $2),
         default_country = COALESCE(user_profile.default_country, $3),
         common_topics   = (
           SELECT jsonb_object_agg(key, total)
           FROM (
             SELECT key, SUM(v::int) AS total FROM (
               SELECT key, value AS v
                 FROM jsonb_each_text(COALESCE(user_profile.common_topics, '{}'::jsonb))
               UNION ALL
               SELECT key, value AS v
                 FROM jsonb_each_text($4::jsonb)
             ) all_pairs
             GROUP BY key
           ) summed
         ),
         total_queries   = user_profile.total_queries + 1,
         last_seen       = NOW()`,
      [
        phone,
        opts.displayName ?? null,
        opts.defaultCountry ?? null,
        JSON.stringify(topicDelta),
      ]
    );
  } catch (e) {
    console.error("[session] bumpProfile error:", e);
  }
}

export async function setProfileDefaults(
  phone: string,
  patch: { defaultCountry?: Country; defaultRegion?: string; language?: string }
): Promise<void> {
  try {
    await query(
      `INSERT INTO user_profile (phone, default_country, default_region, language)
       VALUES ($1, $2, $3, COALESCE($4, 'es'))
       ON CONFLICT (phone) DO UPDATE SET
         default_country = COALESCE($2, user_profile.default_country),
         default_region  = COALESCE($3, user_profile.default_region),
         language        = COALESCE($4, user_profile.language),
         last_seen       = NOW()`,
      [phone, patch.defaultCountry ?? null, patch.defaultRegion ?? null, patch.language ?? null]
    );
  } catch (e) {
    console.error("[session] setProfileDefaults error:", e);
  }
}
