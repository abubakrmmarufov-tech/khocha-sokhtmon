"""The ground of a render seen from above: each plan point at height z is projected into the render
with its calibrated camera (tools/cams.json) and sampled. Points hidden from the camera by the house
(a box over its footprint) are left white. A metre grid every 10 m, labels every 50 m.

    tools/py tools/ortho.py NAME OUT.png [--ext x0,y0,x1,y1] [--px 6] [--z 0]
"""
import argparse
import json
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument('name')
ap.add_argument('out')
ap.add_argument('--ext', default='-110,-90,110,110')
ap.add_argument('--px', type=float, default=6.0)
ap.add_argument('--z', type=float, default=0.0)
ap.add_argument('--render')
a = ap.parse_args()
C = json.load(open('tools/cams.json'))[a.name]
src = a.render or f"materials/renders/{''.join(ch for ch in a.name if ch.isdigit())}.webp"
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
H_, W_ = im.shape[:2]
cx, cy, yaw, f, v0, cz = C['cam']
s, c = math.sin(math.radians(yaw)), math.cos(math.radians(yaw))
x0, y0, x1, y1 = [float(v) for v in a.ext.split(',')]
px = a.px
W, H = int((x1 - x0) * px), int((y1 - y0) * px)
xs = x0 + (np.arange(W) + 0.5) / px
ys = y1 - (np.arange(H) + 0.5) / px
X, Y = np.meshgrid(xs, ys)
Z = np.full_like(X, a.z)
dx, dy = X - cx, Y - cy
xc, zc = dx * c - dy * s, dx * s + dy * c
u = W_ / 2 + f * xc / zc
v = v0 - f * (Z - cz) / zc
ok = (zc > 1) & (u >= 0) & (u < W_ - 1) & (v >= 0) & (v < H_ - 1)
# hidden by the house: the segment from the point to the camera passes through its box
bx0, bx1, by0, by1, bz1 = -17.0, 17.0, -9.6, 9.0, 38.0
D = np.stack([cx - X, cy - Y, cz - Z], -1)
P0 = np.stack([X, Y, Z], -1)
tmin = np.zeros_like(X)
tmax = np.ones_like(X)
for k, (lo, hi) in enumerate(((bx0, bx1), (by0, by1), (0.0, bz1))):
    d = D[..., k]
    p = P0[..., k]
    with np.errstate(divide='ignore', invalid='ignore'):
        t1 = (lo - p) / d
        t2 = (hi - p) / d
    ta, tb = np.minimum(t1, t2), np.maximum(t1, t2)
    inside = (p >= lo) & (p <= hi)
    ta = np.where(np.abs(d) < 1e-9, np.where(inside, -np.inf, np.inf), ta)
    tb = np.where(np.abs(d) < 1e-9, np.where(inside, np.inf, -np.inf), tb)
    tmin = np.maximum(tmin, ta)
    tmax = np.minimum(tmax, tb)
hidden = (tmin <= tmax) & (tmax > 1e-3)
u = np.clip(u, 0, W_ - 1.001)
v = np.clip(v, 0, H_ - 1.001)
ui, vi = u.astype(int), v.astype(int)
fu, fv = (u - ui)[..., None], (v - vi)[..., None]
col = (im[vi, ui] * (1 - fu) * (1 - fv) + im[vi, ui + 1] * fu * (1 - fv) + im[vi + 1, ui] * (1 - fu) * fv + im[vi + 1, ui + 1] * fu * fv)
col[~ok] = 255
col[hidden & ok] = col[hidden & ok] * 0.35 + 255 * 0.65
img = Image.fromarray(col.astype(np.uint8))
g = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 12)
except Exception:
    font = None
for m in range(int(math.ceil(x0 / 10)) * 10, int(x1) + 1, 10):
    X_ = (m - x0) * px
    g.line([(X_, 0), (X_, H)], fill=(255, 0, 0) if m % 50 == 0 else (255, 120, 120), width=1)
    if m % 50 == 0:
        g.text((X_ + 2, 2), str(m), fill=(255, 0, 0), font=font)
for m in range(int(math.ceil(y0 / 10)) * 10, int(y1) + 1, 10):
    Y_ = (y1 - m) * px
    g.line([(0, Y_), (W, Y_)], fill=(0, 0, 255) if m % 50 == 0 else (120, 120, 255), width=1)
    if m % 50 == 0:
        g.text((2, Y_ + 2), str(m), fill=(0, 0, 255), font=font)
# the house's outline
g.rectangle([(bx0 - x0) * px, (y1 - by1) * px, (bx1 - x0) * px, (y1 - -9.0) * px], outline=(255, 255, 0), width=2)
img.save(a.out)
print(a.out, img.size)
