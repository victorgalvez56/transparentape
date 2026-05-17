import Groq from "groq-sdk";
import { query } from "@/lib/db";
import type { ChatMsg } from "./session";
import { AGENT } from "./config";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Utilities ─────────────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`LLM timeout after ${ms}ms`)), ms)
    ),
  ]);
}

const DANGEROUS_SQL =
  /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE|COPY|VACUUM|ANALYZE)\b/i;

function isValidSelectQuery(sql: string): boolean {
  const trimmed = sql.trim();
  if (!trimmed.toUpperCase().startsWith("SELECT")) return false;
  if (trimmed.includes(";")) return false;
  if (DANGEROUS_SQL.test(trimmed)) return false;
  return true;
}

function toGroqHistory(
  history: ChatMsg[]
): Groq.Chat.Completions.ChatCompletionMessageParam[] {
  return history.map((m) => ({ role: m.role, content: m.content }));
}

function fmtSuggestions(suggestions: string[]): string {
  if (!suggestions.length) return "";
  return (
    "\n\nPuedes intentar:\n" +
    suggestions.map((s, i) => `${i + 1}️⃣ ${s}`).join("\n")
  );
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_ROUTER = `Eres el enrutador de un agente de obras públicas para WhatsApp.
Analiza el historial y el último mensaje del usuario. Responde ÚNICAMENTE con JSON válido:
{
  "intent": "ANSWER_FROM_CONTEXT" | "NEEDS_SQL" | "NEEDS_CLARIFICATION",
  "suggestions": ["opción 1", "opción 2", "opción 3"]
}

Reglas:
- ANSWER_FROM_CONTEXT: el usuario pide aclaraciones o resúmenes de lo YA dicho (ej: "explícame más", "cuál era el monto", "repite eso").
- NEEDS_SQL: necesita datos nuevos de la BD (nueva región, año, contratista, comparación).
- NEEDS_CLARIFICATION: mensaje ambiguo sin contexto suficiente. En "suggestions" pon 3 consultas útiles de ejemplo.`;

const SYSTEM_PROMPT_CONTEXT = `Eres un asistente de obras públicas en WhatsApp. Responde la última pregunta del usuario basándote ÚNICAMENTE en el historial de conversación. No inventes datos. Sé breve (máx 3 párrafos). Usa *negrita* para nombres de obras y montos importantes.`;

const SYSTEM_PROMPT_SQL = `Eres un traductor SQL de alta precisión para una BD PostgreSQL de obras públicas latinoamericanas.
Contexto de conversación disponible — úsalo para resolver pronombres ("esa obra", "el primero", "ese contratista").

ESQUEMA — tabla "obras":
- id (int), ocid (text)
- country (text, código ISO: 'PE', 'CL', 'CO', etc.)
- tender_title (text, código de proceso — NO usar como nombre)
- tender_description (text, nombre humano de la obra — usar para mostrar al usuario)
- buyer_region (text, departamento/región)
- buyer_locality (text, provincia/distrito)
- buyer_name (text, entidad compradora)
- supplier_name (text, empresa contratista)
- supplier_ruc (text)
- contract_amount (numeric, monto del contrato)
- award_amount (numeric, monto adjudicado)
- tender_amount (numeric, monto referencial)
- contract_start (date texto — castear: CAST(contract_start AS DATE))
- contract_status (text)
- procurement_method (text, 'direct' = adjudicación directa)
- source_year (int, año del registro)
- is_red_flag (boolean, alerta de riesgo)
- red_flag_types (text[], tipos de alerta)
- n_amendments (int, número de adendas)

REGLAS:
1. Filtros geográficos: usar ILIKE '%valor%' (case-insensitive).
2. Filtros de año: usar source_year = 20XX (más confiable que parsear contract_start).
3. Si el usuario usa ordinal ("el primero", "la segunda"): extrae el nombre del mensaje anterior del asistente y filtra con tender_description ILIKE '%palabra_clave%'.
4. Seleccionar SIEMPRE: id, tender_description, buyer_region, buyer_locality, contract_amount, is_red_flag. Agregar supplier_name, red_flag_types solo si el usuario pide detalles.
5. ORDER BY COALESCE(contract_amount, award_amount, tender_amount) DESC NULLS LAST.
6. LIMIT 5 para listas, LIMIT 1 para búsqueda de obra específica.
7. Solo SELECT. Prohibido INSERT/UPDATE/DELETE y punto y coma.
8. DEVUELVE SOLO LA QUERY SQL VÁLIDA. Sin markdown ni explicaciones.`;

const SYSTEM_PROMPT_SYNTHESIS = `Sintetiza resultados de BD para el usuario de WhatsApp. Restricciones:
1. Máximo 1 párrafo introductorio + 3 viñetas.
2. Cada viñeta: *Nombre de obra* (usar tender_description, no tender_title), 💰 monto resumido (S/ 15M), estado.
3. Agregar contratista o alertas solo si el usuario los pidió explícitamente.
4. Si hay is_red_flag=true, agregar ⚠️ al inicio de esa viñeta.
5. No usar tender_title ni ocid ni id como nombre — son códigos ilegibles.
6. Formato WhatsApp: *negrita* con asteriscos simples. Sin markdown extra.
7. Respuesta máxima: 800 caracteres.`;

// ── Main export ───────────────────────────────────────────────────────────────

export async function chatEngine(
  message: string,
  history: ChatMsg[] = []
): Promise<string> {
  if (!message || message.length > AGENT.limits.maxInputChars) {
    return "Consulta muy larga. Intenta con una pregunta más corta.";
  }

  const historyMsgs = toGroqHistory(history);
  const userTurn: Groq.Chat.Completions.ChatCompletionMessageParam = {
    role: "user",
    content: message,
  };

  // ── STEP 1: Router ──────────────────────────────────────────────────────────
  let routerIntent: "ANSWER_FROM_CONTEXT" | "NEEDS_SQL" | "NEEDS_CLARIFICATION" =
    "NEEDS_SQL";
  let routerSuggestions: string[] = [];

  try {
    const routerRes = await withTimeout(
      groq.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT_ROUTER },
          ...historyMsgs,
          userTurn,
        ],
        model: AGENT.models.fast,
        temperature: AGENT.temperature.router,
        response_format: { type: "json_object" },
        max_tokens: AGENT.maxTokens.router,
      }),
      AGENT.timeoutMs.router
    );
    const parsed = JSON.parse(
      routerRes.choices[0]?.message?.content ?? "{}"
    );
    routerIntent = parsed.intent ?? "NEEDS_SQL";
    routerSuggestions = parsed.suggestions ?? [];
  } catch {
    // router failed or timed out → default to SQL path
  }

  // ── STEP 2: Branch ──────────────────────────────────────────────────────────

  if (routerIntent === "NEEDS_CLARIFICATION") {
    const defaults = [
      "obras en Lima 2024",
      "ranking contratistas Perú",
      "estadísticas Chile",
    ];
    return (
      "No entendí bien tu consulta." +
      fmtSuggestions(routerSuggestions.length ? routerSuggestions : defaults)
    );
  }

  if (routerIntent === "ANSWER_FROM_CONTEXT") {
    if (!history.length) {
      return "Aún no tenemos conversación previa. Pregunta por obras en una región o año específico.";
    }
    const ctxRes = await withTimeout(
      groq.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT_CONTEXT },
          ...historyMsgs,
          userTurn,
        ],
        model: AGENT.models.fast,
        temperature: AGENT.temperature.context,
        max_tokens: AGENT.maxTokens.context,
      }),
      AGENT.timeoutMs.context
    );
    return ctxRes.choices[0]?.message?.content?.trim() ?? "Sin respuesta.";
  }

  // ── STEP 3: NEEDS_SQL — gen + exec + synthesis ──────────────────────────────

  const slidingWindow = toGroqHistory(history.slice(-AGENT.limits.sqlContextWindow));

  const sqlRes = await withTimeout(
    groq.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT_SQL },
        ...slidingWindow,
        userTurn,
      ],
      model: AGENT.models.powerful,
      temperature: AGENT.temperature.sql,
      max_tokens: AGENT.maxTokens.sql,
    }),
    AGENT.timeoutMs.sql
  );

  let sqlQuery = sqlRes.choices[0]?.message?.content?.trim() ?? "";
  sqlQuery = sqlQuery.replace(/^```(sql)?/i, "").replace(/```$/, "").trim();

  if (!isValidSelectQuery(sqlQuery)) {
    return (
      "No pude generar una consulta válida." +
      fmtSuggestions([
        "obras en Piura 2024",
        "obras con alerta en Lima",
        "ranking contratistas Perú",
      ])
    );
  }

  let dbResults: unknown[];
  try {
    const rows = await query(sqlQuery);
    dbResults = rows.slice(0, AGENT.limits.maxDbResults);
  } catch {
    return "Error al consultar la base de datos. Intenta reformular la pregunta.";
  }

  if (!dbResults.length) {
    return (
      "No encontré obras con esos filtros." +
      fmtSuggestions([
        "Buscar en otra región",
        "Probar con otro año",
        "Ver obras con alerta",
      ])
    );
  }

  const synthesisRes = await withTimeout(
    groq.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT_SYNTHESIS },
        ...slidingWindow,
        userTurn,
        {
          role: "user",
          content: `Resultados de la BD:\n${JSON.stringify(dbResults)}`,
        },
      ],
      model: AGENT.models.fast,
      temperature: AGENT.temperature.synthesis,
      max_tokens: AGENT.maxTokens.synthesis,
    }),
    AGENT.timeoutMs.synthesis
  );

  return synthesisRes.choices[0]?.message?.content?.trim() ?? "Sin respuesta.";
}
