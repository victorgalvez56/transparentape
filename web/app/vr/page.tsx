"use client";

import dynamic from "next/dynamic";

const AuditRoom = dynamic(() => import("@/components/vr/AuditRoom"), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-screen flex items-center justify-center bg-black">
      <div
        className="text-[var(--fg-dim)] text-sm tracking-[0.3em] uppercase"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        Cargando Audit Room…
      </div>
    </div>
  ),
});

export default function VRPage() {
  return (
    <main className="fixed inset-0 bg-black overflow-hidden">
      <AuditRoom />
    </main>
  );
}
