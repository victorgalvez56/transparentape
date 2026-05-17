"use client";

import { useEffect, useRef } from "react";
import { useObrasVR } from "@/lib/vr/obras-source";
import { formatMontoCompact } from "@/lib/vr/format";

interface Props {
  selectedId: number | null;
  enabled?: boolean;
}

/**
 * Phase 8 — Narrador.
 *
 * Cuando seleccionas una obra, una voz en es-PE/es-LA dice el título,
 * el monto y si tiene alerta. Usa Web Speech API — disponible en Chrome,
 * Safari, y en el navegador de Quest 3S (Meta Browser).
 */
export default function Narrator({ selectedId, enabled = true }: Props) {
  const { obras } = useObrasVR();
  const lastSpokenRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || selectedId == null) return;
    if (lastSpokenRef.current === selectedId) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const obra = obras.find((o) => o.id === selectedId);
    if (!obra) return;

    const title = obra.tender_title ?? "obra sin título";
    const monto = formatMontoCompact(obra.monto)
      .replace("S/ ", "")
      .replace("MM", " mil millones de soles")
      .replace("M", " millones de soles")
      .replace("K", " mil soles");
    const alerta = obra.is_red_flag
      ? ". Atención: alerta de la OECE — proveedor sancionado."
      : "";
    const text = `${title}. Monto: ${monto}${alerta}`;

    const utter = new SpeechSynthesisUtterance(text);
    // Buscar voz en español, prioridad PE > MX > LA > ES
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => /es[-_]PE/i.test(v.lang)) ||
      voices.find((v) => /es[-_]MX/i.test(v.lang)) ||
      voices.find((v) => /es[-_]419/i.test(v.lang)) ||
      voices.find((v) => /^es/i.test(v.lang));
    if (preferred) utter.voice = preferred;
    utter.lang = preferred?.lang ?? "es-ES";
    utter.rate = 1.0;
    utter.volume = 0.7;
    utter.pitch = obra.is_red_flag ? 0.95 : 1.0;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
    lastSpokenRef.current = selectedId;

    return () => {
      // No cancelamos al desmontar — dejamos que el utter termine
    };
  }, [selectedId, obras, enabled]);

  return null;
}
