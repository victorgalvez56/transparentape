import Groq from "groq-sdk";
import { query } from "@/lib/db";

let _groq: Groq | null = null;
function getGroq() {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

export type ChatMessageRole = "user" | "assistant" | "bot" | "system";
export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
}

export type CoreIntent = "ANSWER_FROM_CONTEXT" | "NEEDS_SQL" | "NEEDS_CLARIFICATION";

export interface CoreResult {
  reply: string;
  suggested_questions?: string[];
  intent: CoreIntent;
  sql?: string;
  raw_results?: number;
}

const SYSTEM_PROMPT_ROUTER = `Eres el enrutador principal de un agente de obras públicas de Perú. Tu trabajo es analizar la conversación y la última pregunta del usuario, y decidir qué acción tomar.
Responde ÚNICAMENTE con un JSON válido usando esta estructura:
{
  "intent": "ANSWER_FROM_CONTEXT" | "NEEDS_SQL" | "NEEDS_CLARIFICATION",
  "suggested_questions": ["pregunta 1", "pregunta 2"] // solo si intent es NEEDS_CLARIFICATION
}

Reglas:
- ANSWER_FROM_CONTEXT: Usa esto SOLO si el usuario está pidiendo un resumen, aclaración de lo ya dicho, o haciendo una pregunta cuya respuesta ES EVIDENTE en el historial explícito de mensajes de la IA. Ejemplo: "resume lo último", "¿cuál era el nombre de esa obra que dijiste?".
- NEEDS_SQL: Usa esto si el usuario pide datos nuevos (ej. otra región, nuevo año), O si pide detalles profundos de una obra previamente mencionada que NO ESTÁN en el historial explícito (ej. "dame el detalle", "quién es el contratista", "cuántas adendas tiene").
- NEEDS_CLARIFICATION: Usa esto si el mensaje es un saludo genérico ("hola", "buenos días") o muy ambiguo ("dime de obras", "ayuda"). En "suggested_questions" provee 2 o 3 opciones útiles.`;

const SYSTEM_PROMPT_ANSWER_CONTEXT = `Eres un asistente experto en obras públicas. Tu tarea es responder a la última pregunta del usuario basándote ÚNICAMENTE en el historial de la conversación. No inventes datos que no se hayan mencionado. Si no sabes la respuesta basándote en el historial, díselo educadamente. Sé breve y conciso.`;

const SYSTEM_PROMPT_SQL = `Eres un agente experto en análisis de datos de obras públicas y un backend-translator de alta precisión. Tu único objetivo es actuar en un flujo cerrado de dos pasos: traducción a SQL y síntesis de resultados.
Estás leyendo una conversación, así que presta atención a pronombres o referencias a regiones/obras previas ("esas obras", "la primera", "de ese mismo año").

[PASO 1: TRADUCCIÓN A SQL]
Debes mapear la consulta al siguiente esquema simplificado de la base de datos (PostgreSQL):
- Tabla: "obras"
- Campos BASE: id, tender_title (código de proceso), tender_description (nombre descriptivo de la obra), buyer_region (departamento), buyer_locality (provincia/distrito), contract_amount (presupuesto), contract_start (fecha de inicio), contract_status (estado)
- Campos PESADOS: supplier_name (contratista), n_amendments (adendas), is_red_flag (bandera roja), red_flag_types

Reglas de Consulta:
1. Filtra geográficamente usando LOWER o ILIKE.
2. IMPORTANTE: Para consultas de tiempo (ej: "este año"), DEBES castear las fechas explícitamente a DATE, ej: EXTRACT(YEAR FROM CAST(contract_start AS DATE)) = 2026. Si no lo haces, la consulta fallará.
3. Para consultas generales (ej: "obras en Piura"), selecciona SOLO los Campos BASE. NO incluyas campos pesados a menos que el usuario lo pida explícitamente o pida detalles (ej: "quién es el contratista", "detalle de la obra", "tiene alertas").
4. Ordena SIEMPRE por relevancia económica (ORDER BY contract_amount DESC NULLS LAST) y limita estrictamente usando LIMIT 3 o LIMIT 5, a menos que busquen una obra específica.
5. Genera consultas SQL de SOLO LECTURA (SELECT).
6. DEVUELVE ÚNICAMENTE LA CONSULTA SQL VÁLIDA. No incluyas markdown (\`\`\`), saludos ni explicaciones.
7. CRÍTICO: Cuando el usuario use posiciones ordinales ("el primero", "la segunda", "del tercero"), busca en el mensaje anterior del asistente, extrae el nombre exacto de esa obra, y usa palabras clave con un filtro holgado usando ILIKE (ej: WHERE tender_description ILIKE '%CONECCIONES%'). Usa siempre % alrededor de cada palabra clave para tolerar errores tipográficos de la BD.`;

