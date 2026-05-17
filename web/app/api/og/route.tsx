import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getObraByOcid } from "@/lib/obras-query";
import { riesgoDeObra } from "@/lib/types";
import { fmtSolesLong, displayTitle } from "@/lib/format";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ocid = req.nextUrl.searchParams.get("ocid");
  const obra = ocid ? await getObraByOcid(ocid).catch(() => null) : null;

  const riesgo = obra ? riesgoDeObra(obra) : "bajo";
  const color =
    riesgo === "alto" ? "#ef4444" : riesgo === "medio" ? "#f59e0b" : "#42dc3a";
  const titulo = obra ? displayTitle(obra) : "Transparentape";
  const distrito = obra?.buyer_locality ?? "Perú";
  const region = obra?.buyer_region ?? "";
  const monto = obra
    ? fmtSolesLong(
        obra.contract_amount ?? obra.award_amount ?? obra.tender_amount,
        obra.country
      )
    : "";
  const contratista = obra?.supplier_name ?? "";
  const emoji = riesgo === "alto" ? "🔴" : riesgo === "medio" ? "🟡" : "🟢";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #050505 0%, #0a3d0a 100%)",
          color: "white",
          padding: "60px 70px",
          fontFamily: "system-ui",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              background: "#42dc3a",
              boxShadow: "0 0 16px #42dc3a",
            }}
          />
          <div
            style={{
              fontSize: 22,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            Transparentape · Perú
          </div>
        </div>

        <div
          style={{
            marginTop: 36,
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 32,
          }}
        >
          <span>{emoji}</span>
          <span style={{ color, textTransform: "uppercase", letterSpacing: 3 }}>
            Riesgo {riesgo}
          </span>
        </div>

        <div
          style={{
            marginTop: 28,
            fontSize: 52,
            fontWeight: 800,
            lineHeight: 1.1,
            display: "flex",
          }}
        >
          {titulo.length > 130 ? titulo.slice(0, 129) + "…" : titulo}
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            gap: 50,
            fontSize: 24,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                color: "rgba(255,255,255,0.45)",
                fontSize: 16,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Lugar
            </span>
            <span style={{ marginTop: 4 }}>
              {distrito}
              {region ? ` · ${region}` : ""}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                color: "rgba(255,255,255,0.45)",
                fontSize: 16,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Monto
            </span>
            <span style={{ marginTop: 4, color: "#42dc3a", fontWeight: 700 }}>
              {monto}
            </span>
          </div>
          {contratista && (
            <div style={{ display: "flex", flexDirection: "column", maxWidth: 420 }}>
              <span
                style={{
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 16,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                }}
              >
                Contratista
              </span>
              <span style={{ marginTop: 4 }}>
                {contratista.length > 38 ? contratista.slice(0, 37) + "…" : contratista}
              </span>
            </div>
          )}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
