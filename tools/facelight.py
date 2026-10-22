"""How bright each face of the house is on the client's renders: points on blank wall (front risalits
between their windows, the ends' panel fields, the back between windows) projected with each
render's camera (tools/cams.json) and sampled (median of a small window).
   tools/py tools/facelight.py [names...] [--model]     (--model: the model shots build/cmp/NAME_model.png)"""
import json
import math
import sys

import numpy as np
from PIL import Image

C = json.load(open('tools/cams.json'))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
model = '--model' in sys.argv
POINTS = {
    'front W risalit': ((-10.0, -9.46, 20.2), (0, -1)),
    'front E risalit': ((10.0, -9.46, 20.2), (0, -1)),
    'end W': ((-17.0, 0.0, 20.0), (-1, 0)),
    'end E': ((17.0, 0.0, 20.0), (1, 0)),
    'back': ((10.5, 9.0, 20.2), (0, 1)),
    'back W': ((-10.4, 9.0, 20.2), (0, 1)),
}
for name in args or ['r8', 'r5', 'r1L', 'r2L', 'r3', 'r7L']:
    W, H = C[name]['size']
    cx, cy, yaw, f, v0, cz = C[name]['cam']
    a = math.radians(yaw)
    s, c = math.sin(a), math.cos(a)
    path = f'build/cmp/{name}_model.png' if model else f"materials/renders/{''.join(ch for ch in name if ch.isdigit())}.webp"
    im = np.asarray(Image.open(path).convert('RGB').resize((W, H))).astype(float)
    out = []
    for label, ((x, y, z), (nx, ny)) in POINTS.items():
        if (cx - x) * nx + (cy - y) * ny <= 0:
            continue                       # facing away
        dx, dy = x - cx, y - cy
        xc, zc = dx * c - dy * s, dx * s + dy * c
        u, v = W / 2 + f * xc / zc, v0 - f * (z - cz) / zc
        if not (5 <= u < W - 5 and 5 <= v < H - 5):
            continue
        p = im[int(v) - 3:int(v) + 4, int(u) - 3:int(u) + 4].reshape(-1, 3)
        m = np.median(p, axis=0).astype(int)
        out.append(f'{label}: {tuple(int(t) for t in m)}')
    print(f"{name:4s} {'model ' if model else 'render'}  " + '   '.join(out))
