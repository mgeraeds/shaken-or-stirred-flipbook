#!/usr/bin/env bash
#
# Zet pdf.js en StPageFlip in de repo, zodat de flipbook zonder CDN werkt.
# Aan te raden voor een proefschrift: de site blijft dan werken, ook als
# jsDelivr over tien jaar iets anders doet.
#
#   bash scripts/vendor.sh
#
# Vereist: node/npm en tar. Voegt ongeveer 15 MB aan de repo toe.

set -euo pipefail

PDFJS_VERSION=6.2.108
PAGEFLIP_VERSION=2.0.7

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="$root/assets/vendor"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "› Pakketten ophalen…"
(cd "$tmp" && npm pack "pdfjs-dist@$PDFJS_VERSION" "page-flip@$PAGEFLIP_VERSION" --silent >/dev/null)

mkdir -p "$tmp/pdfjs" "$tmp/pageflip"
tar -xzf "$tmp/pdfjs-dist-$PDFJS_VERSION.tgz" -C "$tmp/pdfjs"
tar -xzf "$tmp/page-flip-$PAGEFLIP_VERSION.tgz" -C "$tmp/pageflip"

echo "› Bestanden plaatsen in assets/vendor…"
rm -rf "$dest"
mkdir -p "$dest/pdfjs"

# De legacy-build is naar oudere JavaScript vertaald en werkt daardoor ook
# in browsers van een paar jaar terug — handig voor een openbare link.
cp "$tmp/pdfjs/package/legacy/build/pdf.min.mjs"        "$dest/pdfjs/pdf.min.mjs"
cp "$tmp/pdfjs/package/legacy/build/pdf.worker.min.mjs" "$dest/pdfjs/pdf.worker.min.mjs"
cp -r "$tmp/pdfjs/package/cmaps"          "$dest/pdfjs/cmaps"
cp -r "$tmp/pdfjs/package/standard_fonts" "$dest/pdfjs/standard_fonts"
cp -r "$tmp/pdfjs/package/wasm"           "$dest/pdfjs/wasm"
cp "$tmp/pageflip/package/dist/js/page-flip.browser.js" "$dest/page-flip.browser.js"

# Licenties meenemen — beide bibliotheken vragen daarom.
cp "$tmp/pdfjs/package/LICENSE"    "$dest/pdfjs/LICENSE"    2>/dev/null || true
cp "$tmp/pageflip/package/LICENSE" "$dest/LICENSE-page-flip" 2>/dev/null || true

cat <<'BLOK'

✔ Klaar. Vervang nu in assets/js/config.js het blok onder "Bibliotheken" door:

  pdfjs: {
    lib:    './assets/vendor/pdfjs/pdf.min.mjs',
    worker: './assets/vendor/pdfjs/pdf.worker.min.mjs',
    cmaps:  './assets/vendor/pdfjs/cmaps/',
    fonts:  './assets/vendor/pdfjs/standard_fonts/',
    wasm:   './assets/vendor/pdfjs/wasm/',
  },
  pageFlip: './assets/vendor/page-flip.browser.js',

BLOK
