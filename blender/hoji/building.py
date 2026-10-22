"""The house: two shop floors in marble and glass, eight floors of flats in white stone, terraces on
the corners of the top floor, an attic along the middle of the front, a stair house on the roof.

The outline is the architect's sketch, 34 x 21.5 m (tools/plan/extract.py reads it; the sheet is
drawn mirrored, the renders are followed). The rest is measured on the client's renders:
tools/calib.py finds each render's camera from the building's corners and window rows (the
sketch's outline fixes the depth); tools/rectify.py unwraps a facade into a flat elevation in
metres; tools/tri.py triangulates a point seen in two renders. What the renders showed:
  - the front has three blocks standing 0.5 m forward: the two risalits (two big windows a floor,
    a band under floor 9) and the middle between the two ornamental strips;
  - the back is flat but for the stair hall's recess between two strips (1.9 m deep) with a column
    of the stair's small windows standing in it (renders 3, 7), the stair house over it on the roof,
    a porch with the back door under it;
  - the ends are blank with a big framed panel, strips at both corners;
  - the top floor has a terrace on each corner (over the corner rooms of the flats below), its
    ends set back between them; balustrades with urns everywhere at the top.

Plan: x east, y north, the origin at the centre of the sketch's axes, the shop front facing south.
Heights z above the forecourt.
"""
import json
import math
import os

from shapely.geometry import LineString, Polygon, box as sbox
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

from . import facade as F
from .geom import MeshBuilder, make_object, rect_ring

# ---------- heights ----------
F1 = 1.75          # floor 1 (shops) = the terrace along the front
L2 = 5.70          # floor 2 (shops)
P = 9.60           # top of the marble podium, foot of the white facade
L3 = 9.35          # floor 3, the first floor of flats
ST = 3.25          # storey of the flats (fitted on renders 1, 2, 3, 5, 8 with the sketch's outline: 3.23-3.33 m)
FIRST, TOP = 3, 10
SLAB = 0.0
COURSE = ST / 5    # rustication: course height (five a storey)
RUST0 = P + 0.28   # ... and the height of one of its joints


def L(n):
    if n <= 1:
        return F1
    if n == 2:
        return L2
    return L3 + (n - 3) * ST


ROOF = L(TOP + 1)          # 35.35: top of floor 10
DECK = ROOF + 0.55         # the roof deck
TERR_C = (L(TOP) - 0.29, L(TOP) + 0.71)    # the corner terraces' cornice (from under floor 10 to the parapet top)
EDGE_C = (ROOF, ROOF + 0.95)   # the roof edge's cornice (back, ends, terrace walls)
RIS_TOP = ROOF + 0.4       # the risalits' face goes up to here, their cornice above
ATTIC = (ROOF, ROOF + 2.4)     # the attic's face
BLOCK_TOP = ROOF + 3.79    # the stair house's walls

# ---------- plan ----------
W = 34.0
X0, X1, Y0, Y1 = -W / 2, W / 2, -10.5, 11.0     # the sketch's facade lines
D = Y1 - Y0
OUT = 0.5                  # the front's forward blocks (the risalits and the middle) stand at y = -11
# the top floor's corner terraces: how far they reach along the long faces, and along the ends from
# the front and from the back (the corner rooms of the flats below: renders 1, 7, 8)
TERR_X = {'S': 3.45, 'N': 3.3}
TERR_Y = {'S': 6.55, 'N': 7.05}
SET = 0.5                  # the top floor's ends between the terraces stand back this much
SLOT_D = 0.12              # the ornamental strips' slots (render 8: the strip beside the middle block shows)
# the back's middle (renders 3 and 7, triangulated): the stair hall's recess; in it a column of the
# stair's small windows standing 0.8 m out of the recess's back wall
CORE_D = 1.9
STAIR_COL = (14.91, 15.59, 1.1)        # u0, u1, the depth of its face
# The podium is narrower than the floors over it, front and back: the ground floor's plan has its
# walls on the outer column lines (axes А and Г, 17.6 m apart) while the floors over it reach 1.7 m
# (2.2 m at the forward blocks) out at the front and 2.15 m at the back. The renders agree:
# triangulated on renders 3 and 7 at the back (its corners, the back door), on renders 1 and 2 at the
# front (its corners, the foot of the shop front). A marble band runs round the foot of the floors,
# a soffit under them. On the back wall two rows of windows, one over the other (render 3): small
# windows and narrow lights under the soffit.
POD_BACK = 8.85                        # plan y of the podium's back wall
POD_FRONT = -8.85                      # ... of its shop front (the glass; the piers stand out of it)
SOFFIT = P - 0.9                       # the overhang's underside (the foot of its band)
SHADE_Z = 6.5                          # the wall under it in its shade from here up (renders 3, 7)
BACK_WINS = (2.61, 5.61, 8.98, 11.63, 15.14, 18.38, 21.62, 24.58, 28.27, 31.34)   # centres, u from the east end
WIN_Z = (3.92, 4.72)                   # the small windows
SLIT_Z = (7.55, 8.0)                   # the narrow lights over them
WIN_W = 1.45
# the back door under the window over the stair hall's recess (render 7: a metal door up a white stoop)
DOOR = (14.52, 15.91, 0.87, 3.5)       # u0, u1, z0, z1

# window heights over their floor
BIG_Z = (0.24, 2.55)       # risalits (opening)
BIG_SUR = 0.2              # ... their stone surrounds
NAR_Z = (0.62, 2.47)       # framed columns: window
PAN_Z = (-0.6, 0.57)       # ... the ornamental panel under it (fills the gap to the window below)
COL_M = 0.1                # the framed columns: white frame either side of the window
BACK_Z = (0.42, 2.22)      # back windows
BACK_SUR = 0.12

FRAMES = {
    'S': ((X0, Y0), 0.0, W),
    'N': ((X1, Y1), math.pi, W),
    'E': ((X1, Y0), math.pi / 2, D),
    'W': ((X0, Y1), -math.pi / 2, D),
}


def Z(kind, u0, u1, out=0.0, **kw):
    return dict(kind=kind, u0=u0, u1=u1, out=out, **kw)


def mirror(zones, L_):
    right = []
    for z in reversed(zones):
        m = dict(z)
        m['u0'], m['u1'] = L_ - z['u1'], L_ - z['u0']
        if 'wins' in z:
            m['wins'] = [(L_ - b, L_ - a) for a, b in reversed(z['wins'])]
        right.append(m)
    if zones[-1]['kind'] == right[0]['kind'] and abs(zones[-1]['u1'] - right[0]['u0']) < 1e-6:
        mid = dict(zones[-1])
        mid['u1'] = right[0]['u1']
        return zones[:-1] + [mid] + right[1:]
    return zones + right


def wins(*cs, w=1.4):
    return [(c - w / 2, c + w / 2) for c in cs]


# (render 8 unwrapped: windows 1.37 m wide in the framed columns at 2.24, 11.59, 15.37 m; the risalits'
# windows 1.57 m wide; the strips 12.71-13.46 m)
SOUTH = mirror([
    Z('rustic', 0.00, 1.45, corner=True),
    Z('column', 1.45, 3.02, corner=True),
    Z('wall', 3.02, 3.45),
    Z('risalit', 3.45, 10.60, OUT, wins=[(4.75, 6.32), (7.73, 9.30)]),
    Z('wall', 10.60, 10.80),
    Z('column', 10.80, 12.37),
    Z('wall', 12.37, 12.71),
    Z('slot', 12.71, 13.46),
    Z('rustic', 13.46, 14.58, OUT),
    Z('column', 14.58, 16.15, OUT),
    Z('rustic', 16.15, 17.00, OUT),
], W)

# the back: the sketch's windows (the renders show them all 1.4 m wide); the strips and the stair
# hall's recess triangulated on renders 3 and 7
NORTH = [
    Z('rustic', 0.00, 1.43, corner=True),
    Z('column', 1.43, 3.00, corner=True),
    Z('wall', 3.00, 12.95, wins=wins(5.27, 8.73, 11.50)),
    Z('slot', 12.95, 13.80, screen='Lattice light'),
    Z('wall', 13.80, 13.935),
    Z('core', 13.935, 16.535),
    Z('wall', 16.535, 16.65),
    Z('slot', 16.65, 17.45, screen='Lattice light'),
    Z('wall', 17.45, 31.00, wins=wins(18.95, 21.85, 24.85, 28.73)),
    Z('column', 31.00, 32.57, corner=True),
    Z('rustic', 32.57, 34.00, corner=True),
]

# the ends, from the front (E) / from the back (W): strips at both corners (the corner flats' AC
# niches behind them), the big framed panel between
END_E = [
    Z('wall', 0.00, 0.10, corner=True),
    Z('slot', 0.10, 1.40, corner=True, bar=True, screen='Lattice grey'),
    Z('panelwall', 1.40, 19.85),
    Z('slot', 19.85, 21.40, corner=True, bar=True, screen='Lattice grey'),
    Z('wall', 21.40, D, corner=True),
]
END_W = [dict(z, u0=D - z['u1'], u1=D - z['u0']) for z in reversed(END_E)]
LAYOUT = {'S': SOUTH, 'N': NORTH, 'E': END_E, 'W': END_W}
PANEL = dict(u0=5.25, u1=16.25, z0=P, z1=L(9) + 1.5)


