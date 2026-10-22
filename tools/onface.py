"""Where image columns fall along a face, with a calibrated camera (tools/calib.py --free).
   tools/py tools/onface.py NAME FACE u1,u2,... [--depth D]   FACE: S, N, E, W
Prints the distance of each column's point from the face's left end (seen from outside)."""
import json
import math
import sys

sys.path.insert(0, 'tools')
import calib as C  # noqa: E402

name, face = sys.argv[1], sys.argv[2]
us = [float(v) for v in sys.argv[3].split(',')]
data = json.load(open('tools/calib.json'))
cam, hz, r, _ = C.solve(data[name], free=True)
D = hz['depth']
if '--depth' in sys.argv:
    D = float(sys.argv[sys.argv.index('--depth') + 1])
h = D / 2
F = {'S': [-17, -h, 17, -h], 'N': [17, h, -17, h], 'E': [17, -h, 17, h], 'W': [-17, h, -17, -h]}[face]
W = data[name]['size'][0]
L = math.hypot(F[2] - F[0], F[3] - F[1])
print(f'{name} face {face} (depth {D:.2f}): ', end='')
out = []
for u in us:
    x, y = C.on_face(cam, F, u, W)
    out.append(f'{u:.0f}->{math.hypot(x - F[0], y - F[1]):.2f}')
print(', '.join(out))
