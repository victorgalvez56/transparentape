"use client";

import { useMemo } from "react";
import { Billboard, Text } from "@react-three/drei";
import { useObrasVR } from "@/lib/vr/obras-source";
import { projectToFloor, montoToHeight } from "@/lib/vr/projection";
import { formatMontoCompact, truncate } from "@/lib/vr/format";

interface Props {
  obraId: number | null;
  variant: "hover" | "selected";
}

/**
 * Panel flotante 3D que aparece sobre la columna apuntada/seleccionada.
 * Diseñado para leerse claro tanto en desktop como en immersive VR (sin DOM).
 */
export default function ObraPanel({ obraId, variant }: Props) {
  const { obras } = useObrasVR();
  const data = useMemo(() => {
    if (obraId == null) return null;
    return obras.find((o) => o.id === obraId) ?? null;
  }, [obras, obraId]);

  if (!data) return null;

  const [x, z] = projectToFloor(data.lng, data.lat);
  const h = montoToHeight(data.monto);
  const yTop = h + 0.5;

  const isSelected = variant === "selected";
  const accent = isSelected ? "#42dc3a" : "#ffffff";
  const opacity = isSelected ? 0.94 : 0.7;
  const title = truncate(data.tender_title, 80);
  const locality = data.buyer_locality ?? "";
  const monto = formatMontoCompact(data.monto);
  const supplier = data.supplier_name ?? "";

  const panelWidth = 1.6;
  const panelHeight = data.is_red_flag ? 0.7 : 0.6;

  return (
    <Billboard position={[x, yTop, z]} follow>
      {/* Fondo */}
      <mesh position={[0, 0, -0.001]}>
        <planeGeometry args={[panelWidth, panelHeight]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={opacity}
          depthWrite={false}
        />
      </mesh>
      {/* Borde inferior accent */}
      <mesh position={[0, -panelHeight / 2 + 0.01, 0]}>
        <planeGeometry args={[panelWidth, 0.008]} />
        <meshBasicMaterial color={data.is_red_flag ? "#ef4444" : accent} />
      </mesh>
      {/* Título de obra */}
      <Text
        position={[0, panelHeight / 2 - 0.13, 0]}
        fontSize={0.07}
        color="white"
        anchorX="center"
        anchorY="middle"
        maxWidth={panelWidth - 0.1}
        textAlign="center"
        outlineWidth={0.003}
        outlineColor="#000"
      >
        {title}
      </Text>
      {/* Monto */}
      <Text
        position={[0, 0.02, 0]}
        fontSize={0.09}
        color={accent}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.003}
        outlineColor="#000"
      >
        {monto}
      </Text>
      {/* Ubicación */}
      {locality && (
        <Text
          position={[0, -0.1, 0]}
          fontSize={0.04}
          color="#9ca3af"
          anchorX="center"
          anchorY="middle"
          maxWidth={panelWidth - 0.1}
        >
          {locality}
        </Text>
      )}
      {/* Proveedor (si existe y hay espacio) */}
      {supplier && !data.is_red_flag && (
        <Text
          position={[0, -0.18, 0]}
          fontSize={0.035}
          color="#6b7280"
          anchorX="center"
          anchorY="middle"
          maxWidth={panelWidth - 0.1}
        >
          {truncate(supplier, 40)}
        </Text>
      )}
      {/* Alerta OECE */}
      {data.is_red_flag && (
        <Text
          position={[0, -0.2, 0]}
          fontSize={0.05}
          color="#ef4444"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.004}
          outlineColor="#000"
        >
          ALERTA OECE — proveedor sancionado
        </Text>
      )}
    </Billboard>
  );
}
