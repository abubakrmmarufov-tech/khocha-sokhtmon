"""Hypothesis test: fixed depth 18 m with a free horizontal pixel scale (stretched image) vs free depth."""
import json
import math
import sys

import numpy as np
from scipy.optimize import least_squares

sys.path.insert(0, 'tools')
import calib as C  # noqa: E402

data = json.load(open('tools/calib.json'))
for name in sys.argv[1:]:
    view = data[name]
    hz = dict(C.Z)
    W, us, pts = C.constraints(view, hz)
    cam, _, _, _ = C.solve(view, free=False)

    def res(p, depth_free, sx_free):
        cam = list(p[:6])
        ky = p[6] if depth_free else 1.0
        sx = p[7] if sx_free else 1.0
        # a stretched image: columns measured from the centre scale by sx
        us2 = [(x, y, W / 2 + (u - W / 2) / sx) for x, y, u in us]
        pts2 = [(f, z, W / 2 + (u - W / 2) / sx, v, *rest) for f, z, u, v, *rest in pts]
        return C.residuals(cam, W, us2, pts2, 1.0, ky)

    for label, df, sf in (('depth 18, square px', False, False), ('depth free', True, False), ('depth 18, stretch free', False, True), ('both free', True, True)):
        p0 = np.concatenate([cam, [1.0, 1.0]])
        r = least_squares(lambda p: res(p, df, sf), p0, loss='soft_l1', f_scale=2.0, x_scale='jac')
        rr = res(r.x, df, sf)
        print(f'{name} {label:24s} rms {math.sqrt((rr ** 2).mean()):5.2f}  max {abs(rr).max():5.1f}  depth {18 * (r.x[6] if df else 1):6.2f}  stretch {r.x[7] if sf else 1:6.3f}')
