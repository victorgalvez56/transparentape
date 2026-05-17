import { NextRequest, NextResponse } from "next/server";
import { runChatPipeline, type ChatMessage } from "@/lib/agent/core";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const chatHistory: ChatMessage[] = body.messages || [{ role: "user", content: body.message }];

    if (!chatHistory.length || !chatHistory[chatHistory.length - 1]?.content) {
      return NextResponse.json({ error: "Mensaje es requerido" }, { status: 400 });
    }

    const result = await runChatPipeline(chatHistory);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Agent error:", error);
    return NextResponse.json(
      { error: "Error procesando la solicitud del agente." },
      { status: 500 }
    );
  }
}
