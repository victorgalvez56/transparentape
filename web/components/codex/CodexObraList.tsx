"use client";

import { useEffect, useRef } from "react";
import { Obra } from "@/lib/types";
import CodexObraCard from "./CodexObraCard";

interface Props {
  obras: Obra[];
  selectedId: number | null;
  onSelect: (o: Obra) => void;
  q: string;
  onQ: (v: string) => void;
  totalAll: number;
  loading?: boolean;
}

export default function CodexObraList({
  obras,
  selectedId,
  onSelect,
  q,
  onQ,
  totalAll,
  loading,
}: Props) {
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selectedId == null) return;
    const el = itemRefs.current.get(selectedId);
    const container = scrollRef.current;
    if (!el || !container) return;
    const top = el.offsetTop - container.offsetTop;
    container.scrollTo({ top: top - 8, behavior: "smooth" });
  }, [selectedId]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        className="px-3 py-2.5 border-b shrink-0"
        style={{ borderColor: "var(--cx-border)" }}
      >
        <input
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder="Buscar obra, distrito, contratista, RUC…"
          className="w-full rounded-md px-3 py-2 text-xs outline-none transition-colors"
          style={{
            background: "var(--cx-secondary)",
            color: "var(--cx-fg)",
            fontFamily: "var(--font-mono), monospace",
          }}
        />
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent, black 12px, black calc(100% - 16px), transparent)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 12px, black calc(100% - 16px), transparent)",
        }}
      >
        {obras.length === 0 && (
          <p
            className="p-8 text-center text-xs"
            style={{
              color: "var(--cx-faint)",
              fontFamily: loading ? "var(--font-mono), monospace" : undefined,
            }}
          >
            {loading
              ? "Cargando contratos públicos…"
              : "Ninguna obra coincide con el filtro."}
          </p>
        )}
        {obras.map((o) => (
          <div
            key={o.id}
            ref={(el) => {
              if (el) itemRefs.current.set(o.id, el);
              else itemRefs.current.delete(o.id);
            }}
          >
            <CodexObraCard
              obra={o}
              selected={o.id === selectedId}
              onClick={() => onSelect(o)}
            />
          </div>
        ))}
      </div>

      <div
        className="px-3 py-2 border-t shrink-0 text-[10px] text-center uppercase tracking-[0.18em]"
        style={{
          borderColor: "var(--cx-border)",
          color: "var(--cx-faint)",
          fontFamily: "var(--font-mono), monospace",
        }}
      >
        {obras.length} de {totalAll}
      </div>
    </div>
  );
}
