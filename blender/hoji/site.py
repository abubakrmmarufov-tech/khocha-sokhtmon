"""The grounds round the house, laid out after the client's aerial renders (1, 2, 3, 7: their ground
back-projected onto a plan, tools/ortho.py) and the street views (5, 8):

  front   the street (two lanes), a lay-by with perpendicular parking along the house, a lawn strip
          with date palms, the forecourt in pink and cream pavers up to the shop terrace and its
          steps, tall street lamps at both ends;
  sides   paved walks along both ends of the house, gardens beyond them: lawns edged with clipped
          hedges and flower beds, flowering trees (pink and white), cypresses, benches, lamps,
          a white pergola in each garden;
  back    a parking court along the back of the house (perpendicular bays, palms in planters
          between them), the ramp down to the underground garage, the parterre round a round
          fountain with a ring of yellow flowers, an east-west walk with flower beds, a service
          drive to the street behind.

Site metres: x east, y north, the house centred on the origin, its shop front facing south.
The viewer gets the trees, palms, cars and people as lists (complex.json); the rest is one mesh.
"""
import math
import random

from shapely.geometry import LineString, Point, Polygon, box as sbox
from shapely.ops import unary_union

from . import facade as F
from .geom import MeshBuilder, make_object, rect_ring, ccw

# the block between the streets (kerb lines)
BX0, BX1, BY0, BY1 = -82.0, 82.0, -25.3, 74.0
# the main street in front, a boulevard (renders 1, 5, 8 on the new cameras): the near roadway from the
# block's kerb (a white line along its middle), a green with round clipped shrubs and tall lamps, the
# far roadway
NEAR_S = -41.3              # the near roadway's far kerb = the green's near edge
GREEN_S = -60.0             # the green's far edge
MAIN_S = -74.0              # the far roadway's far kerb
LAY = (-19.0, 17.7, -22.5)  # the lay-by in front of the house: x from, x to, the bays' back kerb (render 1)
ROAD_SIDE = 10.0            # the other streets
WALK = 3.6                  # sidewalks on the far sides of the streets
FOUNT = (0.0, 31.8)         # the fountain (render 7)


def poly_ring(g):
    """a shapely polygon's outer ring, counter-clockwise, without the closing point"""
    return ccw([tuple(p) for p in list(g.exterior.coords)[:-1]])


# where renders 5 and 8 were taken from (tools/cams.json): the lines from there to the house stay
# open, nothing tall is planted within 17 m of them on the far side of the main street
VIEWPOINTS = ((-66.1, -99.1), (56.7, -94.5))


def in_view(x, y, width=17.0):
    for (cx, cy) in VIEWPOINTS:
        if y > MAIN_S or y < cy - 8:
            continue
        L = math.hypot(cx, cy)
        t = max(0.0, min(1.0, ((x - cx) * -cx + (y - cy) * -cy) / (L * L)))
        px, py = cx + t * -cx, cy + t * -cy
        if math.hypot(x - px, y - py) < width:
            return True
    return False


