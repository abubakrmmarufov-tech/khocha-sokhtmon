"""Camera of a client render from things whose place on the building is known.

The renders are 2-point perspectives (verticals stay vertical): a level camera at plan (cx, cy),
height cz, heading yaw (degrees from north, clockwise), focal length f (px), principal point at the
image centre across and at v0 down (the horizon's row; outside the image for aerial views).

    tools/py tools/calib.py tools/calib.json NAME [--free]

calib.json: { NAME: { "size": [W, H],
                      "u":    [[x, y, u], ...],                            vertical edges: plan point -> column
                      "hf":   [[face, "zname", u, v], ...],                a point on a face at a named height
                      "rows": [[face, u, "z3name", "storey", {floor: v}]] window tops (or any row) floor by floor
                      "z":    {"zname": metres, ...} } }                   named heights (default: the house's)
face = [x0, y0, x1, y1], a plan segment (the facade line). Heights are absolute (m above the
forecourt). A coarse search over camera positions comes first, then least squares; with --free the
named heights are fitted too (the storey stays as given).
"""
import json
import math
import sys

import numpy as np
from scipy.optimize import least_squares

DEPTH = 21.5      # the house front to back (main planes, tools/plan/extract.py)

# named heights of the house (blender/hoji/building.py)
Z = {
    'pod': 9.60,       # top of the marble podium, foot of the white facade
    'top3n': 11.82,    # floor 3, top of the narrow windows (framed columns)
    'top3c': 11.82,    # ... the corner columns
    'top3r': 12.01,    # ... the risalits' big windows
    'top3b': 11.57,    # ... the back's windows
    'storey': 3.25,
}


def project(cam, X, Y, Zz, W):
    cx, cy, cz, yaw, f, v0 = cam
    s, c = math.sin(yaw), math.cos(yaw)
    dx, dy = np.asarray(X, float) - cx, np.asarray(Y, float) - cy
    xc = dx * c - dy * s
    zc = dx * s + dy * c
    return W / 2 + f * xc / zc, v0 - f * (np.asarray(Zz, float) - cz) / zc


def on_face(cam, face, u, W):
    """plan point of the face line seen at column u (closed form)"""
    cx, cy, cz, yaw, f, v0 = cam
    x0, y0, x1, y1 = face
    s, c = math.sin(yaw), math.cos(yaw)
    ax, ay = x0 - cx, y0 - cy
    bx, by = x1 - x0, y1 - y0
    a0, a1 = ax * c - ay * s, bx * c - by * s       # xc = a0 + a1 t
    b0, b1 = ax * s + ay * c, bx * s + by * c       # zc = b0 + b1 t
    q = u - W / 2
    den = f * a1 - q * b1
    t = (q * b0 - f * a0) / den if abs(den) > 1e-9 else 0.5
    return x0 + bx * t, y0 + by * t


def constraints(view, heights):
    """flattened lists: vertical-edge (x, y, u); points (face, z, u, v, zname, floor - 3)"""
    W = view['size'][0]
    us = [(x, y, u) for x, y, u in view.get('u', [])]
    pts = []
    for face, zn, u, v in view.get('hf', []):
        pts.append((face, heights[zn], u, v, zn, 0))
    for face, u, z3, sn, rows in view.get('rows', []):
        for fl, v in rows.items():
            pts.append((face, heights[z3] + (int(fl) - 3) * heights[sn], u, v, z3, int(fl) - 3))
    return W, us, pts


def labels(view):
    out = [f'edge {x},{y}' for x, y, _ in view.get('u', [])]
    out += [f'{zn} u={u}' for face, zn, u, v in view.get('hf', [])]
    for face, u, z3, sn, rows in view.get('rows', []):
        out += [f'{z3} u={u} fl{fl}' for fl in rows]
    return out


def scale_face(face, kx, ky):
    x0, y0, x1, y1 = face
    return [x0 * kx, y0 * ky, x1 * kx, y1 * ky]


def residuals(cam, W, us, pts, kx=1.0, ky=1.0):
    r = []
    for x, y, u in us:
        r.append(project(cam, x * kx, y * ky, 0.0, W)[0] - u)
    for face, z, u, v, *_ in pts:
        x, y = on_face(cam, scale_face(face, kx, ky), u, W)
        r.append(project(cam, x, y, z, W)[1] - v)
    return np.array(r)


