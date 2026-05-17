import { query, queryOne } from "../db";

export type Country = "PE" | "CL" | string;

export interface Session {
  country: Country;
  lastQuery?: string;
  lastResultIds?: number[];
  updatedAt: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000;

export async function getSession(conversationId: string): Promise<Session> {
  try {
    const row = await queryOne<{
      country: string;
      last_query: string | null;
      last_result_ids: number[] | null;
      updated_at: string;
    }>(
      `SELECT country, last_query, last_result_ids, updated_at
       FROM agent_sessions WHERE conversation_id = $1
         AND updated_at > NOW() - INTERVAL '30 minutes'`,
      [conversationId]
    );
    if (row) {
      return {
        country: row.country as Country,
        lastQuery: row.last_query ?? undefined,
        lastResultIds: row.last_result_ids ?? undefined,
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
      `INSERT INTO agent_sessions(conversation_id, country, last_query, last_result_ids, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (conversation_id)
       DO UPDATE SET country = $2, last_query = $3, last_result_ids = $4, updated_at = NOW()`,
      [
        conversationId,
        merged.country ?? "PE",
        merged.lastQuery ?? null,
        merged.lastResultIds ?? null,
      ]
    );
  } catch {
    // silent — session loss is acceptable, not fatal
  }
}