const SYSTEM_PROMPT_SYNTHESIS = `[PASO 2: SÍNTESIS ULTRA CORTA]
Transforma los datos JSON en una respuesta digerida bajo estas restricciones:
1. Mantén un límite estricto en la conversación: responde en máximo un párrafo corto introductorio y hasta 3 viñetas.
4. Cada viñeta debe incluir solo: Nombre de la obra usando \`tender_description\` (en negrita y omitiendo prefijos irrelevantes como "EJECUCION DE LA OBRA:"), Presupuesto resumido (ej: S/ 15M), Estado actual (y Contratista o Alertas si se pidieron específicamente). NO USES \`tender_title\` ni \`ocid\` como nombre, ya que suelen ser códigos ilegibles.
3. No inventes datos ni incluyas código SQL en la respuesta final. Si los resultados están vacíos, di que no se encontraron obras.`;

const DANGEROUS_SQL = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE|COPY|VACUUM|ANALYZE)\b/i;

function isValidSelectQuery(sql: string): boolean {
  const trimmed = sql.trim();
  if (!trimmed.toUpperCase().startsWith("SELECT")) return false;
  if (trimmed.includes(";")) return false;
  if (DANGEROUS_SQL.test(trimmed)) return false;
  return true;
}

function normalizeHistory(history: ChatMessage[]): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  return history.map((m) => ({
    role: m.role === "bot" ? "assistant" : (m.role as "user" | "assistant" | "system"),
    content: m.content,
  }));
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    ),
  ]);
}

export function generateFallbackQuestions(): string[] {
  return [
    "¿Qué obras hay en Lima?",
    "¿Cuáles son las obras con mayor presupuesto?",
    "¿Qué obras tienen alertas de riesgo?",
  ];
}

