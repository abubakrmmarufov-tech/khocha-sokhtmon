"""Small measuring helpers on a render.
   tools/py tools/scan.py brown RENDER u1,u2,... [ylo yhi]      first marble (brown) pixel going down at each column
   tools/py tools/scan.py glass RENDER u1,u2,... [ylo yhi]      runs of window glass (dark or blue) down each column
   tools/py tools/scan.py hedge RENDER y1,y2,... [xlo xhi]      strong vertical edges along rows"""
import sys

import numpy as np
from PIL import Image

mode, src = sys.argv[1], sys.argv[2]
vals = [int(v) for v in sys.argv[3].split(',')]
lo = int(sys.argv[4]) if len(sys.argv) > 4 else 0
im = np.asarray(Image.open(src).convert('RGB')).astype(float)
hi = int(sys.argv[5]) if len(sys.argv) > 5 else im.shape[0 if mode != 'hedge' else 1]
r, g, b = im[..., 0], im[..., 1], im[..., 2]
L = (r + g + b) / 3
if mode == 'brown':
    brown = ((r - b) > 28) & (r > 80) & (r < 235)
    out = []
    for u in vals:
        c = brown[lo:hi, u - 1:u + 2].mean(axis=1) > 0.6
        v = next((lo + k for k in range(len(c) - 3) if c[k] and c[k + 1] and c[k + 2]), None)
        out.append((u, v))
    print(out)
elif mode == 'glass':
    glass = (((b - r) > 30) & (L < 210)) | (L < 95)
    for u in vals:
        c = glass[lo:hi, u - 1:u + 2].mean(axis=1) > 0.5
        runs, s = [], None
        for k, v in enumerate(c):
            if v and s is None:
                s = k
            if not v and s is not None:
                if k - s >= 4:
                    runs.append((lo + s, lo + k))
                s = None
        print(u, runs)
else:
    for y in vals:
        row = L[y - 1:y + 2].mean(axis=0)
        gr = np.abs(np.diff(row))
        idx = [x for x in range(lo, hi - 1) if gr[x] > 40]
        out, prev = [], -9
        for x in idx:
            if x - prev > 2:
                out.append(x)
            prev = x
        print(y, out)
