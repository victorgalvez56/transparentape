import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Groq from "groq-sdk";

export const runtime = "nodejs";
export const maxDuration = 30;

// ── signature validation ──────────────────────────────────────────────────────
function verifySignature(body: string, header: string | null): boolean {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret) return true; // dev: skip validation
  if (!header) return false;
  const sig = header.replace(/^sha256=/i, "");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(sig, "hex")
    );
  } catch {
    return false;
  }
}

// ── Kapso / WhatsApp send ─────────────────────────────────────────────────────
async function sendWhatsApp(to: string, text: string): Promise<void> {
  const apiKey = process.env.KAPSO_API_KEY;
  const phoneId = process.env.KAPSO_PHONE_NUMBER_ID;
  if (!apiKey || !phoneId) return;

  await fetch(
    `https://api.kapso.io/v1/phone_numbers/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text.slice(0, 4096) },
      }),
    }
  ).catch((e) => console.error("[kapso] send error:", e));
}

// ── agent: query our obras API ────────────────────────────────────────────────
async function queryObras(
  params: Record<string, string>
): Promise<string> {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const secret = process.env.AGENT_API_SECRET ?? "";
  const qs = new URLSearchParams({ limit: "5", ...params }).toString();
  const res = await fetch(`${base}/api/agent/obras?${qs}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) return "[]";
  const data = await res.json();
  // compact text representation for the LLM
  return (data.obras ?? [])
    .map(
      (o: {
        emoji: string;
        titulo: string;
        distrito: string;
        monto_fmt: string;
        contratista: string;
        alerta: string | null;
        link_web: string;
      }) =>
        `${o.emoji} ${o.titulo}\n   Distrito: ${o.distrito} | Monto: ${o.monto_fmt}\n   Contratista: ${o.contratista}${o.alerta ? `\n   ⚠️ ${o.alerta}` : ""}\n   🔗 ${o.link_web}`
    )
    .join("\n\n");
}

// ── LLM orchestration via Groq ────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres el agente de Transparentape, un periodista de datos especializado en contrataciones públicas en Latinoamérica.
Tu trabajo es ayudar a ciudadanos y periodistas a investigar contratos del Estado.
Responde SIEMPRE en español, de forma concisa y clara. Máximo 5 párrafos cortos.
Cuando el usuario pregunte por contratos, obras o contratistas, usa la herramienta query_obras.
Si no hay resultados relevantes, di que no encontraste datos y sugiere buscar en transparentape.app.
Nunca inventes contratos ni montos. Si no tienes datos, dilo claramente.`;

async function runAgent(userMessage: string): Promise<string> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const tools: Groq.Chat.Completions.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "query_obras",
        description:
          "Busca contratos públicos en la base de datos de Transparentape. Úsalo cuando el usuario mencione distritos, regiones, contratistas, obras o tipos de gasto.",
        parameters: {
          type: "object",
          properties: {
            q: {
              type: "string",
              description: "Texto libre para buscar en título y descripción",
            },
            distrito: { type: "string", description: "Nombre del distrito" },
            region: { type: "string", description: "Nombre de la región" },
            contratista: { type: "string", description: "Nombre del contratista o empresa" },
            red_flag: {
              type: "string",
              enum: ["true"],
              description: "Filtrar solo contratos con alertas de corrupción",
            },
            sort: {
              type: "string",
              enum: ["riesgo", "monto", "reciente"],
              description: "Ordenar por riesgo, monto o fecha",
            },
          },
          required: [],
        },
      },
    },
  ];

  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  // first pass
  const res1 = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages,
    tools,
    tool_choice: "auto",
    max_tokens: 800,
  });

  const msg1 = res1.choices[0].message;

  // handle tool calls
  if (msg1.tool_calls?.length) {
    messages.push(msg1);

    for (const call of msg1.tool_calls) {
      let toolResult = "";
      if (call.function.name === "query_obras") {
        const args = JSON.parse(call.function.arguments || "{}");
        toolResult = await queryObras(args);
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: toolResult || "Sin resultados.",
      });
    }

    // second pass with tool results
    const res2 = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: 800,
    });
    return res2.choices[0].message.content ?? "Sin respuesta del agente.";
  }

  return msg1.content ?? "Sin respuesta del agente.";
}

// ── webhook handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // validate signature
  const sig =
    req.headers.get("x-kapso-signature") ??
    req.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, sig)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // extract message — supports Meta Cloud API format and Kapso simplified format
  let fromNumber: string | null = null;
  let messageText: string | null = null;

  // Meta / Kapso Cloud API format
  const entry = (payload.entry as { changes?: { value?: { messages?: { from?: string; type?: string; text?: { body?: string } }[]; contacts?: unknown[] } }[] }[])?.[0];
  const change = entry?.changes?.[0];
  const msgObj = change?.value?.messages?.[0];
  if (msgObj?.type === "text" && msgObj.text?.body) {
    fromNumber = msgObj.from ?? null;
    messageText = msgObj.text.body;
  }

  // Kapso simplified format fallback
  if (!messageText) {
    const msg = payload.message as { from?: string; text?: string; type?: string } | undefined;
    if (msg?.type === "text" && msg.text) {
      fromNumber = msg.from ?? null;
      messageText = msg.text;
    }
  }

  // ack immediately — process async to avoid webhook timeout
  if (!fromNumber || !messageText) {
    // not a text message, ack and skip
    return NextResponse.json({ ok: true, skipped: true });
  }

  // fire-and-forget so we return quickly
  (async () => {
    try {
      const reply = await runAgent(messageText!);
      await sendWhatsApp(fromNumber!, reply);
    } catch (e) {
      console.error("[kapso/webhook] agent error:", e);
    }
  })();

  return NextResponse.json({ ok: true });
}
