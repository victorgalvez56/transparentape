"use client";

import { useEffect, useRef } from "react";

interface Props {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
}

export default function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = "Antes",
  afterLabel = "Ahora",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    import("img-comparison-slider").catch(() => null);
  }, []);

  return (
    <div ref={ref} className="relative w-full overflow-hidden" style={{ aspectRatio: "16/9" }}>
      {/* @ts-expect-error — web component */}
      <img-comparison-slider
        style={{
          width: "100%",
          height: "100%",
          "--divider-color": "var(--brand, #42dc3a)",
          "--default-handle-color": "var(--brand, #42dc3a)",
        }}
      >
        <figure slot="first" style={{ margin: 0, width: "100%", height: "100%", position: "relative" }}>
          <img
            src={beforeUrl}
            alt="Antes"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          <figcaption
            style={{
              position: "absolute", top: 8, left: 8,
              background: "rgba(0,0,0,0.72)", color: "#fff",
              padding: "3px 8px", borderRadius: 4,
              fontSize: 10, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase",
            }}
          >
            {beforeLabel}
          </figcaption>
        </figure>
        <figure slot="second" style={{ margin: 0, width: "100%", height: "100%", position: "relative" }}>
          <img
            src={afterUrl}
            alt="Ahora"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          <figcaption
            style={{
              position: "absolute", top: 8, right: 8,
              background: "rgba(66,220,58,0.85)", color: "#000",
              padding: "3px 8px", borderRadius: 4,
              fontSize: 10, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase",
            }}
          >
            {afterLabel}
          </figcaption>
        </figure>
      {/* @ts-expect-error — web component */}
      </img-comparison-slider>
    </div>
  );
}
