"use client";

import { useEffect, useState } from "react";
import type { Obra } from "@/lib/types";

interface VRObra {
  id: number;
  lng: number;
  lat: number;
  monto: number;
  is_red_flag: boolean;
  source_year: number | null;
  // Lazy-loaded on demand (no las metemos todas al state inicial)
  ocid: string;
  tender_title: string | null;
  buyer_locality: string | null;
  supplier_name: string | null;
}

/**
 * Hook que carga las obras con coordenadas, listas para meter al bosque.
 * Cache en memoria para no re-fetch al cambiar de scene.
 */
let cached: VRObra[] | null = null;
let pending: Promise<VRObra[]> | null = null;

async function loadObras(): Promise<VRObra[]> {
  if (cached) return cached;
  if (pending) return pending;
  // /vr sólo muestra obras con vista panorámica (Street View) — flag
  // persistido por scripts/backfill-panorama.mjs.
  pending = fetch("/api/obras?with_coords=true&has_panorama=true&limit=70000")
    .then((r) => r.json())
    .then((data) => {
      const list: VRObra[] = (data.obras ?? [])
        .filter((o: Obra) => o.lat != null && o.lng != null)
        .map((o: Obra) => ({
          id: o.id,
          lng: Number(o.lng),
          lat: Number(o.lat),
          monto:
            Number(o.contract_amount) ||
            Number(o.award_amount) ||
            Number(o.tender_amount) ||
            0,
          is_red_flag: Boolean(o.is_red_flag),
          source_year: o.source_year,
          ocid: o.ocid,
          tender_title: o.tender_title,
          buyer_locality: o.buyer_locality,
          supplier_name: o.supplier_name,
        }));
      cached = list;
      return list;
    })
    .catch(() => {
      pending = null;
      return [];
    });
  return pending;
}

export function useObrasVR() {
  const [obras, setObras] = useState<VRObra[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  useEffect(() => {
    if (cached) return;
    loadObras().then((list) => {
      setObras(list);
      setLoading(false);
    });
  }, []);
  return { obras, loading };
}

export type { VRObra };
