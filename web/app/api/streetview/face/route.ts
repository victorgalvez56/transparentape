import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const KEY = (process.env.GOOGLE_MAPS_KEY ?? "").trim();

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const panoId = sp.get("panoId");
  const heading = sp.get("heading") ?? "0";
  const pitch = sp.get("pitch") ?? "0";

  if (!panoId)
    return NextResponse.json({ error: "panoId required" }, { status: 400 });
  if (!KEY)
    return NextResponse.json(
      { error: "GOOGLE_MAPS_KEY not configured" },
      { status: 500 }
    );

  const url =
    `https://maps.googleapis.com/maps/api/streetview` +
    `?size=640x640&pano=${encodeURIComponent(panoId)}` +
    `&fov=90&heading=${heading}&pitch=${pitch}&key=${KEY}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return new NextResponse(null, { status: 404 });
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
