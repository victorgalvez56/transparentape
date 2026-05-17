import { NextRequest, NextResponse } from "next/server";
import { runChatPipeline, type ChatMessage } from "@/lib/agent/core";
import { TOOLS } from "@/lib/agent/tools";
import type { Country } from "@/lib/agent-kapso/queries";
import { warmPlaceCache } from "@/lib/agent-kapso/places";

export const runtime = "nodejs";
export const maxDuration = 30;

// Kick off the DB-backed place index warm before the first request lands.
// Module evaluation happens once per cold-start; the warm itself is
// fire-and-forget so it doesn't block the route handler. Subsequent
// requests find the cache populated and classifyQuery resolves localities
// across every country present in `obras` without any allowlist.
void warmPlaceCache();

function pickCountry(v: unknown): Country {
  if (typeof v === "string" && /^[A-Za-z]{2}$/.test(v.trim())) {
    return v.trim().toUpperCase() as Country;
  }
  return "PE";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const chatHistory: ChatMessage[] = body.messages || [{ role: "user", content: body.message }];

    if (!chatHistory.length || !chatHistory[chatHistory.length - 1]?.content) {
      return NextResponse.json({ error: "Mensaje es requerido" }, { status: 400 });
    }

    const country = pickCountry(body.country);
    const result = await runChatPipeline(chatHistory, {
      tools: TOOLS,
      toolContext: { country },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Agent error:", error);
    return NextResponse.json(
      { error: "Error procesando la solicitud del agente." },
      { status: 500 }
    );
  }
}
