#!/usr/bin/env bash
# Rebuild the house and its grounds and copy them into the web viewer.
#
#   blender/export.sh        # -> public/models/house.glb, src/model/complex.json
set -euo pipefail
cd "$(dirname "$0")/.."
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
OUT=build/house
mkdir -p build public/models src/model
PYTHONPATH=.pylib "$BLENDER" -b --factory-startup --python-use-system-env -P blender/build.py -- --out "$OUT" "$@" 2>&1 | grep -E "Error|error|Traceback|File \"|line [0-9]" || true
test -s "$OUT.glb"
GT=(npx --yes @gltf-transform/cli@4.1.1)
"${GT[@]}" dedup "$OUT.glb" "$OUT.dedup.glb" >/dev/null
"${GT[@]}" weld "$OUT.dedup.glb" "$OUT.weld.glb" >/dev/null
# 16-bit positions and UVs: the site mesh is ~480 m across (14 bits would be 3 cm steps, and road
# lines, kerbs and lawns lie a few centimetres apart)
"${GT[@]}" meshopt --quantize-position 16 --quantize-texcoord 16 "$OUT.weld.glb" public/models/house.glb >/dev/null
rm -f "$OUT.dedup.glb" "$OUT.weld.glb"
cp "$OUT.json" src/model/complex.json
ls -la public/models/house.glb src/model/complex.json
