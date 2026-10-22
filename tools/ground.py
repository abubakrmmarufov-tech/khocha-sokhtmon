"""Back-project image points to plan positions at a known height, with a calibrated camera.
   tools/py tools/ground.py --cam=cx,cy,yaw,f,v0,cz --size W,H --z Z  u1,v1 u2,v2 ...
   tools/py tools/ground.py ... --brown RENDER u1,u2,... [ylo yhi]     (find the podium top first)"""
import argparse
import math

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--cam', required=True)
ap.add_argument('--size', required=True)
ap.add_argument('--z', type=float, default=0.0)
ap.add_argument('--brown')
ap.add_argument('--ylo', type=int, default=0)
ap.add_argument('--yhi', type=int, default=99999)
ap.add_argument('pts', nargs='*')
a = ap.parse_args()
cx, cy, yaw, f, v0, cz = [float(v) for v in a.cam.split(',')]
W, H = [int(v) for v in a.size.split(',')]
yaw = math.radians(yaw)
s, c = math.sin(yaw), math.cos(yaw)


def back(u, v, z):
    # ray: xc = (u - W/2)/f * zc ; z - cz = (v0 - v)/f * zc
    dz = (v0 - v) / f
    if abs(dz) < 1e-9:
        return None
    zc = (z - cz) / dz
    xc = (u - W / 2) / f * zc
    # camera frame -> plan: forward (s, c), right (c, -s)
    return cx + zc * s + xc * c, cy + zc * c - xc * s


pts = []
if a.brown:
    im = np.asarray(Image.open(a.brown).convert('RGB')).astype(float)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    brown = ((r - b) > 28) & (r > 80) & (r < 235)
    for u in [int(p) for p in a.pts[0].split(',')]:
        col = brown[a.ylo:min(a.yhi, im.shape[0]), u - 1:u + 2].mean(axis=1) > 0.6
        v = next((a.ylo + k for k in range(len(col) - 3) if col[k] and col[k + 1] and col[k + 2]), None)
        if v is not None:
            pts.append((u, v))
else:
    pts = [tuple(float(q) for q in p.split(',')) for p in a.pts]
for u, v in pts:
    p = back(u, v, a.z)
    print(f'u {u:6.0f} v {v:6.0f} -> x {p[0]:7.2f}  y {p[1]:7.2f}')
