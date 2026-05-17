"use client";

import { Text } from "@react-three/drei";
import { projectToFloor } from "@/lib/vr/projection";

/**
 * Etiquetas en el suelo para orientar al jugador en el espacio.
 * Posicionadas justo encima del piso, rotadas para leer de pie.
 */
const PINS: Array<{ name: string; lng: number; lat: number; size: number }> = [
  { name: "LIMA", lng: -77, lat: -12, size: 0.7 },
  { name: "CUSCO", lng: -71.97, lat: -13.52, size: 0.4 },
  { name: "AREQUIPA", lng: -71.54, lat: -16.4, size: 0.4 },
  { name: "TRUJILLO", lng: -79.03, lat: -8.11, size: 0.4 },
  { name: "PIURA", lng: -80.63, lat: -5.19, size: 0.4 },
  { name: "SANTIAGO", lng: -70.65, lat: -33.45, size: 0.45 },
];

export default function GeoLabels() {
  return (
    <>
      {PINS.map((p) => {
        const [x, z] = projectToFloor(p.lng, p.lat);
        return (
          <Text
            key={p.name}
            position={[x, 0.02, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={p.size}
            color="#1f5e1c"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.005}
            outlineColor="#020202"
            letterSpacing={0.1}
          >
            {p.name}
          </Text>
        );
      })}
    </>
  );
}
