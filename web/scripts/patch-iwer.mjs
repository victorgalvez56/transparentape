#!/usr/bin/env node
/**
 * Parches para iwer 2.x corriendo en Chrome desktop:
 *
 * 1. XRSession.onDeviceFrame asume getParameter(COLOR_CLEAR_VALUE) devuelve
 *    Float32Array. En WebGL2 puede devolver null y revienta con
 *    "Cannot read properties of null (reading '0')".
 *
 * 2. @iwer/devui bundlea su propia three.js — al renderizar el overlay del
 *    Quest tira "material.onBuild is not a function" por version mismatch
 *    con three.js de root. Envolvemos devui.render en try/catch.
 *
 * Idempotente — busca markers comment, si ya parcheado no toca.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(
  __dirname,
  "..",
  "node_modules",
  "iwer",
  "lib",
  "session",
  "XRSession.js"
);

if (!existsSync(target)) {
  console.log("[patch-iwer] iwer no instalado, skip.");
  process.exit(0);
}

const MARKER_CLEAR = "PATCH transparentape clear:";
const MARKER_DEVUI = "PATCH transparentape devui:";

let source = readFileSync(target, "utf8");
let changed = false;

// Patch 1: clearColor/Depth/Stencil null safety
const buggy1 = `                if (this[P_SESSION].mode != 'inline') {
                    const currentClearColor = context.getParameter(context.COLOR_CLEAR_VALUE);
                    const currentClearDepth = context.getParameter(context.DEPTH_CLEAR_VALUE);
                    const currentClearStencil = context.getParameter(context.STENCIL_CLEAR_VALUE);`;

const fixed1 = `                if (this[P_SESSION].mode != 'inline') {
                    // ${MARKER_CLEAR} WebGL2 puede devolver null en algunos browsers
                    const currentClearColor = context.getParameter(context.COLOR_CLEAR_VALUE) || [0, 0, 0, 1];
                    const currentClearDepth = context.getParameter(context.DEPTH_CLEAR_VALUE) ?? 1;
                    const currentClearStencil = context.getParameter(context.STENCIL_CLEAR_VALUE) ?? 0;`;

if (source.includes(MARKER_CLEAR)) {
  // ya parcheado
} else if (source.includes(buggy1)) {
  source = source.replace(buggy1, fixed1);
  changed = true;
} else {
  console.warn("[patch-iwer] patch 1: codigo buggy no encontrado, iwer pudo haber cambiado.");
}

// Patch 2: devui.render try/catch
const buggy2 = `                const devui = this[P_SESSION].device[P_DEVICE].devui;
                if (devui) {
                    devui.render(time);
                }`;

const fixed2 = `                const devui = this[P_SESSION].device[P_DEVICE].devui;
                if (devui) {
                    // ${MARKER_DEVUI} devui bundlea su propia three.js (material.onBuild mismatch)
                    try { devui.render(time); } catch (_) { /* devui overlay falla, XR sigue */ }
                }`;

if (source.includes(MARKER_DEVUI)) {
  // ya parcheado
} else if (source.includes(buggy2)) {
  source = source.replace(buggy2, fixed2);
  changed = true;
} else {
  console.warn("[patch-iwer] patch 2: codigo buggy no encontrado, iwer pudo haber cambiado.");
}

if (changed) {
  writeFileSync(target, source, "utf8");
  console.log("[patch-iwer] iwer XRSession.js parcheado OK.");
} else {
  console.log("[patch-iwer] todos los parches ya aplicados o codigo no coincide, skip.");
}
