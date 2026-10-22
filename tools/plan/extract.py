"""The typical floor (floors 3-10) from the architect's sheet (materials/pdf/eskiz.pdf) -> walls,
windows, rooms, flats, doors, bathroom fittings, the stair, the lift and the corridors.

    tools/py tools/plan/extract.py        # -> blender/hoji/plan.json, src/model/plans.json, build/plan/extract.png

What the sheet gives (an AutoCAD export with real text):
  - the rooms: fills in one colour per flat, split into triangles (rejoined here);
  - the names and areas of the rooms, the flats' labels ("2-х ком. кв. 65.90") in blue frames;
  - the walls: drawn as double lines (black, 0.84); columns and the lift shaft in orange;
  - the windows: four blue lines across the gap in the outer wall;
  - the doors: an arc (the swing) and the leaf; bathtubs and WCs (black, 0.48), basins (0.36);
  - the corridors and the stair hall: a grey cross hatch; the stair's flights (0.24).
How: every line is drawn into a 1 cm raster (the doorways closed by the door leaves, the windows by
their lines); what the outside cannot reach is the floor; its open cells are the rooms, the
corridors, the stair, the lift; the rest is wall. Coordinates: plan metres (sheet.py).
"""
import json
import math
import os
import re
import sys
from collections import defaultdict

import cv2
import numpy as np
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

sys.path.insert(0, os.path.dirname(__file__))
from sheet import paths, words  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
R = 100.0                                   # raster: px per metre
X0, X1, Y0, Y1 = -17.8, 17.8, -11.8, 11.8
WPX, HPX = int((X1 - X0) * R), int((Y1 - Y0) * R)

BLACK, BLUE, ORANGE, GREY = (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), (0.867, 0.216, 0.0), (0.596, 0.596, 0.596)
NOT_ROOM = {(0.0, 0.0, 0.0), (0.0, 0.42, 0.42)}

# room names on the sheet -> (key for the viewer's dictionaries, kind)
NAMES = {
    'Гостевая': ('Guest room', 'living'),
    'Общая комната': ('Common room', 'living'),
    'Спальня': ('Bedroom', 'bedroom'),
    'Кухня': ('Kitchen', 'kitchen'),
    'Прихожая': ('Hall', 'hall'),
    'С/у': ('WC', 'wc'),
    'М.К.': ('AC niche', 'loggia'),
}
RU = {'Guest room': 'Гостевая', 'Common room': 'Общая комната', 'Bedroom': 'Спальня', 'Kitchen': 'Кухня', 'Hall': 'Прихожая',
      'WC': 'Санузел', 'Bathroom': 'Ванная', 'AC niche': 'Место для кондиционера'}
TJ = {'Guest room': 'Меҳмонхона', 'Common room': 'Ҳуҷраи умумӣ', 'Bedroom': 'Хонаи хоб', 'Kitchen': 'Ошхона', 'Hall': 'Даҳлез',
      'WC': 'Ҳоҷатхона', 'Bathroom': 'Ҳаммом', 'AC niche': 'Ҷои кондитсионер'}


def px(x, y):
    return ((x - X0) * R, (Y1 - y) * R)


