"""The viewer's floor plans (src/model/plans.json) from the extracted plan (blender/hoji/plan.json).

    tools/py tools/plan/viewer_plans.py      (after tools/plan/extract.py; then blender/export.sh)

Adds to every flat `hl`: its own outline for highlighting it on the open floor - its rooms (the AC
niche too) and the drawn outline, the slots between them closed (walls up to 0.5 m thick), clear of
the other flats and the common areas; one ring, counter-clockwise."""
import json

from shapely.geometry import Polygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

plan = json.load(open('blender/hoji/plan.json'))
flats = plan['apartments']
outline = [Polygon(a['outline']).buffer(0) for a in flats]
rooms = [unary_union([Polygon(r['poly']).buffer(0) for r in a['rooms']]) for a in flats]
common = unary_union([Polygon(c).buffer(0) for c in plan['common']])
for i, a in enumerate(flats):
    own = unary_union([outline[i], rooms[i].buffer(0.1, join_style='mitre')])
    g = own.buffer(0.25, join_style='mitre').buffer(-0.25, join_style='mitre')
    others = unary_union([outline[j].union(rooms[j]) for j in range(len(flats)) if j != i] + [common])
    g = g.difference(others.buffer(0.02, join_style='mitre')).buffer(0)
    part = max(getattr(g, 'geoms', [g]), key=lambda p: p.area)
    part = orient(Polygon(part.exterior).simplify(0.01), 1.0)
    a['hl'] = [[round(x, 3), round(y, 3)] for x, y in list(part.exterior.coords)[:-1]]
    print(f'flat {i}: rooms {rooms[i].area:5.1f} m2, outline {outline[i].area:5.1f}, hl {part.area:5.1f} ({len(a["hl"])} points)')
json.dump({'typ': plan}, open('src/model/plans.json', 'w'), ensure_ascii=False, separators=(',', ':'))
# (the Blender build makes the flats' pick volumes from `hl` too)
json.dump(plan, open('blender/hoji/plan.json', 'w'), ensure_ascii=False, indent=1)
print('wrote src/model/plans.json, blender/hoji/plan.json')
