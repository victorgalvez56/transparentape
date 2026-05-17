import Groq from "groq-sdk";
import { query } from "@/lib/db";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT_SQL = `Eres un agente experto en análisis de datos de obras públicas y un backend-translator de alta precisión. Tu único objetivo es actuar en un flujo cerrado de dos pasos: traducción a SQL y síntesis de resultados.

[PASO 1: TRADUCCIÓN A SQL]
Cuando el usuario haga una pregunta sobre obras (ubicación, año, presupuesto, estado), debes mapearla estrictamente al siguiente esquema simplificado de la base de datos (PostgreSQL):
- Tabla: "obras"
- Campos: id (int), tender_title (text, nombre de obra), buyer_region (text, departamento), buyer_locality (text, provincia/distrito), contract_amount (numeric, presupuesto), contract_start (date, fecha de inicio), contract_status (text, estado)

Reglas de Consulta:
1. Filtra geográficamente usando LOWER o ILIKE para evitar fallos de mayúsculas (ej: buyer_region ILIKE '%piura%').
2. Para consultas de tiempo como "este año", extrae el año actual (2026) usando la lógica de Postgres: EXTRACT(YEAR FROM CAST(contract_start AS DATE)) = 2026.
3. Ordena SIEMPRE por relevancia económica (ORDER BY contract_amount DESC NULLS LAST) y limita estrictamente el resultado usando LIMIT 3 o LIMIT 5 para no saturar la respuesta.
4. Genera consultas SQL de SOLO LECTURA (SELECT). Está terminantemente prohibido generar sentencias de modificación (INSERT, UPDATE, DELETE).
5. DEVUELVE ÚNICAMENTE LA CONSULTA SQL VÁLIDA. No incluyas markdown, bloques de código (\`\`\`), saludos ni explicaciones.`;

const SYSTEM_PROMPT_SYNTHESIS = `[PASO 2: SÍNTESIS ULTRA CORTA]
Una vez que el backend te devuelva las filas JSON crudas desde la base de datos, tu tarea es transformar esos datos en una respuesta digerida para el usuario final bajo estas restricciones:
1. Mantén un límite estricto en la conversación: responde en un máximo de un párrafo corto introductorio y hasta 3 viñetas (bullet points) muy puntuales.
2. Cada viñeta debe incluir solo: Nombre de la obra (en negrita), Presupuesto resumido (ej: S/ 15M) y Estado actual.
3. No inventes datos, no agregues tecnicismos de base de datos en la respuesta final y sé directo. Si no hay registros, di amablemente que no se encontraron obras con esos filtros para el periodo seleccionado.`;

export async function chatEngine(message: string): Promise<string> {
  if (!message || message.length > 500) {
    return "Consulta muy larga. Intenta con una pregunta más corta.";
  }

  // Step 1: translate to SQL
  const sqlResponse = await groq.chat.completions.create({
    messages: [
      { role: "system", content: SYSTEM_PROMPT_SQL },
      { role: "user", content: message },
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    max_tokens: 300,
  });

  let sqlQuery = sqlResponse.choices[0]?.message?.content?.trim() ?? "";
  sqlQuery = sqlQuery.replace(/^```(sql)?/i, "").replace(/```$/, "").trim();

  if (!sqlQuery.toUpperCase().startsWith("SELECT")) {
    return "No pude entender tu consulta. Intenta preguntar por obras en una región o año específico.";
  }

  // Step 2: execute (cap at 10 rows before synthesis)
  let dbResults: unknown[];
  try {
    const rows = await query(sqlQuery);
    dbResults = rows.slice(0, 10);
  } catch {
    return "Ocurrió un error al consultar la base de datos de obras.";
  }

  // Step 3: synthesize
  const synthesisResponse = await groq.chat.completions.create({
    messages: [
      { role: "system", content: SYSTEM_PROMPT_SYNTHESIS },
      {
        role: "user",
        content: `Pregunta del usuario: "${message}"\n\nResultados de la Base de Datos:\n${JSON.stringify(dbResults)}`,
      },
    ],
    model: "llama-3.1-8b-instant",
    temperature: 0.3,
    max_tokens: 500,
  });

  return synthesisResponse.choices[0]?.message?.content?.trim() ?? "Sin respuesta.";
}
