import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { query } from "@/lib/db";

let _groq: Groq | null = null;
function getGroq() {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

type ChatMessage = {
  role: string;
  content: string;
};

function toGroqMessage(message: ChatMessage) {
  return { role: message.role === "bot" ? "assistant" : message.role, content: message.content };
}

// ROUTER PROMPT
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const chatHistory: ChatMessage[] = body.messages || [{ role: "user", content: body.message }];
    const lastUserMessage = chatHistory[chatHistory.length - 1]?.content;

    if (!lastUserMessage) {
      return NextResponse.json({ error: "Mensaje es requerido" }, { status: 400 });
    }

    // --- STEP 1: ROUTER ---
    const routerResponse = await getGroq().chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT_ROUTER },
        ...chatHistory.map(toGroqMessage),
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const routerOutput = JSON.parse(routerResponse.choices[0]?.message?.content || "{}");
    const intent = routerOutput.intent || "NEEDS_SQL";

    // --- STEP 2: BRANCHING ---

    if (intent === "NEEDS_CLARIFICATION") {
      return NextResponse.json({
        reply: "Por favor sé un poco más específico para poder ayudarte. Aquí tienes algunas opciones sugeridas:",
        suggested_questions: routerOutput.suggested_questions || ["¿Qué obras hay en Lima?", "¿Cuáles son las obras con mayor presupuesto?"],
        intent,
      });
    }

    if (intent === "ANSWER_FROM_CONTEXT") {
      const contextResponse = await getGroq().chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT_ANSWER_CONTEXT },
          ...chatHistory.map(toGroqMessage),
        ],
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
      });

      return NextResponse.json({
        reply: contextResponse.choices[0]?.message?.content?.trim(),
        intent,
      });
    }

    // intent === "NEEDS_SQL"

    // Sliding window para SQL Generator: Solo los últimos 4 mensajes
    const slidingWindow = chatHistory.slice(-4);

    const sqlResponse = await getGroq().chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT_SQL },
        ...slidingWindow.map(toGroqMessage),
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      max_tokens: 300,
    });

    let sqlQuery = sqlResponse.choices[0]?.message?.content?.trim() || "";
    sqlQuery = sqlQuery.replace(/^```(sql)?/, "").replace(/```$/, "").trim();

    if (!sqlQuery.toUpperCase().startsWith("SELECT")) {
      console.error("Invalid SQL generated:", sqlQuery);
      return NextResponse.json(
        { error: "El agente no pudo generar una consulta segura válida." },
        { status: 500 }
      );
    }

    let dbResults;
    try {
      dbResults = await query(sqlQuery);
    } catch (dbError) {
      console.error("Database error executing generated SQL:", sqlQuery, dbError);
      return NextResponse.json(
        { error: "Hubo un error al consultar la base de datos de obras." },
        { status: 500 }
      );
    }

    if (dbResults.length === 0) {
      return NextResponse.json({
        reply: "No encontré resultados exactos con esos filtros. ¿Podrías intentar una búsqueda ligeramente distinta?",
        suggested_questions: ["¿Buscar por el sector de la obra?", "¿Intentar buscando por Provincia?", "¿Probar con otro año?"],
        intent: "NEEDS_CLARIFICATION",
      });
    }

    // Synthesis step
    const synthesisResponse = await getGroq().chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT_SYNTHESIS },
        ...chatHistory.map(toGroqMessage),
        { role: "user", content: `Resultados de la Base de Datos para mi última consulta:\n${JSON.stringify(dbResults)}` },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_tokens: 500,
    });

    const synthesis = synthesisResponse.choices[0]?.message?.content?.trim();

    return NextResponse.json({
      reply: synthesis,
      sql: sqlQuery,
      raw_results: dbResults.length,
      intent,
    });
  } catch (error) {
    console.error("Agent error:", error);
    return NextResponse.json(
      { error: "Error procesando la solicitud del agente." },
      { status: 500 }
    );
  }
}
