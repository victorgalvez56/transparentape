#!/usr/bin/env node
/**
 * Parche para iwer 2.x — su XRSession.onDeviceFrame asume que
 * gl.getParameter(COLOR_CLEAR_VALUE) devuelve un Float32Array, pero en
 * WebGL2 sobre Chrome desktop puede devolver null y revienta con
 * "Cannot read properties of null (reading '0')".
 *
 * Se ejecuta en postinstall — idempotente, si ya esta parcheado no toca.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(__dirname, "..", "node_modules", "iwer", "lib", "session", "XRSession.js");

if (!existsSync(target)) {
  console.log("[patch-iwer] iwer no instalado, skip.");
  process.exit(0);
}

const original = readFileSync(target, "utf8");
const MARKER = "PATCH transparentape:";

if (original.includes(MARKER)) {
  console.log("[patch-iwer] ya parcheado, skip.");
  process.exit(0);
}

const buggy = `                if (this[P_SESSION].mode != 'inline') {
                    const currentClearColor = context.getParameter(context.COLOR_CLEAR_VALUE);
                    const currentClearDepth = context.getParameter(context.DEPTH_CLEAR_VALUE);
                    const currentClearStencil = context.getParameter(context.STENCIL_CLEAR_VALUE);`;

const fixed = `                if (this[P_SESSION].mode != 'inline') {
                    // ${MARKER} WebGL2 puede devolver null en algunos browsers
                    const currentClearColor = context.getParameter(context.COLOR_CLEAR_VALUE) || [0, 0, 0, 1];
                    const currentClearDepth = context.getParameter(context.DEPTH_CLEAR_VALUE) ?? 1;
                    const currentClearStencil = context.getParameter(context.STENCIL_CLEAR_VALUE) ?? 0;`;

if (!original.includes(buggy)) {
  console.warn("[patch-iwer] no se encontro el codigo buggy — quizas iwer cambio. Skip.");
  process.exit(0);
}

const patched = original.replace(buggy, fixed);
writeFileSync(target, patched, "utf8");
console.log("[patch-iwer] iwer XRSession.js parcheado OK.");
