"use client";

import { useEffect, useState } from "react";

export default function CustomCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // Solo desktop + sin touch
    if (
      typeof window === "undefined" ||
      window.matchMedia("(pointer: coarse)").matches ||
      window.innerWidth < 1024
    ) {
      return;
    }
    setEnabled(true);
    const onMove = (e: PointerEvent) =>
      setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  if (!enabled) return null;
  return (
    <span
      aria-hidden="true"
      className="globe-cursor-dot"
      style={{ transform: `translate(${pos.x - 12}px, ${pos.y - 12}px)` }}
    />
  );
}