def terr_span(side):
    """how far the top floor's terraces reach along a facade from its left end and from its right"""
    if side in 'SN':
        return TERR_X[side], TERR_X[side]
    return (TERR_Y['S'], TERR_Y['N']) if side == 'E' else (TERR_Y['N'], TERR_Y['S'])


def seg_bounds(kind, n):
    """the facade segment of floor n for a zone kind: [z0, z1] (split where no window is cut)"""
    # (the stair hall's recess between the stair's window and the panel over it)
    off = {'column': -0.625, 'risalit': 0.12, 'wall_w': 0.1, 'core': -0.52}.get(kind, -0.3)

    def b(k):
        return P if k <= FIRST else L(k) + off
    return b(n), b(n + 1)


# ---------- one zone of one floor ----------

def holes_of(z, n):
    k, out = z['kind'], []
    l = L(n)
    if k == 'column':
        out.append((z['u0'] + COL_M, z['u1'] - COL_M, l + NAR_Z[0], l + NAR_Z[1], 'narrow'))
    elif k == 'risalit':
        for a, b in z['wins']:
            out.append((a, b, l + BIG_Z[0], l + BIG_Z[1], 'big'))
    elif k == 'wall':
        for a, b in z.get('wins', []):
            out.append((a, b, l + BACK_Z[0], l + BACK_Z[1], 'back'))
    return out


def panels_of(z, n):
    if z['kind'] != 'column' or n == FIRST:
        return []
    l = L(n)
    return [(z['u0'] + COL_M, z['u1'] - COL_M, l + PAN_Z[0], l + PAN_Z[1])]


def draw_zone(mb, z, n, zs, ze, clip=None):
    u0, u1 = z['u0'], z['u1']
    if clip:
        u0, u1 = max(u0, clip[0]), min(u1, clip[1])
        if u1 - u0 < 1e-3:
            return
    k = z['kind']
    y = -z['out']
    zs_w = zs - 0.004
    if k == 'rustic':
        F.tiles(mb, u0, u1, zs_w, ze, y, [], 'Groove')
        F.rustic(mb, u0, u1, zs_w, ze, y, COURSE, RUST0)
    elif k == 'wall':
        holes = [h for h in holes_of(z, n) if h[0] >= u0 - 1e-6 and h[1] <= u1 + 1e-6 and zs < (h[2] + h[3]) / 2 < ze]
        F.tiles(mb, u0, u1, zs_w, ze, y, [h[:4] for h in holes], 'Facade white')
        for a, b, c, e, st in holes:
            F.window(mb, a, b, c, e, y, 'narrow', depth=0.16)
            F.surround(mb, a, b, c, e, y, w=BACK_SUR, out=0.035, mat='Sill white', sill=True)
    elif k == 'column':
        draw_column(mb, z, n, zs_w, ze, u0, u1, y)
    elif k == 'risalit':
        draw_risalit(mb, z, n, zs_w, ze, y)
    elif k == 'slot':
        draw_slot(mb, u0, u1, zs_w, ze, n, y, bar=z.get('bar', False), mat=z.get('screen', 'Lattice dark'))
    elif k == 'core':
        draw_core(mb, u0, u1, zs_w, ze, n)
    elif k == 'panelwall':
        draw_panelwall(mb, u0, u1, zs_w, ze)


def draw_column(mb, z, n, zs, ze, u0, u1, y):
    """a framed column (renders 5, 8): a raised white frame round a stack of windows (a top light, two
    casements) and grey ornamental panels, one of each a floor"""
    fw, fo = COL_M, 0.05
    holes = [h[:4] for h in holes_of(z, n) if zs < (h[2] + h[3]) / 2 < ze]
    pans = [p for k in (n, n + 1) for p in panels_of(z, k) if zs <= (p[2] + p[3]) / 2 < ze]
    F.tiles(mb, u0, u1, zs, ze, y, holes + pans, 'Facade white')
    for a, b, c, e in holes:
        F.window(mb, a, b, c, e, y, 'narrow', depth=0.16)
    for a, b, c, e in pans:
        F.reveal(mb, a, b, c, e, y, 0.03, 'Stone white', sill=False)
        F.lattice_panel(mb, a, b, c, e, y + 0.03, rw=0.07, out=0.035, inset=0.03)
    # the frame: fillets either side, full height; cross pieces between window and panel
    for x0, x1 in ((z['u0'], z['u0'] + fw), (z['u1'] - fw, z['u1'])):
        if x1 > u0 and x0 < u1:
            mb.box(max(x0, u0), y - fo, zs, min(x1, u1), y, ze, 'Stone white', faces='xXy')
    for a, b, c, e in holes:
        mb.box(z['u0'] + fw, y - fo, c - 0.05, z['u1'] - fw, y, c, 'Stone white', faces='yZz')       # sill rail
        mb.box(z['u0'] + fw, y - fo, e, z['u1'] - fw, y, min(ze, e + 0.07), 'Stone white', faces='yZz')  # head rail
    for a, b, c, e in pans:
        mb.box(z['u0'] + fw, y - fo, max(zs, c - 0.06), z['u1'] - fw, y, c, 'Stone white', faces='yZz')


def draw_risalit(mb, z, n, zs, ze, y):
    """the risalit's front with big windows in stone surrounds; the band under floor 9"""
    a0, a1 = z['u0'], z['u1']
    holes = [h for h in holes_of(z, n) if zs < (h[2] + h[3]) / 2 < ze]
    F.tiles(mb, a0, a1, zs, ze, y, [h[:4] for h in holes], 'Facade white')
    for a, b, c, e, _ in holes:
        F.window(mb, a, b, c, e, y, 'big', depth=0.2)
        F.surround(mb, a, b, c, e, y, w=BIG_SUR, out=0.05, mat='Sill white', sill=True)
    if n == TOP - 1:
        band_return(mb, a0, a1, y, L(TOP - 1) - 0.52, F.CORNICE_BAND)


def band_return(mb, a0, a1, y, zb, prof, back=0.0):
    """a moulding along a forward block's front [a0, a1] at depth y, returned along both sides to
    `back` (facade frame: +y into the building; the sweep's outside is on the right of travel)"""
    path = [(a0, back, zb), (a0, y, zb), (a1, y, zb), (a1, back, zb)]
    mb.sweep(path, prof, 'Stone white', closed=False)


def draw_slot(mb, u0, u1, zs, ze, n, y=0.0, bar=False, mat='Lattice dark'):
    """a shallow slot with the ornamental metal screen in it (renders 1, 5, 8): the slot's back dark,
    the screen 5 cm in, a dark frame round it and bars at the floors"""
    d = y + SLOT_D
    mb.quad((u0, d, zs), (u1, d, zs), (u1, d, ze), (u0, d, ze), 'Strip back')
    F.side(mb, u0, y, d, zs, ze, 'Facade white', 1)
    F.side(mb, u1, y, d, zs, ze, 'Facade white', -1)
    ys = y + 0.05
    w = u1 - u0
    F.wallq(mb, u0, u1, zs, ze, ys, mat, uvs=[(0, zs / w), (1, zs / w), (1, ze / w), (0, ze / w)])
    for zb in (L(n) + 0.02,):
        if zs < zb < ze:
            mb.box(u0, ys - 0.03, zb - 0.04, u1, ys, zb + 0.04, 'Frame black', faces='yZz')
    mb.box(u0, ys - 0.03, zs, u0 + 0.05, ys, ze, 'Frame black', faces='yX')
    mb.box(u1 - 0.05, ys - 0.03, zs, u1, ys, ze, 'Frame black', faces='yx')
    if bar:
        m = (u0 + u1) / 2
        mb.box(m - 0.025, ys - 0.03, zs, m + 0.025, ys, ze, 'Frame black', faces='yxX')


def draw_core(mb, u0, u1, zs, ze, n):
    """the stair hall's recess in the back (renders 3, 7): plain white walls; standing out of its
    back wall a column with the stair's small windows (one a floor, at the half landing) and light
    grey panels between them, a white frame up its sides"""
    d = CORE_D
    a, b, dc = STAIR_COL
    F.tiles(mb, u0, u1, zs, ze, d, [], 'Facade white')
    F.side(mb, u0, 0.0, d, zs, ze, 'Facade white', 1)
    F.side(mb, u1, 0.0, d, zs, ze, 'Facade white', -1)
    F.side(mb, a, dc, d, zs, ze, 'Facade white', -1)
    F.side(mb, b, dc, d, zs, ze, 'Facade white', 1)
    l = L(n)
    m = (a + b) / 2
    win = (m - 0.23, m + 0.23, l + 1.65, l + 2.45)
    pan = (m - 0.23, m + 0.23, max(zs, l - 0.42), l + 1.43)
    F.tiles(mb, a, b, zs, ze, dc, [win, pan], 'Facade white')
    F.window(mb, *win, dc, 'small', depth=0.1)
    mb.box(win[0] - 0.05, dc - 0.05, win[2] - 0.08, win[1] + 0.05, dc, win[2], 'Sill white')
    F.reveal(mb, *pan, dc, 0.04, 'Stone white')
    F.wallq(mb, pan[0], pan[1], pan[2], pan[3], dc + 0.04, 'Panel grey')
    fw = 0.07
    mb.box(a, dc - 0.04, zs, a + fw, dc, ze, 'Stone white', faces='xXy')
    mb.box(b - fw, dc - 0.04, zs, b, dc, ze, 'Stone white', faces='xXy')
    if n == FIRST:
        mb.box(a, dc, zs, b, d, zs + 0.01, 'Facade white', faces='z')


