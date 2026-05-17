/**
 * Liveblocks presence type declaration. Modern v3.x usa el global merge.
 * Lo que cada user broadcastea para que los demás vean su avatar.
 */

declare global {
  interface Liveblocks {
    Presence: {
      headPos: [number, number, number];
      headQuat: [number, number, number, number];
      color: string;
      name: string;
      // Si está apuntando a una obra (raycast hit instanceId)
      pointingObraId: number | null;
    };
  }
}

const PALETTE = [
  "#42dc3a", // brand
  "#3a8cdc", // sky
  "#dc3a8c", // pink
  "#dc8c3a", // amber
  "#8c3adc", // purple
  "#3adcdc", // cyan
];

/**
 * Genera un perfil persistente por sesión (sobrevive a reloads de la misma
 * pestaña). Cada user tiene color + nombre únicos.
 */
export function getMyProfile(): { color: string; name: string } {
  if (typeof window === "undefined") {
    return { color: PALETTE[0], name: "Auditor" };
  }
  const KEY = "transparentape-vr-profile";
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { color: string; name: string };
      if (parsed.color && parsed.name) return parsed;
    }
  } catch {
    // ignore
  }
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  const name = `Auditor #${Math.floor(Math.random() * 9000) + 1000}`;
  const profile = { color, name };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
  return profile;
}

export const LIVEBLOCKS_ROOM_ID = "transparentape-audit-room-v1";

export {};
