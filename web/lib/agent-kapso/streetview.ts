// Street View + Vision analysis helper for the agent layer.
//
// Reuses the existing public endpoints — does not duplicate their logic:
//   - GET /api/obra/[id]/streetview  → fast (DB-cached URLs + Google fallback)
//   - GET /api/ai?id=N               → Vision comparative analysis (Claude Opus)
//
// The agent calls them as HTTP clients via the configured BASE URL so the
// same persistence (DB columns `streetview_*`, `ai_score`, `ai_description`)
// is shared with the web product. No agent-side memory writes.

import { queryOne } from "../db";

export interface SvSide {
  url: string;
  date: string | null;
}

export interface StreetviewPayload {
  id: number;
  ocid: string;
  lat: number | null;
  lng: number | null;
  before: SvSide | null;
  after: SvSide | null;
  has_history: boolean;
  cached: boolean;
}

export interface AiAnalysisPayload {
  score: number | null;
  description: string | null;
  streetview: {
    beforeUrl: string | null;
    afterUrl: string;
    beforeDate: string | null;
    afterDate: string | null;
    hasHistory: boolean;
    cached: boolean;
    totalPanos?: number;
  };
}

export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

function baseUrl(): string {
  // Local dev: hit the same Next.js instance so changes show without
  // deploying. NEXT_PUBLIC_BASE_URL is for client-side links and may
  // point to a remote prod origin; we don't want server-to-server fetches
  // from /api/chat to leave the box.
  if (process.env.NODE_ENV !== "production") {
    return `http://localhost:${process.env.PORT ?? "3000"}`;
  }
  // Vercel: prefer the internal URL so server-to-server fetches stay
  // inside the deployment and aren't subject to public DNS / CDN.
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function fetchStreetview(
  idOrOcid: string | number,
  timeoutMs = 8000
): Promise<FetchResult<StreetviewPayload>> {
  const url = `${baseUrl()}/api/obra/${encodeURIComponent(String(idOrOcid))}/streetview`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, status: res.status, error: body.error ?? "unknown" };
    }
    return { ok: true, data: (await res.json()) as StreetviewPayload };
  } catch (e) {
    return { ok: false, status: 0, error: String(e instanceof Error ? e.message : e) };
  }
}

export async function fetchAiAnalysis(
  id: number,
  timeoutMs = 20000
): Promise<FetchResult<AiAnalysisPayload>> {
  const url = `${baseUrl()}/api/ai?id=${id}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, status: res.status, error: body.error ?? "unknown" };
    }
    return { ok: true, data: (await res.json()) as AiAnalysisPayload };
  } catch (e) {
    return { ok: false, status: 0, error: String(e instanceof Error ? e.message : e) };
  }
}

// Read-only snapshot of cached visuals from the obras row. No endpoint
// roundtrip — used by VER_DETALLE auto-attach so we never trigger Google
// Street View or Claude Vision implicitly.
export interface CachedVisuals {
  id: number;
  lat: number | null;
  lng: number | null;
  streetviewBefore: string | null;
  streetviewAfter: string | null;
  aiScore: number | null;
  aiDescription: string | null;
}

export async function getCachedVisuals(id: number): Promise<CachedVisuals | null> {
  const row = await queryOne<{
    id: number;
    lat: string | number | null;
    lng: string | number | null;
    streetview_before: string | null;
    streetview_after: string | null;
    ai_score: number | null;
    ai_description: string | null;
  }>(
    `SELECT id, lat, lng, streetview_before, streetview_after, ai_score, ai_description
     FROM obras WHERE id = $1`,
    [id]
  );
  if (!row) return null;
  return {
    id: row.id,
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    streetviewBefore: row.streetview_before ? row.streetview_before.trim() : null,
    streetviewAfter: row.streetview_after ? row.streetview_after.trim() : null,
    aiScore: row.ai_score,
    aiDescription: row.ai_description,
  };
}

// Resolve which obra the user is targeting for a SV/AI request.
// Returns:
//   - { kind: "id", id }       → resolved deterministically
//   - { kind: "clarify", msg } → caller should ask user
export type ObraTarget =
  | { kind: "id"; id: number }
  | { kind: "clarify"; msg: string };

export function resolveObraTarget(input: {
  explicitId?: number;
  ordinalPos?: number; // 1-based, -1 for "last"
  lastResultIds?: number[];
}): ObraTarget {
  if (input.explicitId) return { kind: "id", id: input.explicitId };

  const ids = input.lastResultIds ?? [];
  if (!ids.length) {
    return {
      kind: "clarify",
      msg:
        "Primero busca una obra (ej: *obras en Piura*) y luego pídeme la imagen o el análisis.",
    };
  }

  if (input.ordinalPos != null) {
    const idx = input.ordinalPos === -1 ? ids.length - 1 : input.ordinalPos - 1;
    const id = ids[idx];
    if (!id) {
      return {
        kind: "clarify",
        msg: `Solo tengo ${ids.length} resultado(s) de la última búsqueda. Indica #1 a #${ids.length}.`,
      };
    }
    return { kind: "id", id };
  }

  if (ids.length === 1) return { kind: "id", id: ids[0] };

  return {
    kind: "clarify",
    msg: `¿De cuál de las ${ids.length} obras? Responde con *#1*, *#2*, ... hasta *#${ids.length}*.`,
  };
}

