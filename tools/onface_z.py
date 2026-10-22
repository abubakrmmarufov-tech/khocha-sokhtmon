"""Plan position along a face and height of image points, with a camera from tools/cams.json.
   tools/py tools/onface_z.py CAM FACE u,v [u,v ...]     FACE: S N E W (facade lines of the 34 x 18 house)"""
import json
import math
import sys

sys.path.insert(0, 'tools')
import calib as Cb  # noqa: E402

C = json.load(open('tools/cams.json'))
name, face = sys.argv[1], sys.argv[2]
cam = C[name]['cam']
W = C[name]['size'][0]
cx, cy, yaw, f, v0, cz = cam
camr = (cx, cy, cz, math.radians(yaw), f, v0)
Fc = {'S': [-17, -9, 17, -9], 'N': [17, 9, -17, 9], 'E': [17, -9, 17, 9], 'W': [-17, 9, -17, -9]}[face]
L = math.hypot(Fc[2] - Fc[0], Fc[3] - Fc[1])
for uv in sys.argv[3:]:
    u, v = (float(t) for t in uv.split(','))
    x, y = Cb.on_face(camr, Fc, u, W)
    s, c = math.sin(math.radians(yaw)), math.cos(math.radians(yaw))
    zc = (x - cx) * s + (y - cy) * c
    z = cz + (v0 - v) * zc / f
    t = math.hypot(x - Fc[0], y - Fc[1])
    print(f'u {u:6.0f} v {v:6.0f} -> along {t:6.2f} m (x {x:6.2f}, y {y:6.2f}), z {z:6.2f}')
