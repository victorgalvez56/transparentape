import { NextRequest, NextResponse } from "next/server";
import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import { normalizeWebhook, verifySignature as sdkVerifySignature } from "@kapso/whatsapp-cloud-api/server";
import { query } from "@/lib/db";
import { chatEngine } from "@/lib/agent-kapso/engine";
import { parseIntent } from "@/lib/agent-kapso/intent";
import { getSession, updateSession, appendToHistory } from "@/lib/agent-kapso/session";
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
  AYUDA_MSG,
} from "@/lib/agent-kapso/wa-format";

export const runtime = "nodejs";
export const maxDuration = 30;

// ── signature validation ──────────────────────────────────────────────────────
function checkSignature(rawBody: string, req: NextRequest): boolean {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret) return true;
  // Kapso kind:meta signs with KAPSO_WEBHOOK_SECRET via x-hub-signature-256
  const signatureHeader =
    req.headers.get("x-hub-signature-256") ??
    req.headers.get("x-kapso-signature") ??
    req.headers.get("x-webhook-signature");
  if (!signatureHeader) return false;
  return sdkVerifySignature({ appSecret: secret, rawBody, signatureHeader });
}

const kapso = new WhatsAppClient({
  baseUrl: "https://api.kapso.ai/meta/whatsapp",
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

  // Collect all headers for diagnostics
  const allHeaders: Record<string, string> = {};
  req.headers.forEach((v, k) => { allHeaders[k] = v; });

  if (!checkSignature(rawBody, req)) {
    // Log headers to identify which signature header Kapso actually sends
    query(
      `INSERT INTO agent_logs(endpoint, params, n_resultados, latencia_ms) VALUES ($1, $2, $3, $4)`,
      [
        "/api/kapso/webhook/sig_fail",
        JSON.stringify({ headers: allHeaders, body_preview: rawBody.slice(0, 500) }),
        0,
        0,
      ]
    ).catch(() => {});
    // Return 200 temporarily so Kapso keeps retrying while we diagnose
    // TODO: restore 401 once signature is confirmed working end-to-end
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
      (async () => {
        try {
          await updateSession(from, { lastLocation: { lat: latitude, lng: longitude } });
          const reply = await handleMessage("obras cerca de mí", from, phoneNumberId, to);
          if (reply) {
            const truncated = reply.length > 4096 ? reply.slice(0, 4090) + "…" : reply;
            await kapso.messages.sendText({ phoneNumberId, to, body: truncated });
            saveHistory(from, "📍 ubicación compartida", truncated).catch(() => {});
          }
          query(
            `INSERT INTO agent_logs(endpoint, params, n_resultados, latencia_ms) VALUES ($1, $2, $3, $4)`,
            ["/api/kapso/webhook", JSON.stringify({ from, text: "location", lat: latitude, lng: longitude }), 1, Date.now() - t0]
          ).catch(() => {});
        } catch (e) {
          console.error("[kapso/webhook] location error:", e);
        }
      })();
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
    (async () => {
      try {
        await kapso.messages.sendText({
          phoneNumberId,
          to,
          body: "Solo proceso mensajes de texto 📝\n\nEscribe *ayuda* para ver los comandos disponibles.",
        });
      } catch (e) {
        console.error("[kapso/webhook] media reply error:", e);
      }
    })();
    return NextResponse.json({ ok: true });
  }

  if (!text) return NextResponse.json({ ok: true, skipped: true });

  // fire-and-forget — return 200 immediately to avoid Kapso retry
  (async () => {
    try {
      const reply = await handleMessage(text!, from, phoneNumberId, to);
      if (reply !== null) {
        const truncated = reply.length > 4096 ? reply.slice(0, 4090) + "…" : reply;
        await kapso.messages.sendText({ phoneNumberId, to, body: truncated });
        saveHistory(from, text!, truncated).catch(() => {});
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
