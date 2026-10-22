import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from sheet import paths
from shapely.geometry import LineString, Polygon, box
from shapely.ops import polygonize, unary_union
from PIL import Image, ImageDraw

P = paths()
lines = []
for g in P:
    if g['stroke'] == (0.0, 0.0, 0.0) and g['width'] == 0.84:
        for s in g['segs']:
            if len(s) >= 2:
                lines.append(LineString(s))
# drop the sheet frame (the big rectangle) and lines far outside the plan
lines = [l for l in lines if l.length < 40 and abs(l.centroid.x) < 18 and abs(l.centroid.y) < 12]
noded = unary_union(lines)
faces = list(polygonize(noded))
print('lines', len(lines), 'faces', len(faces))
# room fills
fills = []
for g in P:
    if g['kind'] == 'fs' and g['fill'] not in ((0.0, 0.0, 0.0), (0.0, 0.42, 0.42)):
        segs = g['segs']
        for k in range(0, len(segs) - 2, 3):
            tri = [segs[k][0], segs[k + 1][0], segs[k + 2][0]]
            p = Polygon(tri)
            if p.area > 1e-6:
                fills.append(p)
F = unary_union(fills)
S = 40.0
X0, Y1 = -19.0, 13.0
im = Image.new('RGB', (1520, 1040), 'white')
dr = ImageDraw.Draw(im)
Pt = lambda x, y: ((x - X0) * S, (Y1 - y) * S)
for f in faces:
    cov = f.intersection(F).area / f.area if f.area > 0 else 0
    mrr = f.minimum_rotated_rectangle
    c = list(mrr.exterior.coords)
    import math
    w = min(math.dist(c[0], c[1]), math.dist(c[1], c[2]))
    col = (0, 0, 0) if cov < 0.2 and w < 0.6 else (200, 200, 255) if cov > 0.5 else (255, 160, 0)
    dr.polygon([Pt(*p) for p in f.exterior.coords], fill=col, outline=(120, 120, 120))
im.save(os.path.join(os.path.dirname(__file__), '..', '..', 'build', 'plan', 'walls_test.png'))
