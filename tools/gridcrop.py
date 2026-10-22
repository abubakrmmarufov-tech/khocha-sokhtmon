"""Crop of an image, enlarged, with a pixel ruler (original coordinates) for reading positions.
   tools/py tools/gridcrop.py IMG OUT x0 y0 x1 y1 [scale] [step]"""
import sys
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]
x0, y0, x1, y1 = map(int, sys.argv[3:7])
k = float(sys.argv[7]) if len(sys.argv) > 7 else 4
step = int(sys.argv[8]) if len(sys.argv) > 8 else 10
im = Image.open(src).convert('RGB').crop((x0, y0, x1, y1))
im = im.resize((int(im.width * k), int(im.height * k)), Image.NEAREST if k >= 4 else Image.LANCZOS)
g = ImageDraw.Draw(im)
try:
    f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 11)
except Exception:
    f = None
for x in range((x0 // step + 1) * step, x1, step):
    X = (x - x0) * k
    big = x % (step * 5) == 0
    g.line([(X, 0), (X, 14 if big else 6)], fill=(255, 0, 0))
    g.line([(X, im.height - (14 if big else 6)), (X, im.height)], fill=(255, 0, 0))
    if big:
        g.text((X + 2, 14), str(x), fill=(255, 0, 0), font=f)
for y in range((y0 // step + 1) * step, y1, step):
    Y = (y - y0) * k
    big = y % (step * 5) == 0
    g.line([(0, Y), (14 if big else 6, Y)], fill=(0, 0, 255))
    g.line([(im.width - (14 if big else 6), Y), (im.width, Y)], fill=(0, 0, 255))
    if big:
        g.text((16, Y - 6), str(y), fill=(0, 0, 255), font=f)
im.save(out)
print(out, im.size)
