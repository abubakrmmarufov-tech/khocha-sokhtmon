"""Pieces of the facades, drawn in a facade's own frame: u along the wall (metres from its left end
as seen from outside), y into the building (the wall's outer face at y = 0, outward is -y), z up.

Every piece takes `p`, how far its wall plane stands out in front of the facade line (a risalit
stands out 0.3 m: p = 0.3, its face at y = -0.3).
"""
import math

GROOVE = 0.045     # rustication: gap between the blocks
RUSTIC_OUT = 0.06  # blocks stand this far out of their wall


def wallq(mb, u0, u1, z0, z1, y, mat, uvs=None):
    """a wall quad facing outward (-y)"""
    if u1 - u0 < 1e-4 or z1 - z0 < 1e-4:
        return
    mb.quad((u0, y, z0), (u1, y, z0), (u1, y, z1), (u0, y, z1), mat, uvs=uvs)


def side(mb, u, y0, y1, z0, z1, mat, facing):
    """a return face at u between depths y0 < y1, facing +u (facing=1) or -u (facing=-1)"""
    if y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
        return
    if facing > 0:
        mb.quad((u, y0, z0), (u, y1, z0), (u, y1, z1), (u, y0, z1), mat)
    else:
        mb.quad((u, y1, z0), (u, y0, z0), (u, y0, z1), (u, y1, z1), mat)


def flat(mb, u0, u1, y0, y1, z, mat, up=True):
    """horizontal face between depths y0, y1"""
    if up:
        mb.quad((u0, y0, z), (u1, y0, z), (u1, y1, z), (u0, y1, z), mat)
    else:
        mb.quad((u0, y0, z), (u0, y1, z), (u1, y1, z), (u1, y0, z), mat)


def tiles(mb, u0, u1, z0, z1, y, holes, mat):
    """the wall [u0, u1] x [z0, z1] at depth y, less the holes [(a, b, c, e)], as few quads as it
    takes (cells of the grid the holes' edges make, merged along rows)"""
    us = sorted({u0, u1, *[h[0] for h in holes if u0 < h[0] < u1], *[h[1] for h in holes if u0 < h[1] < u1]})
    zs = sorted({z0, z1, *[h[2] for h in holes if z0 < h[2] < z1], *[h[3] for h in holes if z0 < h[3] < z1]})
    for j in range(len(zs) - 1):
        za, zb = zs[j], zs[j + 1]
        zm = (za + zb) / 2
        run = None
        for i in range(len(us) - 1):
            ua, ub = us[i], us[i + 1]
            um = (ua + ub) / 2
            hole = any(h[0] <= um <= h[1] and h[2] <= zm <= h[3] for h in holes)
            if hole:
                if run:
                    wallq(mb, run[0], run[1], za, zb, y, mat)
                    run = None
            elif run:
                run[1] = ub
            else:
                run = [ua, ub]
        if run:
            wallq(mb, run[0], run[1], za, zb, y, mat)


def reveal(mb, a, b, c, e, y, depth, mat, sill=True):
    """the four inner faces of an opening, from the wall face y back to y + depth"""
    y1 = y + depth
    mb.quad((a, y, c), (a, y1, c), (a, y1, e), (a, y, e), mat)          # left jamb, faces +u
    mb.quad((b, y1, c), (b, y, c), (b, y, e), (b, y1, e), mat)          # right jamb, faces -u
    mb.quad((a, y, e), (a, y1, e), (b, y1, e), (b, y, e), mat)          # head, faces down
    if sill:
        mb.quad((a, y, c), (b, y, c), (b, y1, c), (a, y1, c), mat)      # sill, faces up