def coarse(W, us, pts):
    """search over camera positions and headings; f from the vertical edges, then cz and v0 from the
    points (both linear); returns the best few cameras"""
    xs = np.array([p[0] for p in us]), np.array([p[1] for p in us]), np.array([p[2] for p in us])
    best = []
    for d in np.geomspace(35, 600, 70):
        for az in np.radians(np.arange(0, 360, 1.5)):
            cx, cy = d * math.sin(az), d * math.cos(az)
            look = math.atan2(-cx, -cy)          # heading towards the middle of the house
            for dy in np.radians(np.arange(-24, 24.1, 1.5)):
                yaw = look + dy
                s, c = math.sin(yaw), math.cos(yaw)
                dxs, dys = xs[0] - cx, xs[1] - cy
                xc, zc = dxs * c - dys * s, dxs * s + dys * c
                if np.any(zc <= 5):
                    continue
                k = xc / zc
                q = xs[2] - W / 2
                f = float((k * q).sum() / (k * k).sum())
                if f < 300 or f > 12000:
                    continue
                ru = f * k - q
                eu = float((ru ** 2).sum())
                if eu > 400 * len(us):
                    continue
                # cz, v0 by least squares on the points: v = v0 - f (z - cz) / zc
                cam = (cx, cy, 0.0, yaw, f, 0.0)
                A, b = [], []
                for face, z, u, v, *_ in pts:
                    x, y = on_face(cam, face, u, W)
                    zz = (x - cx) * s + (y - cy) * c
                    if zz <= 1:
                        A = None
                        break
                    A.append([1.0, f / zz])
                    b.append(v + f * z / zz)
                if A is None or len(A) < 2:
                    continue
                A, b = np.array(A), np.array(b)
                sol, *_ = np.linalg.lstsq(A, b, rcond=None)
                v0, cz = sol
                ev = float(((A @ sol - b) ** 2).sum())
                e = eu + ev
                best.append((e, (cx, cy, cz, yaw, f, v0)))
        best.sort(key=lambda t: t[0])
        best = best[:12]
    return [b[1] for b in best]


def solve(view, free=False):
    heights = dict(Z)
    heights.update(view.get('z', {}))
    W, us, pts = constraints(view, heights)
    starts = coarse(W, us, pts)
    best = None
    for s0 in starts:
        r = least_squares(lambda p: residuals(p, W, us, pts), np.array(s0), loss='soft_l1', f_scale=2.0, x_scale='jac')
        if best is None or r.cost < best.cost:
            best = r
    cam = best.x
    names = sorted({p[4] for p in pts} | {'storey'}) if free else []
    names = [n for n in names if n != view.get('datum', 'pod')] if free else []
    if free and not any(p[4] == view.get('datum', 'pod') for p in pts):
        names = names[1:]          # nothing measured at the datum: keep the first name fixed instead
    ky = 1.0
    if free:
        free_depth = '--depth' in sys.argv

        def res2(p):
            hz = dict(heights)
            hz.update(dict(zip(names, p[7:])))
            _, _, pts2 = constraints(view, hz)
            return residuals(p[:6], W, us, pts2, 1.0, p[6] if free_depth else 1.0)
        r = least_squares(res2, np.concatenate([cam, [1.0], [heights[n] for n in names]]), loss='soft_l1', f_scale=2.0, x_scale='jac')
        cam = r.x[:6]
        ky = r.x[6] if free_depth else 1.0
        heights.update(dict(zip(names, r.x[7:])))
        _, _, pts = constraints(view, heights)
    heights['depth'] = DEPTH * ky
    return cam, heights, residuals(cam, W, us, pts, 1.0, ky), names + ['depth']


def main():
    data = json.load(open(sys.argv[1]))
    free = '--free' in sys.argv
    names = [a for a in sys.argv[2:] if not a.startswith('--')] or list(data)
    for name in names:
        cam, hz, r, zn = solve(data[name], free)
        cx, cy, cz, yaw, f, v0 = cam
        yd = math.degrees(yaw) % 360
        print(f'{name}: camera x {cx:.2f} y {cy:.2f} z {cz:.2f} yaw {yd:.2f} f {f:.1f} v0 {v0:.1f}   rms {math.sqrt((r ** 2).mean()):.2f} px, max {abs(r).max():.1f}')
        print(f'   --cam={cx:.2f},{cy:.2f},{yd:.3f},{f:.1f},{v0:.1f},{cz:.2f}')
        if free:
            print('   heights', {n: round(float(hz[n]), 3) for n in zn})
        lab = labels(data[name])
        worst = sorted(range(len(r)), key=lambda i: -abs(r[i]))[:8]
        print('   worst', ', '.join(f'{lab[i]}: {r[i]:.1f}' for i in worst))


if __name__ == '__main__':
    main()
