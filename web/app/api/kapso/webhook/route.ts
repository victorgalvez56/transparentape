import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createHmac, timingSafeEqual } from "node:crypto";
import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import { normalizeWebhook } from "@kapso/whatsapp-cloud-api/server";
import { query } from "@/lib/db";
import { chatEngine } from "@/lib/agent-kapso/engine";
import { runChatPipeline, type ChatMessage } from "@/lib/agent/core";
import { parseIntent } from "@/lib/agent-kapso/intent";
import { getSession, updateSession, appendToHistory } from "@/lib/agent-kapso/session";
import { AGENT } from "@/lib/agent-kapso/config";
import {
  buscarObras,
  buscarCercanas,
  yearsDisponibles,
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
  fmtCercanas,
  fmtStats,
  fmtRankingContratistas,
  fmtInvestigacion,
  fmtInhabilitados,
  fmtAdjudicacionDirecta,
  fmtRankingEntidades,
  fmtMontoEnRiesgo,
  INTRO_MSG,
} from "@/lib/agent-kapso/wa-format";

export const runtime = "nodejs";
export const maxDuration = 30;

// ── signature validation ──────────────────────────────────────────────────────
// Accepts both Meta format ("sha256=<hex>" on x-hub-signature-256) and
// Kapso format (raw hex on x-webhook-signature).
function checkSignature(rawBody: string, req: NextRequest): boolean {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret) return true;

  const sigHeader =
    req.headers.get("x-hub-signature-256") ??
    req.headers.get("x-webhook-signature") ??
    req.headers.get("x-kapso-signature");
  if (!sigHeader) return false;

  const received = sigHeader.startsWith("sha256=") ? sigHeader.slice(7) : sigHeader;
  if (!/^[a-f0-9]+$/i.test(received)) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(received, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

let _kapso: WhatsAppClient | null = null;
function getKapso() {
  if (!_kapso) _kapso = new WhatsAppClient({
    baseUrl: "https://api.kapso.ai/meta/whatsapp",
    kapsoApiKey: process.env.KAPSO_API_KEY!,
  });
  return _kapso;
}

// ── button helpers ────────────────────────────────────────────────────────────
const BUTTON_MAP: Record<string, string> = {
  btn_buscar: "obras en",
  btn_stats: "estadísticas",
  btn_ranking: "ranking contratistas",
  btn_inhabilitados: "inhabilitados",
  btn_adjdirecta: "adjudicación directa",
  btn_entidades: "ranking entidades",
};

// Send reply + suggested questions as a WhatsApp interactive list.
// Meta caps: row title 24 chars, description 72, buttonText 20, up to 10 rows.
async function sendReplyWithSuggestions(
  phoneNumberId: string,
  to: string,
  reply: string,
  suggestions: string[]
): Promise<void> {
  const rows = suggestions.slice(0, 10).map((q, i) => {
    const clean = q.trim().replace(/^¿|\?$/g, "");
    return {
      id: `sug_${i}`,
      title: clean.length > 24 ? clean.slice(0, 23) + "…" : clean,
      ...(clean.length > 24 ? { description: clean.length > 72 ? clean.slice(0, 71) + "…" : clean } : {}),
    };
  });
  try {
    const truncatedBody = reply.length > 1024 ? reply.slice(0, 1020) + "…" : reply;
    await getKapso().messages.sendInteractiveList({
      phoneNumberId,
      to,
      bodyText: truncatedBody,
      buttonText: "Ver opciones",
      sections: [{ title: "Preguntas sugeridas", rows }],
    });
  } catch {
    // Fallback to plain text with numbered options
    const numbered = suggestions.map((q, i) => `${i + 1}️⃣ ${q}`).join("\n");
    const body = `${reply}\n\n${numbered}`;
    const truncated = body.length > AGENT.limits.waMaxChars ? body.slice(0, AGENT.limits.waMaxChars - 6) + "…" : body;
    await getKapso().messages.sendText({ phoneNumberId, to, body: truncated });
  }
}

async function sendAyudaWithButtons(
  phoneNumberId: string,
  to: string
): Promise<void> {
  try {
    await getKapso().messages.sendInteractiveButtons({
      phoneNumberId,
      to,
      header: { type: "text", text: "👋 Soy Transparentape" },
      bodyText:
        "Vigilo obras públicas de Perú, Chile, Colombia y más.\n\n" +
        "Detecta contratos con alertas, investiga empresas contratistas " +
        "y consulta rankings de transparencia — directo desde WhatsApp.\n\n" +
        "¿Por dónde empezamos?",
      footerText: "Datos: OCDS · SEACE · Mercado Público",
      buttons: [
        { id: "btn_buscar", title: "🔍 Buscar obras" },
        { id: "btn_stats", title: "📊 Estadísticas" },
        { id: "btn_ranking", title: "🏆 Rankings" },
      ],
    });
  } catch {
    // Interactive buttons not supported on this number tier — fall back to text
    await getKapso().messages.sendText({ phoneNumberId, to, body: INTRO_MSG });
  }
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

    case "BUSCAR_CERCANOS": {
      const loc = session.lastLocation;
      if (!loc) {
        return (
          "📍 Para mostrarte obras cercanas, *comparte tu ubicación* desde WhatsApp:\n\n" +
          "Toca el ícono 📎 → *Ubicación* → *Enviar mi ubicación actual*"
        );
      }
      const cercanas = await buscarCercanas(loc.lat, loc.lng, country, 5);
      await updateSession(conversationId, {
        lastResultIds: cercanas.map((o) => o.id),
        lastQuery: text,
      });
      return fmtCercanas(cercanas, country);
    }

    case "BUSCAR_OBRAS": {
      const filters = parsed.filters ?? { country };
      const obras = await buscarObras({ ...filters, limit: 5 });
      // If year filter returned 0 results, suggest the most recent available year
      let yearSugerido: number | undefined;
      if (!obras.length && filters.year) {
        const years = await yearsDisponibles(country);
        yearSugerido = years[0];
      }
      await updateSession(conversationId, {
        lastResultIds: obras.map((o) => o.id),
        lastQuery: text,
      });
      return fmtObras(obras, country, yearSugerido);
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

    case "AGRADECIMIENTO":
      return "¡Con gusto! 😊 Escribe *ayuda* para ver todo lo que puedo consultar.";

    case "PREGUNTA_LIBRE":
    default: {
      // Use shared pipeline (web + WhatsApp). On failure, fallback to legacy engine.
      const history: ChatMessage[] = [
        ...((session.lastMessages ?? []) as ChatMessage[]),
        { role: "user", content: text },
      ];
      try {
        const result = await runChatPipeline(history);
        if (result.suggested_questions?.length) {
          await sendReplyWithSuggestions(phoneNumberId, to, result.reply, result.suggested_questions);
          return null;
        }
        return result.reply;
      } catch (e) {
        console.error("[kapso/webhook] core pipeline failed, fallback:", e);
        return chatEngine(text, session.lastMessages ?? []);
      }
    }
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

// ── Meta webhook verification (GET) ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const verifyToken = process.env.KAPSO_WEBHOOK_SECRET ?? "";
  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  // Accept any challenge when no verify token is configured (Kapso manages it)
  if (challenge) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: true });
}

