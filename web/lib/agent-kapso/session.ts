import { query, queryOne } from "../db";
import { AGENT } from "./config";

export type Country = "PE" | "CL" | string;

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export interface Session {
  country: Country;
  lastQuery?: string;
  lastResultIds?: number[];
  lastMessages?: ChatMsg[];
  lastLocation?: { lat: number; lng: number };
  updatedAt: number;
}

const MAX_HISTORY = AGENT.limits.historyPairs * 2;

export async function getSession(conversationId: string): Promise<Session> {
  try {
    const row = await queryOne<{
      country: string;
      last_query: string | null;
      last_result_ids: number[] | null;
      last_messages: ChatMsg[] | null;
      last_location: { lat: number; lng: number } | null;
      updated_at: string;
    }>(
      `SELECT country, last_query, last_result_ids, last_messages, last_location, updated_at
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
      `INSERT INTO agent_sessions(conversation_id, country, last_query, last_result_ids, last_messages, last_location, updated_at)
       VALUES ($1, COALESCE($2, 'PE'), $3, $4, $5, $6, NOW())
       ON CONFLICT (conversation_id) DO UPDATE SET
         country         = COALESCE($2, agent_sessions.country),
         last_query      = COALESCE($3, agent_sessions.last_query),
         last_result_ids = COALESCE($4, agent_sessions.last_result_ids),
         last_messages   = COALESCE($5::jsonb, agent_sessions.last_messages),
         last_location   = COALESCE($6::jsonb, agent_sessions.last_location),
         updated_at      = NOW()`,
      [
        conversationId,
        patch.country ?? null,
        patch.lastQuery ?? null,
        patch.lastResultIds ?? null,
        patch.lastMessages ? JSON.stringify(patch.lastMessages) : null,
        patch.lastLocation ? JSON.stringify(patch.lastLocation) : null,
      ]
    );
  } catch (e) {
    console.error("[session] updateSession error:", e);
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
