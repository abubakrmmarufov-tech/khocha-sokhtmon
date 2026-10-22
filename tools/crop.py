"""Crop regions of the client renders, enlarged, for close study.
   tools/py tools/crop.py OUT.png RENDER x0 y0 x1 y1 [scale]"""
import sys
from PIL import Image
out, src, x0, y0, x1, y1 = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7])
k = float(sys.argv[7]) if len(sys.argv) > 7 else 3.0
im = Image.open(src)
c = im.crop((x0, y0, x1, y1))
c = c.resize((int(c.width * k), int(c.height * k)), Image.LANCZOS)
c.save(out)
print(out, c.size)
