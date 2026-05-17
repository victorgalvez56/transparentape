import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Proxy de los tiles equirectangulares de Street View — el MISMO endpoint
 * que usa el cliente web de Google Maps (cb_client=maps_sv.tactile). Sin
 * key, full-res, mismo enfoque "no oficial" que ya usamos en
 * GeoPhotoService.SingleImageSearch. Devuelve el JPEG desde nuestro propio
 * origen para que la textura WebGL no falle por CORS.
 *
 *   /api/streetview/tile?pano=PANOID&x=0&y=0&zoom=2
 *
 * Grid por zoom (tiles de 512px): cols = 2^zoom, rows = 2^(zoom-1).
 */
const TILE_BASE = "https://streetviewpixels-pa.googleapis.com/v1/tile";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const pano = sp.get("pano");
  const x = sp.get("x") ?? "0";
  const y = sp.get("y") ?? "0";
  const zoom = sp.get("zoom") ?? "2";

  if (!pano)
    return NextResponse.json({ error: "pano required" }, { status: 400 });

  const url =
    `${TILE_BASE}?cb_client=maps_sv.tactile&panoid=${encodeURIComponent(pano)}` +
    `&x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}&zoom=${encodeURIComponent(zoom)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return new NextResponse(null, { status: 404 });
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
        // Los panos son inmutables — cachea agresivo en el CDN.
        "Cache-Control": "public, s-maxage=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