def draw_panelwall(mb, u0, u1, zs, ze):
    """the ends' wall with the big framed panel: a raised frame moulding, a fine line inside it"""
    F.tiles(mb, u0, u1, zs, ze, 0.0, [], 'Facade white')
    p = PANEL
    pz0, pz1 = max(zs, p['z0']), min(ze, p['z1'])
    if pz1 <= pz0:
        return
    bot, top = zs <= p['z0'] + 1e-6 < ze, zs < p['z1'] <= ze
    w, o = 0.36, 0.13
    fz = lambda a, b: 'xXy' + ('z' if a else '') + ('Z' if b else '')
    mb.box(p['u0'], -o, pz0, p['u0'] + w, 0.0, pz1, 'Stone white', faces=fz(bot, top))
    mb.box(p['u1'] - w, -o, pz0, p['u1'], 0.0, pz1, 'Stone white', faces=fz(bot, top))
    if top:
        mb.box(p['u0'] + w, -o, p['z1'] - w, p['u1'] - w, 0.0, p['z1'], 'Stone white', faces='yZz')
    i, lw = 0.55, 0.07
    lz0, lz1 = max(pz0, p['z0']), min(pz1, p['z1'] - i)
    if lz1 > lz0:
        t2 = zs < p['z1'] - i <= ze
        mb.box(p['u0'] + i, -0.03, lz0, p['u0'] + i + lw, 0.0, lz1, 'Stone white', faces=fz(False, t2))
        mb.box(p['u1'] - i - lw, -0.03, lz0, p['u1'] - i, 0.0, lz1, 'Stone white', faces=fz(False, t2))
        if t2:
            mb.box(p['u0'] + i + lw, -0.03, p['z1'] - i - lw, p['u1'] - i - lw, 0.0, p['z1'] - i, 'Stone white', faces='yZz')


def corner_zone(z, side):
    L_ = FRAMES[side][2]
    a, b = terr_span(side)
    return z.get('corner', False) and (z['u1'] <= a + 1e-6 or z['u0'] >= L_ - b - 1e-6)


def top_of(side, z):
    """where floor 10's facade ends"""
    if side == 'S':
        return RIS_TOP if z['kind'] == 'risalit' else ATTIC[0]
    return ROOF


def steps_between(mb, zones, zs_of, ze_of):
    """side faces where neighbouring zones stand at different depths"""
    for a, b in zip(zones, zones[1:]):
        if abs(a['out'] - b['out']) < 1e-6:
            continue
        u = a['u1']
        # the side face belongs to the zone that stands forward: its segment, floor after floor
        fwd = a if a['out'] > b['out'] else b
        z0, z1 = zs_of(fwd), ze_of(fwd)
        if z1 <= z0:
            continue
        y0, y1 = sorted((-a['out'], -b['out']))
        # facing the side of the zone that stands back
        F.side(mb, u, y0, y1, z0, z1, 'Facade white', 1 if a['out'] > b['out'] else -1)


def facade_floor(mb, side, n):
    (ox, oy), rot, L_ = FRAMES[side]
    if n == TOP and side in 'EW':
        return
    with mb.at(ox, oy, 0.0, rot):
        drawn = []
        for z in LAYOUT[side]:
            if n == TOP and corner_zone(z, side):
                continue
            kind = 'wall_w' if z['kind'] == 'wall' and z.get('wins') else z['kind']
            zs, ze = seg_bounds(kind, n)
            clip = None
            if n == TOP:
                ze = top_of(side, z)
                a, b = terr_span(side)
                clip = (a, L_ - b)
            elif n == TOP - 1 and corner_zone(z, side):
                ze = TERR_C[0]
            draw_zone(mb, z, n, zs, ze, clip)
            drawn.append((z, zs, ze))
        if side == 'S':
            bounds = {id(z): (zs, ze) for z, zs, ze in drawn}
            zs_ = [z for z, _, _ in drawn]
            steps_between(mb, zs_, lambda z: bounds[id(z)][0], lambda z: bounds[id(z)][1])


# ---------- the floors of flats ----------

def front_blocks():
    return [sbox(X0 + z['u0'], Y0 - z['out'], X0 + z['u1'], Y0) for z in SOUTH if z['out'] > 0]


def outline(n):
    g = unary_union([sbox(X0, Y0, X1, Y1)] + front_blocks())
    if n == TOP:
        xs, xn, fs, fn = TERR_X['S'], TERR_X['N'], TERR_Y['S'], TERR_Y['N']
        cut = [sbox(X0 - 2, Y0 - 2, X0 + xs, Y0 + fs), sbox(X1 - xs, Y0 - 2, X1 + 2, Y0 + fs),
               sbox(X1 - xn, Y1 - fn, X1 + 2, Y1 + 2), sbox(X0 - 2, Y1 - fn, X0 + xn, Y1 + 2),
               sbox(X0 - 2, Y0, X0 + SET, Y1), sbox(X1 - SET, Y0, X1 + 2, Y1)]
        g = g.difference(unary_union(cut))
    return g


def recesses():
    out = []
    for side, zones in LAYOUT.items():
        (ox, oy), rot, L_ = FRAMES[side]
        c, s = math.cos(rot), math.sin(rot)
        for z in zones:
            d = SLOT_D + 0.02 if z['kind'] == 'slot' else CORE_D + 0.02 if z['kind'] == 'core' else 0
            if not d:
                continue
            pts = [(z['u0'], -1.5), (z['u1'], -1.5), (z['u1'], d), (z['u0'], d)]
            out.append(Polygon([(ox + c * u - s * dd, oy + s * u + c * dd) for u, dd in pts]))
    return unary_union(out)


def build_slab(n):
    mb = MeshBuilder()
    # 12 cm inside the facade line: clear of the panels and screens set into the walls
    g = outline(n).buffer(-0.12, join_style='mitre').difference(recesses()).buffer(0)
    z0 = P - 0.3 if n == FIRST else L(n) - 0.3
    for part in getattr(g, 'geoms', [g]):
        mb.prism(list(part.exterior.coords)[:-1], z0, L(n) + SLAB, 'Stone white', 'Shop floor', 'Stone white')
    return mb


def build_walls(n):
    mb = MeshBuilder()
    for s in 'SNEW':
        facade_floor(mb, s, n)
    if n == TOP:
        top_floor_extras(mb)
    # the floor's inside, closed: a dark box 0.6 m inside the facades (nothing shows through a gap in
    # the shell; the windows' glass draws the rooms behind it)
    g = outline(n).buffer(-0.6, join_style='mitre').difference(recesses().buffer(0.15, join_style='mitre')).buffer(0)
    z0 = P if n == FIRST else L(n) - 0.3
    z1 = ROOF if n == TOP else L(n + 1) - 0.3
    for part in getattr(g, 'geoms', [g]):
        if part.area > 4:
            mb.prism(list(part.exterior.coords)[:-1], z0 + 0.01, z1 - 0.01, 'Interior dark', 'Interior dark', 'Interior dark')
    return mb


# ---------- the top floor ----------

