import { NextRequest, NextResponse } from "next/server";
import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import { chatEngine } from "@/lib/chat-engine";
import { query } from "@/lib/db";
import crypto from "node:crypto";

export const runtime = "nodejs";

const kapso = new WhatsAppClient({
  baseUrl: "https://app.kapso.ai/api/meta/",
  kapsoApiKey: process.env.KAPSO_API_KEY!,
});

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret) return true; // skip if not configured
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

type KapsoEvent = {
  message?: {
    type?: string;
    from?: string;
    text?: { body?: string };
  };
  whatsapp_config?: { phone_number_id?: string };
};

function extractEvents(body: Record<string, unknown>): KapsoEvent[] {
  // Batched payload: { "whatsapp.message.received": [...] }
  const batched = body["whatsapp.message.received"];
  if (Array.isArray(batched)) return batched as KapsoEvent[];
  // Single event
  if (body.message) return [body as KapsoEvent];
  return [];
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true }); // always 200
  }

  const events = extractEvents(body);

  for (const event of events) {
    const msg = event.message;
    if (!msg || msg.type !== "text") continue;

    const text = msg.text?.body?.trim();
    const from = msg.from;
    const phoneNumberId =
      event.whatsapp_config?.phone_number_id ?? process.env.KAPSO_PHONE_NUMBER_ID!;

    if (!text || !from) continue;

    const to = from.startsWith("+") ? from : `+${from}`;
    const t0 = Date.now();

    try {
      const reply = await chatEngine(text);
      const truncated = reply.length > 4096 ? reply.slice(0, 4090) + "…" : reply;

      await kapso.messages.sendText({ phoneNumberId, to, body: truncated });

      query(
        `INSERT INTO agent_logs(endpoint, params, n_resultados, latencia_ms) VALUES ($1, $2, $3, $4)`,
        ["/api/kapso/webhook", JSON.stringify({ from, text }), 1, Date.now() - t0]
      ).catch(() => {});
    } catch (err) {
      console.error("Kapso webhook handler error:", err);
    }
  }

  // Always return 200 — Kapso retries on non-2xx
  return NextResponse.json({ ok: true });
}
