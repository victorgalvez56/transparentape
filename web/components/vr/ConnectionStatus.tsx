"use client";

import { useStatus } from "@liveblocks/react";

const MULTIPLAYER_ENABLED = Boolean(
  process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY
);

/**
 * Banner sutil que muestra el estado del websocket de Liveblocks.
 * - "connected" → no muestra nada (verde, todo bien)
 * - "connecting" → "Conectando…"
 * - "reconnecting" → "Reconectando…"
 * - "disconnected" → "Modo solo — multi-user no disponible"
 *
 * Si no hay public key, no se renderiza nunca.
 */
export default function ConnectionStatus() {
  if (!MULTIPLAYER_ENABLED) return null;
  return <ConnectionStatusInner />;
}

function ConnectionStatusInner() {
  const status = useStatus();
  if (status === "connected" || status === "initial") return null;

  const config: Record<string, { label: string; color: string }> = {
    connecting: { label: "Conectando a sala…", color: "#facc15" },
    reconnecting: { label: "Reconectando…", color: "#facc15" },
    disconnected: {
      label: "Modo solo · multi-user no disponible",
      color: "#9ca3af",
    },
  };
  const c = config[status];
  if (!c) return null;

  return (
    <div
      className="pointer-events-none absolute top-4 right-4 z-20 px-3 py-2 bg-black/70 backdrop-blur"
      style={{ fontFamily: "var(--font-mono), monospace" }}
    >
      <span
        className="text-[10px] uppercase tracking-[0.22em]"
        style={{ color: c.color }}
      >
        ● {c.label}
      </span>
    </div>
  );
}
