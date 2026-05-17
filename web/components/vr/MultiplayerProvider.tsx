"use client";

import { ReactNode, useMemo } from "react";
import { LiveblocksProvider, RoomProvider } from "@liveblocks/react";
import { getMyProfile, LIVEBLOCKS_ROOM_ID } from "@/lib/vr/liveblocks-config";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY;

/**
 * Wrappea la VR scene con Liveblocks. Si la public key no está, degrada
 * silenciosamente — la app funciona en solo-mode.
 */
export default function MultiplayerProvider({ children }: { children: ReactNode }) {
  const profile = useMemo(() => getMyProfile(), []);

  if (!PUBLIC_KEY) {
    return <>{children}</>;
  }

  return (
    <LiveblocksProvider publicApiKey={PUBLIC_KEY}>
      <RoomProvider
        id={LIVEBLOCKS_ROOM_ID}
        initialPresence={{
          headPos: [0, 1.6, 6],
          headQuat: [0, 0, 0, 1],
          color: profile.color,
          name: profile.name,
          pointingObraId: null,
        }}
      >
        {children}
      </RoomProvider>
    </LiveblocksProvider>
  );
}
