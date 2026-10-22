"""Debug: each class of paths drawn in plan metres with a metre grid -> build/plan/layers/*.png"""
import os
import sys
from collections import defaultdict

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
from sheet import paths, words  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'build', 'plan', 'layers')
os.makedirs(OUT, exist_ok=True)
S = 40.0
X0, X1, Y0, Y1 = -19.0, 19.0, -13.0, 13.0
W, H = int((X1 - X0) * S), int((Y1 - Y0) * S)
P = lambda x, y: ((x - X0) * S, (Y1 - y) * S)
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 11)


def grid(dr):
    for m in range(int(X0), int(X1) + 1):
        dr.line([P(m, Y0), P(m, Y1)], fill=(235, 235, 235) if m % 5 else (200, 200, 255))
    for m in range(int(Y0), int(Y1) + 1):
        dr.line([P(X0, m), P(X1, m)], fill=(235, 235, 235) if m % 5 else (200, 200, 255))


groups = defaultdict(list)
for g in paths():
    groups[(g['kind'], g['fill'], g['stroke'], g['width'])].append(g)
allim = Image.new('RGB', (W, H), 'white')
alldr = ImageDraw.Draw(allim)
grid(alldr)
for k, gs in groups.items():
    im = Image.new('RGB', (W, H), 'white')
    dr = ImageDraw.Draw(im)
    grid(dr)
    col = tuple(int(c * 255) for c in (k[1] or k[2] or (0, 0, 0)))
    for g in gs:
        if g['fill']:
            for q in g['polys']:
                if len(q) >= 3:
                    dr.polygon([P(*p) for p in q], fill=col)
                    alldr.polygon([P(*p) for p in q], fill=col)
        for s in g['segs']:
            if g['stroke'] and not g['fill']:
                dr.line([P(*p) for p in s], fill=col, width=1)
                alldr.line([P(*p) for p in s], fill=col, width=1)
    name = f"{len(gs):04d}_{k[0]}_{'f' + ''.join('%02x' % int(c * 255) for c in k[1]) if k[1] else 'nofill'}_{'s' + ''.join('%02x' % int(c * 255) for c in k[2]) if k[2] else 'nostroke'}_w{k[3]}"
    im.save(os.path.join(OUT, name + '.png'))
for w in words():
    alldr.text(P(w['x'], w['y']), w['text'], fill=(200, 0, 0), font=font, anchor='mm')
allim.save(os.path.join(OUT, '_all.png'))
print('ok', W, H)
