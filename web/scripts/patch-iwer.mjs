#!/usr/bin/env node
/**
 * Parches para hacer funcionar el emulator IWER en Chrome desktop:
 *
 * 1. iwer XRSession.onDeviceFrame: gl.getParameter(COLOR_CLEAR_VALUE) puede
 *    devolver null en WebGL2 → currentClearColor[0] revienta.
 *
 * 2. @pmndrs/xr emulate: instala @iwer/devui que bundlea three@0.165, que
 *    choca con three@0.184 del root del proyecto ("material.onBuild is not
 *    a function" + render en blanco). Saltamos installDevUI().
 *
 * Idempotente — busca markers comment, si ya parcheado no toca.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function patch({ target, marker, buggy, fixed, label }) {
  if (!existsSync(target)) {
    console.log(`[patch-iwer] ${label}: archivo no existe, skip.`);
    return;
  }
  const source = readFileSync(target, "utf8");
  if (source.includes(marker)) {
    console.log(`[patch-iwer] ${label}: ya parcheado.`);
    return;
  }
  if (!source.includes(buggy)) {
    console.warn(
      `[patch-iwer] ${label}: codigo buggy no encontrado — version cambio?`
    );
    return;
  }
  writeFileSync(target, source.replace(buggy, fixed), "utf8");
  console.log(`[patch-iwer] ${label}: parcheado.`);
}

// Patch 1 — iwer XRSession.js: null safety en getParameter
patch({
  label: "iwer getParameter null",
  target: resolve(root, "node_modules/iwer/lib/session/XRSession.js"),
  marker: "PATCH transparentape clear:",
  buggy: `                if (this[P_SESSION].mode != 'inline') {
                    const currentClearColor = context.getParameter(context.COLOR_CLEAR_VALUE);
                    const currentClearDepth = context.getParameter(context.DEPTH_CLEAR_VALUE);
                    const currentClearStencil = context.getParameter(context.STENCIL_CLEAR_VALUE);`,
  fixed: `                if (this[P_SESSION].mode != 'inline') {
                    // PATCH transparentape clear: WebGL2 puede devolver null
                    const currentClearColor = context.getParameter(context.COLOR_CLEAR_VALUE) || [0, 0, 0, 1];
                    const currentClearDepth = context.getParameter(context.DEPTH_CLEAR_VALUE) ?? 1;
                    const currentClearStencil = context.getParameter(context.STENCIL_CLEAR_VALUE) ?? 0;`,
});

// Patch 2 — iwer XRSession.js: try/catch devui.render (defense in depth)
patch({
  label: "iwer devui.render try/catch",
  target: resolve(root, "node_modules/iwer/lib/session/XRSession.js"),
  marker: "PATCH transparentape devui:",
  buggy: `                const devui = this[P_SESSION].device[P_DEVICE].devui;
                if (devui) {
                    devui.render(time);
                }`,
  fixed: `                const devui = this[P_SESSION].device[P_DEVICE].devui;
                if (devui) {
                    // PATCH transparentape devui: bundle tiene three@0.165 mismatch
                    try { devui.render(time); } catch (_) { /* devui overlay falla, XR sigue */ }
                }`,
});

// Patch 3 — @pmndrs/xr emulate.js: NO instalar devui (raiz del problema)
patch({
  label: "@pmndrs/xr skip installDevUI",
  target: resolve(root, "node_modules/@pmndrs/xr/dist/emulate.js"),
  marker: "PATCH transparentape: skip devui",
  buggy: `    xrdevice.installRuntime();
    xrdevice.installDevUI(DevUI);`,
  fixed: `    xrdevice.installRuntime();
    // PATCH transparentape: skip devui — bundlea three@0.165 que choca con root three@0.184
    // xrdevice.installDevUI(DevUI);`,
});
