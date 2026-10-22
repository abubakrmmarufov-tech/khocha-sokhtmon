"""A facade of a client render as a flat elevation in metres, from a calibrated camera.

    tools/py tools/rectify.py RENDER OUT.png --cam "cx,cy,yaw_deg,f,v0[,u0]" --face x0,y0,x1,y1 --z Z0 Z1 [--px 40] [--zoff 0]

The face runs from plan point (x0, y0) to (x1, y1) (its left end seen from outside first); t across
in metres from that end, z up (relative to the camera's height, plus --zoff). A metre grid is drawn
(red every metre across, blue every metre up, labels every 5 m).
"""
import argparse
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('out')
ap.add_argument('--cam', required=True)
ap.add_argument('--face', required=True)
ap.add_argument('--z', nargs=2, type=float, required=True)
ap.add_argument('--px', type=float, default=40)
ap.add_argument('--zoff', type=float, default=0.0)
ap.add_argument('--grid', type=int, default=1)
a = ap.parse_args()

im = np.asarray(Image.open(a.src).convert('RGB')).astype(np.float32)
H_, W_ = im.shape[:2]
c = [float(v) for v in a.cam.split(',')]
cx, cy, yaw, f, v0 = c[0], c[1], math.radians(c[2]), c[3], c[4]
u0 = c[5] if len(c) > 5 else W_ / 2
x0, y0, x1, y1 = [float(v) for v in a.face.split(',')]
L = math.hypot(x1 - x0, y1 - y0)
ex, ey = (x1 - x0) / L, (y1 - y0) / L
z0, z1 = a.z
px = a.px
W, H = int(L * px), int((z1 - z0) * px)
ts = (np.arange(W) + 0.5) / px
zs = z1 - (np.arange(H) + 0.5) / px - a.zoff       # relative to the camera
TT, ZZ = np.meshgrid(ts, zs)
X, Y = x0 + ex * TT, y0 + ey * TT
fx, fy = math.sin(yaw), math.cos(yaw)
rx, ry = math.cos(yaw), -math.sin(yaw)
dx, dy = X - cx, Y - cy
xc, zc = dx * rx + dy * ry, dx * fx + dy * fy
u = u0 + f * xc / zc
v = v0 - f * ZZ / zc
ok = (zc > 1) & (u >= 0) & (u < W_ - 1) & (v >= 0) & (v < H_ - 1)
u = np.clip(u, 0, W_ - 1.001)
v = np.clip(v, 0, H_ - 1.001)
ui, vi = u.astype(int), v.astype(int)
fu, fv = (u - ui)[..., None], (v - vi)[..., None]
col = (im[vi, ui] * (1 - fu) * (1 - fv) + im[vi, ui + 1] * fu * (1 - fv) + im[vi + 1, ui] * (1 - fu) * fv + im[vi + 1, ui + 1] * fu * fv)
col[~ok] = 255
img = Image.fromarray(col.astype(np.uint8))
if a.grid:
    g = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 12)
    except Exception:
        font = None
    for m in range(0, int(L) + 1):
        X_ = m * px
        g.line([(X_, 0), (X_, 8 if m % 5 else 18)], fill=(255, 0, 0))
        g.line([(X_, H - 1), (X_, H - (8 if m % 5 else 18))], fill=(255, 0, 0))
        if m % 5 == 0:
            g.text((X_ + 2, 18), str(m), fill=(255, 0, 0), font=font)
    for m in range(math.ceil(z0), int(z1) + 1):
        Y_ = (z1 - m) * px
        g.line([(0, Y_), (8 if m % 5 else 18, Y_)], fill=(0, 0, 255))
        g.line([(W - 1, Y_), (W - (8 if m % 5 else 18), Y_)], fill=(0, 0, 255))
        if m % 5 == 0:
            g.text((20, Y_ - 7), str(m), fill=(0, 0, 255), font=font)
img.save(a.out)
print(a.out, img.size)