def frame(mb, a, b, c, e, y, mullions=(), transoms=(), fw=0.06, mat='Frame black', glass='Window glass', d=0.07):
    """a window in its opening: glass at depth y, black frame members in front of it.
    mullions: u positions; transoms: z positions"""
    wallq(mb, a, b, c, e, y, glass)
    yf = y - d
    mb.box(a, yf, c, a + fw, y, e, mat, faces='xXyZz')
    mb.box(b - fw, yf, c, b, y, e, mat, faces='xXyZz')
    mb.box(a + fw, yf, e - fw, b - fw, y, e, mat, faces='yZz')
    mb.box(a + fw, yf, c, b - fw, y, c + fw, mat, faces='yZz')
    for m in mullions:
        mb.box(m - fw * 0.6, yf, c + fw, m + fw * 0.6, y, e - fw, mat, faces='xXy')
    for t in transoms:
        mb.box(a + fw, yf, t - fw * 0.6, b - fw, y, t + fw * 0.6, mat, faces='yZz')


def window(mb, a, b, c, e, y, style, depth=0.18):
    """a window opening in the wall face y: reveals `depth` deep, the frame at the back.
    style 'big' (risalits: a mullion, transoms near the top and the bottom), 'narrow' (a top light
    across, two casements under it), 'small' (one light)"""
    reveal(mb, a, b, c, e, y, depth, 'Stone white', sill=False)
    yy = y + depth
    if style == 'big':
        frame(mb, a, b, c, e, yy, mullions=[(a + b) / 2], transoms=[e - 0.52, c + 0.48], fw=0.065)
    elif style == 'narrow':
        frame(mb, a, b, c, e, yy, transoms=[e - 0.45], fw=0.06)
        m = (a + b) / 2
        mb.box(m - 0.035, yy - 0.07, c + 0.06, m + 0.035, yy, e - 0.45 - 0.035, 'Frame black', faces='xXy')
    else:
        frame(mb, a, b, c, e, yy, fw=0.045)
    # sill: a sloped stone sill in the reveal
    mb.box(a, y - 0.02, c - 0.03, b, yy - 0.06, c, 'Sill white', faces='yZ')


def surround(mb, a, b, c, e, y, w=0.13, out=0.045, mat='Stone white', sill_mat='Sill white', sill=True, head=True):
    """raised flat architrave round an opening (left, right, top) and a stone sill under it"""
    mb.box(a - w, y - out, c, a, y, e + (w if head else 0), mat, faces='xXyZz')
    mb.box(b, y - out, c, b + w, y, e + (w if head else 0), mat, faces='xXyZz')
    if head:
        mb.box(a, y - out, e, b, y, e + w, mat, faces='yZz')
    if sill:
        mb.box(a - w - 0.06, y - out - 0.06, c - 0.08, b + w + 0.06, y + 0.02, c, sill_mat)


def rustic(mb, u0, u1, z0, z1, y, course=0.62, base=0.0, mat='Rustic white', ends=(True, True)):
    """rusticated blocks on the wall face y between z0 and z1: courses `course` high with their
    joints at base + k * course; the joints are V-grooves (the wall behind shows in their shadow)"""
    k = math.floor((z0 - base) / course)
    while True:
        zb = base + k * course
        if zb >= z1 - 1e-6:
            break
        za = max(z0, zb + GROOVE / 2)
        zt = min(z1, zb + course - GROOVE / 2)
        if zt - za > 0.02:
            o = RUSTIC_OUT
            # the block's face, and its top and bottom bevelled back into the groove
            bot = za > z0 + 1e-6
            top = zt < z1 - 1e-6
            b0 = za + (0.02 if bot else 0.0)
            t0 = zt - (0.02 if top else 0.0)
            mb.quad((u0, y - o, b0), (u1, y - o, b0), (u1, y - o, t0), (u0, y - o, t0), mat)
            if bot:
                mb.quad((u0, y, za), (u1, y, za), (u1, y - o, b0), (u0, y - o, b0), mat)
            if top:
                mb.quad((u0, y - o, t0), (u1, y - o, t0), (u1, y, zt), (u0, y, zt), mat)
            if ends[0]:
                mb.face([(u0, y, za), (u0, y - o, b0), (u0, y - o, t0), (u0, y, zt)][::-1], mat)
            if ends[1]:
                mb.face([(u1, y, za), (u1, y - o, b0), (u1, y - o, t0), (u1, y, zt)], mat)
        k += 1


