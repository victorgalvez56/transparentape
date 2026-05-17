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
         AND updated_at > NOW() - INTERVAL '${AGENT.limits.sessionTtlMinutes} minutes'`,
      [conversationId]
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
  } catch {
    // table may not exist yet — fall through to default
  }
  return { country: "PE", updatedAt: Date.now() };
}

export async function updateSession(
  conversationId: string,
  patch: Partial<Session>
): Promise<void> {
  const current = await getSession(conversationId);
  const merged = { ...current, ...patch };
  try {
    await query(
      `INSERT INTO agent_sessions(conversation_id, country, last_query, last_result_ids, last_messages, last_location, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (conversation_id)
       DO UPDATE SET country = $2, last_query = $3, last_result_ids = $4, last_messages = $5, last_location = $6, updated_at = NOW()`,
      [
        conversationId,
        merged.country ?? "PE",
        merged.lastQuery ?? null,
        merged.lastResultIds ?? null,
        merged.lastMessages ? JSON.stringify(merged.lastMessages) : null,
        merged.lastLocation ? JSON.stringify(merged.lastLocation) : null,
      ]
    );
  } catch {
    // silent — session loss is acceptable, not fatal
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