// ── webhook handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const sigOk = checkSignature(rawBody, req);
  if (!sigOk) {
    query(
      `INSERT INTO agent_logs(endpoint, params, n_resultados, latencia_ms) VALUES ($1, $2, $3, $4)`,
      [
        "/api/kapso/webhook/sig_fail",
        JSON.stringify({
          sig_header: req.headers.get("x-hub-signature-256") ?? req.headers.get("x-webhook-signature") ?? req.headers.get("x-kapso-signature"),
          body_preview: rawBody.slice(0, 300),
        }),
        0,
        0,
      ]
    ).catch(() => {});
    // Continue processing — TODO: return 401 once signature confirmed working
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Use SDK normalizeWebhook — handles all Meta/Kapso payload variants
  const normalized = normalizeWebhook(payload);
  const msg = normalized.messages[0];

  // If no messages parsed, log raw payload for inspection and skip
  if (!msg || !msg.from) {
    query(
      `INSERT INTO agent_logs(endpoint, params, n_resultados, latencia_ms) VALUES ($1, $2, $3, $4)`,
      [
        "/api/kapso/webhook/skipped",
        JSON.stringify({ body_preview: rawBody.slice(0, 500) }),
        0,
        0,
      ]
    ).catch(() => {});
    return NextResponse.json({ ok: true, skipped: true });
  }

  const from = msg.from;
  const phoneNumberId = normalized.phoneNumberId ?? process.env.KAPSO_PHONE_NUMBER_ID!;
  const to = from.startsWith("+") ? from : `+${from}`;
  const t0 = Date.now();

  // Idempotency — Kapso retries on timeout; same msg_id = duplicate
  const msgId = (msg as Record<string, unknown>).id as string | undefined;
  if (msgId) {
    const inserted = await query(
      `INSERT INTO webhook_dedup (msg_id) VALUES ($1) ON CONFLICT (msg_id) DO NOTHING RETURNING msg_id`,
      [msgId]
    ).catch(() => null);
    // null = DB error (fail open); empty array = already processed
    if (inserted !== null && inserted.length === 0) {
      return NextResponse.json({ ok: true, dup: true });
    }
  }

  // Location message — save coords to session and search nearby obras
  if (msg.type === "location" && msg.location) {
    const { latitude, longitude } = msg.location as { latitude?: number; longitude?: number };
    if (latitude != null && longitude != null) {
      waitUntil((async () => {
        try {
          await updateSession(from, { lastLocation: { lat: latitude, lng: longitude } });
          const reply = await handleMessage("obras cerca de mí", from, phoneNumberId, to);
          if (reply) {
            const truncated = reply.length > AGENT.limits.waMaxChars ? reply.slice(0, AGENT.limits.waMaxChars - 6) + "…" : reply;
            await getKapso().messages.sendText({ phoneNumberId, to, body: truncated });
            saveHistory(from, "📍 ubicación compartida", truncated).catch(() => {});
          }
          query(
            `INSERT INTO agent_logs(endpoint, params, n_resultados, latencia_ms) VALUES ($1, $2, $3, $4)`,
            ["/api/kapso/webhook", JSON.stringify({ from, text: "location", lat: latitude, lng: longitude }), 1, Date.now() - t0]
          ).catch(() => {});
        } catch (e) {
          console.error("[kapso/webhook] location error:", e);
          query(
            `INSERT INTO agent_logs(endpoint, params, n_resultados, latencia_ms) VALUES ($1, $2, $3, $4)`,
            ["/api/kapso/webhook/error", JSON.stringify({ from, step: "location", err: String(e) }), 0, Date.now() - t0]
          ).catch(() => {});
        }
      })());
      return NextResponse.json({ ok: true });
    }
  }

  let text: string | null = null;
  if (msg.type === "text" && msg.text?.body) {
    text = msg.text.body.trim();
  } else if (msg.type === "interactive") {
    // normalizeWebhook converts snake_case keys to camelCase
    const interactive = msg.interactive as { buttonReply?: { id?: string }; listReply?: { id?: string } } | undefined;
    const btnId = interactive?.buttonReply?.id ?? interactive?.listReply?.id;
    if (btnId) text = BUTTON_MAP[btnId] ?? btnId;
  } else if (["image", "audio", "video", "document", "sticker", "voice"].includes(msg.type ?? "")) {
    // Unsupported media type — send friendly reply and skip processing
    waitUntil((async () => {
      try {
        await getKapso().messages.sendText({
          phoneNumberId,
          to,
          body: "Solo proceso mensajes de texto 📝\n\nEscribe *ayuda* para ver los comandos disponibles.",
        });
      } catch (e) {
        console.error("[kapso/webhook] media reply error:", e);
      }
    })());
    return NextResponse.json({ ok: true });
  }

  if (!text) return NextResponse.json({ ok: true, skipped: true });

  // waitUntil keeps the async work alive after we return 200
  waitUntil((async () => {
    const steps: Record<string, number> = {};
    try {
      steps.start = Date.now() - t0;
      const reply = await handleMessage(text!, from, phoneNumberId, to);
      steps.handle_done = Date.now() - t0;
      if (reply !== null) {
        const truncated = reply.length > AGENT.limits.waMaxChars ? reply.slice(0, AGENT.limits.waMaxChars - 6) + "…" : reply;
        await getKapso().messages.sendText({ phoneNumberId, to, body: truncated });
        steps.send_done = Date.now() - t0;
        saveHistory(from, text!, truncated).catch(() => {});
      } else {
        steps.reply_null = Date.now() - t0;
      }
      query(
        `INSERT INTO agent_logs(endpoint, params, n_resultados, latencia_ms) VALUES ($1, $2, $3, $4)`,
        ["/api/kapso/webhook", JSON.stringify({ from, text, steps }), 1, Date.now() - t0]
      ).catch(() => {});
    } catch (e) {
      console.error("[kapso/webhook] error:", e);
      query(
        `INSERT INTO agent_logs(endpoint, params, n_resultados, latencia_ms) VALUES ($1, $2, $3, $4)`,
        ["/api/kapso/webhook/error", JSON.stringify({ from, text, steps, err: String(e) }), 0, Date.now() - t0]
      ).catch(() => {});
    }
  })());

  return NextResponse.json({ ok: true });
}