export async function runChatPipeline(chatHistory: ChatMessage[]): Promise<CoreResult> {
  const lastUserMessage = chatHistory[chatHistory.length - 1]?.content;
  if (!lastUserMessage) {
    return {
      reply: "Mensaje vacío. Pregunta por obras en una región o año.",
      intent: "NEEDS_CLARIFICATION",
      suggested_questions: generateFallbackQuestions(),
    };
  }

  const normalized = normalizeHistory(chatHistory);

  // STEP 1: Router
  let intent: CoreIntent = "NEEDS_SQL";
  let suggested: string[] | undefined;
  try {
    const routerRes = await withTimeout(
      getGroq().chat.completions.create({
        messages: [{ role: "system", content: SYSTEM_PROMPT_ROUTER }, ...normalized],
        model: "llama-3.1-8b-instant",
        temperature: 0,
        response_format: { type: "json_object" },
        max_tokens: 200,
      }),
      8_000,
      "router"
    );
    const parsed = JSON.parse(routerRes.choices[0]?.message?.content ?? "{}");
    intent = (parsed.intent as CoreIntent) ?? "NEEDS_SQL";
    suggested = Array.isArray(parsed.suggested_questions) ? parsed.suggested_questions.slice(0, 3) : undefined;
  } catch {
    // router failure → fall through to SQL path
  }

  // STEP 2a: NEEDS_CLARIFICATION
  if (intent === "NEEDS_CLARIFICATION") {
    return {
      reply: "Por favor sé un poco más específico para poder ayudarte. Aquí tienes algunas opciones sugeridas:",
      suggested_questions: suggested?.length ? suggested : generateFallbackQuestions(),
      intent,
    };
  }

  // STEP 2b: ANSWER_FROM_CONTEXT
  if (intent === "ANSWER_FROM_CONTEXT") {
    try {
      const ctxRes = await withTimeout(
        getGroq().chat.completions.create({
          messages: [{ role: "system", content: SYSTEM_PROMPT_ANSWER_CONTEXT }, ...normalized],
          model: "llama-3.1-8b-instant",
          temperature: 0.2,
          max_tokens: 400,
        }),
        8_000,
        "context"
      );
      return {
        reply: ctxRes.choices[0]?.message?.content?.trim() ?? "Sin respuesta.",
        intent,
      };
    } catch {
      return {
        reply: "No pude procesar la pregunta de contexto. Intenta reformularla.",
        intent: "NEEDS_CLARIFICATION",
        suggested_questions: generateFallbackQuestions(),
      };
    }
  }

  // STEP 2c: NEEDS_SQL — gen + exec + synthesis
  const slidingWindow = normalized.slice(-4);
  let sqlQuery = "";
  try {
    const sqlRes = await withTimeout(
      getGroq().chat.completions.create({
        messages: [{ role: "system", content: SYSTEM_PROMPT_SQL }, ...slidingWindow],
        model: "llama-3.3-70b-versatile",
        temperature: 0,
        max_tokens: 300,
      }),
      10_000,
      "sql_gen"
    );
    sqlQuery = (sqlRes.choices[0]?.message?.content ?? "").trim()
      .replace(/^```(sql)?/i, "")
      .replace(/```$/, "")
      .trim();
  } catch {
    return {
      reply: "El generador SQL tardó demasiado. Intenta una consulta más específica.",
      intent: "NEEDS_CLARIFICATION",
      suggested_questions: generateFallbackQuestions(),
    };
  }

  if (!isValidSelectQuery(sqlQuery)) {
    return {
      reply: "No pude generar una consulta válida.",
      intent: "NEEDS_CLARIFICATION",
      suggested_questions: generateFallbackQuestions(),
    };
  }

  let dbResults: unknown[] = [];
  try {
    dbResults = await query(sqlQuery);
  } catch {
    return {
      reply: "Hubo un error al consultar la base de datos de obras.",
      intent: "NEEDS_CLARIFICATION",
      suggested_questions: generateFallbackQuestions(),
      sql: sqlQuery,
    };
  }

  if (dbResults.length === 0) {
    return {
      reply: "No encontré resultados exactos con esos filtros. ¿Podrías intentar una búsqueda ligeramente distinta?",
      suggested_questions: ["¿Buscar por el sector de la obra?", "¿Intentar buscando por Provincia?", "¿Probar con otro año?"],
      intent: "NEEDS_CLARIFICATION",
      sql: sqlQuery,
      raw_results: 0,
    };
  }

  // Synthesis
  let synthesis: string;
  try {
    const synthesisRes = await withTimeout(
      getGroq().chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT_SYNTHESIS },
          ...normalized,
          { role: "user", content: `Resultados de la Base de Datos para mi última consulta:\n${JSON.stringify(dbResults.slice(0, 5))}` },
        ],
        model: "llama-3.1-8b-instant",
        temperature: 0.3,
        max_tokens: 500,
      }),
      10_000,
      "synthesis"
    );
    synthesis = synthesisRes.choices[0]?.message?.content?.trim() ?? "Sin respuesta.";
  } catch {
    synthesis = `Encontré ${dbResults.length} resultado(s) pero la síntesis tardó demasiado. Reformula la pregunta.`;
  }

  return {
    reply: synthesis,
    sql: sqlQuery,
    raw_results: dbResults.length,
    intent: "NEEDS_SQL",
  };
}
