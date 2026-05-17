import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

type InfobrasRow = {
  codigo_infobras: number;
  nombre: string | null;
  estado: string | null;
  avance_fisico_pct: number | null;
  fecha_ultimo_avance: string | null;
  fecha_inicio: string | null;
  fecha_fin_programada: string | null;
  contratista_nombre: string | null;
  monto_aprobacion: number | null;
  ubicacion_geografica: string | null;
  direccion: string | null;
  n_avances_mensuales: number | null;
  n_fotos: number | null;
  avances_mensuales: unknown[] | null;
  fotos: unknown[] | null;
  imagenes_aereas: unknown[] | null;
  tiene_informe_control: boolean | null;
  n_modificaciones_plazo: number | null;
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });

  const row = await queryOne<InfobrasRow>(
    `SELECT codigo_infobras, nombre, estado, avance_fisico_pct, fecha_ultimo_avance,
            fecha_inicio, fecha_fin_programada, contratista_nombre, monto_aprobacion,
            ubicacion_geografica, direccion, n_avances_mensuales, n_fotos,
            avances_mensuales, fotos, imagenes_aereas,
            tiene_informe_control, n_modificaciones_plazo
       FROM infobras_full
      WHERE codigo_infobras = $1`,
    [Number(code)]
  );

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Extract the most recent monthly progress entries (last 6 months)
  const avances = Array.isArray(row.avances_mensuales) ? row.avances_mensuales : [];
  const recentAvances = avances.slice(-6);

  // Extract photo URLs from avances and fotos
  const INFOBRAS_BASE = "https://infobras.contraloria.gob.pe/InfobrasWeb";
  const photos: { url: string; label: string }[] = [];

  // Photos from fotos JSONB (extracted from DatosEjecucion HTML)
  const fotos = Array.isArray(row.fotos) ? row.fotos as Record<string, string>[] : [];
  for (const f of fotos.slice(0, 8)) {
    if (f.url) photos.push({ url: f.url, label: f.filename_id ?? "" });
  }

  // Photos from avances_mensuales[].lImgFisico[].UrlImg
  if (photos.length < 8) {
    for (const av of avances.slice().reverse()) {
      const avObj = av as Record<string, unknown>;
      const imgs = Array.isArray(avObj.lImgFisico) ? avObj.lImgFisico as Record<string, string>[] : [];
      for (const img of imgs) {
        if (img.UrlImg && photos.length < 8) {
          const ext = img.Extension ?? "jpeg";
          photos.push({
            url: `${INFOBRAS_BASE}/Archivo/ShowFile?filename=${img.UrlImg}&contentType=image/${ext}`,
            label: `${avObj.Mes ?? ""} ${avObj.Anio ?? ""}`.trim(),
          });
        }
      }
    }
  }

  return NextResponse.json(
    {
      codigo_infobras: row.codigo_infobras,
      nombre: row.nombre,
      estado: row.estado,
      avance_fisico_pct: row.avance_fisico_pct,
      fecha_ultimo_avance: row.fecha_ultimo_avance,
      fecha_inicio: row.fecha_inicio,
      fecha_fin_programada: row.fecha_fin_programada,
      contratista_nombre: row.contratista_nombre,
      monto_aprobacion: row.monto_aprobacion,
      ubicacion_geografica: row.ubicacion_geografica,
      direccion: row.direccion,
      n_avances_mensuales: row.n_avances_mensuales,
      n_fotos: row.n_fotos,
      n_modificaciones_plazo: row.n_modificaciones_plazo,
      tiene_informe_control: row.tiene_informe_control,
      recent_avances: recentAvances,
      photos,
      infobras_url: `https://infobras.contraloria.gob.pe/InfobrasWeb/Mapa/Sumario?obraId=${row.codigo_infobras}`,
    },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