def lattice_panel(mb, a, b, c, e, y, mat='Lattice white', rim='Stone white', rw=0.07, out=0.035, inset=0.02):
    """an ornamental panel: a raised rim, the field set back with the pattern (UV 0..1 over the
    field: the viewer draws one ornament per panel)"""
    mb.box(a, y - out, c, a + rw, y, e, rim, faces='xXyZz')
    mb.box(b - rw, y - out, c, b, y, e, rim, faces='xXyZz')
    mb.box(a + rw, y - out, e - rw, b - rw, y, e, rim, faces='yZz')
    mb.box(a + rw, y - out, c, b - rw, y, c + rw, rim, faces='yZz')
    fa, fb, fc, fe = a + rw, b - rw, c + rw, e - rw
    yi = y + inset
    reveal(mb, fa, fb, fc, fe, y, inset, rim)
    wallq(mb, fa, fb, fc, fe, yi, mat, uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])


def dark_strip(mb, a, b, z0, z1, y, depth=0.22, bars=(), mat='Lattice dark', back='Strip back', edge='Frame black'):
    """the dark ornamental metal screens in narrow slots: the slot's back dark, the screen near the
    front (UV: u 0..1 across, v in widths up the strip so the ornament keeps square cells), a
    thin dark frame and horizontal bars"""
    w = b - a
    yb = y + depth
    wallq(mb, a, b, z0, z1, yb, back)
    mb.quad((a, y, z0), (a, yb, z0), (a, yb, z1), (a, y, z1), 'Facade white')
    mb.quad((b, yb, z0), (b, y, z0), (b, y, z1), (b, yb, z1), 'Facade white')
    ys = y + 0.05
    wallq(mb, a, b, z0, z1, ys, mat, uvs=[(0, z0 / w), (1, z0 / w), (1, z1 / w), (0, z1 / w)])
    fw = min(0.05, w * 0.1)
    mb.box(a, ys - 0.03, z0, a + fw, ys, z1, edge, faces='yX')
    mb.box(b - fw, ys - 0.03, z0, b, ys, z1, edge, faces='yx')
    for z in bars:
        if z0 < z < z1:
            mb.box(a, ys - 0.035, z - 0.03, b, ys, z + 0.03, edge, faces='yZz')


def profile_box(mb, u0, u1, y, z, prof, mat, ends=True):
    """a straight moulding along u at the wall face y: prof [(out, up), ...] from the bottom at the
    wall outward and up, back to the wall at the top"""
    n = len(prof)
    for i in range(n - 1):
        o0, h0 = prof[i]
        o1, h1 = prof[i + 1]
        mb.quad((u0, y - o0, z + h0), (u1, y - o0, z + h0), (u1, y - o1, z + h1), (u0, y - o1, z + h1), mat)
    if ends:
        left = [(u0, y - o, z + h) for o, h in prof]
        right = [(u1, y - o, z + h) for o, h in prof]
        mb.face(left, mat)          # faces -u
        mb.face(right[::-1], mat)   # faces +u


# ---------- mouldings ----------
# Profiles are lists of (out, up) in metres from the bottom at the wall face, outward and up, back to
# the wall at the top. The curved members are sampled (cyma recta / reversa, ovolo, cavetto).

def _curve(o0, h0, o1, h1, kind, n=6):
    """points after (o0, h0) up to (o1, h1) along a classical curve"""
    pts = []
    for i in range(1, n + 1):
        t = i / n
        if kind == 'ovolo':        # quarter round, convex: out first, then up
            a = t * math.pi / 2
            fo, fh = math.sin(a), 1 - math.cos(a)
        elif kind == 'cavetto':    # quarter hollow, concave: up first, then out
            a = t * math.pi / 2
            fo, fh = 1 - math.cos(a), math.sin(a)
        elif kind == 'recta':      # cyma recta: hollow below, round above (upright at both ends)
            fo, fh = 0.5 - 0.5 * math.cos(t * math.pi), t
        else:                      # cyma reversa: round below, hollow above (level at both ends)
            fo, fh = t, 0.5 - 0.5 * math.cos(t * math.pi)
        pts.append((o0 + (o1 - o0) * fo, h0 + (h1 - h0) * fh))
    return pts