// ── WhatsApp render helpers ───────────────────────────────────────────────────
// Caller provides the Kapso client (so module stays free of side-effectful
// SDK init). Two image messages + optional analysis text.

// Structural type loose enough to accept the SDK's MessagesResource. We
// only call sendText / sendImage and treat the responses as opaque — using
// `any` here avoids re-declaring the SDK's full input/response shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KapsoSender = {
  sendText: (input: any) => Promise<any>;
  sendImage: (input: any) => Promise<any>;
};

function fmtDate(d: string | null | undefined): string {
  if (!d || d === "unknown") return "";
  return ` · ${d}`;
}

export async function sendStreetviewToWhatsApp(
  client: KapsoSender,
  phoneNumberId: string,
  to: string,
  sv: StreetviewPayload
): Promise<void> {
  if (!sv.before || !sv.after) {
    await client.sendText({
      phoneNumberId,
      to,
      body: "No hay imágenes Street View disponibles para esa ubicación.",
    });
    return;
  }

  if (!sv.has_history) {
    await client.sendImage({
      phoneNumberId,
      to,
      link: sv.after.url,
      caption: `📍 Vista actual${fmtDate(sv.after.date)} · sin histórico Street View`,
    });
    return;
  }

  await client.sendImage({
    phoneNumberId,
    to,
    link: sv.before.url,
    caption: `📸 ANTES${fmtDate(sv.before.date)}`,
  });
  await client.sendImage({
    phoneNumberId,
    to,
    link: sv.after.url,
    caption: `📷 DESPUÉS${fmtDate(sv.after.date)}`,
  });
}

export async function sendAiAnalysisToWhatsApp(
  client: KapsoSender,
  phoneNumberId: string,
  to: string,
  ai: AiAnalysisPayload
): Promise<void> {
  const sv = ai.streetview;
  const hasBefore = sv.beforeUrl && sv.hasHistory;

  if (hasBefore) {
    await client.sendImage({
      phoneNumberId,
      to,
      link: sv.beforeUrl!,
      caption: `📸 ANTES${fmtDate(sv.beforeDate)}`,
    });
  }
  await client.sendImage({
    phoneNumberId,
    to,
    link: sv.afterUrl,
    caption: hasBefore
      ? `📷 DESPUÉS${fmtDate(sv.afterDate)}`
      : `📍 Vista actual${fmtDate(sv.afterDate)} · sin histórico`,
  });

  if (ai.score != null && ai.description) {
    const verdict =
      ai.score <= 30 ? "🔴 RIESGO ALTO" : ai.score <= 60 ? "🟡 DUDOSO" : "🟢 OK";
    const body = `${verdict} · Veredicto IA (${ai.score}/100)\n\n"${ai.description}"`;
    await client.sendText({ phoneNumberId, to, body });
  }
}

// Auto-attach helper: reads DB cache only, never hits Google/Vision.
// Returns true if anything was sent.
export async function autoAttachVisualsWhatsApp(
  client: KapsoSender,
  phoneNumberId: string,
  to: string,
  obraId: number
): Promise<boolean> {
  const v = await getCachedVisuals(obraId);
  if (!v) return false;

  const hasGenuineSv =
    v.streetviewBefore &&
    v.streetviewAfter &&
    v.streetviewBefore !== v.streetviewAfter;

  if (!hasGenuineSv && !v.streetviewAfter) return false;

  if (hasGenuineSv) {
    await client.sendImage({
      phoneNumberId,
      to,
      link: v.streetviewBefore!,
      caption: "📸 ANTES",
    });
    await client.sendImage({
      phoneNumberId,
      to,
      link: v.streetviewAfter!,
      caption: "📷 DESPUÉS",
    });
  } else if (v.streetviewAfter) {
    await client.sendImage({
      phoneNumberId,
      to,
      link: v.streetviewAfter,
      caption: "📍 Vista actual · sin histórico",
    });
  }

  if (v.aiScore != null && v.aiDescription) {
    const verdict =
      v.aiScore <= 30 ? "🔴 RIESGO ALTO" : v.aiScore <= 60 ? "🟡 DUDOSO" : "🟢 OK";
    await client.sendText({
      phoneNumberId,
      to,
      body: `${verdict} · Veredicto IA (${v.aiScore}/100)\n\n"${v.aiDescription}"`,
    });
  }
  return true;
}
