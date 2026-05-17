import { NextRequest, NextResponse } from "next/server";
import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import { query } from "@/lib/db";
import { chatEngine } from "@/lib/agent-kapso/engine";
import { parseIntent } from "@/lib/agent-kapso/intent";
import { getSession, updateSession } from "@/lib/agent-kapso/session";
import {
  buscarObras,
  getObraResumen,
  rankingContratistas,
  investigarContratista,
  inhabilitadosVigentes,
  statsPorPais,
} from "@/lib/agent-kapso/queries";
import {
  fmtObras,
  fmtDetalle,
  fmtStats,
  fmtRankingContratistas,
  fmtInvestigacion,
  fmtInhabilitados,
  AYUDA_MSG,
} from "@/lib/agent-kapso/wa-format";
import crypto from "node:crypto";

export const runtime = "nodejs";

const kapso = new WhatsAppClient({
  baseUrl: "https://app.kapso.ai/api/meta/",
  kapsoApiKey: process.env.KAPSO_API_KEY!,
});

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret) return true;
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
  const batched = body["whatsapp.message.received"];
  if (Array.isArray(batched)) return batched as KapsoEvent[];
  if (body.message) return [body as KapsoEvent];
  return [];
}

async function handleMessage(text: string, conversationId: string): Promise<string> {
  const session = getSession(conversationId);
  const parsed = parseIntent(text, session.country);

  // Persist country change
  if (parsed.country && parsed.country !== session.country) {
    updateSession(conversationId, { country: parsed.country });
  }

  const country = parsed.country ?? session.country;

  switch (parsed.intent) {
    case "CAMBIAR_PAIS": {
      const names: Record<string, string> = {
        PE: "Perú 🇵🇪", CL: "Chile 🇨🇱", CO: "Colombia 🇨🇴",
        MX: "México 🇲🇽", AR: "Argentina 🇦🇷", BR: "Brasil 🇧🇷",
      };
      return `✅ País cambiado a *${names[country] ?? country}*.\n\nPregunta por obras, estadísticas o ranking.`;
    }

    case "AYUDA":
      return AYUDA_MSG;

    case "STATS": {
      const stats = await statsPorPais(country);
      if (!stats) return "No hay datos disponibles para ese país.";
      return fmtStats({ ...stats, country });
    }

    case "BUSCAR_OBRAS": {
      const filters = parsed.filters ?? { country };
      const obras = await buscarObras({ ...filters, limit: 5 });
      // Store result IDs for conversational context
      updateSession(conversationId, {
        lastResultIds: obras.map((o) => o.id),
        lastQuery: text,
      });
      return fmtObras(obras, country);
    }

    case "CONTEXTO_DETALLE": {
      const ids = session.lastResultIds ?? [];
      if (!ids.length) {
        return "No tengo una búsqueda reciente. Primero pregunta por obras en una región o año.";
      }
      const pos = parsed.contextPosition ?? 1;
      const idx = pos === -1 ? ids.length - 1 : pos - 1;
      const id = ids[idx];
      if (!id) return `Solo tengo ${ids.length} resultado(s) de la última búsqueda.`;
      const obra = await getObraResumen(id);
      if (!obra) return `No encontré la obra con ID ${id}.`;
      return fmtDetalle(obra, country);
    }

    case "VER_DETALLE": {
      if (!parsed.obraId) return "Especifica el ID de la obra. Ej: *detalle #123*";
      const obra = await getObraResumen(parsed.obraId);
      if (!obra) return `No encontré la obra con ID ${parsed.obraId}.`;
      return fmtDetalle(obra, country);
    }

    case "RANKING_CONTRATISTAS": {
      const porAlertas = /\balerta[s]?\b/i.test(text);
      const list = await rankingContratistas(country, porAlertas ? "alertas" : "monto", 5);
      return fmtRankingContratistas(list, country);
    }

    case "INVESTIGAR_CONTRATISTA": {
      const q = parsed.ruc ?? parsed.contratista;
      if (!q) return "Escribe el RUC o nombre de la empresa. Ej: *investigar Odebrecht*";
      const data = await investigarContratista(q, country);
      return fmtInvestigacion(data, country);
    }

    case "INHABILITADOS": {
      const list = await inhabilitadosVigentes(country, 8);
      return fmtInhabilitados(list, country);
    }

    case "PREGUNTA_LIBRE":
    default:
      return chatEngine(text);
  }
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
    return NextResponse.json({ ok: true });
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
      const reply = await handleMessage(text, from);
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

  return NextResponse.json({ ok: true });
}