def top_floor_extras(mb):
    zt = L(TOP)
    for side in 'EW':
        (ox, oy), rot, L_ = FRAMES[side]
        a, b = terr_span(side)
        b = L_ - b
        with mb.at(ox, oy, 0.0, rot):
            # the end between the terraces: set back, finely rusticated (renders 7, 8)
            F.tiles(mb, a, b, zt, ROOF, SET, [], 'Groove')
            F.rustic(mb, a, b, zt, ROOF, SET, 0.36, zt, ends=(False, False))
            # the terraces' cornice runs on along the end, a ledge back to the wall over it
            F.profile_box(mb, a, b, 0.0, TERR_C[0], F.scaled(F.CORNICE_TERRACE, TERR_C[1] - TERR_C[0]), 'Stone white', ends=False)
            mb.box(a, 0.0, TERR_C[0], b, SET, TERR_C[1], 'Stone white', faces='xXZ')
    # the risalits' sides over the front terraces, up to their cornice
    with mb.at(X0, Y0, 0.0, 0.0):
        a = TERR_X['S']
        F.side(mb, a, -OUT, 0.0, zt + 0.12, RIS_TOP, 'Facade white', -1)
        F.side(mb, W - a, -OUT, 0.0, zt + 0.12, RIS_TOP, 'Facade white', 1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            corner_terrace(mb, sx, sy)


def corner_terrace(mb, sx, sy):
    """a corner terrace of the top floor (renders 1, 3, 7, 8): the cornice round the corner (a solid
    parapet), a balustrade with urns on it, deck, the top floor's walls round it with a glazed door
    and a window, a timber pergola with white slats and louvres along the end, planters"""
    zt = L(TOP)
    zc0, zc1 = TERR_C
    long_side = 'S' if sy < 0 else 'N'
    a, b = TERR_X[long_side], TERR_Y[long_side]
    cx, cy = (X1 if sx > 0 else X0), (Y1 if sy > 0 else Y0)
    ix, iy = cx - sx * a, cy - sy * b
    xa, xb = sorted((cx, ix))
    ya, yb = sorted((cy, iy))
    deck = zt + 0.12
    mb.box(xa, ya, zc0, xb, yb, deck, 'Stone white', faces='Z')
    mb.cap(rect_ring(xa + 0.02, ya + 0.02, xb - 0.02, yb - 0.02), deck + 0.005, 'Roof deck')
    pts = [(ix, cy), (cx, cy), (cx, iy)]
    if sx * sy > 0:
        pts = pts[::-1]
    prof = F.scaled(F.CORNICE_TERRACE, zc1 - zc0)
    mb.sweep([(x, y, zc0) for x, y in pts], prof, 'Stone white', closed=False)
    # the parapet's inner face and top (the cornice is solid up to zc1)
    pw = 0.35
    for p, q in ((pts[0], pts[1]), (pts[1], pts[2])):
        (x0, y0), (x1, y1) = p, q
        if abs(y0 - y1) < 1e-6:
            yy = y0 - sy * pw
            mb.box(min(x0, x1), min(y0, yy), deck, max(x0, x1), max(y0, yy), zc1, 'Stone white', faces='yYZxX')
        else:
            xx = x0 - sx * pw
            mb.box(min(x0, xx), min(y0, y1), deck, max(x0, xx), max(y0, y1), zc1, 'Stone white', faces='xXZyY')
    # the balustrade: pedestals with urns at the corner, at both far ends and half way along the end
    # (renders 1, 2, 3, 7); one bay along the long face, two along the end
    yl, xl = cy - sy * 0.2, cx - sx * 0.2
    x_from, x_to = sorted((xl, ix))
    F.balustrade(mb, x_from, x_to, yl, zc1, spacing=x_to - x_from, h=1.0, post_h=1.3)
    y_from, y_to = sorted((yl, iy))
    with mb.at(xl, 0.0, 0.0, math.pi / 2):
        F.balustrade(mb, y_from, y_to, 0.0, zc1, spacing=(y_to - y_from) / 2, h=1.0, post_h=1.3, ends=(sy > 0, sy < 0))
    # the top floor's walls round the terrace: along y at x = ix (a glazed door), along x at y = iy
    _wall_at(mb, (ix, ya), (ix, yb), sx, deck - 0.12, ROOF, door=0.95)
    xs = cx - sx * SET
    wx0, wx1 = sorted((ix, xs))
    _wall_at(mb, (wx0, iy), (wx1, iy), sy, deck - 0.12, ROOF, window=0.6)
    # (the roof's edge over these walls: build_roof)
    terrace_pergola(mb, sx, sy, cx, cy, ix, iy, deck)
    # the planter along the long face's balustrade, under the pergola's front beam (its shrubs:
    # terrace_plants())
    F.planter(mb, *sorted((ix + sx * 0.12, cx - sx * 0.9)), *sorted((cy - sy * 0.42, cy - sy * 1.12)), deck, h=0.55, shrubs=False)
    for k, t in enumerate((0.27, 0.72)):
        bush(mb, ix + (cx - sx * 0.9 - ix) * t, cy - sy * 0.78, deck + 0.59, r=0.72, h=1.75, seed=int(4 * sx + 2 * sy + k))


# the corner terraces' pergola (renders 1, 2, 5, 8; measured on renders 1, 5 and 8): heavy timber.
# Three posts down the end side just inside the balustrade (the front one 1.15 m back from the
# corner, the back one in front of the back wall); a beam along their heads reaching forward to the
# front beam, which runs right behind the front balustrade to the inner wall; beams across from the
# other two posts; all their tops 3.5 m over the deck (level with the roof's cornice); white slats
# over them along the end; white louvres between the posts.
PERGOLA_H = 3.5
PERGOLA_POST, PERGOLA_BEAM = 0.3, (0.26, 0.46)


def terrace_pergola(mb, sx, sy, cx, cy, ix, iy, deck):
    wood, white = 'Pergola wood', 'Pergola white'
    pw = PERGOLA_POST
    bw, bh = PERGOLA_BEAM
    zt = deck + PERGOLA_H
    zb = zt - bh
    xp = cx - sx * 0.5                          # the posts' line, just inside the end's balustrade
    ys = [cy - sy * 1.15, None, iy + sy * 0.35]
    ys[1] = (ys[0] + ys[2]) / 2
    yf = cy - sy * 0.5                          # the front beam, behind the front balustrade
    for y in ys:
        mb.box(xp - pw / 2, y - pw / 2, deck, xp + pw / 2, y + pw / 2, zb, wood)
    # the beams across, to the inner wall: the front one, and one from each of the other posts
    for y in (yf, ys[1], ys[2]):
        mb.box(min(xp + sx * (pw / 2 + 0.15), ix), y - bw / 2, zb, max(xp + sx * (pw / 2 + 0.15), ix), y + bw / 2, zt, wood)
    # the beam along the posts' heads, from the front beam to the back wall
    ya, yb = sorted((yf - sy * bw / 2, iy))
    mb.box(xp - bw / 2, ya, zb, xp + bw / 2, yb, zt, wood)
    # white slats over the beams, along the end, 0.3 m apart, from the posts' line to the inner wall
    n = max(2, round(abs(ix - xp) / 0.3))
    for k in range(n + 1):
        x = xp + (ix - xp) * k / n
        x = min(max(x, min(xp, ix) + 0.04), max(xp, ix) - 0.04)
        mb.box(x - 0.025, ya, zt, x + 0.025, yb, zt + 0.07, white)
    # louvres between the posts: white boards 0.12 m tall, 0.2 m apart, from knee height to the beam
    for y0, y1 in ((ys[0], ys[1]), (ys[1], ys[2])):
        y0, y1 = sorted((y0, y1))
        y0, y1 = y0 + pw / 2, y1 - pw / 2
        z = deck + 0.5
        while z + 0.12 < zb - 0.05:
            mb.box(xp - 0.025, y0, z, xp + 0.025, y1, z + 0.12, white)
            z += 0.2


def bush(mb, x, y, z, r=0.7, h=1.7, seed=0):
    """a full round bush (renders 1, 2, 5, 8): a big leafy ball and four smaller ones lumped round
    it, dark green"""
    import random
    rnd = random.Random(seed)
    balls = [(0.0, 0.0, 0.0, 1.0)]
    for k in range(4):
        a = k * math.pi / 2 + rnd.uniform(-0.4, 0.4)
        balls.append((math.cos(a) * r * 0.45, math.sin(a) * r * 0.25, h * rnd.uniform(0.15, 0.35), rnd.uniform(0.55, 0.7)))
    for dx, dy, dz, k in balls:
        rr, hh = r * k, h * k
        mb.lathe([(0.0, 0.0), (rr * 0.55, 0.0), (rr * 0.92, hh * 0.18), (rr, hh * 0.45), (rr * 0.9, hh * 0.72), (rr * 0.6, hh * 0.92),
                  (0.0, hh)], 'Shrub', 14, x + dx, y + dy, z + min(dz, h - hh))


def terrace_plants():
    """(the corner terraces' bushes are modelled: bush(); no tree billboards there)"""
    return []


def _wall_at(mb, p0, p1, facing, z0, z1, door=None, window=None):
    (x0, y0), (x1, y1) = p0, p1
    if abs(y1 - y0) < 1e-6:
        Lw = abs(x1 - x0)
        xa = min(x0, x1)
        rot = 0.0 if facing < 0 else math.pi
        ox = xa if facing < 0 else xa + Lw
        with mb.at(ox, y0, 0.0, rot):
            _wall_with_door(mb, Lw, z0, z1, door, window)
    else:
        Lw = abs(y1 - y0)
        ya = min(y0, y1)
        rot = math.pi / 2 if facing > 0 else -math.pi / 2
        oy = ya if facing > 0 else ya + Lw
        with mb.at(x0, oy, 0.0, rot):
            _wall_with_door(mb, Lw, z0, z1, door, window)


def _wall_with_door(mb, Lw, z0, z1, door, window=None):
    holes = []
    if door:
        holes.append((Lw / 2 - door, Lw / 2 + door, z0 + 0.12, z0 + 2.45, 'door'))
    if window:
        holes.append((Lw / 2 - window, Lw / 2 + window, z0 + 0.9, z0 + 2.5, 'win'))
    F.tiles(mb, 0.0, Lw, z0, z1, 0.0, [h[:4] for h in holes], 'Facade white')
    for a, b, c, e, k in holes:
        F.window(mb, a, b, c, e, 0.0, 'narrow', depth=0.18)
        F.surround(mb, a, b, c, e, 0.0, w=0.12, sill=k != 'door', mat='Sill white')


# ---------- roof ----------

def edge_path():
    """the roof's edge round the back and the ends, over the top floor's walls round the terraces:
    counter-clockwise (the outside on the right of travel), from the front-right terrace round to
    the front-left one"""
    xs, xn, fs, fn = TERR_X['S'], TERR_X['N'], TERR_Y['S'], TERR_Y['N']
    return [(X1 - xs, Y0 + fs), (X1 - SET, Y0 + fs), (X1 - SET, Y1 - fn), (X1 - xn, Y1 - fn), (X1 - xn, Y1),
            (X0 + xn, Y1), (X0 + xn, Y1 - fn), (X0 + SET, Y1 - fn), (X0 + SET, Y0 + fs), (X0 + xs, Y0 + fs)]


def parapet(mb, path, z0, z1, thick):
    """a solid wall along an open path (counter-clockwise: the outside on the right), `thick` in
    from it, from z0 up to z1: closed on every side (its outer face is behind the cornice)"""
    g = LineString(path).buffer(thick, single_sided=True, join_style='mitre')
    for part in getattr(g, 'geoms', [g]):
        mb.prism(list(part.exterior.coords)[:-1], z0, z1, 'Facade white', 'Stone white', None)


def balustrade_along(mb, path, z, inset=0.22, spacing=2.6, closed=False, **kw):
    """balustrades along a path (counter-clockwise: the outside on the right), `inset` in from its
    line, a post at every corner"""
    if closed:
        pts = list(Polygon(path).buffer(-inset, join_style='mitre').exterior.coords)
        if Polygon(pts).exterior.is_ccw is False:
            pts = pts[::-1]
    else:
        pts = list(LineString(path).offset_curve(inset, join_style='mitre').coords)
    n = len(pts) - 1
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        Lq = math.hypot(x1 - x0, y1 - y0)
        if Lq < 0.3:
            continue
        with mb.at(x0, y0, 0.0, math.atan2(y1 - y0, x1 - x0)):
            F.balustrade(mb, 0.0, Lq, 0.0, z, spacing=spacing, ends=(True, closed is False and i == n - 1), **kw)


def build_roof():
    """the roof, solid throughout (a parapet under every balustrade, nothing in the air): the deck;
    the cornice, parapet and balustrade round the back and the ends; the risalits' tops; the attic
    over the front's middle (small paired windows front and back, cornice, balustrade); the stair
    house"""
    mb = MeshBuilder()
    ris = [z for z in SOUTH if z['kind'] == 'risalit']
    a_u0, a_u1 = ris[0]['u1'], ris[1]['u0']
    # --- the deck (the attic stands at the front between the risalits) ---
    deck = outline(TOP).difference(sbox(X0 + a_u0, Y0 - 2, X0 + a_u1, Y0 + 0.01)).buffer(0)
    for part in getattr(deck, 'geoms', [deck]):
        mb.prism(list(part.exterior.coords)[:-1], ROOF - 0.3, DECK, 'Facade white', 'Roof deck', None)
    # --- round the back and the ends ---
    edge = F.scaled(F.CORNICE_TERRACE, EDGE_C[1] - EDGE_C[0])
    bal_z = EDGE_C[1]
    path = edge_path()
    mb.sweep([(x, y, EDGE_C[0]) for x, y in path], edge, 'Stone white', closed=False)
    parapet(mb, path, DECK - 0.05, bal_z, 0.45)
    balustrade_along(mb, path, bal_z, inset=0.22, spacing=2.6)
    # the stair hall's recess under it: its ceiling
    core = [z for z in NORTH if z['kind'] == 'core'][0]
    with mb.at(X1, Y1, 0.0, math.pi):
        mb.box(core['u0'], 0.0, ROOF - 0.32, core['u1'], CORE_D, ROOF - 0.3, 'Facade white', faces='z')
    # --- the risalits' tops: the cornice round the front and back along the terrace's wall ---
    rc = F.scaled(F.CORNICE_MAIN, 1.0)
    zt = RIS_TOP + rc[-1][1]
    for i, z in enumerate(ris):
        x0, x1 = X0 + z['u0'], X0 + z['u1']
        yf, yt = Y0 - z['out'], Y0 + TERR_Y['S']
        if i == 0:
            path = [(x0, yt), (x0, yf), (x1, yf), (x1, Y0 + 0.3)]
            bal = [(x0, yt), (x0, yf), (x1 - 0.28, yf)]
        else:
            path = [(x0, Y0 + 0.3), (x0, yf), (x1, yf), (x1, yt)]
            bal = [(x0 + 0.28, yf), (x1, yf), (x1, yt)]
        mb.sweep([(x, y, RIS_TOP) for x, y in path], rc, 'Stone white', closed=False)
        parapet(mb, path, DECK - 0.05, zt, 0.6)
        balustrade_along(mb, bal, zt, inset=0.28, spacing=2.35, post_h=1.32)
    # --- the attic between the risalits ---
    ad = 3.0
    za0, za1 = ATTIC
    with mb.at(X0, Y0, 0.0, 0.0):
        holes = []
        for z in SOUTH:
            if z['kind'] == 'column' and a_u0 <= z['u0'] and z['u1'] <= a_u1:
                c = (z['u0'] + z['u1']) / 2
                for du in (-0.58, 0.12):
                    holes.append((c + du, c + du + 0.46, za0 + 0.75, za0 + 1.6))
        F.tiles(mb, a_u0, a_u1, za0 - 0.01, za1, 0.0, holes, 'Facade white')
        for h in holes:
            F.window(mb, *h, 0.0, 'small', depth=0.14)
            F.surround(mb, *h, 0.0, w=0.08, out=0.03, mat='Sill white', sill=False)
        # the base band along the attic and round the middle block, the block's top behind it
        mid = [z for z in SOUTH if z['out'] > 0 and z['kind'] != 'risalit']
        m0, m1 = min(z['u0'] for z in mid), max(z['u1'] for z in mid)
        band = F.scaled(F.CORNICE_BAND, 0.45)
        mb.sweep([(a_u0, 0.0, za0), (m0, 0.0, za0), (m0, -OUT, za0), (m1, -OUT, za0), (m1, 0.0, za0), (a_u1, 0.0, za0)],
                 band, 'Stone white', closed=False)
        mb.box(m0, -OUT, za0 + band[-1][1] - 0.02, m1, 0.0, za0 + band[-1][1], 'Stone white', faces='Z')
        # caps of the slots under the attic
        for z in SOUTH:
            if z['kind'] == 'slot':
                mb.box(z['u0'], -0.04, za0 - 0.25, z['u1'], SLOT_D, za0, 'Stone white', faces='yzZ')
        # sides and back of the attic: small windows on the back too (render 7)
        F.side(mb, a_u0, 0.0, ad, za0, za1, 'Facade white', -1)
        F.side(mb, a_u1, 0.0, ad, za0, za1, 'Facade white', 1)
        with mb.at(a_u1, ad, 0.0, math.pi):
            Lw = a_u1 - a_u0
            hb = [(Lw - (h[1] - a_u0), Lw - (h[0] - a_u0), h[2], h[3]) for h in holes]
            F.tiles(mb, 0.0, Lw, za0, za1, 0.0, hb, 'Facade white')
            for h in hb:
                F.window(mb, *h, 0.0, 'small', depth=0.14)
        # the cornice all round, the top inside it, the balustrade round the top
        ac = F.scaled(F.CORNICE_MAIN, 0.75)
        ring = [(a_u0, 0.0), (a_u1, 0.0), (a_u1, ad), (a_u0, ad)]
        mb.sweep([(u, y, za1) for u, y in ring], ac, 'Stone white', closed=True)
        zt_a = za1 + ac[-1][1]
        mb.cap(ring, zt_a, 'Roof deck')
        balustrade_along(mb, ring + ring[:1], zt_a, inset=0.28, spacing=2.2, closed=True, post_h=1.32)
    # --- the stair house over the stair hall (renders 1, 2, 3, 7; triangulated on 3 and 7: its north
    # face over the recess's back wall) ---
    hx0, hx1 = -0.4, 3.5
    hy0, hy1 = -0.8, Y1 - CORE_D
    ring = rect_ring(hx0, hy0, hx1, hy1)
    mb.prism(ring, DECK - 0.05, BLOCK_TOP, 'Facade white', None)
    bc = F.scaled(F.CORNICE_TERRACE, 0.5)
    mb.sweep([(x, y, BLOCK_TOP) for x, y in ring], bc, 'Stone white')
    zt = BLOCK_TOP + bc[-1][1]
    mb.cap(ring, zt, 'Roof deck')
    balustrade_along(mb, ring + ring[:1], zt, inset=0.22, spacing=1.9, closed=True)
    # its windows and the door to the roof (west face), a window on the north face
    with mb.at(hx0, hy1, 0.0, -math.pi / 2):
        for u0_, w_, kind in ((1.2, 0.9, 'door'), (4.0, 1.0, 'win'), (6.6, 1.0, 'win')):
            c = DECK + (0.1 if kind == 'door' else 0.95)
            e = DECK + 2.4
            F.window(mb, u0_, u0_ + w_, c, e, 0.0, 'narrow', depth=0.16)
            F.surround(mb, u0_, u0_ + w_, c, e, 0.0, w=0.1, out=0.03, mat='Sill white', sill=kind != 'door')
    with mb.at(hx1, hy1, 0.0, math.pi):
        F.window(mb, 1.5, 2.6, DECK + 0.95, DECK + 2.4, 0.0, 'narrow', depth=0.16)
        F.surround(mb, 1.5, 2.6, DECK + 0.95, DECK + 2.4, 0.0, w=0.1, out=0.03, mat='Sill white')
    return mb


# ---------- the shop floors ----------
PIER_W = 0.62
PIER_OUT = 0.4                 # the piers' faces at y -9.25 (renders 1, 2: the corners)
# the piers' centres (render 8 unwrapped): symmetric, 3.25 m apart, the entrance bay in the middle
PIERS = sorted(17.0 + s * d - PIER_W / 2 for d in (1.6, 4.85, 8.1, 11.35, 14.6) for s in (-1, 1))   # left edges (u)
STEPS = (11.5, 22.5)           # the steps up to the terrace: 11 m wide (renders 1, 5)
STEPS_Y = (-10.5, -12.9)       # ... from the floors' facade line down (the ground floor's plan)
TERR_EDGE = -11.6              # the terrace's front edge, the basement's front under it (render 2)

ENTABLATURE = F.profile(('p', 0.06, 0.0), ('p', 0.06, 0.22), ('p', 0.1, 0.24), ('p', 0.1, 0.3), ('p', 0.05, 0.3),
                        ('p', 0.05, 0.56), ('ovolo', 0.14, 0.64), ('p', 0.18, 0.64), ('p', 0.18, 0.7),
                        ('cavetto', 0.4, 0.8), ('p', 0.44, 0.8), ('p', 0.44, 0.9))


def build_podium():
    """floors 1-2 (renders 1, 2, 5, 8): marble piers with bands and capitals, glass bays with black
    frames between them, the entablature on top following the forward blocks; marble walls with
    bands at the ends and the back (two rows of small windows, a door in the stair hall's recess)"""
    mb = MeshBuilder()
    zc = P - 0.9
    with mb.at(X0, POD_FRONT, 0.0, 0.0):
        # the corner returns and the piers
        piers = [(-0.0, 0.42)] + [(u, u + PIER_W) for u in PIERS] + [(W - 0.42, W)]
        for a, b in piers:
            o = PIER_OUT
            mb.box(a, -o, F1 + 0.35, b, 0.0, zc - 0.32, 'Marble', faces='xXy')
            mb.box(a - 0.04, -o - 0.04, F1, b + 0.04, 0.0, F1 + 0.35, 'Marble dark', faces='xXyZ')
            mb.box(a - 0.03, -o - 0.03, L2 - 0.12, b + 0.03, 0.0, L2 + 0.12, 'Marble', faces='xXyZz')
            mb.box(a - 0.05, -o - 0.05, zc - 0.32, b + 0.05, 0.0, zc - 0.2, 'Marble', faces='xXyZz')
            mb.box(a - 0.07, -o - 0.07, zc - 0.2, b + 0.07, 0.0, zc, 'Marble', faces='xXyZz')
            mb.box(a, -o, 0.0, b, 0.0, F1, 'Marble dark', faces='xXy')
        for i in range(len(piers) - 1):
            shop_bay(mb, piers[i][1], piers[i + 1][0])
    # ---- back: the wall 2.15 m in under the overhang ----
    core = [z for z in NORTH if z['kind'] == 'core'][0]
    cu0, cu1 = core['u0'], core['u1']
    pd = Y1 - POD_BACK
    with mb.at(X1, Y1, 0.0, math.pi):
        holes = [(c - WIN_W / 2, c + WIN_W / 2, *zz) for c in BACK_WINS for zz in (WIN_Z, SLIT_Z)]
        door = DOOR
        _marble_wall(mb, -0.06, W + 0.06, SOFFIT, pd, holes + [door], shade=SHADE_Z)
        for h in holes:
            F.reveal(mb, *h, pd, 0.16, 'Marble', sill=True)
            F.frame(mb, *h, pd + 0.16, mullions=[(h[0] + h[1]) / 2], fw=0.05)
            F.surround(mb, *h, pd, w=0.07, out=0.025, mat='Sill white')
        _podium_bands(mb, -0.06, door[0], pd)
        _podium_bands(mb, door[1], W + 0.06, pd)
        # the door: a grey metal leaf with a small light, in a plain reveal
        a, b, c, e = door
        F.reveal(mb, *door, pd, 0.14, 'Marble', sill=False)
        mb.quad((a, pd + 0.14, c), (b, pd + 0.14, c), (b, pd + 0.14, e), (a, pd + 0.14, e), 'Door metal')
        F.frame(mb, a + 0.3, b - 0.3, e - 0.85, e - 0.3, pd + 0.13, fw=0.03, mat='Frame black', glass='Shop glass', d=0.02)
        mb.box(b - 0.22, pd + 0.06, c + 0.95, b - 0.1, pd + 0.13, c + 1.0, 'Railing metal')
        # the stoop: a landing across the door, five white steps down from it (render 7)
        sm = (a + b) / 2
        rise = c / 5
        mb.box(sm - 0.95, pd - 0.9, 0.0, sm + 0.95, pd, c, 'Step stone', faces='xXyZ')
        for k in range(1, 5):
            w = 0.95 + 0.1 * k
            mb.box(sm - w, pd - 0.9 - 0.3 * k, 0.0, sm + w, pd - 0.9 - 0.3 * (k - 1), c - k * rise, 'Step stone', faces='xXyZ')
    # the overhang, front and back: its underside from the podium's walls out to the floors' facade
    # line, the band round the foot of the floors all round the building (along the forward blocks
    # at the front, into the stair hall's recess at the back; its foot 6 cm out at the ends: flush
    # with the podium's end walls)
    foot = outline(FIRST).difference(sbox(X1 - cu1, Y1 - CORE_D, X1 - cu0, Y1 + 1))
    soffit = foot.difference(sbox(X0 - 1, POD_FRONT, X1 + 1, POD_BACK))
    for part in getattr(soffit, 'geoms', [soffit]):
        mb.cap(list(part.exterior.coords)[:-1], SOFFIT, 'Marble shade', up=False)
    ring = list(orient(foot, 1.0).exterior.coords)[:-1]
    mb.sweep([(x, y, SOFFIT) for x, y in ring], ENTABLATURE, 'Marble', closed=True)
    # ---- ends: their walls back to the podium's back wall ----
    for side in 'EW':
        (ox, oy), rot, L_ = FRAMES[side]
        f = POD_FRONT - PIER_OUT - Y0       # the front corner pier's face, from the floors' front
        u0, u1 = (f, L_ - pd) if side == 'E' else (pd, L_ - f)
        with mb.at(ox, oy, 0.0, rot):
            _marble_wall(mb, u0, u1, SOFFIT, -0.06, [])
            _podium_bands(mb, u0, u1, -0.06)
    shops(mb)
    # the podium closed: its roof (the floor of floor 3) and the back of the shops, clear of the stair
    # hall's recess
    recess = sbox(X1 - cu1, Y1 - CORE_D - 0.05, X1 - cu0, Y1 + 1)
    for g, z0, z1, bot in ((sbox(X0 + 0.05, Y0 + 0.05, X1 - 0.05, Y1 - 0.05).difference(recess), P - 0.35, P - 0.01, 'Interior dark'),
                           (sbox(X0 + 0.5, POD_FRONT + 8.05, X1 - 0.5, POD_BACK - 0.25), 0.0, SOFFIT - 0.05, None)):
        for part in getattr(g, 'geoms', [g]):
            mb.prism(list(part.exterior.coords)[:-1], z0, z1, 'Interior dark', 'Interior dark', bot)
    return mb


def _marble_wall(mb, u0, u1, z1, y, holes, shade=None):
    """a marble wall of the podium facing out (-y) from the ground to z1, darker marble under the band
    at floor 1 (renders 3, 7), in shade from `shade` up"""
    zb = F1 - 0.05
    zs = shade or z1
    F.tiles(mb, u0, u1, 0.0, zb, y, holes, 'Marble dark')
    F.tiles(mb, u0, u1, zb, zs, y, holes, 'Marble')
    F.tiles(mb, u0, u1, zs, z1, y, holes, 'Marble shade')


def _podium_bands(mb, u0, u1, y):
    """a dark plinth, a band at floor 1 and one at floor 2 on the podium's marble walls"""
    F.profile_box(mb, u0, u1, y, 0.0, F.PLINTH, 'Marble dark', ends=False)
    for zb in (F1 - 0.05, L2 - 0.1):
        F.profile_box(mb, u0, u1, y, zb, F.PODIUM_BAND, 'Marble', ends=False)


def shop_bay(mb, a, b):
    """one bay of the shop front: glass from the terrace to the entablature in a grid of black
    frames, a dark band at floor 2, double doors in the bays behind the steps"""
    zc = P - 0.9
    F.reveal(mb, a, b, F1, zc, -PIER_OUT, PIER_OUT + 0.1, 'Marble', sill=False)
    yg = 0.1
    # (render 5) one mullion up the middle; a transom at the door head, the dark band at floor 2,
    # two transoms in the upper floor
    # (render 2) tall dark glass in each bay: a mullion up the middle, a slim transom at the door
    # head and one at floor 2
    mids = [(a + b) / 2]
    ts = [F1 + 2.6, L2]
    F.frame(mb, a, b, F1, zc, yg, mullions=mids, transoms=ts, fw=0.05, mat='Shop frame', glass='Shop glass', d=0.07)
    u_mid = (a + b) / 2
    if STEPS[0] < u_mid < STEPS[1]:
        for d0 in (a + (b - a) * 0.25, u_mid):
            mb.box(d0 - 0.025, yg - 0.11, F1, d0 + 0.025, yg - 0.05, F1 + 2.55, 'Shop frame')
        mb.box(a + (b - a) * 0.25, yg - 0.12, F1 + 1.0, a + (b - a) * 0.75, yg - 0.08, F1 + 1.05, 'Door metal')


def shops(mb):
    """what shows through the shop windows: two lit floors 8 m deep, partitions, shelves, counters"""
    import random
    rnd = random.Random(3)
    depth = 8.0
    ya, yb = POD_FRONT + 0.3, POD_FRONT + depth
    for zf, h in ((F1, L2 - F1), (L2, P - 0.9 - L2)):
        mb.cap(rect_ring(X0 + 0.5, ya, X1 - 0.5, yb), zf + 0.01, 'Shop floor')
        mb.cap(rect_ring(X0 + 0.5, ya, X1 - 0.5, yb), zf + h - 0.35, 'Shop ceiling', up=False)
        mb.quad((X0 + 0.5, yb, zf), (X1 - 0.5, yb, zf), (X1 - 0.5, yb, zf + h - 0.35), (X0 + 0.5, yb, zf + h - 0.35), 'Shop wall')
        # the end walls, facing in
        mb.quad((X0 + 0.5, ya, zf), (X0 + 0.5, yb, zf), (X0 + 0.5, yb, zf + h - 0.35), (X0 + 0.5, ya, zf + h - 0.35), 'Shop wall')
        mb.quad((X1 - 0.5, yb, zf), (X1 - 0.5, ya, zf), (X1 - 0.5, ya, zf + h - 0.35), (X1 - 0.5, yb, zf + h - 0.35), 'Shop wall')
        for u in PIERS[1::3]:
            x = X0 + u + PIER_W / 2
            mb.box(x - 0.1, ya, zf, x + 0.1, yb, zf + h - 0.35, 'Shop wall')
        x = X0 + 2.0
        while x < X1 - 2:
            for y in (ya + 2.0, ya + 5.0):
                mb.box(x - 0.6, y - 0.6, zf + h - 0.38, x + 0.6, y + 0.6, zf + h - 0.35, 'Shop light', faces='z')
            x += 3.2
        x = X0 + 1.0
        while x < X1 - 2.5:
            mb.box(x, yb - 0.5, zf, x + 2.2, yb - 0.05, zf + 2.0, 'Shelf')
            for k in range(4):
                gz = zf + 0.35 + k * 0.42
                for j in range(5):
                    gx = x + 0.1 + j * 0.42
                    col = rnd.choice(['Goods red', 'Goods blue', 'Goods yellow', 'Goods white', 'Goods green'])
                    mb.box(gx, yb - 0.45, gz, gx + 0.3, yb - 0.15, gz + 0.2 + rnd.random() * 0.12, col, faces='xXyZ')
            x += 2.6
        for x in (-13.5, -6.8, 0.0, 6.8, 13.5):
            mb.box(x - 0.9, ya + 3.0, zf, x + 0.9, ya + 3.8, zf + 0.9, 'Counter')


# The basement under the terrace (renders 1, 2): its front stands under the terrace's edge (dark
# glazing with bars between marble pilasters, a door near each end), a sunken walk along it 0.9 m
# below the pavement, white railings round it, stairs down at its outer ends.
BASEMENT_Z = -0.9
SUNK_W = 1.5                   # the sunken walk's width in front of the basement
SUNK_X = (5.9, 16.6)           # ... from the main steps' side to the end, either side (|x|)
WELL_X = (15.0, 16.6)          # the stairs down: 6 steps at the outer end, coming in from the front
WELL_L = 1.8


def sunken():
    """the sunken walks and their stairs (plan polygons, for cutting the forecourt's paving)"""
    t0 = TERR_EDGE
    out = []
    for sx in (-1, 1):
        a, b = sorted((sx * SUNK_X[0], sx * SUNK_X[1]))
        out.append(sbox(a, t0 - SUNK_W, b, t0 + 0.1))
        a, b = sorted((sx * WELL_X[0], sx * WELL_X[1]))
        out.append(sbox(a, t0 - SUNK_W - WELL_L, b, t0 - SUNK_W + 0.01))
    return out


def build_terrace():
    """the raised terrace in front of the shops (a stone slab from the shop front, under the floors'
    overhang, to its edge in front of it), its glass railing, the wide steps in the middle cut into
    it from the overhang's line (the ground floor's plan) with handrails, cypresses in pots; under its
    edge the basement's front over a sunken walk (basement())"""
    mb = MeshBuilder()
    t0, t1 = TERR_EDGE, POD_FRONT
    x0, x1 = X0, X1
    sx0, sx1 = X0 + STEPS[0], X0 + STEPS[1]
    st = STEPS_Y[0]
    # the slab either side of the steps, and behind them; its edge (a fascia) along the front
    for (a, b, y_front) in ((x0, sx0, t0), (sx1, x1, t0), (sx0, sx1, st)):
        mb.box(a, y_front, F1 - 0.3, b, t1, F1, 'Step stone', faces='xXyzZ')
    for (a, b) in ((x0, sx0), (sx1, x1)):
        mb.box(a, t0 - 0.03, F1 - 0.34, b, t0 + 0.24, F1 + 0.06, 'Step stone', faces='xXyZz')
        # the side walls of the cut, down to the steps
        xx = b if a == x0 else a
        mb.box(xx - 0.12 if a == x0 else xx, t0, 0.0, xx if a == x0 else xx + 0.12, st, F1, 'Step stone', faces='xXyZ')
    # its railing: glass between slim steel posts (renders 1, 2), along the edge, round both ends
    # and along the cut
    for (a, b) in ((x0 + 0.05, sx0), (sx1, x1 - 0.05)):
        _railing_glass(mb, a, b, t0 + 0.1, F1 + 0.06)
    for x in (x0 + 0.08, x1 - 0.08, sx0 - 0.08, sx1 + 0.08):
        L_ = (POD_FRONT - PIER_OUT if abs(x) > 16 else st) - t0
        with mb.at(x, t0, 0.0, math.pi / 2):
            _railing_glass(mb, 0.1, L_ - 0.05, 0.0, F1 + 0.06)
    nst = 10
    r, T = F1 / nst, (st - STEPS_Y[1]) / (nst - 1)
    for i in range(1, nst):
        mb.box(sx0, st - (nst - i) * T, 0.0, sx1, st + 0.01, i * r, 'Step stone', faces='xXyZ')
    for x in (sx0 + 0.12, sx1 - 0.12, (sx0 + sx1) / 2 - 2.5, (sx0 + sx1) / 2 + 2.5):
        _stair_rail(mb, x, STEPS_Y[1], st, r, F1)
    for u in (1.7, 7.3, 26.7, 32.3):
        F.cypress(mb, X0 + u, t0 + 0.6, F1, h=2.1, r=0.32)
    basement(mb, t0, t1)
    return mb


def basement(mb, t0, t1):
    zb, zt = BASEMENT_Z, F1 - 0.34
    yf = t0 + 0.1                      # the basement's front, under the terrace's edge
    piers = [X0 + u + PIER_W / 2 for u in PIERS]
    for sx in (-1, 1):
        a, b = sorted((sx * SUNK_X[0], sx * SUNK_X[1]))
        # pilasters under the shop's piers and at both ends; between them dark glazing with
        # horizontal bars, a door in the second bay from the end
        cols = sorted({a, b} | {p for p in piers if a + 0.5 < p < b - 0.5})
        for c in cols:
            w = 0.25 if c in (a, b) else 0.28
            mb.box(c - w, yf - 0.12, zb, c + w, yf, zt, 'Marble', faces='xXy')
        bays = list(zip(cols, cols[1:]))
        door_bay = bays[-2] if sx > 0 else bays[1]
        for (p, q) in bays:
            ga, gb = p + 0.28, q - 0.28
            holes = []
            if (p, q) == door_bay:
                m = (p + q) / 2
                d = (m - 0.62, m + 0.62, zb, zb + 2.15)
                holes.append(d)
                # the door: a dark wood leaf in a marble frame
                mb.box(d[0] - 0.12, yf - 0.06, zb, d[0], yf, d[3] + 0.12, 'Marble', faces='xXyZ')
                mb.box(d[1], yf - 0.06, zb, d[1] + 0.12, yf, d[3] + 0.12, 'Marble', faces='xXyZ')
                mb.box(d[0], yf - 0.06, d[3], d[1], yf, d[3] + 0.12, 'Marble', faces='yZz')
                mb.quad((d[0], yf + 0.05, d[2]), (d[1], yf + 0.05, d[2]), (d[1], yf + 0.05, d[3]), (d[0], yf + 0.05, d[3]), 'Door wood')
                F.side(mb, d[0], yf, yf + 0.05, d[2], d[3], 'Marble', 1)
                F.side(mb, d[1], yf, yf + 0.05, d[2], d[3], 'Marble', -1)
                mb.box(d[1] - 0.16, yf - 0.02, zb + 1.0, d[1] - 0.1, yf + 0.05, zb + 1.12, 'Railing metal')
            F.tiles(mb, ga, gb, zb, zt, yf + 0.02, holes, 'Basement glass')
            for h in holes:
                F.side(mb, h[0], yf, yf + 0.02, h[2], h[3], 'Marble', -1)
                F.side(mb, h[1], yf, yf + 0.02, h[2], h[3], 'Marble', 1)
            z = zb + 0.18
            while z < zt - 0.05:
                for (u0, u1) in ([(ga, gb)] if not holes else [(ga, holes[0][0] - 0.12), (holes[0][1] + 0.12, gb)]):
                    if u1 - u0 > 0.05:
                        mb.box(u0, yf - 0.03, z, u1, yf + 0.02, z + 0.035, 'Frame black', faces='yZz')
                z += 0.2
        # the sunken walk: its floor; retaining walls round it and round the stairs (to the
        # pavement); a stone edge along the front (renders 5, 8: no railing there), white railings
        # round the stairs and across the walk's end (renders 1, 2)
        ws = t0 - SUNK_W                    # the walk's front edge
        ys = ws - WELL_L                    # the stairs' head, at the pavement
        inner, outer = sx * SUNK_X[0], sx * SUNK_X[1]
        wi = sx * WELL_X[0]                 # the stairs' inner side (their outer side: the walk's end)
        wall = lambda xa, ya, xb, yb, z1=0.02: mb.box(min(xa, xb), min(ya, yb), zb, max(xa, xb), max(ya, yb), z1, 'Step stone')
        mb.cap([(a, ws), (b, ws), (b, yf), (a, yf)], zb, 'Paving grey')
        wall(inner, ws - 0.2, wi, ws)                       # along the front, to the stairs
        wall(sx * (STEPS[1] - W / 2), ws - 0.2, inner, yf)   # the inner end, against the main steps
        wall(outer, ys - 0.2, outer + 0.2 * sx, yf)          # the outer end and the stairs' outer side
        wall(wi - 0.2 * sx, ys - 0.2, wi, ws)               # the stairs' inner side
        wall(wi - 0.2 * sx, ys - 0.2, outer + 0.2 * sx, ys)  # behind the top step
        n = 6                               # risers of 0.15 m, going down northwards to the walk
        for k in range(n - 1):
            mb.box(min(wi, outer), ys + k * WELL_L / n, zb, max(wi, outer), ys + (k + 1) * WELL_L / n, -(k + 1) * (-zb) / n,
                   'Step stone', faces='xXYZ')
        mb.cap([(min(wi, outer), ws - WELL_L / n), (max(wi, outer), ws - WELL_L / n), (max(wi, outer), ws), (min(wi, outer), ws)],
               zb, 'Paving grey')
        mb.box(min(inner, wi), ws - 0.25, 0.0, max(inner, wi), ws + 0.05, 0.09, 'Step stone', faces='xXyYZ')
        for xr, y_from, L in ((wi - 0.1 * sx, ys, WELL_L), (outer + 0.1 * sx, ys, yf - ys)):
            mb.box(xr - 0.15, y_from, 0.0, xr + 0.15, y_from + L, 0.09, 'Step stone', faces='xXyYZ')
            with mb.at(xr, y_from, 0.0, math.pi / 2):
                _railing_metal(mb, 0.05, L - 0.05, 0.0, 0.09, mat='Railing white')
        # the basement behind its front, closed (dark); the terrace's front past the walk's ends; the
        # terrace closed at the building's end
        mb.box(a, yf + 0.06, zb, b, t1, zt, 'Interior dark', faces='yz')
        mb.box(min(outer, sx * W / 2), yf - 0.12, 0.0, max(outer, sx * W / 2), yf + 0.3, zt, 'Marble', faces='xXy')
        mb.box(sx * (STEPS[1] - W / 2), yf - 0.12, zb, inner, yf + 0.3, zt, 'Marble', faces='xXy')
        mb.box(min(sx * W / 2, sx * (W / 2 - 0.05)), t0, 0.0, max(sx * W / 2, sx * (W / 2 - 0.05)), t1, F1 - 0.3, 'Marble')


def _stair_rail(mb, x, y0, y1, r, top):
    """a handrail up a flight of steps (from y0 at the foot to y1 at the head): a straight sloped bar
    0.9 m over the nosings, three posts"""
    za, zb = r + 0.9, top + 0.9
    h, w = 0.05, 0.025
    q = [(x - w, -h / 2), (x + w, -h / 2), (x + w, h / 2), (x - w, h / 2)]
    lo = [(qx, y0, za + qz) for qx, qz in q]
    hi = [(qx, y1, zb + qz) for qx, qz in q]
    for i in range(4):
        j = (i + 1) % 4
        mb.quad(lo[i], lo[j], hi[j], hi[i], 'Railing metal')
    mb.face(lo[::-1], 'Railing metal')
    mb.face(hi, 'Railing metal')
    for yy in (y0 + 0.2, (y0 + y1) / 2, y1 - 0.1):
        zz = (yy - y0) / (y1 - y0) * (top - r) + r
        mb.box(x - 0.02, yy - 0.02, zz, x + 0.02, yy + 0.02, zz + 0.92, 'Railing metal')


def _railing_glass(mb, a, b, y, z, h=1.0):
    """glass panels between slim steel posts about 1.4 m apart, a steel handrail on top"""
    n = max(1, round((b - a) / 1.4))
    xs = [a + (b - a) * i / n for i in range(n + 1)]
    for x in xs:
        mb.box(x - 0.025, y - 0.025, z, x + 0.025, y + 0.025, z + h, 'Railing steel')
    mb.box(a, y - 0.035, z + h - 0.04, b, y + 0.035, z + h + 0.01, 'Railing steel')
    for p, q in zip(xs, xs[1:]):
        for yy, sgn in ((y, 1), (y, -1)):
            pts = [(p + 0.04, yy, z + 0.06), (q - 0.04, yy, z + 0.06), (q - 0.04, yy, z + h - 0.06), (p + 0.04, yy, z + h - 0.06)]
            mb.face(pts if sgn > 0 else pts[::-1], 'Railing glass')


def _railing_metal(mb, a, b, y, z, h=1.0, mat='Railing metal'):
    mb.box(a, y - 0.03, z + h - 0.05, b, y + 0.03, z + h, mat)
    mb.box(a, y - 0.02, z + 0.1, b, y + 0.02, z + 0.14, mat)
    n = max(1, int((b - a) / 0.12))
    for i in range(n + 1):
        x = a + (b - a) * i / n
        mb.box(x - 0.012, y - 0.012, z + 0.1, x + 0.012, y + 0.012, z + h - 0.05, mat, faces='xXyY')
    for x in (a, b):
        mb.box(x - 0.03, y - 0.03, z, x + 0.03, y + 0.03, z + h, mat)


# ---------- assembly ----------

def build_house(mats, col):
    ob = make_object('House podium', build_podium().to_mesh('House podium', mats), col)
    ob['part'] = 'podium'
    ob = make_object('House terrace', build_terrace().to_mesh('House terrace', mats), col)
    ob['part'] = 'terrace'
    typical_slab = build_slab(FIRST + 1).to_mesh('slab typical', mats)
    walls_cache = {}
    floors = []
    for n in range(FIRST, TOP + 1):
        if n in (FIRST, TOP):
            so = make_object(f'A floor {n:02d}', build_slab(n).to_mesh(f'slab {n}', mats), col)
        else:
            so = make_object(f'A floor {n:02d}', typical_slab, col)
            so.location.z = L(n) - L(FIRST + 1)
        so['tower'], so['floor'], so['part'] = 'A', n, 'slab'
        key = n if n in (FIRST, TOP - 1, TOP) else 'typ'
        if key not in walls_cache:
            walls_cache[key] = (build_walls(n).to_mesh(f'walls {key}', mats), n)
        me, n0 = walls_cache[key]
        wo = make_object(f'A walls {n:02d}', me, col)
        wo.location.z = L(n) - L(n0)
        wo['tower'], wo['floor'], wo['part'] = 'A', n, 'walls'
        # (one plan for floors 3-10: the sketch's typical floor; no plan of the top floor's terraces yet)
        floors.append(dict(floor=n, z=round(L(n), 3), h=ST, plan='typ'))
    ro = make_object('A roof', build_roof().to_mesh('A roof', mats), col)
    ro['tower'], ro['part'] = 'A', 'roof'
    # the flats' pick volumes: the viewer picks flats with them and lights the floor under the pointer
    # (amber, a white outline round each flat). Each is the flat's outline grown out through the
    # facade to 0.15 m in front of it, so the light shows outside the walls (alibinokor grows its
    # outlines by 0.2 m; here the walls are deeper); the stair hall's recess stays empty.
    with open(os.path.join(os.path.dirname(__file__), 'plan.json')) as f:
        plan = json.load(f)
    outs = [Polygon(a['outline']).buffer(0) for a in plan['apartments']]
    core = [z for z in NORTH if z['kind'] == 'core'][0]
    void = sbox(X1 - core['u1'], Y1 - CORE_D, X1 - core['u0'], Y1 + 1)
    for key, n0, ns in (('typ', FIRST, range(FIRST, TOP)), ('top', TOP, [TOP])):
        shell = outline(n0).buffer(0.15, join_style='mitre')
        band = shell.difference(outline(n0).buffer(-0.9, join_style='mitre')).difference(void)
        given = Polygon()
        for i, o in enumerate(outs):
            g = unary_union([o, o.buffer(1.5, join_style='mitre').intersection(band)]).intersection(shell)
            g = g.difference(unary_union([q for j, q in enumerate(outs) if j != i])).difference(given).buffer(0)
            given = given.union(g)
            mb = MeshBuilder()
            for part in getattr(g.simplify(0.02), 'geoms', [g.simplify(0.02)]):
                if part.area > 0.05:
                    mb.prism(list(part.exterior.coords)[:-1], -0.15, ST - 0.1, 'Pick', 'Pick', 'Pick')
            me = mb.to_mesh(f'pick {key} {i}', mats)
            for n in ns:
                po = make_object(f'A pick {n:02d}-{i}', me, col)
                po.location.z = L(n) + SLAB
                po['pick'], po['tower'], po['floor'], po['unit'] = True, 'A', n, i
    ring = [[round(x, 2), round(y, 2)] for x, y in list(outline(FIRST).exterior.coords)[:-1]]
    return dict(key='A', label='Дом', tj='Бино', centre=[0.0, 0.0], rot=0.0, plan_centre=[0.0, 0.0], slab=SLAB,
                floors=floors, levels=TOP, top=round(BLOCK_TOP + 1.5, 3), sales=True, outline=ring)


def house_extent():
    return dict(x0=X0, x1=X1, y0=STEPS_Y[1], y1=Y1, stairs=(X0 + STEPS[0], X0 + STEPS[1], STEPS_Y[1]), sunken=sunken())
