export const AGENT = {
  models: {
    fast: "llama-3.1-8b-instant",       // router, context, synthesis
    powerful: "llama-3.3-70b-versatile", // SQL generation
  },
  temperature: {
    router: 0,
    context: 0,    // deterministic — no creativity needed for recall
    sql: 0,        // deterministic — SQL must be exact
    synthesis: 0,  // deterministic — format is prescriptive
  },
  maxTokens: {
    router: 150,
    context: 400,
    sql: 350,
    synthesis: 500,
  },
  timeoutMs: {
    router: 8_000,
    context: 10_000,
    sql: 15_000,
    synthesis: 10_000,
  },
  limits: {
    maxInputChars: 600,      // reject messages longer than this
    maxDbResults: 10,        // cap rows returned to LLM synthesis
    sqlContextWindow: 4,     // last N messages passed to SQL gen
    historyPairs: 3,         // user+assistant pairs kept in session (6 msgs total)
    sessionTtlMinutes: 30,   // session expiry
    waMaxChars: 4096,        // WhatsApp message length hard cap
  },
} as const;