def profile(*steps):
    """build a profile from steps: ('p', out, up) a point, (kind, out, up) a curve to that point"""
    pts = [(0.0, 0.0)]
    for st in steps:
        if st[0] == 'p':
            pts.append((st[1], st[2]))
        else:
            o0, h0 = pts[-1]
            pts.extend(_curve(o0, h0, st[1], st[2], st[0]))
    pts.append((0.0, pts[-1][1]))
    return pts


def scaled(prof, h=None, out=None):
    """a profile scaled to height h (and projection out)"""
    H = prof[-1][1]
    O = max(o for o, _ in prof)
    kh = (h / H) if h else 1.0
    ko = (out / O) if out else kh
    return [(o * ko, z * kh) for o, z in prof]


# the main cornice (renders 1, 7, 8): a fillet and bed moulding, a hollow soffit carrying the corona
# 0.48 m out, a cyma recta on top with its fillet; 0.78 m high
CORNICE_MAIN = profile(('p', 0.04, 0.0), ('p', 0.04, 0.05), ('ovolo', 0.12, 0.13), ('p', 0.14, 0.13), ('p', 0.14, 0.18),
                       ('cavetto', 0.44, 0.38), ('p', 0.48, 0.38), ('p', 0.48, 0.55), ('p', 0.5, 0.55), ('p', 0.5, 0.58),
                       ('recta', 0.58, 0.72), ('p', 0.6, 0.72), ('p', 0.6, 0.78))
# the band between the risalits' top two floors and the rest (render 8): 0.5 m
CORNICE_BAND = profile(('p', 0.03, 0.0), ('p', 0.03, 0.06), ('reversa', 0.1, 0.14), ('p', 0.12, 0.14), ('p', 0.12, 0.17),
                       ('cavetto', 0.2, 0.26), ('p', 0.22, 0.26), ('p', 0.22, 0.38), ('recta', 0.28, 0.46), ('p', 0.29, 0.46),
                       ('p', 0.29, 0.5))
# under the terraces of the top floor and round the attic: 0.62 m
CORNICE_TERRACE = profile(('p', 0.04, 0.0), ('p', 0.04, 0.05), ('ovolo', 0.11, 0.12), ('p', 0.13, 0.12), ('p', 0.13, 0.16),
                          ('cavetto', 0.34, 0.31), ('p', 0.37, 0.31), ('p', 0.37, 0.45), ('recta', 0.44, 0.56), ('p', 0.46, 0.56),
                          ('p', 0.46, 0.62))
PODIUM_CORNICE = profile(('p', 0.08, 0.0), ('p', 0.08, 0.16), ('reversa', 0.18, 0.27), ('p', 0.2, 0.27), ('p', 0.2, 0.33),
                         ('cavetto', 0.42, 0.5), ('p', 0.46, 0.5), ('p', 0.46, 0.66), ('recta', 0.52, 0.74), ('p', 0.53, 0.74),
                         ('p', 0.53, 0.78))
PLINTH = profile(('p', 0.07, 0.0), ('p', 0.07, 0.22), ('ovolo', 0.0, 0.3))
# a small band round the podium's ends at the second floor (render 2)
PODIUM_BAND = profile(('p', 0.03, 0.0), ('ovolo', 0.1, 0.07), ('p', 0.1, 0.18), ('cavetto', 0.03, 0.24))


# ---------- balustrades ----------
# Render 8 and 1: square stone pedestals with a moulded base and cap, an urn on each; between them
# a stone base rail, a glass panel with a white middle bar, a row of small white balusters under
# the capping rail.
URN = [(0.0, 0.0), (0.11, 0.0), (0.11, 0.03), (0.075, 0.05), (0.06, 0.08), (0.09, 0.11), (0.13, 0.16), (0.145, 0.21),
       (0.135, 0.26), (0.105, 0.3), (0.065, 0.32), (0.05, 0.335), (0.08, 0.35), (0.08, 0.37), (0.045, 0.39), (0.035, 0.41),
       (0.05, 0.44), (0.045, 0.47), (0.02, 0.49), (0.0, 0.495)]


