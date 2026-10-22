"""Reading the typical floor sheet (materials/pdf/eskiz.pdf, an AutoCAD export): every path in plan
metres. The sheet is stored rotated (page rotation 270); the drawing's own coordinates are used.

Plan frame (the house's, blender/hoji/building.py): x east, y north, the centre of the axis grid at
the origin. The sheet's top is the back (the stair and its open loggia) and its left the EAST end:
the renders (cameras in tools/cams.json) put the stair hall's recess 15.2 m from the east end, the
sheet 15.3 m from its left edge - the sheet is drawn mirrored to the renders, and the model follows
the renders.
"""
import os

import pymupdf as fitz

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
PDF = os.path.join(ROOT, 'materials', 'pdf', 'eskiz.pdf')

# axes on the sheet (drawing coordinates, pt): the column centres
AX_LONG = (209.88, 1075.68)     # axes 1 and 6 (drawing y): 33.6 m apart
AX_SHORT = (247.56, 701.10)     # axes А and Г (drawing x): 17.6 m apart
K = (AX_LONG[1] - AX_LONG[0]) / 33.6          # pt per metre (25.768)
YC = (AX_LONG[0] + AX_LONG[1]) / 2
XC = (AX_SHORT[0] + AX_SHORT[1]) / 2


def to_plan(px, py):
    """drawing point (pt) -> plan (m)"""
    return ((YC - py) / K, (px - XC) / K)


def colour(c):
    return tuple(round(v, 3) for v in c) if c else None


def paths():
    """every path: dict(kind 'f'/'s'/'fs', fill, stroke, width, segs [[(x, y), ...] polylines in
    plan metres], closed polygons [[...]] for filled paths)"""
    page = fitz.open(PDF)[0]
    out = []
    for g in page.get_drawings():
        segs, poly = [], []
        cur = []
        for it in g['items']:
            if it[0] == 'l':
                a, b = to_plan(it[1].x, it[1].y), to_plan(it[2].x, it[2].y)
                segs.append([a, b])
                if not cur:
                    cur.append(a)
                cur.append(b)
            elif it[0] == 'c':
                pts = [to_plan(q.x, q.y) for q in it[1:5]]
                # sample the bezier
                bz = []
                for k in range(9):
                    t = k / 8
                    mt = 1 - t
                    x = mt ** 3 * pts[0][0] + 3 * mt * mt * t * pts[1][0] + 3 * mt * t * t * pts[2][0] + t ** 3 * pts[3][0]
                    y = mt ** 3 * pts[0][1] + 3 * mt * mt * t * pts[1][1] + 3 * mt * t * t * pts[2][1] + t ** 3 * pts[3][1]
                    bz.append((x, y))
                segs.append(bz)
                if not cur:
                    cur.append(bz[0])
                cur.extend(bz[1:])
            elif it[0] == 're':
                r = it[1]
                q = [to_plan(r.x0, r.y0), to_plan(r.x1, r.y0), to_plan(r.x1, r.y1), to_plan(r.x0, r.y1)]
                segs.append(q + [q[0]])
                poly.append(q)
            elif it[0] == 'qu':
                q = it[1]
                pts = [to_plan(q.ul.x, q.ul.y), to_plan(q.ur.x, q.ur.y), to_plan(q.lr.x, q.lr.y), to_plan(q.ll.x, q.ll.y)]
                segs.append(pts + [pts[0]])
                poly.append(pts)
        if cur and len(cur) > 2:
            poly.append(cur)
        out.append(dict(kind=g['type'], fill=colour(g.get('fill')), stroke=colour(g.get('color')),
                        width=round(g.get('width') or 0, 2), segs=segs, polys=poly, closePath=g.get('closePath')))
    return out


def words():
    """the lettering: (x, y, text) in plan metres (the centre of each word), with the line it is on"""
    page = fitz.open(PDF)[0]
    out = []
    for x0, y0, x1, y1, t, b, l, w in page.get_text('words'):
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        px, py = to_plan(cx, cy)
        out.append(dict(x=px, y=py, text=t, block=b, line=l, h=abs(x1 - x0) / K))
    return out
