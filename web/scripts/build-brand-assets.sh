#!/usr/bin/env bash
# Regenerates every app icon / favicon / OG image from the brand master.
# Master: public/brand/ape-master.png (1600x1600, watermark already cropped).
# Requires only macOS `sips` + node (for the .ico packer).
set -euo pipefail
cd "$(dirname "$0")/.."

MASTER="public/brand/ape-master.png"
BG="050505" # --ink-0, the app's base background
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mk() { # mk <size> <out>
  sips -s format png -z "$1" "$1" "$MASTER" -o "$2" >/dev/null
}

mkdir -p public/icons

# --- Browser tab + App Router auto-linked icons ---
mk 512 app/icon.png        # <link rel=icon> (modern browsers)
mk 180 app/apple-icon.png  # apple-touch-icon

# --- Legacy multi-size favicon.ico (16/32/48) ---
mk 16 "$TMP/f16.png"
mk 32 "$TMP/f32.png"
mk 48 "$TMP/f48.png"
node scripts/make-favicon-ico.mjs app/favicon.ico \
  "$TMP/f16.png=16" "$TMP/f32.png=32" "$TMP/f48.png=48"

# --- PWA / manifest icons ---
mk 192 public/icons/icon-192.png
mk 512 public/icons/icon-512.png
# Maskable: shrink into the Android safe zone on a solid brand background
sips -s format png -z 400 400 "$MASTER" -o "$TMP/m.png" >/dev/null
sips -p 512 512 --padColor "$BG" "$TMP/m.png" -o public/icons/icon-maskable-512.png >/dev/null

# --- Social share images (1200x630) ---
sips -s format png -z 560 560 "$MASTER" -o "$TMP/og.png" >/dev/null
sips -p 630 1200 --padColor "$BG" "$TMP/og.png" -o app/opengraph-image.png >/dev/null
cp app/opengraph-image.png app/twitter-image.png

echo "Brand assets rebuilt."
