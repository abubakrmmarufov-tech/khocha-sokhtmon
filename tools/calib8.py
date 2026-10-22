"""Camera of render 8 (the front from the south-south-west) and the heights of the window rows.

Plan metres: x east, y north, the house 34 x 18 m centred on the origin. The camera: plan position
(cx, cy), height 0 (heights come out relative to the camera), heading `yaw` (0 = north, 90 = east),
focal length f, principal point u0 = image centre, horizon v0 (2-point perspective: verticals stay
vertical). Unknowns besides the camera: the window-top height of floor 3 relative to the camera and
the storey height; the positions of mirrored pairs of elements along the front.
"""
import math
import numpy as np
from scipy.optimize import least_squares

U0 = 1492 / 2
X0, X1, Y0, Y1 = -17.0, 17.0, -9.0, 9.0


def proj(cam, X, Y, Z):
    cx, cy, yaw, f, v0 = cam
    fwd = np.array([math.sin(yaw), math.cos(yaw)])
    right = np.array([math.cos(yaw), -math.sin(yaw)])
    d = np.stack([np.asarray(X) - cx, np.asarray(Y) - cy], -1)
    xc, zc = d @ right, d @ fwd
    return U0 + f * xc / zc, v0 - f * np.asarray(Z) / zc


# u of corners (plan x, y)
CORNERS = [((X0, Y0), 604.5), ((X1, Y0), 1215.0), ((X0, Y1), 390.5)]
# mirrored pairs on the front: (left edge u, right edge u) of the element on the west half, and the
# same element's edges on the east half (left u, right u as seen)
PAIRS = [((637, 667), (1173, 1194)), ((709, 741), (1125, 1150)), ((769, 800), (1076, 1102)),
         ((826, 852), (1021, 1044)), ((860, 880), (1007, 1013)), ((903, 928), (962, 986))]
# window tops (v) at columns u, by floor
TOPS = {
    726: {10: 132, 9: 210, 8: 288, 7: 366, 6: 444, 5: 522, 4: 599, 3: 676},
    645: {9: 205, 8: 285, 7: 364, 6: 443, 5: 522, 4: 601, 3: 680},
    916: {10: 167, 9: 241, 8: 315, 7: 389, 6: 463, 5: 537, 4: 610, 3: 684},
    975: {10: 177, 9: 250, 8: 322, 7: 395, 6: 468, 5: 540, 4: 613, 3: 686},
    1032: {10: 189, 9: 261, 8: 332, 7: 403, 6: 474, 5: 545, 4: 616, 3: 687},
    1143: {10: 200, 9: 269, 8: 339, 7: 408, 6: 477, 5: 546, 3: 685},
    1188: {9: 282, 8: 351, 7: 419, 6: 486, 5: 554, 4: 622, 3: 690},
}
# podium top line (v) on the front and the west end
POD_FRONT = [(612, 734), (737, 734), (862, 736), (987, 736), (1112, 738), (1187, 739)]
POD_WEST = [(395, 741), (443, 740), (491, 739), (539, 737), (587, 736)]


def unpack(p):
    cam = p[:5]
    ztop3, storey, zpod = p[5:8]
    ts = p[8:]
    return cam, ztop3, storey, zpod, ts


def t_of_u(cam, u):
    """front facade position t (from the west corner) seen at image column u"""
    lo, hi = -2.0, 36.0
    for _ in range(60):
        m = (lo + hi) / 2
        if proj(cam, X0 + m, Y0, 0.0)[0] < u:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


def residuals(p):
    cam, ztop3, storey, zpod, ts = unpack(p)
    r = []
    for (x, y), u in CORNERS:
        r.append(proj(cam, x, y, 0.0)[0] - u)
    k = 0
    for (l0, l1), (r0, r1) in PAIRS:
        a, b = ts[k], ts[k + 1]
        k += 2
        r.append(proj(cam, X0 + a, Y0, 0.0)[0] - l0)
        r.append(proj(cam, X0 + b, Y0, 0.0)[0] - l1)
        r.append(proj(cam, X1 - b, Y0, 0.0)[0] - r0)
        r.append(proj(cam, X1 - a, Y0, 0.0)[0] - r1)
    for u, rows in TOPS.items():
        t = t_of_u(cam, u)
        for fl, v in rows.items():
            r.append(proj(cam, X0 + t, Y0, ztop3 + (fl - 3) * storey)[1] - v)
    for u, v in POD_FRONT:
        t = t_of_u(cam, u)
        r.append(proj(cam, X0 + t, Y0, zpod)[1] - v)
    for u, v in POD_WEST:
        # west end: find y with that u
        lo, hi = -9.5, 9.5
        for _ in range(60):
            m = (lo + hi) / 2
            if proj(cam, X0, m, 0.0)[0] < u:
                hi = m
            else:
                lo = m
        r.append(proj(cam, X0, (lo + hi) / 2, zpod)[1] - v)
    return np.array(r)


best = None
for yaw0 in (20, 30, 40, 50):
    for dist in (60, 90, 130):
        a = math.radians(yaw0)
        cx, cy = -dist * math.sin(a), -dist * math.cos(a)
        p0 = [cx, cy, a, 2000.0, 750.0, -2.0, 3.3, -12.0] + [1.5, 2.9, 4.8, 6.3, 7.8, 9.3, 10.9, 12.2, 12.7, 13.5, 14.6, 16.1]
        try:
            s = least_squares(residuals, p0, loss='soft_l1', f_scale=2.0)
        except Exception as e:
            continue
        if best is None or s.cost < best.cost:
            best = s
cam, ztop3, storey, zpod, ts = unpack(best.x)
res = residuals(best.x)
print('camera: x %.1f y %.1f yaw %.1f deg f %.0f v0 %.1f' % (cam[0], cam[1], math.degrees(cam[2]), cam[3], cam[4]))
print('rms %.2f px, max %.1f' % (math.sqrt((res ** 2).mean()), abs(res).max()))
print('storey %.3f m; floor-3 window top %.2f m and podium top %.2f m relative to the camera' % (storey, ztop3, zpod))
print('window top above podium top: %.2f m' % (ztop3 - zpod))
names = ['corner col', 'risalit w1', 'risalit w2', 'narrow A', 'strip', 'narrow B']
for i, n in enumerate(names):
    print(f'  {n:12s} {ts[2*i]:6.2f} .. {ts[2*i+1]:6.2f}  (w {ts[2*i+1]-ts[2*i]:.2f})')
