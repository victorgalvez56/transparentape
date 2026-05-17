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
  adjudicacionDirectaAlertas,
  rankingEntidades,
  montoEnRiesgo,
  statsPorPais,
} from "@/lib/agent-kapso/queries";
import {
  fmtObras,
  fmtDetalle,
  fmtStats,
  fmtRankingContratistas,
  fmtInvestigacion,
  fmtInhabilitados,
  fmtAdjudicacionDirecta,
  fmtRankingEntidades,
  fmtMontoEnRiesgo,
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

type KapsoMessage = {
  type?: string;
  from?: string;
  text?: { body?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
};

type KapsoEvent = {
  message?: KapsoMessage;
  whatsapp_config?: { phone_number_id?: string };
};

function extractEvents(body: Record<string, unknown>): KapsoEvent[] {
  const batched = body["whatsapp.message.received"];
  if (Array.isArray(batched)) return batched as KapsoEvent[];
  if (body.message) return [body as KapsoEvent];
  return [];
}

// Map button IDs to text commands for intent parsing
function resolveButtonReply(id: string): string {
  const MAP: Record<string, string> = {
    btn_buscar: "obras en",
    btn_stats: "estadísticas",
    btn_ranking: "ranking contratistas",
    btn_inhabilitados: "inhabilitados",
    btn_adjdirecta: "adjudicación directa",
    btn_entidades: "ranking entidades",
  };
  return MAP[id] ?? id;
}

async function sendAyudaWithButtons(
  phoneNumberId: string,
  to: string
): Promise<void> {
  try {
    await kapso.messages.sendInteractiveButtons({
      phoneNumberId,
      to,
      bodyText: "🤖 *Transparentape* — ¿Qué quieres consultar?",
      footerText: "Datos: OCDS · SEACE · Mercado Público",
      header: { type: "text", text: "Obras Públicas" },
      buttons: [
        { id: "btn_buscar", title: "🔍 Buscar obras" },
        { id: "btn_stats", title: "📊 Estadísticas" },
        { id: "btn_ranking", title: "🏆 Ranking" },
      ],
    });
  } catch {
    // Fallback to plain text if interactive fails
    await kapso.messages.sendText({ phoneNumberId, to, body: AYUDA_MSG });
  }
}

async function handleMessage(
  text: string,
  conversationId: string,
  phoneNumberId: string,
  to: string
): Promise<string | null> {
  const session = await getSession(conversationId);
  const parsed = parseIntent(text, session.country);

  if (parsed.country && parsed.country !== session.country) {
    await updateSession(conversationId, { country: parsed.country });
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
      await sendAyudaWithButtons(phoneNumberId, to);
      return null; // already sent interactively

    case "STATS": {
      const stats = await statsPorPais(country);
      if (!stats) return "No hay datos disponibles para ese país.";
      return fmtStats({ ...stats, country });
    }

    case "MONTO_EN_RIESGO": {
      const data = await montoEnRiesgo(country);
      return fmtMontoEnRiesgo(data);
    }

    case "BUSCAR_OBRAS": {
      const filters = parsed.filters ?? { country };
      const obras = await buscarObras({ ...filters, limit: 5 });
      await updateSession(conversationId, {
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

    case "RANKING_ENTIDADES": {
      const list = await rankingEntidades(country, 5);
      return fmtRankingEntidades(list, country);
    }

    case "ADJUDICACION_DIRECTA": {
      const obras = await adjudicacionDirectaAlertas(country, 5);
      return fmtAdjudicacionDirecta(obras, country);
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
    if (!msg) continue;

    const from = msg.from;
    const phoneNumberId =
      event.whatsapp_config?.phone_number_id ?? process.env.KAPSO_PHONE_NUMBER_ID!;

    if (!from) continue;

    const to = from.startsWith("+") ? from : `+${from}`;
    const t0 = Date.now();

    // Resolve text: plain text OR interactive button reply
    let text: string | undefined;
    if (msg.type === "text") {
      text = msg.text?.body?.trim();
    } else if (msg.type === "interactive") {
      const btnId = msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id;
      if (btnId) text = resolveButtonReply(btnId);
    }

    if (!text) continue;

    try {
      const reply = await handleMessage(text, from, phoneNumberId, to);

      if (reply !== null) {
        const truncated = reply.length > 4096 ? reply.slice(0, 4090) + "…" : reply;
        await kapso.messages.sendText({ phoneNumberId, to, body: truncated });
      }

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
