"""Triangulate a point seen in two or more calibrated renders (tools/cams.json).
   tools/py tools/tri.py r1:u,v r2:u,v [r3:u,v ...]      -> x y z (plan metres, height)
   tools/py tools/tri.py --at z r1:u,v ...                -> x y at a known height (one view is enough)"""
import json
import math
import sys

import numpy as np
from scipy.optimize import least_squares

C = json.load(open('tools/cams.json'))


def proj(name, X, Y, Z):
    W = C[name]['size'][0]
    cx, cy, yaw, f, v0, cz = C[name]['cam']
    a = math.radians(yaw)
    s, c = math.sin(a), math.cos(a)
    dx, dy = X - cx, Y - cy
    xc, zc = dx * c - dy * s, dx * s + dy * c
    return W / 2 + f * xc / zc, v0 - f * (Z - cz) / zc


args = sys.argv[1:]
zfix = None
if args and args[0] == '--at':
    zfix = float(args[1])
    args = args[2:]
obs = []
for a in args:
    n, uv = a.split(':')
    u, v = (float(t) for t in uv.split(','))
    obs.append((n, u, v))


def res(p):
    X, Y = p[0], p[1]
    Z = zfix if zfix is not None else p[2]
    r = []
    for n, u, v in obs:
        pu, pv = proj(n, X, Y, Z)
        r += [pu - u, pv - v]
    return r


best = None
for x0 in (-10, 0, 10):
    for y0 in (-8, 0, 8):
        p0 = [x0, y0] if zfix is not None else [x0, y0, 20.0]
        r = least_squares(res, p0)
        if best is None or r.cost < best.cost:
            best = r
p = best.x
rr = np.array(res(p))
z = zfix if zfix is not None else p[2]
print(f'x {p[0]:7.2f}  y {p[1]:7.2f}  z {z:6.2f}   (rms {math.sqrt((rr ** 2).mean()):.1f} px: {np.round(rr, 1).tolist()})')
