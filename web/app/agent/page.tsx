"use client";

import { useState } from "react";

interface Message {
  role: "user" | "bot";
  content: string;
}

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);

  const sendToBackend = async (userMsg: string) => {
    if (isLoading) return;

    const newMessages = [...messages, { role: "user" as const, content: userMsg }];
    setMessages(newMessages);
    setInput("");
    setSuggestedQuestions([]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Ocurrió un error al procesar el mensaje.");
      }

      setMessages((prev) => [
        ...prev,
        { role: "bot", content: data.reply || "Sin respuesta." },
      ]);
      
      if (data.suggested_questions && Array.isArray(data.suggested_questions)) {
        setSuggestedQuestions(data.suggested_questions);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "bot", content: `Error: ${err.message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await sendToBackend(input.trim());
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center py-10 px-4">
      <div className="max-w-3xl w-full h-[85vh] flex flex-col gap-6">
        <div className="text-center shrink-0">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">
            Agente Obras Públicas
          </h1>
          <p className="text-neutral-400 mt-2">
            Pregúntame sobre obras en Perú, presupuestos y estados.
          </p>
        </div>

        <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-2xl p-4 min-h-0 flex flex-col gap-4 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="text-center text-neutral-500 my-auto">
              Empieza a preguntar sobre obras públicas. Ej: "¿Qué obras hay en Piura este año?"
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex w-full ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-5 py-3 whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-bl-none"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex w-full justify-start">
              <div className="max-w-[85%] bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-2xl rounded-bl-none px-5 py-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          {suggestedQuestions.length > 0 && !isLoading && (
            <div className="flex flex-wrap gap-2 mt-2 justify-start">
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendToBackend(q)}
                  disabled={isLoading}
                  className="text-sm bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-neutral-300 py-2 px-4 rounded-full transition-colors text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={sendMessage} className="relative w-full shrink-0">
          <input
            type="text"
            className="w-full bg-neutral-900 border border-neutral-700 rounded-full px-6 py-4 pr-32 text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            placeholder="Escribe tu consulta aquí..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full px-6 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