class Site:
    def __init__(self, house):
        self.h = house
        self.mb = MeshBuilder()
        self.rnd = random.Random(11)
        self.trees = []            # [x, y, z, height, radius, kind]
        self.palms = []            # [x, y, z, height, lean, turn]
        self.cars = []             # [x, y, z, heading (plan, from east, ccw), variant, paint?, body?]
        self.people = []           # [x, y, z, k]
        self.lawns = []            # shapely polygons (for planting)
        self.shrub_beds = []       # ... of them, planted with shrubs and small cypresses only
        self.taken = []            # shapely geometries trees must keep clear of

    # ---------- primitives ----------
    def cap(self, g, z, mat):
        for part in getattr(g, 'geoms', [g]):
            if part.is_empty or part.area < 0.01:
                continue
            if len(part.interiors):
                # split a polygon with holes into simple pieces along its holes' centres
                pieces = self._split_holes(part)
                for p in pieces:
                    self.mb.cap(poly_ring(p), z, mat)
            else:
                self.mb.cap(poly_ring(part), z, mat)

    def _split_holes(self, g):
        out = []
        xs = sorted({round(Polygon(h).centroid.x, 3) for h in g.interiors})
        x0, y0, x1, y1 = g.bounds
        cuts = [x0 - 1] + xs + [x1 + 1]
        for a, b in zip(cuts, cuts[1:]):
            part = g.intersection(sbox(a, y0 - 1, b, y1 + 1))
            for q in getattr(part, 'geoms', [part]):
                if isinstance(q, Polygon) and q.area > 0.01:
                    if len(q.interiors):
                        out.extend(self._split_holes_y(q))
                    else:
                        out.append(q)
        return out

    def _split_holes_y(self, g):
        out = []
        ys = sorted({round(Polygon(h).centroid.y, 3) for h in g.interiors})
        x0, y0, x1, y1 = g.bounds
        cuts = [y0 - 1] + ys + [y1 + 1]
        for a, b in zip(cuts, cuts[1:]):
            part = g.intersection(sbox(x0 - 1, a, x1 + 1, b))
            for q in getattr(part, 'geoms', [part]):
                if isinstance(q, Polygon) and q.area > 0.01 and not len(q.interiors):
                    out.append(q)
        return out

    def band(self, g, z, prof, mat):
        """a moulding swept round a polygon's edge (prof: (out, up), out < 0 inside)"""
        for part in getattr(g, 'geoms', [g]):
            ring = poly_ring(part)
            self.mb.sweep([(x, y, z) for x, y in ring], prof, mat, closed=True)

    def lawn(self, g, hedge=True, flowers=None, z=0.02, raised=0.08, hedge_h=0.5, plant=True):
        """a lawn: a stone edge, the grass a little raised, a clipped hedge inside its edge and a band
        of flowers inside the hedge"""
        g = g.buffer(0)
        if g.is_empty:
            return
        self.band(g, z, [(0.0, 0.0), (0.0, raised + 0.04), (-0.12, raised + 0.04), (-0.12, 0.0)], 'Kerb')
        self.cap(g.buffer(-0.12, join_style='mitre'), z + raised, 'Lawn')
        inner = 0.12
        if hedge:
            self.band(g, z + raised, [(-inner, 0.0), (-inner, hedge_h - 0.08), (-inner - 0.06, hedge_h), (-inner - 0.5, hedge_h),
                                      (-inner - 0.56, hedge_h - 0.08), (-inner - 0.56, 0.0)], 'Hedge')
            inner += 0.56
        if flowers:
            self.band(g, z + raised, [(-inner, 0.0), (-inner, 0.2), (-inner - 0.08, 0.27), (-inner - 0.42, 0.27), (-inner - 0.5, 0.2),
                                      (-inner - 0.5, 0.0)], flowers)
            inner += 0.5
        if plant:
            for part in getattr(g, 'geoms', [g]):
                self.lawns.append(part.buffer(-inner - 0.4))

    # ---------- streets ----------
    def streets(self):
        mb = self.mb
        far = 240.0           # beyond this the viewer draws the plain and the streets on (src/world.js)
        # asphalt: the main street in front, the three others round the block, out to the city
        roads = [
            sbox(-far, NEAR_S, far, BY0),
            sbox(-far, MAIN_S, far, GREEN_S),
            sbox(-far, BY1, far, BY1 + ROAD_SIDE),
            sbox(BX0 - ROAD_SIDE, -far, BX0, far),
            sbox(BX1, -far, BX1 + ROAD_SIDE, far),
        ]
        for r in roads:
            self.cap(r, 0.0, 'Asphalt')
        # lines (not through the crossings)
        def dashes(x0, y0, x1, y1, dash=3.0, gap=6.0, w=0.12, skip=()):
            L = math.hypot(x1 - x0, y1 - y0)
            ux, uy = (x1 - x0) / L, (y1 - y0) / L
            t = 0.0
            while t < L:
                t1 = min(L, t + dash)
                ax, ay = x0 + ux * t, y0 + uy * t
                bx, by = x0 + ux * t1, y0 + uy * t1
                if not any(lo < (ax + bx) / 2 < hi or lo < (ay + by) / 2 < hi for lo, hi in skip):
                    nx, ny = -uy * w / 2, ux * w / 2
                    mb.face([(ax + nx, ay + ny, 0.02), (ax - nx, ay - ny, 0.02), (bx - nx, by - ny, 0.02), (bx + nx, by + ny, 0.02)], 'Road line')
                t += dash + gap
        crossings = ((BX0 - ROAD_SIDE - 3, BX0 + 3), (BX1 - 3, BX1 + ROAD_SIDE + 3))
        # the near roadway: one solid white line along it (render 1); the far one: lane dashes (render 5)
        dashes(-far, -34.6, far, -34.6, dash=40.0, gap=0.01, w=0.14, skip=crossings)
        dashes(-far, (GREEN_S + MAIN_S) / 2, far, (GREEN_S + MAIN_S) / 2, skip=crossings)
        cy2 = BY1 + ROAD_SIDE / 2
        dashes(-far, cy2, far, cy2, skip=crossings)
        for x in (BX0 - ROAD_SIDE / 2, BX1 + ROAD_SIDE / 2):
            dashes(x, -far, x, far, skip=((MAIN_S - 3, BY0 + 3), (BY1 - 3, BY1 + ROAD_SIDE + 3)))
        # zebra crossings at the corners of the block, over both roadways
        for x in (BX0 + 6, BX1 - 6):
            for k in range(7):
                xx = x - 3 + k * 0.9
                mb.cap(rect_ring(xx, NEAR_S + 0.6, xx + 0.5, BY0 - 0.6), 0.02, 'Road line')
                mb.cap(rect_ring(xx, MAIN_S + 0.6, xx + 0.5, GREEN_S - 0.6), 0.02, 'Road line')
        # the green between the roadways: kerbs, grass, a row of round clipped shrubs along each edge
        # (renders 5, 8), tall single-arm lamps along it reaching out over the roadways
        for (a, b) in ((-far, BX0 - ROAD_SIDE - 6), (BX0 + 6, BX1 - 6), (BX1 + ROAD_SIDE + 6, far)):
            if b - a < 4:
                continue
            mb.box(a, GREEN_S, 0.0, b, NEAR_S, 0.16, 'Kerb', faces='xXyYZ')
            mb.cap(rect_ring(a + 0.15, GREEN_S + 0.15, b - 0.15, NEAR_S - 0.15), 0.165, 'Lawn')
            for yy in (NEAR_S - 0.9, GREEN_S + 0.9):
                x = a + 1.0
                while x < b - 0.8:
                    if -150 < x < 150:
                        r = 0.42
                        mb.lathe([(0.0, 0.0), (r * 0.75, 0.0), (r, r * 0.55), (r * 0.92, r * 1.15), (r * 0.55, r * 1.5), (0.0, r * 1.62)],
                                 'Hedge', 9, x, yy, 0.165)
                    x += 1.55
        for x in range(-139, 140, 26):
            if BX0 - ROAD_SIDE - 6 < x < BX0 + 6 or BX1 - 6 < x < BX1 + ROAD_SIDE + 6:
                continue
            self.street_lamp(x, NEAR_S - 2.0, math.pi / 2)
            self.street_lamp(x + 13, GREEN_S + 2.0, -math.pi / 2)
        # and along the block's kerb either side of the lay-by (render 8)
        for x in (-39.3, 39.3):
            self.street_lamp(x, BY0 + 0.7, -math.pi / 2)
        # sidewalks on the far sides of the streets, a lawn strip with trees beyond them
        walks = [
            sbox(-far, MAIN_S - WALK, far, MAIN_S),
            sbox(-far, BY1 + ROAD_SIDE, far, BY1 + ROAD_SIDE + WALK),
            sbox(BX0 - ROAD_SIDE - WALK, -far, BX0 - ROAD_SIDE, far),
            sbox(BX1 + ROAD_SIDE, -far, BX1 + ROAD_SIDE + WALK, far),
        ]
        for w_ in walks:
            g = w_.difference(unary_union(roads))
            self.cap(g, 0.14, 'Paving grey')
        # kerbs along both sides of every street
        k = 0.18
        def kerb_line(x0, y0, x1, y1):
            mb.box(min(x0, x1), min(y0, y1), 0.0, max(x0, x1), max(y0, y1), 0.15, 'Kerb', faces='xXyYZ')
        kerb_line(-far, MAIN_S - k, far, MAIN_S)
        kerb_line(-far, BY1 + ROAD_SIDE, far, BY1 + ROAD_SIDE + k)
        kerb_line(BX0 - ROAD_SIDE - k, -far, BX0 - ROAD_SIDE, far)
        kerb_line(BX1 + ROAD_SIDE, -far, BX1 + ROAD_SIDE + k, far)
        # the city's ground beyond
        self.cap(sbox(-far, -far, far, far).difference(unary_union(self.h.get('sunken', []))), -0.04, 'Ground')
        # street trees in a verge along the far sidewalks
        rnd = self.rnd
        for x in range(-150, 151, 9):
            ty = MAIN_S - WALK - 2.2
            if not in_view(x, ty):      # (the views of renders 5 and 8 stay open)
                self.trees.append([x + rnd.uniform(-1, 1), ty, 0.0, rnd.uniform(7.5, 10.5), 3.0, 'broad' if x % 27 else 'blossom'])
            self.trees.append([x + rnd.uniform(-1, 1), BY1 + ROAD_SIDE + WALK + 2.2, 0.0, rnd.uniform(7.5, 10.5), 3.0, 'broad'])
        for y in range(-60, 131, 9):
            self.trees.append([BX0 - ROAD_SIDE - WALK - 2.2, y + rnd.uniform(-1, 1), 0.0, rnd.uniform(7.5, 10.5), 3.0, 'broad'])
            self.trees.append([BX1 + ROAD_SIDE + WALK + 2.2, y + rnd.uniform(-1, 1), 0.0, rnd.uniform(7.5, 10.5), 3.0, 'broad'])
        # traffic: cars along the streets (standing still)
        for x, k in ((-62, 0), (-31, 1), (8, 2), (44, 3), (95, 0), (-120, 2), (150, 1)):
            # driving on the right: westbound on the near roadway, eastbound on the far one
            y = [-30.8, -38.0, GREEN_S - 3.5, MAIN_S + 3.5][k]
            self.cars.append([x, y, 0.0, math.pi if k < 2 else 0.0, rnd.randrange(8)])
        for x in (-50, 20, 60):
            self.cars.append([x, BY1 + ROAD_SIDE / 2 + 2.3, 0.0, math.pi, rnd.randrange(8)])
        for y in (-5, 40):
            self.cars.append([BX0 - ROAD_SIDE / 2 - 2.3, y, 0.0, -math.pi / 2, rnd.randrange(8)])
            self.cars.append([BX1 + ROAD_SIDE / 2 + 2.3, y + 17, 0.0, math.pi / 2, rnd.randrange(8)])

    # ---------- the block's paving and kerb ----------
    def block(self):
        mb = self.mb
        # (less the sunken walk in front of the basement under the terrace, and its stairs)
        g = sbox(BX0, BY0, BX1, BY1).difference(unary_union(self.h.get('sunken', [])))
        self.cap(g, 0.02, 'Paving')
        # the block's kerb along the streets (open where the lay-by in front is let in)
        k = 0.2
        r_ = LAY[2] - BY0
        for (x0, y0, x1, y1) in ((BX0, BY0, LAY[0] - r_, BY0 + k), (LAY[1] + r_, BY0, BX1, BY0 + k), (BX0, BY1 - k, BX1, BY1),
                                 (BX0, BY0, BX0 + k, BY1), (BX1 - k, BY0, BX1, BY1)):
            mb.box(x0, y0, 0.0, x1, y1, 0.16, 'Kerb', faces='xXyYZ')

    # ---------- front ----------
    def front(self):
        mb, rnd = self.mb, self.rnd
        # the lay-by (render 1, measured on the new camera): asphalt let 2.8 m into the forecourt, the cars
        # nose in towards a lawn strip with date palms; no lines painted; rounded ends
        lx0, lx1, ly = LAY
        r_ = ly - BY0
        lay = sbox(lx0, BY0 - 0.01, lx1, ly)
        for cx, sgn in ((lx0, -1), (lx1, 1)):
            # a quarter round from the bays' back down to the street's kerb
            lay = lay.union(Point(cx, BY0).buffer(r_, 32).intersection(sbox(min(cx, cx + sgn * r_), BY0, max(cx, cx + sgn * r_), ly)))
        self.cap(lay, 0.03, 'Asphalt')
        # its kerb: round the west end, along the back, round the east end
        path = [(lx0 - r_ * math.cos(t * math.pi / 24), BY0 + r_ * math.sin(t * math.pi / 24)) for t in range(13)]
        path += [(lx1 + r_ * math.sin(t * math.pi / 24), BY0 + r_ * math.cos(t * math.pi / 24)) for t in range(13)]
        for a_, b_ in zip(path, path[1:]):
            L = math.hypot(b_[0] - a_[0], b_[1] - a_[1])
            if L < 1e-3:
                continue
            with mb.at(a_[0], a_[1], 0.0, math.atan2(b_[1] - a_[1], b_[0] - a_[0])):
                mb.box(0.0, 0.0, 0.0, L, 0.2, 0.16, 'Kerb', faces='xXyYZ')
        # cars in the bays (2.6 m apart), noses to the lawn strip
        bw = 2.6
        n = int((lx1 - lx0) / bw)
        x = lx0 + ((lx1 - lx0) - n * bw) / 2
        taken = {2, 7, 11}
        for i in range(n):
            if i in taken or rnd.random() < 0.12:
                continue
            cx = x + (i + 0.5) * bw
            self.cars.append([cx, ly - 2.45, 0.03, math.pi / 2 + rnd.uniform(-0.03, 0.03), rnd.randrange(8)])
        # the lawn strip with the date palms (one crossing either side of the steps)
        for (a_, b_) in ((lx0, -8.6), (-6.8, 6.8), (8.6, lx1)):
            self.lawn(sbox(a_, ly + 0.15, b_, ly + 2.3), hedge=False, flowers=None, raised=0.1)
        for px in (-17.0, -11.4, -5.6, 0.0, 5.6, 11.4, 17.0):
            if -8.6 < px < -6.8 or 6.8 < px < 8.6:
                continue
            self.palms.append([px, ly + 1.2, 0.12, rnd.uniform(8.6, 9.6), rnd.uniform(0.02, 0.06), rnd.uniform(0, 6.28)])
        # the walks along the street beyond the lay-by, lawns with benches and trees behind them
        for (x0, x1) in ((BX0 + 0.2, lx0 - 3.6), (lx1 + 3.6, BX1 - 0.2)):
            xa, xb = sorted((x0, x1))
            for (y0, y1, fl) in ((BY0 + 3.4, -14.2, 'Flowers red'), (-11.4, -3.0, 'Flowers pink')):
                ya = y0
                # a diagonal path across the long lawns (render 2)
                g = sbox(xa, ya, xb, y1)
                if xb - xa > 30:
                    mid = (xa + xb) / 2
                    diag = LineString([(mid - 8, ya), (mid + 8, y1)]).buffer(1.4, cap_style='flat')
                    g = g.difference(diag)
                for part in getattr(g, 'geoms', [g]):
                    if part.area > 6:
                        self.lawn(part, hedge=True, flowers=fl if rnd.random() < 0.7 else None, hedge_h=0.6)
            # benches along the walk between the two rows of lawns, facing south
            xs = [xa + 4 + k * 7 for k in range(int((xb - xa - 6) / 7))]
            for bx in xs:
                self.bench(bx, -12.9, math.pi)
        # flower beds and hedges at the forecourt's sides (render 8)
        for sx in (-1, 1):
            x0, x1 = sorted((sx * 21.6, sx * 24.0))
            self.lawn(sbox(x0, -19.0, x1, -3.0), hedge=True, flowers='Flowers red', hedge_h=0.7)
        # people on the forecourt and the walks
        for _ in range(26):
            x = rnd.uniform(-20, 19)
            y = rnd.uniform(-19.8, -17.4)
            self.people.append([round(x, 2), round(y, 2), 0.02, rnd.randrange(4)])
        for _ in range(14):
            x = rnd.choice([rnd.uniform(-78, -26), rnd.uniform(25, 78)])
            self.people.append([round(x, 2), round(rnd.uniform(-14.0, -11.6), 2), 0.02, rnd.randrange(4)])

    # ---------- across the main street ----------
    def across(self):
        """the far side of the main street (render 5's foreground, render 7's distance): lawns with
        low clipped hedges and flower beds, a few low round shrubs; nothing taller than a metre in
        the view of the house from across the street"""
        rnd = self.rnd
        y_walk = MAIN_S - WALK
        for (y0, y1) in ((-98.0, y_walk - 0.3), (-126.0, -100.6)):
            x = -95.0
            while x < 95.0:
                w = rnd.uniform(16.0, 24.0)
                g = sbox(x, y0, min(95.0, x + w), y1)
                self.lawn(g, hedge=True, flowers=rnd.choice(['Flowers pink', 'Flowers white', 'Flowers yellow', None]),
                          hedge_h=0.55, plant=False)
                x0_, y0_, x1_, y1_ = g.bounds
                for _ in range(int(g.area / 60)):
                    px, py = rnd.uniform(x0_ + 1.5, x1_ - 1.5), rnd.uniform(y0_ + 1.5, y1_ - 1.5)
                    self.trees.append([px, py, 0.1, rnd.uniform(0.7, 1.0), 0.7, 'small'])
                # trees on it, out of the two sight lines (render 7 shows a park there)
                for _ in range(int(g.area / 40)):
                    px, py = rnd.uniform(x0_ + 2.0, x1_ - 2.0), rnd.uniform(y0_ + 2.0, y1_ - 2.0)
                    if in_view(px, py):
                        continue
                    k = rnd.random()
                    kind = 'blossom' if k < 0.15 else 'white' if k < 0.22 else 'conifer' if k < 0.32 else 'broad'
                    h = rnd.uniform(4.0, 6.0) if kind in ('blossom', 'white') else rnd.uniform(4.5, 7.0) if kind == 'conifer' else rnd.uniform(7.0, 10.5)
                    self.trees.append([px, py, 0.1, h, 3.0 if kind == 'broad' else 2.2, kind])
                x += w + 2.4
            for k in range(9):
                self.garden_lamp(-88 + k * 22.0, y0 - 1.3)

    # ---------- the ends: walks and gardens ----------
    def sides(self):
        rnd = self.rnd
        # west garden (beyond the walk along the west end), east garden likewise
        for sx in (-1, 1):
            xa, xb = sorted((sx * 26.5, sx * (BX1 - 0.4)))
            # lawns in a grid of walks, a diagonal walk through the middle
            ys = [(-0.4, 14.0), (16.6, 32.0), (34.6, 44.2)]
            for (y0, y1) in ys:
                g = sbox(xa, y0, xb, y1)
                cut = []
                xm = (xa + xb) / 2
                cut.append(sbox(xm - 1.4, y0 - 1, xm + 1.4, y1 + 1))
                if y0 < 0:
                    cut.append(LineString([(xa + 4, y0), (xm - 1.4, y1)]).buffer(1.3, cap_style='flat'))
                g = g.difference(unary_union(cut))
                for part in getattr(g, 'geoms', [g]):
                    if part.area > 8:
                        self.lawn(part, hedge=True, flowers=rnd.choice(['Flowers pink', 'Flowers white', 'Flowers red', None]), hedge_h=0.65)
            # benches along the walks
            for k in range(6):
                bx = xa + 5 + k * ((xb - xa - 10) / 5)
                self.bench(bx, 15.3, 0.0 if k % 2 else math.pi)
                self.bench(bx, 33.3, 0.0 if k % 2 else math.pi)
            # garden lamps
            for k in range(5):
                bx = xa + 3 + k * ((xb - xa - 6) / 4)
                self.garden_lamp(bx, -2.0)
                self.garden_lamp(bx, 45.5)
        # the white pergolas (renders 1, 7): over a walk in each garden
        self.pergola(-46.0, 15.3, 13.0, 4.2, 0.0)
        self.pergola(46.0, 33.3, 13.0, 4.2, 0.0)

    # ---------- back ----------
    def back(self):
        mb, rnd = self.mb, self.rnd
        # (render 3, measured with its camera) along the podium's back wall a lawn strip in the shadow of
        # the floors over it, open at the back door's steps; at the ends likewise
        wb = 8.85                      # the podium's back wall (blender/hoji/building.py POD_BACK)
        for g in (sbox(-17.0, wb, 0.55, 9.6), sbox(3.05, wb, 17.0, 9.6),
                  sbox(-18.25, -9.25, -17.06, 9.6), sbox(17.06, -9.25, 18.25, 9.6)):
            self.lawn(g, hedge=False, flowers=None, raised=0.06, plant=False)
        # a paved lane; the parking: one grey pad, no lines, the cars backed in across it (dark, white,
        # dark either side of the middle); in front of their noses a lawn strip with a kerb, the palms
        # standing in it (at both ends and between the cars) with clumps of shrubs at their feet
        px0, px1, py0, py1 = -16.6, 12.6, 11.4, 16.3
        self.cap(sbox(px0, py0, px1, py1), 0.035, 'Paving grey')
        for (cx, paint, nose) in ((10.0, 0x24272c, 1), (5.9, 0xe8e9eb, -1), (2.6, 0x24272c, 1),
                                  (-2.6, 0x24272c, 1), (-7.2, 0xe8e9eb, -1), (-11.4, 0x1c2638, 1)):
            self.cars.append([cx, (py0 + py1) / 2 + 0.1, 0.035, nose * math.pi / 2 + rnd.uniform(-0.03, 0.03), rnd.randrange(8),
                              paint, 'saloon'])
        self.lawn(sbox(px0, py1, px1, py1 + 0.9), hedge=False, flowers=None, raised=0.1, plant=False)
        for px in (12.0, 6.5, -0.6, -10.0, -15.4):
            self.palms.append([px, py1 + 0.45, 0.14, rnd.uniform(7.4, 8.4), rnd.uniform(0.01, 0.04), rnd.uniform(0, 6.28)])
        for (a_, b_) in ((10.8, 12.5), (-2.9, -1.0), (-16.5, -14.2)):
            n = 4
            for k in range(n):
                x = a_ + (b_ - a_) * (k + 0.5) / n
                self.trees.append([round(x + rnd.uniform(-0.2, 0.2), 2), round(py1 + 0.45 + rnd.uniform(-0.15, 0.15), 2), 0.14,
                                   rnd.uniform(0.8, 1.15), 0.55, 'small'])
        # (the walk beyond it is the court's paving; the parterre's beds begin 2.6 m on)
        # the ramp down to the garage (render 2): west of the parterre, down towards the house
        self.ramp(-25.4, -21.4, 22.0, 40.0, 3.2)
        # the service drive from the ramp to the street behind
        # (paving already; kerbs along it)
        for x in (-26.0, -20.8):
            mb.box(x - 0.1, 40.0, 0.02, x + 0.1, BY1 - 0.2, 0.14, 'Kerb', faces='xXyYZ')
        # the parterre round the fountain
        self.parterre()
        # the walk along the north with flower beds (render 7)
        for (a, b) in ((-80.0, -27.0), (-19.6, 80.0)):
            self.lawn(sbox(a, 48.2, b, BY1 - 3.0), hedge=True, flowers='Flowers yellow', hedge_h=0.65)
        for k in range(14):
            x = -75 + k * 11.5
            if -28 < x < -19:
                continue
            self.garden_lamp(x, 47.0)

    def ramp(self, x0, x1, ya, yb, depth):
        """a sunken ramp between retaining walls with railings: ground level at yb, down to -depth
        at ya, where a garage door in a portal faces up the ramp"""
        mb = self.mb
        w = x1 - x0
        # the ramp's floor (concrete), sloping
        z = lambda y: -depth * max(0.0, min(1.0, (yb - y) / (yb - ya - 3.0)))
        n = 12
        ys = [ya + (yb - ya) * k / n for k in range(n + 1)]
        for k in range(n):
            a, b = ys[k], ys[k + 1]
            mb.quad((x0, a, z(a)), (x1, a, z(a)), (x1, b, z(b)), (x0, b, z(b)), 'Ramp')
        # retaining walls both sides (top 0.25 over the ground), their inner faces down to the floor
        t = 0.3
        for xx, side in ((x0 - t, -1), (x1, 1)):
            mb.box(xx, ya - 0.5, 0.0, xx + t, yb, 0.25, 'Kerb', faces='xXyYZ')
            for k in range(n):
                a, b = ys[k], ys[k + 1]
                xf = x0 if side < 0 else x1
                if side < 0:      # the west wall's inner face, facing east into the ramp
                    mb.quad((xf, a, z(a)), (xf, b, z(b)), (xf, b, 0.25), (xf, a, 0.25), 'Retaining wall')
                else:             # the east wall's, facing west
                    mb.quad((xf, b, z(b)), (xf, a, z(a)), (xf, a, 0.25), (xf, b, 0.25), 'Retaining wall')
            # railings on top
            with mb.at(xx + t / 2, ya - 0.5, 0.0, math.pi / 2):
                self._railing(0.0, yb - ya + 0.5, 0.0, 0.25)
        # the portal at the bottom: a wall across with the garage door, a slab over it
        mb.box(x0 - t, ya - 1.0, -depth, x1 + t, ya, 0.25, 'Retaining wall', faces='YZ')
        mb.quad((x1 - 0.3, ya + 0.01, -depth), (x0 + 0.3, ya + 0.01, -depth), (x0 + 0.3, ya + 0.01, -depth + 2.6), (x1 - 0.3, ya + 0.01, -depth + 2.6), 'Garage door')
        for k in range(1, 13):
            zz = -depth + k * 0.2
            mb.box(x0 + 0.3, ya + 0.01, zz - 0.015, x1 - 0.3, ya + 0.04, zz + 0.015, 'Door metal', faces='YZz')
        with mb.at(x0 - t, ya - 0.3, 0.0, 0.0):
            self._railing(0.0, w + 2 * t, 0.0, 0.25)
        # lawn islands with shrubs along both sides (render 2)
        for (a, b) in ((x0 - 3.2, x0 - 0.5), (x1 + 0.5, x1 + 3.0)):
            self.lawn(sbox(a, ya + 1.0, b, yb - 1.0), hedge=False, flowers='Flowers white')
            for k in range(3):
                yy = ya + 3 + k * (yb - ya - 6) / 2
                self.trees.append([(a + b) / 2, yy, 0.1, 2.0, 0.8, 'conifer'])

    def parterre(self):
        mb, rnd = self.mb, self.rnd
        fx, fy = FOUNT
        # the walks: an axis north-south and east-west, the round plaza in the middle
        plaza = Point(fx, fy).buffer(8.0, 48)
        axes = unary_union([sbox(fx - 2.6, 19.0, fx + 2.6, 49.0), sbox(-17.0, fy - 2.6, 17.0, fy + 2.6)])
        field = sbox(-17.0, 19.8, 17.0, 46.6)
        quads = field.difference(unary_union([plaza, axes]))
        for part in getattr(quads, 'geoms', [quads]):
            if part.area < 5:
                continue
            # each quarter in two: a lawn and, at its inner corner, a stepped bed (render 7); the two next to
            # the parking: green shrubs, white flowers, small cypresses (render 3)
            near = part.bounds[1] < 21.0
            self.lawn(part, hedge=True, flowers='Flowers white' if near else 'Flowers pink', hedge_h=0.7)
            if near:
                self.shrub_beds.append(part)
        # the fountain
        self.fountain(fx, fy)
        # benches round the plaza, facing the fountain
        for k in range(8):
            a = (k + 0.5) * math.pi / 4
            self.bench(fx + 6.6 * math.cos(a), fy + 6.6 * math.sin(a), a + math.pi / 2)
        # cypresses in pairs at the axes' ends, small flowering trees in the lawns
        for (x, y) in ((fx - 3.4, 20.6), (fx + 3.4, 20.6), (fx - 3.4, 45.8), (fx + 3.4, 45.8),
                       (-16.0, fy - 3.4), (-16.0, fy + 3.4), (16.0, fy - 3.4), (16.0, fy + 3.4)):
            F.cypress(mb, x, y, 0.02, h=2.6, r=0.38)
        for (x, y) in ((-11.5, 27.5), (11.5, 27.5), (-11.5, 41.6), (11.5, 41.6)):
            self.trees.append([x, y, 0.1, rnd.uniform(4.8, 5.8), 2.2, 'white' if x * y > 0 else 'blossom'])
        for (x, y) in ((fx - 4.6, 20.5), (fx + 4.6, 20.5), (fx - 4.6, 47.6), (fx + 4.6, 47.6)):
            self.garden_lamp(x, y)
        for _ in range(16):
            a = rnd.uniform(0, 6.28)
            r = rnd.uniform(5.2, 7.6)
            self.people.append([round(fx + r * math.cos(a), 2), round(fy + r * math.sin(a), 2), 0.02, rnd.randrange(4)])

    # ---------- garden pieces ----------
    def fountain(self, cx, cy):
        """round fountain (renders 3, 7): a basin on a low stone rim in a ring of yellow flowers, a
        bowl on a stem in the middle, a jet"""
        mb = self.mb
        seg = 48
        ring = lambda r: [(cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
        # stone ring round the flowers, the flower ring, the basin's rim
        mb.prism(ring(5.0), 0.02, 0.22, 'Kerb', 'Kerb')
        mb.prism(ring(4.75), 0.22, 0.5, 'Flowers yellow', 'Flowers yellow')
        mb.prism(ring(3.55), 0.02, 0.72, 'Fountain stone', None)
        mb.lathe([(3.55, 0.72), (3.6, 0.75), (3.6, 0.8), (3.3, 0.82), (3.25, 0.72), (3.25, 0.2)], 'Fountain stone', seg, cx, cy, 0.0)
        mb.cap(ring(3.26), 0.58, 'Pool water')
        mb.lathe([(0.0, 0.58), (0.42, 0.58), (0.3, 0.9), (0.24, 1.3), (0.3, 1.4), (1.05, 1.55), (1.12, 1.66), (0.95, 1.7), (0.0, 1.7)],
                 'Fountain stone', 32, cx, cy, 0.0)
        mb.lathe([(0.0, 1.62), (0.9, 1.62), (0.0, 1.63)], 'Pool water', 24, cx, cy, 0.0)
        mb.lathe([(0.16, 1.66), (0.08, 3.0), (0.02, 3.7), (0.0, 3.75)], 'Jet water', 12, cx, cy, 0.0)
        mb.lathe([(0.98, 1.64), (0.82, 2.4), (0.45, 3.2), (0.08, 3.6), (0.0, 3.62)], 'Jet water', 20, cx, cy, 0.0)

    def bench(self, x, y, rot):
        mb = self.mb
        with mb.at(x, y, 0.0, rot):
            for k in range(4):
                mb.box(-0.9, -0.22 + k * 0.12, 0.42, 0.9, -0.13 + k * 0.12, 0.46, 'Bench wood')
            for k in range(3):
                mb.box(-0.9, 0.24, 0.55 + k * 0.12, 0.9, 0.28, 0.64 + k * 0.12, 'Bench wood')
            for sx in (-0.75, 0.75):
                mb.box(sx - 0.03, -0.22, 0.0, sx + 0.03, 0.22, 0.42, 'Bench metal')
                mb.box(sx - 0.03, 0.22, 0.0, sx + 0.03, 0.27, 0.9, 'Bench metal')
        self.taken.append(Point(x, y).buffer(1.4))

    def garden_lamp(self, x, y):
        mb = self.mb
        mb.cylinder(x, y, 0.0, 0.45, 0.12, 'Lamp pole', 8)
        mb.cylinder(x, y, 0.45, 3.4, 0.05, 'Lamp pole', 8)
        mb.lathe([(0.0, 3.4), (0.16, 3.42), (0.2, 3.5), (0.17, 3.85), (0.21, 3.9), (0.08, 4.05), (0.0, 4.08)], 'Lamp white', 10, x, y, 0.0)
        self.taken.append(Point(x, y).buffer(1.0))

    def street_lamp(self, x, y, heading):
        """a tall street lamp (render 8): a tapered pole, an arm curving out over the street and
        a flat lamp head"""
        mb = self.mb
        H = 9.0
        mb.lathe([(0.0, 0.0), (0.22, 0.0), (0.2, 0.6), (0.12, 0.8), (0.11, H * 0.6), (0.075, H), (0.0, H)], 'Lamp pole', 12, x, y, 0.0)
        dx, dy = math.cos(heading), math.sin(heading)
        pts = []
        for k in range(9):
            t = k / 8
            out = 2.2 * math.sin(t * math.pi / 2)
            up = 0.9 * math.sin(t * math.pi) * 0.6 + (1 - math.cos(t * math.pi / 2)) * 0.25
            pts.append((x + dx * out, y + dy * out, H - 0.3 + up))
        for a, b in zip(pts, pts[1:]):
            L = math.dist(a, b)
            ang = math.atan2(b[1] - a[1], b[0] - a[0])
            with mb.at(a[0], a[1], 0.0, ang):
                hz = (b[2] - a[2])
                mb.box(0.0, -0.045, a[2] - 0.045, L, 0.045, max(a[2], b[2]) + 0.045, 'Lamp pole')
        ex, ey, ez = pts[-1]
        with mb.at(ex, ey, 0.0, heading):
            mb.box(-0.15, -0.22, ez - 0.16, 0.65, 0.22, ez + 0.02, 'Lamp pole')
            mb.box(-0.1, -0.18, ez - 0.17, 0.6, 0.18, ez - 0.16, 'Lamp white', faces='z')
        self.taken.append(Point(x, y).buffer(1.5))

    def pergola(self, cx, cy, L, W, rot):
        """a white pergola over a walk (renders 1, 7): posts in pairs, beams along, slats across"""
        mb = self.mb
        h = 2.9
        with mb.at(cx, cy, 0.0, rot):
            mb.box(-L / 2 - 0.8, -W / 2 - 0.8, 0.02, L / 2 + 0.8, W / 2 + 0.8, 0.06, 'Paving grey', faces='Z')
            nx = 6
            for i in range(nx):
                x = -L / 2 + i * L / (nx - 1)
                for y in (-W / 2, W / 2):
                    mb.box(x - 0.14, y - 0.14, 0.06, x + 0.14, y + 0.14, 0.3, 'Pergola white')
                    mb.box(x - 0.11, y - 0.11, 0.3, x + 0.11, y + 0.11, h, 'Pergola white')
            for y in (-W / 2, W / 2):
                mb.box(-L / 2 - 0.6, y - 0.1, h, L / 2 + 0.6, y + 0.1, h + 0.32, 'Pergola white')
            x = -L / 2 - 0.4
            while x <= L / 2 + 0.4:
                mb.box(x - 0.05, -W / 2 - 0.7, h + 0.32, x + 0.05, W / 2 + 0.7, h + 0.52, 'Pergola white')
                x += 0.55
            for i in range(nx - 1):
                x = -L / 2 + (i + 0.5) * L / (nx - 1)
                for y, r in ((-W / 2 + 0.55, math.pi / 2), (W / 2 - 0.55, -math.pi / 2)):
                    pass
        self.taken.append(sbox(cx - L / 2 - 1, cy - W / 2 - 1, cx + L / 2 + 1, cy + W / 2 + 1))

    def _railing(self, a, b, y, z, h=1.0):
        mb = self.mb
        mb.box(a, y - 0.03, z + h - 0.05, b, y + 0.03, z + h, 'Railing metal')
        mb.box(a, y - 0.02, z + 0.1, b, y + 0.02, z + 0.14, 'Railing metal')
        n = max(1, int((b - a) / 0.14))
        for i in range(n + 1):
            x = a + (b - a) * i / n
            mb.box(x - 0.012, y - 0.012, z + 0.1, x + 0.012, y + 0.012, z + h - 0.05, 'Railing metal', faces='xXyY')
        for x in (a, b):
            mb.box(x - 0.03, y - 0.03, z, x + 0.03, y + 0.03, z + h, 'Railing metal')

    # ---------- planting ----------
    def plant(self):
        """trees on the lawns: flowering trees (pink, white), broadleaf trees, cypresses, small
        conifers, the way the renders mix them; kept off the walks, benches and lamps"""
        rnd = self.rnd
        taken = unary_union(self.taken) if self.taken else None
        house = sbox(-20, -16, 20, 12)
        placed = []
        for g in self.lawns:
            if g.is_empty or g.area < 6:
                continue
            for part in getattr(g, 'geoms', [g]):
                if part.area < 4:
                    continue
                shrubs = any(part.intersects(b) for b in self.shrub_beds)
                n = max(1, int(part.area / (12 if shrubs else 26)))
                x0, y0, x1, y1 = part.bounds
                tries = 0
                while n > 0 and tries < 60:
                    tries += 1
                    p = Point(rnd.uniform(x0, x1), rnd.uniform(y0, y1))
                    if not part.contains(p) or house.contains(p):
                        continue
                    if taken is not None and taken.contains(p):
                        continue
                    if any(p.distance(q) < (2.2 if shrubs else 3.3) for q in placed):
                        continue
                    k = rnd.random()
                    if shrubs:
                        if k < 0.5:
                            self.trees.append([p.x, p.y, 0.1, rnd.uniform(1.2, 2.0), 1.0, 'small'])
                        elif k < 0.78:
                            self.trees.append([p.x, p.y, 0.1, rnd.uniform(2.4, 3.4), 0.6, 'conifer'])
                        else:
                            self.trees.append([p.x, p.y, 0.1, rnd.uniform(1.8, 2.6), 1.2, 'white'])
                    elif k < 0.3:
                        self.trees.append([p.x, p.y, 0.1, rnd.uniform(4.8, 6.4), 2.4, 'blossom'])
                    elif k < 0.48:
                        self.trees.append([p.x, p.y, 0.1, rnd.uniform(4.5, 6.0), 2.2, 'white'])
                    elif k < 0.62:
                        self.trees.append([p.x, p.y, 0.1, rnd.uniform(3.4, 5.2), 0.8, 'conifer'])
                    elif k < 0.72:
                        self.trees.append([p.x, p.y, 0.1, rnd.uniform(2.6, 3.6), 1.4, 'small'])
                    else:
                        self.trees.append([p.x, p.y, 0.1, rnd.uniform(6.5, 9.5), 3.0, 'broad'])
                    placed.append(p)
                    n -= 1
                # round bushes along the lawn's edge, inside the hedge
                ring = LineString(list(part.exterior.coords))
                L = ring.length
                k = 0.0
                while k < L:
                    q = ring.interpolate(k)
                    if rnd.random() < 0.55 and not (taken is not None and taken.contains(q)) and not house.contains(q):
                        self.trees.append([q.x, q.y, 0.1, rnd.uniform(1.0, 1.8), 0.9, 'small'])
                    k += rnd.uniform(2.5, 5.0)

    def build(self, mats, col):
        self.streets()
        self.block()
        self.front()
        self.across()
        self.sides()
        self.back()
        self.plant()
        self.people = []        # the renders show nobody
        me = self.mb.to_mesh('Site', mats)
        return make_object('Site', me, col)
