"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { INTRO_MSG } from "@/lib/agent-kapso/wa-format";

interface Message {
  role: "user" | "bot";
  content: string;
}

export default function AgentWidget() {
  const [isOpen, setIsOpen] = useState(false);
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

  const bodyFont = "var(--font-body), system-ui, sans-serif";
  const monoFont = "var(--font-mono), monospace";

  return (
    <>
      {/* Trigger flotante — burbuja codex */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0, transition: { duration: 0.2 } }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setIsOpen(true)}
            aria-label="Abrir agente"
            className="fixed bottom-6 right-6 z-50 rounded-full flex items-center justify-center transition-colors"
            style={{
              width: "56px",
              height: "56px",
              background: "var(--cx-card-bg)",
              border: "1px solid var(--cx-border)",
              boxShadow: "var(--cx-shadow)",
              color: "var(--cx-fg)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--cx-card-hover)";
              e.currentTarget.style.borderColor = "var(--cx-border-strong)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--cx-card-bg)";
              e.currentTarget.style.borderColor = "var(--cx-border)";
            }}
          >
            {/* indicador online */}
            <span
              className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--cx-brand)" }}
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel del chat */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[420px] z-50 flex flex-col"
            style={{
              background: "var(--cx-bg-blur)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderLeft: "1px solid var(--cx-border)",
              boxShadow: "var(--cx-shadow)",
              fontFamily: bodyFont,
            }}
          >
            {/* Header */}
            <header
              className="flex items-center justify-between px-5 py-4"
              style={{
                borderBottom: "1px solid var(--cx-border)",
                background: "var(--cx-card-bg)",
              }}
            >
              <div className="min-w-0">
                <p
                  className="text-[11px] tracking-tight lowercase"
                  style={{
                    color: "var(--cx-muted)",
                    fontFamily: monoFont,
                  }}
                >
                  agente · forense
                </p>
                <h2
                  className="text-[15px] leading-tight font-medium tracking-tight mt-0.5"
                  style={{
                    color: "var(--cx-fg)",
                    letterSpacing: "-0.012em",
                  }}
                >
                  Sigue el billete
                </h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Cerrar agente"
                className="shrink-0 rounded-md transition-colors flex items-center justify-center"
                style={{
                  width: "30px",
                  height: "30px",
                  color: "var(--cx-muted)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--cx-card-hover)";
                  e.currentTarget.style.color = "var(--cx-fg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--cx-muted)";
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </header>

            {/* Mensajes */}
            <div
              className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-4"
              style={{ background: "var(--cx-bg)" }}
            >
              {messages.length === 0 ? (
                <div className="px-1">
                  <h2
                    className="text-[22px] leading-[1.15] font-medium tracking-tight"
                    style={{
                      color: "var(--cx-fg)",
                      letterSpacing: "-0.015em",
                    }}
                  >
                    Consulta inicial
                  </h2>
                  <div
                    className="mt-4 text-[13.5px] leading-relaxed whitespace-pre-wrap rounded-lg p-4"
                    style={{
                      color: "var(--cx-muted)",
                      background: "var(--cx-card-bg)",
                      border: "1px solid var(--cx-border)",
                    }}
                  >
                    {INTRO_MSG}
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    key={idx}
                    className={`flex w-full ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <div
                        className="max-w-[85%] rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed tracking-tight whitespace-pre-wrap"
                        style={{
                          background: "var(--cx-brand)",
                          color: "var(--cx-brand-fg)",
                          letterSpacing: "-0.005em",
                        }}
                      >
                        {msg.content}
                      </div>
                    ) : (
                      <div
                        className="max-w-[88%] rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed tracking-tight"
                        style={{
                          background: "var(--cx-card-bg)",
                          color: "var(--cx-fg)",
                          border: "1px solid var(--cx-border)",
                          letterSpacing: "-0.005em",
                        }}
                      >
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            ul: ({ node, ...props }) => (
                              <ul className="list-disc ml-4 my-1.5 space-y-1" {...props} />
                            ),
                            ol: ({ node, ...props }) => (
                              <ol className="list-decimal ml-4 my-1.5 space-y-1" {...props} />
                            ),
                            li: ({ node, ...props }) => (
                              <li className="pl-0.5" {...props} />
                            ),
                            p: ({ node, ...props }) => (
                              <p
                                className="mb-1.5 last:mb-0 leading-relaxed tracking-tight"
                                {...props}
                              />
                            ),
                            strong: ({ node, ...props }) => (
                              <strong
                                className="font-semibold"
                                style={{ color: "var(--cx-fg)" }}
                                {...props}
                              />
                            ),
                            em: ({ node, ...props }) => (
                              <em
                                className="italic"
                                style={{ color: "var(--cx-muted)" }}
                                {...props}
                              />
                            ),
                            a: ({ node, ...props }) => (
                              <a
                                className="underline underline-offset-2 transition-colors"
                                style={{ color: "var(--cx-brand)" }}
                                {...props}
                              />
                            ),
                            code: ({ node, ...props }) => (
                              <code
                                className="px-1 py-0.5 rounded-sm text-[12px] tabular-nums"
                                style={{
                                  background: "var(--cx-secondary)",
                                  fontFamily: monoFont,
                                  color: "var(--cx-fg)",
                                }}
                                {...props}
                              />
                            ),
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </motion.div>
                ))
              )}

              {isLoading && (
                <div className="flex w-full justify-start">
                  <div
                    className="rounded-lg px-3.5 py-3 flex items-center gap-1.5"
                    style={{
                      background: "var(--cx-card-bg)",
                      border: "1px solid var(--cx-border)",
                    }}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{
                        background: "var(--cx-faint)",
                        animationDelay: "0ms",
                      }}
                    />
                    <div
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{
                        background: "var(--cx-faint)",
                        animationDelay: "150ms",
                      }}
                    />
                    <div
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{
                        background: "var(--cx-faint)",
                        animationDelay: "300ms",
                      }}
                    />
                  </div>
                </div>
              )}

              {suggestedQuestions.length > 0 && !isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col gap-2 mt-1"
                >
                  <p
                    className="text-[11px] tracking-tight lowercase px-1"
                    style={{
                      color: "var(--cx-faint)",
                      fontFamily: monoFont,
                    }}
                  >
                    sugerencias
                  </p>
                  {suggestedQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => sendToBackend(q)}
                      disabled={isLoading}
                      className="text-left text-[12.5px] tracking-tight rounded-md px-3 py-2.5 flex items-center justify-between gap-2 transition-colors group"
                      style={{
                        background: "var(--cx-secondary)",
                        border: "1px solid var(--cx-border)",
                        color: "var(--cx-fg)",
                        letterSpacing: "-0.005em",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--cx-card-hover)";
                        e.currentTarget.style.borderColor = "var(--cx-border-strong)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "var(--cx-secondary)";
                        e.currentTarget.style.borderColor = "var(--cx-border)";
                      }}
                    >
                      <span className="leading-snug">{q}</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
                        style={{ color: "var(--cx-muted)" }}
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  ))}
                </motion.div>
              )}
            </div>

            {/* Input */}
            <footer
              className="px-3 py-3"
              style={{
                borderTop: "1px solid var(--cx-border)",
                background: "var(--cx-card-bg)",
              }}
            >
              <form onSubmit={sendMessage} className="relative w-full">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isLoading}
                  placeholder="Escribe tu consulta…"
                  className="w-full rounded-md pl-3.5 pr-11 py-2.5 text-[13px] tracking-tight transition-colors focus:outline-none"
                  style={{
                    background: "var(--cx-bg)",
                    border: "1px solid var(--cx-border)",
                    color: "var(--cx-fg)",
                    fontFamily: bodyFont,
                    letterSpacing: "-0.005em",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--cx-border-strong)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--cx-border)";
                  }}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  aria-label="Enviar consulta"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm flex items-center justify-center transition-colors disabled:cursor-not-allowed"
                  style={{
                    width: "30px",
                    height: "30px",
                    background:
                      !input.trim() || isLoading
                        ? "var(--cx-secondary)"
                        : "var(--cx-brand)",
                    color:
                      !input.trim() || isLoading
                        ? "var(--cx-faint)"
                        : "var(--cx-brand-fg)",
                  }}
                  onMouseEnter={(e) => {
                    if (input.trim() && !isLoading) {
                      e.currentTarget.style.background = "var(--cx-brand-strong)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (input.trim() && !isLoading) {
                      e.currentTarget.style.background = "var(--cx-brand)";
                    }
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m22 2-7 20-4-9-9-4Z" />
                    <path d="M22 2 11 13" />
                  </svg>
                </button>
              </form>
              <p
                className="mt-2 text-[10.5px] tracking-tight lowercase px-1"
                style={{
                  color: "var(--cx-faint)",
                  fontFamily: monoFont,
                }}
              >
                respuestas generadas · verificar contra la fuente
              </p>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
