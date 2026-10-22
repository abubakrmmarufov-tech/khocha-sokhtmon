"""Draw each class of vector paths of a PDF page separately (to see what is what).
   tools/py tools/pdflayers.py PDF OUTDIR"""
import sys
from collections import defaultdict

import pymupdf as fitz
from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
d = fitz.open(src)
p = d[0]
S = 1.6
W, H = int(p.rect.width * S), int(p.rect.height * S)
groups = defaultdict(list)
for g in p.get_drawings():
    f = tuple(round(c, 3) for c in g['fill']) if g.get('fill') else None
    s = tuple(round(c, 3) for c in g['color']) if g.get('color') else None
    groups[(g['type'], f, s, round(g.get('width') or 0, 2))].append(g)
for k, gs in sorted(groups.items(), key=lambda kv: -len(kv[1])):
    im = Image.new('RGB', (W, H), 'white')
    dr = ImageDraw.Draw(im)
    col = tuple(int(c * 255) for c in (k[1] or k[2] or (0, 0, 0)))
    if col == (255, 255, 255):
        col = (200, 0, 0)
    for g in gs:
        for it in g['items']:
            if it[0] == 'l':
                a, b = it[1], it[2]
                dr.line([(a.x * S, a.y * S), (b.x * S, b.y * S)], fill=col, width=2)
            elif it[0] == 'c':
                pts = [it[1], it[2], it[3], it[4]]
                dr.line([(q.x * S, q.y * S) for q in pts], fill=col, width=2)
            elif it[0] == 're':
                r = it[1]
                dr.rectangle([r.x0 * S, r.y0 * S, r.x1 * S, r.y1 * S], outline=col, width=2)
            elif it[0] == 'qu':
                q = it[1]
                dr.polygon([(q.ul.x * S, q.ul.y * S), (q.ur.x * S, q.ur.y * S), (q.lr.x * S, q.lr.y * S), (q.ll.x * S, q.ll.y * S)], outline=col)
    name = f"{k[0]}_{'f' + ''.join('%02x' % int(c * 255) for c in k[1]) if k[1] else 'nofill'}_{'s' + ''.join('%02x' % int(c * 255) for c in k[2]) if k[2] else 'nostroke'}_w{k[3]}"
    im.save(f'{out}/{len(gs):04d}_{name}.png')
    print(name, len(gs))
