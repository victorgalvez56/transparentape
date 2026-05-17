import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

let pool: Pool | null = null;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  if (!hasDatabase()) {
    throw new Error("DATABASE_URL is not set");
  }
  if (global.__pgPool) return global.__pgPool;
  if (pool) return pool;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    ssl: { rejectUnauthorized: false },
  });
  // Hard cap on per-statement runtime. LLM-generated SQL with missing WHERE
  // clauses or pathological joins can otherwise saturate the small (max 5)
  // pool and cause request timeouts elsewhere. 5s is plenty for the
  // pre-aggregated obras table; statement_timeout raises a clean error that
  // bubbles up as a CLARIFY in runChatPipeline.
  pool.on("connect", (client) => {
    client.query("SET statement_timeout = 5000").catch(() => {});
  });
  if (process.env.NODE_ENV !== "production") {
    global.__pgPool = pool;
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
