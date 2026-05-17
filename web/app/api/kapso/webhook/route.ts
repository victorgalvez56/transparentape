import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import { query } from "@/lib/db";
import { chatEngine } from "@/lib/agent-kapso/engine";
import { parseIntent } from "@/lib/agent-kapso/intent";
import { getSession, updateSession, appendToHistory } from "@/lib/agent-kapso/session";
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

export const runtime = "nodejs";
export const maxDuration = 30;

// ── signature validation ──────────────────────────────────────────────────────
// Kapso sends x-kapso-signature or x-hub-signature-256, value may be prefixed "sha256="
function verifySignature(body: string, header: string | null): boolean {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret) return true;
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

const kapso = new WhatsAppClient({
  baseUrl: "https://app.kapso.ai/api/meta/",
  kapsoApiKey: process.env.KAPSO_API_KEY!,
});

// ── button helpers ────────────────────────────────────────────────────────────
const BUTTON_MAP: Record<string, string> = {
  btn_buscar: "obras en",
  btn_stats: "estadísticas",
  btn_ranking: "ranking contratistas",
  btn_inhabilitados: "inhabilitados",
  btn_adjdirecta: "adjudicación directa",
  btn_entidades: "ranking entidades",
};

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
    await kapso.messages.sendText({ phoneNumberId, to, body: AYUDA_MSG });
  }
}

// ── message extraction ────────────────────────────────────────────────────────
type MsgExtract = { from: string; text: string; type: "text" | "interactive_btn"; phoneNumberId?: string };

function extractMessage(payload: Record<string, unknown>): MsgExtract | null {
  // 1. Meta Cloud API format: payload.entry[0].changes[0].value.messages[0]
  type MetaMsg = { from?: string; type?: string; text?: { body?: string }; interactive?: { type?: string; button_reply?: { id?: string }; list_reply?: { id?: string } } };
  type MetaValue = { messages?: MetaMsg[]; metadata?: { phone_number_id?: string } };
  const entry = (payload.entry as { changes?: { value?: MetaValue }[] }[])?.[0];
  const metaValue = entry?.changes?.[0]?.value;
  const metaMsg = metaValue?.messages?.[0];
  const metaPhoneId = metaValue?.metadata?.phone_number_id;
  if (metaMsg?.type === "text" && metaMsg.text?.body && metaMsg.from) {
    return { from: metaMsg.from, text: metaMsg.text.body.trim(), type: "text", phoneNumberId: metaPhoneId };
  }
  if (metaMsg?.type === "interactive" && metaMsg.from) {
    const btnId = metaMsg.interactive?.button_reply?.id ?? metaMsg.interactive?.list_reply?.id;
    if (btnId) return { from: metaMsg.from, text: BUTTON_MAP[btnId] ?? btnId, type: "interactive_btn", phoneNumberId: metaPhoneId };
  }

  // 2. Kapso batched format: payload["whatsapp.message.received"][0]
  type KapsoMsg = { from?: string; type?: string; text?: { body?: string }; interactive?: { type?: string; button_reply?: { id?: string }; list_reply?: { id?: string } } };
  const batchedArr = payload["whatsapp.message.received"];
  const kMsg = (Array.isArray(batchedArr) ? batchedArr[0] : payload) as { message?: KapsoMsg; whatsapp_config?: { phone_number_id?: string } };
  const km = kMsg?.message;
  const kapsoPhoneId = (kMsg?.whatsapp_config as { phone_number_id?: string })?.phone_number_id;
  if (km?.type === "text" && km.text?.body && km.from) {
    return { from: km.from, text: km.text.body.trim(), type: "text", phoneNumberId: kapsoPhoneId };
  }
  if (km?.type === "interactive" && km.from) {
    const btnId = km.interactive?.button_reply?.id ?? km.interactive?.list_reply?.id;
    if (btnId) return { from: km.from, text: BUTTON_MAP[btnId] ?? btnId, type: "interactive_btn", phoneNumberId: kapsoPhoneId };
  }

  // 3. Kapso simplified format: payload.message.text (string)
  const simpleMsg = payload.message as { from?: string; type?: string; text?: string } | undefined;
  if (simpleMsg?.type === "text" && simpleMsg.text && simpleMsg.from) {
    return { from: simpleMsg.from, text: simpleMsg.text.trim(), type: "text" };
  }

  return null;
}

// ── intent routing ────────────────────────────────────────────────────────────
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
      return null;

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
      if (!ids.length) return "No tengo una búsqueda reciente. Primero pregunta por obras en una región o año.";
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
      return chatEngine(text, session.lastMessages ?? []);
  }
}

async function saveHistory(
  conversationId: string,
  userMsg: string,
  assistantMsg: string | null
): Promise<void> {
  if (!assistantMsg) return;
  const session = await getSession(conversationId);
  await updateSession(conversationId, {
    lastMessages: appendToHistory(session.lastMessages, userMsg, assistantMsg),
  });
}

// ── webhook handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const sigHeader =
    req.headers.get("x-kapso-signature") ??
    req.headers.get("x-hub-signature-256") ??
    req.headers.get("x-webhook-signature");

  if (!verifySignature(rawBody, sigHeader)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const extracted = extractMessage(payload);
  if (!extracted) return NextResponse.json({ ok: true, skipped: true });

  const { from, text, phoneNumberId: payloadPhoneId } = extracted;
  const phoneNumberId = payloadPhoneId ?? process.env.KAPSO_PHONE_NUMBER_ID!;
  const to = from.startsWith("+") ? from : `+${from}`;
  const t0 = Date.now();

  // fire-and-forget — return 200 immediately to avoid Kapso retry
  (async () => {
    try {
      const reply = await handleMessage(text, from, phoneNumberId, to);
      if (reply !== null) {
        const truncated = reply.length > 4096 ? reply.slice(0, 4090) + "…" : reply;
        await kapso.messages.sendText({ phoneNumberId, to, body: truncated });
        // Persist exchange in session history for conversational context
        saveHistory(from, text, truncated).catch(() => {});
      }
      query(
        `INSERT INTO agent_logs(endpoint, params, n_resultados, latencia_ms) VALUES ($1, $2, $3, $4)`,
        ["/api/kapso/webhook", JSON.stringify({ from, text }), 1, Date.now() - t0]
      ).catch(() => {});
    } catch (e) {
      console.error("[kapso/webhook] error:", e);
    }
  })();

  return NextResponse.json({ ok: true });
}