def post(mb, u, y, z, w=0.36, h=1.3, mat='Stone white', urn=True):
    """a square pedestal: plinth, base moulding, shaft, cap mouldings, urn"""
    def sq(d, z0, z1, faces='xXyYZ'):
        mb.box(u - d, y - d, z0, u + d, y + d, z1, mat, faces=faces)
    hw = w / 2
    sq(hw + 0.05, z, z + 0.1)
    sq(hw + 0.025, z + 0.1, z + 0.16)
    sq(hw, z + 0.16, z + h - 0.2)
    sq(hw + 0.03, z + h - 0.2, z + h - 0.15, 'xXyYzZ')
    sq(hw + 0.06, z + h - 0.15, z + h - 0.06, 'xXyYzZ')
    sq(hw + 0.035, z + h - 0.06, z + h)
    if urn:
        mb.lathe(URN, mat, 14, u, y, z + h)


def railing(mb, u0, u1, y, z, h=1.02, mat='Stone white', glass='Railing glass', post_w=0.36):
    """the balustrade between two posts"""
    a, b = u0 + post_w / 2, u1 - post_w / 2
    L = b - a
    if L < 0.05:
        return
    mb.box(a, y - 0.12, z, b, y + 0.12, z + 0.13, mat, faces='yYZ')                 # base rail
    zg0, zg1 = z + 0.13, z + h - 0.24
    mb.box(a, y - 0.11, z + h - 0.07, b, y + 0.11, z + h, mat, faces='yYZz')          # capping rail
    mb.box(a, y - 0.05, zg1, b, y + 0.05, zg1 + 0.035, mat, faces='yYZz')             # bar under the balusters
    # the row of small balusters (8.5 cm apart)
    n = max(2, int(L / 0.085))
    for i in range(n):
        x = a + (i + 0.5) * L / n
        mb.box(x - 0.014, y - 0.03, zg1 + 0.035, x + 0.014, y + 0.03, z + h - 0.07, mat, faces='xXyY')
    # glass with a frame and a middle bar
    mb.quad((a, y, zg0), (b, y, zg0), (b, y, zg1), (a, y, zg1), glass)
    mb.quad((b, y, zg0), (a, y, zg0), (a, y, zg1), (b, y, zg1), glass)
    mids = [a + L / 2] if L > 1.2 else []
    for x in mids:
        mb.box(x - 0.03, y - 0.035, zg0, x + 0.03, y + 0.035, zg1, mat, faces='xXyY')


def balustrade(mb, u0, u1, y, z, spacing=2.8, h=1.02, post_h=1.3, mat='Stone white', ends=(True, True)):
    """posts with urns every `spacing` metres and railings between them, along u at depth y"""
    n = max(1, round((u1 - u0) / spacing))
    xs = [u0 + (u1 - u0) * i / n for i in range(n + 1)]
    for i, x in enumerate(xs):
        if (i == 0 and not ends[0]) or (i == n and not ends[1]):
            continue
        post(mb, x, y, z, h=post_h, mat=mat)
    for i in range(n):
        railing(mb, xs[i], xs[i + 1], y, z, h=h, mat=mat)


