"use client";

import { useEffect, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

/**
 * Grafo de navegación de Street View: los panoramas vecinos de cada pano
 * y el rumbo (heading) de cada conexión. Usamos el StreetViewService de
 * Maps (sólo datos, sin el widget pesado) — la misma key pública que ya
 * usaba el visor anterior. Degrada a "sin movimiento" si no hay key.
 */

setOptions({
  key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "",
  v: "weekly",
});

export interface PanoLink {
  pano: string;
  heading: number; // grados, 0 = norte, horario
}

export interface PanoLinks {
  links: PanoLink[];
  /** Rumbo (grados) en el centro horizontal de la imagen equirectangular. */
  centerHeading: number;
}

const EMPTY: PanoLinks = { links: [], centerHeading: 0 };

const cache = new Map<string, PanoLinks>();
const pending = new Map<string, Promise<PanoLinks>>();

let svcPromise: Promise<google.maps.StreetViewService | null> | null = null;

async function getService(): Promise<google.maps.StreetViewService | null> {
  if (!svcPromise) {
    svcPromise = importLibrary("streetView")
      .then((lib) => {
        const { StreetViewService } = lib as google.maps.StreetViewLibrary;
        return new StreetViewService();
      })
      .catch(() => null);
  }
  return svcPromise;
}

export async function getPanoLinks(panoId: string): Promise<PanoLinks> {
  if (cache.has(panoId)) return cache.get(panoId)!;
  if (pending.has(panoId)) return pending.get(panoId)!;

  const job = (async (): Promise<PanoLinks> => {
    const svc = await getService();
    if (!svc) return EMPTY;
    try {
      const { data } = await svc.getPanorama({ pano: panoId });
      const links: PanoLink[] = (data?.links ?? [])
        .filter((l) => l?.pano && typeof l.heading === "number")
        .map((l) => ({ pano: l.pano as string, heading: l.heading as number }));
      const centerHeading =
        typeof data?.tiles?.centerHeading === "number"
          ? data.tiles.centerHeading
          : 0;
      const result: PanoLinks = { links, centerHeading };
      cache.set(panoId, result);
      return result;
    } catch {
      return EMPTY;
    } finally {
      pending.delete(panoId);
    }
  })();

  pending.set(panoId, job);
  return job;
}

export function usePanoLinks(panoId: string | null | undefined): PanoLinks {
  const [data, setData] = useState<PanoLinks>(() =>
    panoId && cache.has(panoId) ? cache.get(panoId)! : EMPTY
  );

  useEffect(() => {
    let alive = true;
    // setState sólo en el callback async (no en el cuerpo del efecto).
    Promise.resolve(panoId ? getPanoLinks(panoId) : EMPTY).then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, [panoId]);

  return data;
}
