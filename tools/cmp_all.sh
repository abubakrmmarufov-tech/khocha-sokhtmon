#!/usr/bin/env bash
# The model seen with each calibrated render camera (tools/cams.json), next to the render.
#   tools/cmp_all.sh [names...]     -> build/cmp/<name>_side.png, <name>_edges.png, <name>_model.png
set -euo pipefail
cd "$(dirname "$0")/.."
NAMES=${*:-"r8 r5 r1 r2 r3 r7"}
mkdir -p build/cmp
for n in $NAMES; do
  read -r W H CAM < <(python3 -c "
import json; c=json.load(open('tools/cams.json'))['$n']
print(c['size'][0], c['size'][1], ','.join(str(v) for v in c['cam']))")
  R=materials/renders/${n//[!0-9]/}.webp
  node tools/shot.mjs build/cmp/${n}_model.png --size ${W}x${H} --cam "$CAM" ${BARE:---bare} 2>&1 | grep -v "^wrote" || true
  tools/py tools/compare.py "$R" build/cmp/${n}_model.png build/cmp/${n}_side.png --mode side >/dev/null
  tools/py tools/compare.py "$R" build/cmp/${n}_model.png build/cmp/${n}_edges.png --mode edges >/dev/null
  echo "$n done"
done
