"use client";

import { useMemo } from "react";
import { Text } from "@react-three/drei";

const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

interface Props {
  year: number | null; // null = todos
  onChange: (year: number | null) => void;
}

/**
 * Phase 5 — Cronología 3D.
 *
 * Una fila horizontal de cubos flotantes a la altura del pecho. Cada cubo
 * es un año. El "Todos" es el reset. Al apuntar/click filtra el bosque
 * mostrando solo las obras de ese año.
 *
 * Diseñado para verse tanto en desktop como en immersive VR (controllers/hand).
 */
export default function TimelineYears({ year, onChange }: Props) {
  const buttons = useMemo(() => [null, ...YEARS], []);

  // Posicionamiento horizontal centrado, a z=4 (en frente del spawn), y=1.2
  const buttonWidth = 0.32;
  const buttonHeight = 0.22;
  const gap = 0.1;
  const totalWidth = buttons.length * buttonWidth + (buttons.length - 1) * gap;
  const startX = -totalWidth / 2 + buttonWidth / 2;

  return (
    <group position={[0, 1.2, 4]}>
      {/* Línea de fondo sutil */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[totalWidth + 0.4, buttonHeight + 0.3]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
      <Text
        position={[0, buttonHeight / 2 + 0.13, 0]}
        fontSize={0.045}
        color="#9ca3af"
        anchorY="middle"
        anchorX="center"
      >
        CRONOLOGIA · CLICK PARA FILTRAR POR ANO
      </Text>

      {buttons.map((y, i) => {
        const x = startX + i * (buttonWidth + gap);
        const isActive = y === year;
        return (
          <group
            key={y ?? "all"}
            position={[x, 0, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onChange(y);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              document.body.style.cursor = "default";
            }}
          >
            <mesh>
              <planeGeometry args={[buttonWidth, buttonHeight]} />
              <meshBasicMaterial
                color={isActive ? "#42dc3a" : "#1a1a1a"}
                transparent
                opacity={isActive ? 0.95 : 0.85}
              />
            </mesh>
            {/* Border accent activo */}
            {isActive && (
              <mesh position={[0, -buttonHeight / 2 + 0.008, 0.001]}>
                <planeGeometry args={[buttonWidth, 0.015]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            )}
            <Text
              position={[0, 0, 0.002]}
              fontSize={0.07}
              color={isActive ? "#000000" : "#ffffff"}
              anchorX="center"
              anchorY="middle"
            >
              {y == null ? "TODOS" : String(y)}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