def pergola(mb, u0, u1, y0, y1, z, h=2.5, wood='Pergola wood', slat='Pergola white', screen=None):
    """a pergola over a corner terrace (renders 1, 5, 7, 8): thick dark timber posts, deep beams round
    the top, white slats across the roof, and on the `screen` sides ('u0', 'u1', 'y0', 'y1') white
    horizontal louvres between the posts from knee height to the beam"""
    pw = 0.24
    bh = 0.36
    # posts: at the corners, and every ~1.3 m along the screened sides
    posts = {(u0, y0), (u1, y0), (u0, y1), (u1, y1)}
    for side in (screen or ()):
        if side in ('u0', 'u1'):
            uu = u0 if side == 'u0' else u1
            n = max(1, round((y1 - y0) / 1.3))
            posts |= {(uu, y0 + (y1 - y0) * k / n) for k in range(n + 1)}
        else:
            yy = y0 if side == 'y0' else y1
            n = max(1, round((u1 - u0) / 1.3))
            posts |= {(u0 + (u1 - u0) * k / n, yy) for k in range(n + 1)}
    def clampbox(cu, cy_):
        a = min(max(cu - pw / 2, u0), u1 - pw)
        c = min(max(cy_ - pw / 2, y0), y1 - pw)
        return a, c
    for (pu, py) in posts:
        a, c = clampbox(pu, py)
        mb.box(a, c, z, a + pw, c + pw, z + h + bh, wood)
    # beams round the top
    mb.box(u0, y0, z + h, u1, y0 + pw, z + h + bh, wood)
    mb.box(u0, y1 - pw, z + h, u1, y1, z + h + bh, wood)
    mb.box(u0, y0, z + h, u0 + pw, y1, z + h + bh, wood)
    mb.box(u1 - pw, y0, z + h, u1, y1, z + h + bh, wood)
    # roof slats across u
    u = u0 + 0.3
    while u < u1 - 0.25:
        mb.box(u - 0.035, y0 + pw, z + h + 0.1, u + 0.035, y1 - pw, z + h + bh - 0.02, slat)
        u += 0.2
    # louvres: white boards 10 cm tall, 17 cm apart, between the posts
    for side in (screen or ()):
        zz = z + 0.35
        while zz < z + h - 0.08:
            if side in ('y0', 'y1'):
                yy = y0 + pw / 2 if side == 'y0' else y1 - pw / 2
                mb.box(u0 + pw, yy - 0.02, zz, u1 - pw, yy + 0.02, zz + 0.1, slat)
            else:
                uu = u0 + pw / 2 if side == 'u0' else u1 - pw / 2
                mb.box(uu - 0.02, y0 + pw, zz, uu + 0.02, y1 - pw, zz + 0.1, slat)
            zz += 0.17


def planter(mb, u0, u1, y0, y1, z, h=0.55, shrubs=True):
    """a stone planter box, its soil; shrubs as rounded mounds unless the viewer plants them"""
    mb.box(u0, y0, z, u1, y1, z + h, 'Planter')
    mb.box(u0 + 0.05, y0 + 0.05, z + h, u1 - 0.05, y1 - 0.05, z + h + 0.04, 'Mulch', faces='Z')
    if not shrubs:
        return
    import random
    r = random.Random(int((u0 + y0) * 100) & 0xffff)
    n = max(1, int(max(u1 - u0, y1 - y0) / 0.7))
    for i in range(n):
        t = (i + 0.5) / n
        cx = u0 + (u1 - u0) * (t if u1 - u0 >= y1 - y0 else 0.5)
        cy = y0 + (y1 - y0) * (t if y1 - y0 > u1 - u0 else 0.5)
        rr = min(u1 - u0, y1 - y0) * (0.55 + r.random() * 0.2)
        mb.lathe([(0.0, 0.0), (rr * 0.8, 0.0), (rr, rr * 0.5), (rr * 0.8, rr * 1.1), (rr * 0.4, rr * 1.45), (0.0, rr * 1.55)],
                 'Shrub', 8, cx, cy, z + h)


def cypress(mb, x, y, z, h=2.2, r=0.38, pot=True):
    """a clipped cypress (renders 5 and 7): a slim pointed column of foliage, in a round pot"""
    if pot:
        mb.lathe([(0.0, 0.0), (0.26, 0.0), (0.3, 0.05), (0.34, 0.5), (0.36, 0.55), (0.3, 0.55), (0.3, 0.5), (0.0, 0.5)],
                 'Planter', 14, x, y, z)
        z += 0.5
    mb.lathe([(0.0, 0.0), (r * 0.55, 0.0), (r * 0.95, h * 0.12), (r, h * 0.3), (r * 0.9, h * 0.55), (r * 0.6, h * 0.8),
              (r * 0.25, h * 0.95), (0.0, h)], 'Hedge', 10, x, y, z)
