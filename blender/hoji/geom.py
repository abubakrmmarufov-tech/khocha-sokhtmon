"""Geometry kit for the Blender build: a mesh builder that collects faces per material with UVs in
metres (box-projected, so the web viewer's textures keep their real size), and helpers for the
shapes a classical facade is made of (boxes, prisms, profiles swept along a path, turned posts).

Coordinates are metres: x east, y north, z up.
"""
import math

import bpy
from mathutils import Matrix, Vector


def get_collection(name, parent=None):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(col)
    return col


def make_object(name, mesh, col):
    ob = bpy.data.objects.new(name, mesh)
    col.objects.link(ob)
    return ob


def ccw(ring):
    """the ring counter-clockwise (positive area)"""
    a = 0.0
    for i in range(len(ring)):
        x0, y0 = ring[i - 1]
        x1, y1 = ring[i]
        a += x0 * y1 - x1 * y0
    return list(ring) if a > 0 else list(reversed(ring))


class MeshBuilder:
    """Faces per material. UVs: box projection in metres (u along the face, v up or north)."""

    def __init__(self):
        self.verts = []
        self.faces = []      # (indices, material, smooth, uvs or None)
        self.stack = [Matrix.Identity(4)]

    # ---- transforms ----
    def push(self, m):
        self.stack.append(self.stack[-1] @ m)

    def pop(self):
        self.stack.pop()

    def at(self, x=0.0, y=0.0, z=0.0, rot=0.0, scale=None):
        """push a local frame: origin (x, y, z), turned rot radians about z"""
        m = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z')
        if scale is not None:
            s = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
            m = m @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))
        self.push(m)
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.pop()

    def _v(self, p):
        q = self.stack[-1] @ Vector((p[0], p[1], p[2]))
        self.verts.append((q.x, q.y, q.z))
        return len(self.verts) - 1

    # ---- primitives ----
    def face(self, pts, mat, smooth=False, uvs=None):
        """a polygon from 3D points (counter-clockwise seen from its front)"""
        if len(pts) < 3:
            return
        idx = [self._v(p) for p in pts]
        self.faces.append((idx, mat, smooth, uvs))

    def quad(self, a, b, c, d, mat, smooth=False, uvs=None):
        self.face([a, b, c, d], mat, smooth, uvs)

    def box(self, x0, y0, z0, x1, y1, z1, mat, faces='all'):
        """axis-aligned box in the current frame; faces: 'all' or a string of letters from
        'xXyYzZ' (x = the -x face, X = the +x face...) to keep"""
        if x0 > x1:
            x0, x1 = x1, x0
        if y0 > y1:
            y0, y1 = y1, y0
        if z0 > z1:
            z0, z1 = z1, z0
        keep = 'xXyYzZ' if faces == 'all' else faces
        p = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        if 'z' in keep:
            self.quad(p[0], p[3], p[2], p[1], mat)
        if 'Z' in keep:
            self.quad(p[4], p[5], p[6], p[7], mat)
        if 'y' in keep:
            self.quad(p[0], p[1], p[5], p[4], mat)
        if 'Y' in keep:
            self.quad(p[2], p[3], p[7], p[6], mat)
        if 'x' in keep:
            self.quad(p[3], p[0], p[4], p[7], mat)
        if 'X' in keep:
            self.quad(p[1], p[2], p[6], p[5], mat)

    def prism(self, ring, z0, z1, side, top=None, bottom=None):
        """vertical prism over a 2D ring (any orientation); top / bottom caps triangulated"""
        ring = ccw([tuple(p[:2]) for p in ring])
        n = len(ring)
        for i in range(n):
            (ax, ay), (bx, by) = ring[i], ring[(i + 1) % n]
            if abs(ax - bx) + abs(ay - by) < 1e-6:
                continue
            self.quad((ax, ay, z0), (bx, by, z0), (bx, by, z1), (ax, ay, z1), side)
        if top or bottom:
            tris = triangulate(ring)
            for t in tris:
                a, b, c = (ring[k] for k in t)
                if top:
                    self.face([(a[0], a[1], z1), (b[0], b[1], z1), (c[0], c[1], z1)], top)
                if bottom:
                    self.face([(a[0], a[1], z0), (c[0], c[1], z0), (b[0], b[1], z0)], bottom)

    def cap(self, ring, z, mat, up=True):
        ring = ccw([tuple(p[:2]) for p in ring])
        for t in triangulate(ring):
            a, b, c = (ring[k] for k in t)
            if up:
                self.face([(a[0], a[1], z), (b[0], b[1], z), (c[0], c[1], z)], mat)
            else:
                self.face([(a[0], a[1], z), (c[0], c[1], z), (b[0], b[1], z)], mat)

    def sweep(self, path, profile, mat, closed=True, ends=True):
        """A moulding: `profile` [(out, up), ...] (out = metres outward from the path, up = metres
        above it) swept along a horizontal `path` [(x, y, z), ...] that runs counter-clockwise round
        the building (outward = to the right of the direction of travel). Mitred at the corners."""
        n = len(path)
        segs = n if closed else n - 1
        # outward normals of each segment
        def nrm(i):
            a, b = path[i % n], path[(i + 1) % n]
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy) or 1.0
            return (dy / L, -dx / L)
        rings = []
        for i in range(n):
            if closed or 0 < i < n - 1:
                n0, n1 = nrm(i - 1), nrm(i)
                mx, my = n0[0] + n1[0], n0[1] + n1[1]
                ml = math.hypot(mx, my) or 1.0
                mx, my = mx / ml, my / ml
                k = 1.0 / max(0.25, mx * n1[0] + my * n1[1])   # mitre stretch
            else:
                mx, my = nrm(0) if i == 0 else nrm(n - 2)
                k = 1.0
            x, y, z = path[i]
            rings.append([(x + mx * o * k, y + my * o * k, z + u) for o, u in profile])
        m = len(profile)
        for s in range(segs):
            r0, r1 = rings[s], rings[(s + 1) % n]
            for j in range(m - 1):
                self.quad(r0[j], r1[j], r1[j + 1], r0[j + 1], mat)
        if not closed and ends:
            # flat ends
            self.face([rings[0][j] for j in range(m)][::-1], mat)
            self.face([rings[-1][j] for j in range(m)], mat)

    def lathe(self, pts, mat, seg=12, x=0.0, y=0.0, z=0.0, smooth=True):
        """a turned piece (baluster, finial) from a profile [(radius, height), ...] bottom to top"""
        rings = []
        for r, h in pts:
            rings.append([(x + r * math.cos(2 * math.pi * k / seg), y + r * math.sin(2 * math.pi * k / seg), z + h) for k in range(seg)])
        for i in range(len(pts) - 1):
            a, b = rings[i], rings[i + 1]
            for k in range(seg):
                k1 = (k + 1) % seg
                if pts[i][0] < 1e-6:
                    self.face([a[k], b[k1], b[k]], mat, smooth)
                elif pts[i + 1][0] < 1e-6:
                    self.face([a[k], a[k1], b[k]], mat, smooth)
                else:
                    self.quad(a[k], a[k1], b[k1], b[k], mat, smooth)

    def sphere(self, cx, cy, cz, r, mat, seg=12, rings=8):
        pts = [(r * math.sin(math.pi * i / rings), cz - r * math.cos(math.pi * i / rings) - cz) for i in range(rings + 1)]
        self.lathe([(max(0.0, a), b) for a, b in pts], mat, seg, cx, cy, cz)

    def cylinder(self, cx, cy, z0, z1, r, mat, seg=12, caps=True):
        self.lathe([(0, 0), (r, 0), (r, z1 - z0), (0, z1 - z0)] if caps else [(r, 0), (r, z1 - z0)], mat, seg, cx, cy, z0)

    # ---- output ----
    def merge(self, other):
        off = len(self.verts)
        self.verts.extend(other.verts)
        for idx, mat, sm, uvs in other.faces:
            self.faces.append(([i + off for i in idx], mat, sm, uvs))

    def to_mesh(self, name, mats):
        """mats: name -> bpy material. Box-projected UVs in metres where a face gives none."""
        me = bpy.data.meshes.new(name)
        if not self.faces:
            return me
        names = []
        for _, m, _, _ in self.faces:
            if m not in names:
                names.append(m)
        me.from_pydata(self.verts, [], [f[0] for f in self.faces])
        for m in names:
            me.materials.append(mats[m] if isinstance(mats, dict) else mats(m))
        slot = {m: i for i, m in enumerate(names)}
        me.polygons.foreach_set('material_index', [slot[f[1]] for f in self.faces])
        me.polygons.foreach_set('use_smooth', [bool(f[2]) for f in self.faces])
        uv = me.uv_layers.new(name='UVMap')
        data = []
        V = self.verts
        for idx, _, _, uvs in self.faces:
            if uvs:
                for p in uvs:
                    data.extend(p)
                continue
            # face normal -> projection plane
            a, b, c = Vector(V[idx[0]]), Vector(V[idx[1]]), Vector(V[idx[-1]])
            nrm = (b - a).cross(c - a)
            for k in range(1, len(idx) - 1):
                nrm += (Vector(V[idx[k]]) - a).cross(Vector(V[idx[k + 1]]) - a)
            ax, ay, az = abs(nrm.x), abs(nrm.y), abs(nrm.z)
            for i in idx:
                x, y, z = V[i]
                if az >= ax and az >= ay:
                    data.extend((x, y))
                elif ax >= ay:
                    data.extend((y if nrm.x > 0 else -y, z))
                else:
                    data.extend((-x if nrm.y > 0 else x, z))
        uv.data.foreach_set('uv', data)
        me.validate(clean_customdata=False)
        me.update()
        return me


def triangulate(ring):
    """ear clipping of a simple counter-clockwise ring -> list of index triples"""
    n = len(ring)
    if n < 3:
        return []
    idx = list(range(n))
    out = []

    def area(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])

    def inside(p, a, b, c):
        return area(a, b, p) >= -1e-12 and area(b, c, p) >= -1e-12 and area(c, a, p) >= -1e-12

    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        m = len(idx)
        cut = False
        for i in range(m):
            i0, i1, i2 = idx[i - 1], idx[i], idx[(i + 1) % m]
            a, b, c = ring[i0], ring[i1], ring[i2]
            if area(a, b, c) <= 1e-12:
                continue
            if any(inside(ring[j], a, b, c) for j in idx if j not in (i0, i1, i2)):
                continue
            out.append((i0, i1, i2))
            idx.pop(i)
            cut = True
            break
        if not cut:
            # degenerate: fan the rest
            for k in range(1, len(idx) - 1):
                out.append((idx[0], idx[k], idx[k + 1]))
            return out
    out.append(tuple(idx))
    return out


def rect_ring(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
