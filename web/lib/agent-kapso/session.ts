export type Country = "PE" | "CL" | string;

export interface Session {
  country: Country;
  lastQuery?: string;
  lastResultIds?: number[];
  updatedAt: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min
const store = new Map<string, Session>();

export function getSession(conversationId: string): Session {
  const s = store.get(conversationId);
  if (s && Date.now() - s.updatedAt < SESSION_TTL_MS) return s;
  const fresh: Session = { country: "PE", updatedAt: Date.now() };
  store.set(conversationId, fresh);
  return fresh;
}

export function updateSession(conversationId: string, patch: Partial<Session>): void {
  const s = getSession(conversationId);
  store.set(conversationId, { ...s, ...patch, updatedAt: Date.now() });
}

// Prune expired sessions every 10 min to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.updatedAt > SESSION_TTL_MS) store.delete(k);
  }
}, 10 * 60 * 1000);
