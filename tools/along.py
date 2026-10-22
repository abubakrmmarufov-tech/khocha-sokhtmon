"""Where image columns fall along a plan line, with a camera from tools/cams.json.
   tools/py tools/along.py CAM x0,y0,x1,y1 u1,u2,...   -> distance from (x0, y0) for each column"""
import json
import math
import sys

C = json.load(open('tools/cams.json'))
name = sys.argv[1]
x0, y0, x1, y1 = [float(v) for v in sys.argv[2].split(',')]
us = [float(v) for v in sys.argv[3].split(',')]
W = C[name]['size'][0]
cx, cy, yaw, f, v0, cz = C[name]['cam']
a = math.radians(yaw)
s, c = math.sin(a), math.cos(a)
ax, ay = x0 - cx, y0 - cy
bx, by = x1 - x0, y1 - y0
L = math.hypot(bx, by)
a0, a1 = ax * c - ay * s, bx * c - by * s
b0, b1 = ax * s + ay * c, bx * s + by * c
out = []
for u in us:
    q = u - W / 2
    t = (q * b0 - f * a0) / (f * a1 - q * b1)
    out.append(f'{u:.0f}->{t * L:.2f}')
print(name, ', '.join(out))
