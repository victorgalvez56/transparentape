import { NextRequest, NextResponse } from "next/server";
import { getCountryView, DEFAULT_COUNTRY } from "@/lib/countries";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Detecta el país del usuario en orden de confianza:
 * 1. Cloudflare CF-IPCountry (preciso, viene del túnel/proxy)
 * 2. Vercel x-vercel-ip-country (si está en Vercel)
 * 3. accept-language parseado (ej "es-PE,en;q=0.9" → "PE")
 * 4. Default PE
 */
export async function GET(req: NextRequest) {
  const h = req.headers;
  const cf = h.get("cf-ipcountry");
  const vercel = h.get("x-vercel-ip-country");

  let code: string | null = null;
  let source: string;

  if (cf && cf !== "XX" && cf !== "T1") {
    code = cf;
    source = "cloudflare";
  } else if (vercel) {
    code = vercel;
    source = "vercel";
  } else {
    const al = h.get("accept-language") ?? "";
    const m = al.match(/[a-z]{2,3}-([A-Z]{2})/);
    if (m) {
      code = m[1];
      source = "accept-language";
    } else {
      source = "default";
    }
  }

  const view = getCountryView(code);
  return NextResponse.json({
    detected: code,
    source,
    country: view,
    fallback: !code || view.code === DEFAULT_COUNTRY.code,
  });
}