def parts(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    return [q for q in getattr(g, 'geoms', []) if q.geom_type == 'Polygon']


def ring(poly, nd=3):
    c = list(poly.exterior.coords)[:-1]
    if not Polygon(c).exterior.is_ccw:
        c = c[::-1]
    return [[round(x, nd), round(y, nd)] for x, y in c]


def mask_polys(mask, simplify=0.006):
    """polygons (shapely) of a binary raster mask, holes kept"""
    cnts, hier = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    if hier is None:
        return out
    hier = hier[0]
    for i, c in enumerate(cnts):
        if hier[i][3] != -1 or len(c) < 3:
            continue
        shell = [(p[0][0] / R + X0, Y1 - p[0][1] / R) for p in c]
        holes = []
        j = hier[i][2]
        while j != -1:
            h = cnts[j]
            if len(h) >= 3:
                holes.append([(p[0][0] / R + X0, Y1 - p[0][1] / R) for p in h])
            j = hier[j][0]
        try:
            poly = Polygon(shell, holes).buffer(0)
        except Exception:
            continue
        # pixel boundaries run through pixel centres: grow by half a pixel
        poly = poly.buffer(0.5 / R, join_style='mitre').simplify(simplify, preserve_topology=True)
        out += parts(poly)
    return out


def axis_snap(p, tol=0.012):
    """snap nearly axis-parallel edges of a polygon to the axes (cleaner walls)"""
    c = list(p.exterior.coords)[:-1]
    n = len(c)
    out = [list(q) for q in c]
    for i in range(n):
        a, b = out[i], out[(i + 1) % n]
        if abs(a[0] - b[0]) < tol:
            m = (a[0] + b[0]) / 2
            a[0] = b[0] = m
        elif abs(a[1] - b[1]) < tol:
            m = (a[1] + b[1]) / 2
            a[1] = b[1] = m
    try:
        q = Polygon(out).buffer(0)
        return q if q.area > 0 else p
    except Exception:
        return p


# ----------------------------------------------------------------------------

def read():
    P = paths()
    W = words()
    # --- room fills: triangles per colour
    fills = defaultdict(list)
    for g in P:
        if g['kind'] == 'fs' and g['fill'] and g['fill'] not in NOT_ROOM:
            s = g['segs']
            for k in range(0, len(s) - 2, 3):
                t = Polygon([s[k][0], s[k + 1][0], s[k + 2][0]])
                if t.area > 1e-5:
                    fills[g['fill']].append(t)
    fill_geom = {c: unary_union([t.buffer(0.003, join_style='mitre') for t in ts]).buffer(-0.003, join_style='mitre')
                 for c, ts in fills.items()}
    lines = lambda col, w=None: [s for g in P if g['stroke'] == col and (w is None or g['width'] == w) and not g['fill'] for s in g['segs']]
    return P, W, fill_geom, lines


def door_arcs(P, room_union):
    """door swings: arcs (sampled beziers) of radius 0.55-1.05 m in the black 0.36 strokes.
    -> [dict(c=hinge, e=closed end (other jamb), tip=open end, mid=arc middle)]"""
    out = []
    for g in P:
        if g['stroke'] != BLACK or g['width'] != 0.36:
            continue
        for s in g['segs']:
            if len(s) < 9:
                continue
            pts = np.array(s)
            x, y = pts[:, 0], pts[:, 1]
            sol = np.linalg.lstsq(np.c_[2 * x, 2 * y, np.ones(len(pts))], x * x + y * y, rcond=None)[0]
            cx, cy = sol[0], sol[1]
            r = math.sqrt(max(sol[2] + cx * cx + cy * cy, 0.0))
            if not 0.45 <= r <= 1.1 or np.abs(np.hypot(x - cx, y - cy) - r).max() > 0.02:
                continue
            a, b = tuple(s[0]), tuple(s[-1])
            # the closed end: the one whose way to the hinge runs through the doorway (unfilled)
            ma = Point((a[0] + cx) / 2, (a[1] + cy) / 2)
            mb = Point((b[0] + cx) / 2, (b[1] + cy) / 2)
            ina, inb = room_union.contains(ma), room_union.contains(mb)
            if ina == inb:
                # both or neither: the end nearer an axis direction from the hinge is the closed one
                da = min(abs(a[0] - cx), abs(a[1] - cy))
                db = min(abs(b[0] - cx), abs(b[1] - cy))
                e, tip = (a, b) if da < db else (b, a)
            else:
                e, tip = (a, b) if not ina else (b, a)
            m = s[len(s) // 2]
            out.append(dict(c=(cx, cy), r=r, e=e, tip=tip, mid=tuple(m)))
    # a door drawn as one arc of two beziers: keep one per hinge
    keep = []
    for d in out:
        if any(math.dist(d['c'], k['c']) < 0.05 and math.dist(d['e'], k['e']) < 0.1 for k in keep):
            continue
        keep.append(d)
    return keep


def extract():
    P, W, fill_geom, lines = read()
    apt_colours = sorted([c for c, g in fill_geom.items() if g.area > 20.0])
    room_union = unary_union([fill_geom[c] for c in apt_colours])

    # --- the raster: walls, columns, shafts, windows, door leaves
    img = np.zeros((HPX, WPX), np.uint8)

    def draw(seglist, width=3):
        for s in seglist:
            q = np.array([px(*p) for p in s], np.int32)
            cv2.polylines(img, [q], False, 1, width)
    draw(lines(BLACK, 0.84))
    draw(lines(ORANGE))
    draw(lines(BLUE, 0.36))
    arcs = door_arcs(P, room_union)
    for d in arcs:
        draw([[d['c'], d['e']]], 3)
    # the sheet's frame and the dimension lines lie outside the floor: drop what is far out
    img[:, :int(0.15 * R)] = 0
    # flood the outside
    ff = img.copy()
    mask = np.zeros((HPX + 2, WPX + 2), np.uint8)
    cv2.floodFill(ff, mask, (2, 2), 2)
    outside = ff == 2
    floor_mask = ~outside
    # open cells (not lines) inside the floor -> components
    open_cells = (img == 0) & floor_mask
    n, lab, stats, cent = cv2.connectedComponentsWithStats(open_cells.astype(np.uint8), 4)

    # what each component is: a room (its fill covers it), a common space (large, no fill), or wall
    rmask = np.zeros((HPX, WPX), np.uint8)
    for c in apt_colours:
        for q in parts(fill_geom[c]):
            cv2.fillPoly(rmask, [np.array([px(*p) for p in q.exterior.coords], np.int32)], 1)
    space = np.zeros((HPX, WPX), bool)
    common_ids = []
    for i in range(1, n):
        area = stats[i, cv2.CC_STAT_AREA] / R / R
        comp = lab == i
        cover = rmask[comp].mean() if area > 0 else 0
        # thickness: the largest distance to the component's edge
        if area >= 0.25:
            sub = comp[stats[i, 1]:stats[i, 1] + stats[i, 3], stats[i, 0]:stats[i, 0] + stats[i, 2]].astype(np.uint8)
            dist = cv2.distanceTransform(np.pad(sub, 1), cv2.DIST_L2, 3).max() / R
        else:
            dist = 0.0
        if cover > 0.5 or dist > 0.33:
            space |= comp
            if cover <= 0.5:
                common_ids.append(i)
    # door leaves drawn across a doorway are no wall: the doorway joins the rooms either side
    leaves = np.zeros((HPX, WPX), np.uint8)
    draw_leaf = lambda a, b: cv2.line(leaves, tuple(int(v) for v in px(*a)), tuple(int(v) for v in px(*b)), 1, 5)
    for d in arcs:
        draw_leaf(d['c'], d['e'])
    wall = floor_mask & ~space & ~(leaves.astype(bool) & ~(img.astype(bool) & ~leaves.astype(bool)))
    # opening: drop the door leaf strokes and slivers under 4 cm
    k = np.ones((5, 5), np.uint8)
    wall = cv2.morphologyEx(wall.astype(np.uint8), cv2.MORPH_OPEN, k).astype(bool)
    walls = [axis_snap(p) for p in mask_polys(wall) if p.area > 0.01]
    walls_u = unary_union(walls)
    floor = unary_union(mask_polys(floor_mask, 0.004))
    floor = max(parts(floor), key=lambda q: q.area)

    # --- common spaces: the open components that are not rooms
    common = []
    for i in common_ids:
        comp = (lab == i).astype(np.uint8)
        common += [p for p in mask_polys(comp) if p.area > 0.5]

    # --- windows: groups of blue lines across the outer wall
    wl = []
    for s in lines(BLUE, 0.36):
        (xa, ya), (xb, yb) = s[0], s[-1]
        wl.append((min(xa, xb), max(xa, xb), min(ya, yb), max(ya, yb)))
    windows = []
    used = [False] * len(wl)
    for i, a in enumerate(wl):
        if used[i]:
            continue
        horiz = (a[1] - a[0]) > (a[3] - a[2])
        grp = [a]
        for j in range(i + 1, len(wl)):
            b = wl[j]
            if used[j]:
                continue
            if horiz and abs(b[0] - a[0]) < 0.02 and abs(b[1] - a[1]) < 0.02 and abs(b[2] - a[2]) < 0.4 and (b[1] - b[0]) > 0.3:
                grp.append(b)
                used[j] = True
            elif not horiz and abs(b[2] - a[2]) < 0.02 and abs(b[3] - a[3]) < 0.02 and abs(b[0] - a[0]) < 0.4 and (b[3] - b[2]) > 0.3:
                grp.append(b)
                used[j] = True
        used[i] = True
        if len(grp) < 3:
            continue
        x0, x1 = min(g[0] for g in grp), max(g[1] for g in grp)
        y0, y1 = min(g[2] for g in grp), max(g[3] for g in grp)
        windows.append(box(x0, y0, x1, y1))
    # the window cells are no walls
    if windows:
        walls_u = walls_u.difference(unary_union([w.buffer(0.004) for w in windows]))
        walls = [axis_snap(q) for q in parts(walls_u) if q.area > 0.01]

    # --- the lettering
    def is_area(t):
        return re.fullmatch(r'\d+\.\d+(м²|м2)?', t) is not None
    frames = []
    for g in P:
        if g['stroke'] == BLUE and g['width'] == 0.84:
            pts = [p for s in g['segs'] for p in s]
            if len(pts) >= 4:
                xs, ys = [p[0] for p in pts], [p[1] for p in pts]
                if max(xs) - min(xs) > 0.8 and max(ys) - min(ys) > 0.4:
                    frames.append(box(min(xs), min(ys), max(xs), max(ys)))
    frames = parts(unary_union([f.buffer(0.02) for f in frames]))
    in_frame = lambda w: any(f.contains(Point(w['x'], w['y'])) for f in frames)
    labels = []
    for f in frames:
        ws = [w for w in W if f.contains(Point(w['x'], w['y']))]
        kind = next((w['text'] for w in ws if re.match(r'\d-', w['text'])), '')
        area = next((float(w['text']) for w in ws if re.fullmatch(r'\d+\.\d+', w['text'])), None)
        rooms_n = int(kind[0]) if kind[:1].isdigit() else None
        labels.append(dict(frame=f, rooms=rooms_n, area=area, at=f.centroid))

    # --- rooms of each flat
    flats = []
    for c in apt_colours:
        rooms = []
        for q in parts(fill_geom[c]):
            q = axis_snap(q.buffer(-0.002, join_style='mitre').buffer(0.002, join_style='mitre'))
            if q.area < 0.5:
                continue
            ws = [w for w in W if q.buffer(0.05).contains(Point(w['x'], w['y'])) and not in_frame(w)]
            txt = ' '.join(w['text'] for w in sorted(ws, key=lambda w: (-round(w['y'], 1), w['x'])) if not is_area(w['text']))
            area = next((float(re.match(r'\d+\.\d+', w['text']).group()) for w in ws if is_area(w['text'])), None)
            name = next((k for k in sorted(NAMES, key=len, reverse=True) if k in txt), None)
            rooms.append(dict(poly=q, sheet_name=name, text=txt, sheet_area=area))
        lab = next((l for l in labels if any(r['poly'].buffer(0.05).contains(l['at']) for r in rooms)), None)
        flats.append(dict(colour=c, rooms=rooms, label=lab))

    # --- fittings: bathtubs and WCs (black 0.48), basins (the small 0.36 shapes in the bathrooms)
    blobs = parts(unary_union([LineString(s).buffer(0.02) for s in lines(BLACK, 0.48) if len(s) >= 2]))
    fittings = []
    for b in blobs:
        r = b.minimum_rotated_rectangle
        cs = list(r.exterior.coords)
        e = sorted([math.dist(cs[0], cs[1]), math.dist(cs[1], cs[2])])
        if e[1] > 1.2 and e[0] >= 0.5:      # (a lone 0.48 line along a bath is not one)
            fittings.append(dict(type='bath', poly=b.envelope))
        elif 0.45 <= e[1] <= 0.9 and e[0] >= 0.3:
            fittings.append(dict(type='toilet', poly=b.envelope))
    small36 = []
    for g in P:
        if g['stroke'] == BLACK and g['width'] == 0.36:
            for s in g['segs']:
                if len(s) >= 2:
                    small36.append(LineString(s))
    bath_rooms = unary_union([r['poly'] for f in flats for r in f['rooms'] if r['sheet_name'] in ('С/у',)])
    for b in parts(unary_union([q.buffer(0.02) for q in small36 if q.length < 0.6 and bath_rooms.buffer(0.05).contains(q.centroid)])):
        x0, y0, x1, y1 = b.bounds
        if 0.25 <= max(x1 - x0, y1 - y0) <= 0.75 and min(x1 - x0, y1 - y0) >= 0.2:
            if not any(f['poly'].intersects(b) for f in fittings):
                fittings.append(dict(type='basin', poly=b.envelope))

    # --- lift: the magenta car outline
    mag = [LineString(s) for g in P if g['stroke'] == (1.0, 0.0, 1.0) for s in g['segs'] if len(s) >= 2]
    lift = unary_union(mag).envelope if mag else None
    # --- stair flights: the 0.24 treads
    treads = [LineString(s) for s in lines(BLACK, 0.24) if len(s) >= 2]
    return dict(walls=walls, floor=floor, common=common, windows=windows, flats=flats, labels=labels, arcs=arcs,
                fittings=fittings, lift=lift, treads=treads, words=W, frames=frames)


# ----------------------------------------------------------------------------

def facing_of(poly, walls_u):
    """the side of a fitting against a wall: (centre, w along the wall, d out of it, f the way its
    front faces)"""
    x0, y0, x1, y1 = poly.bounds
    c = ((x0 + x1) / 2, (y0 + y1) / 2)
    sides = {
        0.0: (x0 - 0.06, c[1]),                 # front faces +x: the wall is on the -x side
        math.pi: (x1 + 0.06, c[1]),
        math.pi / 2: (c[0], y0 - 0.06),
        -math.pi / 2: (c[0], y1 + 0.06),
    }
    best = min(sides, key=lambda a: walls_u.distance(Point(*sides[a])))
    along_x = abs(math.sin(best)) > 0.5      # facing ±y: the width runs along x
    w = (x1 - x0) if along_x else (y1 - y0)
    d = (y1 - y0) if along_x else (x1 - x0)
    return c, w, d, best


def build(x):
    walls_u = unary_union(x['walls'])
    flats_out = []
    for f in x['flats']:
        rooms = []
        for r in f['rooms']:
            nm = r['sheet_name']
            key, kind = NAMES.get(nm, ('Hall', 'hall'))
            fits = [ft for ft in x['fittings'] if r['poly'].buffer(0.03).contains(ft['poly'].centroid)]
            if nm == 'С/у':
                key, kind = ('Bathroom', 'bath') if any(ft['type'] == 'bath' for ft in fits) else ('WC', 'wc')
            rooms.append(dict(name=key, ru=RU[key], tj=TJ[key], kind=kind, area=r['sheet_area'] or round(r['poly'].area, 2),
                              poly=ring(r['poly']), _poly=r['poly'], fits=fits))
        furniture = []
        for rm in rooms:
            for ft in rm['fits']:
                c, w, d, a = facing_of(ft['poly'], walls_u)
                if ft['type'] == 'bath':
                    furniture.append(dict(type='bath', c=[round(c[0], 3), round(c[1], 3)], w=round(w, 3), d=round(d, 3), f=round(a, 4), tap=1))
                elif ft['type'] == 'toilet':
                    furniture.append(dict(type='toilet', c=[round(c[0], 3), round(c[1], 3)], w=round(min(w, 0.42), 3), d=round(max(d, 0.6), 3), f=round(a, 4)))
                else:
                    furniture.append(dict(type='basin', c=[round(c[0], 3), round(c[1], 3)], w=round(max(w, 0.5), 3), d=round(max(d, 0.42), 3), f=round(a, 4)))
        geoms = [r['_poly'] for r in rooms]
        body = unary_union([g.buffer(0.16, join_style='mitre') for g in geoms]).buffer(-0.06, join_style='mitre')
        body = body.intersection(x['floor'])
        body = max(parts(body), key=lambda q: q.area)
        lab = f['label'] or {}
        flats_out.append(dict(colour='#%02x%02x%02x' % tuple(int(v * 255) for v in f['colour']),
                              rooms_count=lab.get('rooms') or sum(r['kind'] in ('living', 'bedroom') for r in rooms),
                              label_rooms=lab.get('rooms'), area=lab.get('area') or round(sum(r['area'] for r in rooms), 2),
                              outline=ring(body), rooms=[{k: v for k, v in r.items() if not k.startswith('_') and k != 'fits'} for r in rooms],
                              balconies=[], furniture=furniture, _body=body))
    # flats must not overlap: trim each by the ones before
    taken = Polygon()
    for fl in flats_out:
        b = fl['_body'].difference(taken)
        b = max(parts(b), key=lambda q: q.area)
        fl['outline'] = ring(b)
        taken = taken.union(fl['_body'])
    # order: the back row west to east, then the front row west to east
    def key(fl):
        b = fl['_body'].centroid
        return (0 if b.y > 0 else 1, b.x)
    flats_out.sort(key=key)
    swings = []
    for d in x['arcs']:
        cx, cy = d['c']
        ex, ey = d['e']
        mx, my = (cx + ex) / 2, (cy + ey) / 2
        L = math.dist((cx, cy), (ex, ey)) or 1
        nx, ny = -(ey - cy) / L, (ex - cx) / L
        side = (d['mid'][0] - mx) * nx + (d['mid'][1] - my) * ny
        s = 0.5 if side > 0 else -0.5
        swings.append([round(mx, 3), round(my, 3), round(mx + nx * s, 3), round(my + ny * s, 3)])
    lifts = []
    if x['lift'] is not None:
        b = x['lift'].bounds
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        # the doors open onto the corridor (north of the car on the sheet's floor)
        lifts.append(dict(c=[round(cx, 3), round(cy, 3)], w=round(b[2] - b[0], 3), d=round(b[3] - b[1], 3), f=round(math.pi / 2, 4), q=1000))
    floor = x['floor']
    plan = dict(title='Типовой этаж (3–10)', slab=ring(floor), enclosure=ring(floor),
                walls=[ring(w) for w in x['walls'] if w.area > 0.01],
                struct=[], windows=[ring(w) for w in x['windows']], glazing=[],
                common=[ring(c) for c in x['common']],
                apartments=[{k: v for k, v in f.items() if not k.startswith('_')} for f in flats_out],
                lifts=lifts, swings=swings)
    return plan, flats_out


def draw_debug(x, plan, path):
    from PIL import Image, ImageDraw, ImageFont
    S = 40.0
    im = Image.new('RGB', (int((X1 - X0) * S), int((Y1 - Y0) * S)), 'white')
    dr = ImageDraw.Draw(im)
    P = lambda p: ((p[0] - X0) * S, (Y1 - p[1]) * S)
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 11)
    for c in plan['common']:
        dr.polygon([P(p) for p in c], fill=(225, 225, 225))
    for a in plan['apartments']:
        col = tuple(int(a['colour'][i:i + 2], 16) for i in (1, 3, 5))
        for r in a['rooms']:
            dr.polygon([P(p) for p in r['poly']], fill=col, outline=(120, 120, 120))
            cx = sum(p[0] for p in r['poly']) / len(r['poly'])
            cy = sum(p[1] for p in r['poly']) / len(r['poly'])
            dr.text(P((cx, cy)), f"{r['ru'][:10]}\n{r['area']}", fill=(0, 0, 0), font=font, anchor='mm')
        dr.line([P(p) for p in a['outline'] + [a['outline'][0]]], fill=(200, 0, 0), width=2)
        for it in a['furniture']:
            c = it['c']
            dr.ellipse([P((c[0] - 0.12, c[1] + 0.12)), P((c[0] + 0.12, c[1] - 0.12))], fill=(0, 120, 255))
            e = (c[0] + math.cos(it['f']) * 0.4, c[1] + math.sin(it['f']) * 0.4)
            dr.line([P(c), P(e)], fill=(0, 120, 255), width=2)
    for w in plan['walls']:
        dr.polygon([P(p) for p in w], fill=(30, 30, 30))
    for w in plan['windows']:
        dr.polygon([P(p) for p in w], fill=(60, 140, 255))
    for s in plan['swings']:
        dr.line([P(s[:2]), P(s[2:])], fill=(255, 0, 180), width=2)
    for lf in plan['lifts']:
        c = lf['c']
        dr.rectangle([P((c[0] - lf['w'] / 2, c[1] + lf['d'] / 2)), P((c[0] + lf['w'] / 2, c[1] - lf['d'] / 2))], outline=(255, 0, 255), width=2)
    dr.line([P(p) for p in plan['enclosure'] + [plan['enclosure'][0]]], fill=(0, 160, 0), width=1)
    for m in range(-17, 18):
        dr.text(P((m, Y1 - 0.2)), str(m), fill=(0, 0, 255), font=font, anchor='mm')
    for m in range(-11, 12):
        dr.text(P((X0 + 0.2, m)), str(m), fill=(0, 0, 255), font=font, anchor='mm')
    im.save(path)


def main():
    x = extract()
    plan, flats = build(x)
    os.makedirs(os.path.join(ROOT, 'build', 'plan'), exist_ok=True)
    draw_debug(x, plan, os.path.join(ROOT, 'build', 'plan', 'extract.png'))
    with open(os.path.join(ROOT, 'blender', 'hoji', 'plan.json'), 'w') as f:
        json.dump(plan, f, ensure_ascii=False)
    total = 0
    for i, a in enumerate(plan['apartments']):
        rs = sum(r['area'] for r in a['rooms'])
        total += a['area']
        names = ', '.join(f"{r['ru']} {r['area']}" for r in a['rooms'])
        print(f"flat {i + 1}: {a['rooms_count']}-room {a['area']} m2 (rooms add up to {rs:.2f}); {names}; fittings {len(a['furniture'])}")
    print('walls', len(plan['walls']), 'windows', len(plan['windows']), 'common', len(plan['common']), 'swings', len(plan['swings']),
          'lifts', len(plan['lifts']), 'total', round(total, 2))
    b = Polygon(plan['enclosure']).bounds
    print('enclosure bounds', [round(v, 3) for v in b])


if __name__ == '__main__':
    main()
