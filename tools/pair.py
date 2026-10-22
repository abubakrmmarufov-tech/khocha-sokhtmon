"""A region of a client render and the same region of the model seen with the render's camera, one
above the other, enlarged.   tools/py tools/pair.py NAME x0,y0,x1,y1 OUT.png [scale]
(NAME as in tools/cams.json; the model shot is build/cmp/NAME_model.png from tools/cmp_all.sh)"""
import sys

from PIL import Image

name, box, out = sys.argv[1], [int(v) for v in sys.argv[2].split(',')], sys.argv[3]
k = float(sys.argv[4]) if len(sys.argv) > 4 else 2.0
digits = ''.join(ch for ch in name if ch.isdigit())
a = Image.open(f'materials/renders/{digits}.webp').convert('RGB')
b = Image.open(f'build/cmp/{name}_model.png').convert('RGB').resize(a.size, Image.LANCZOS)
ca, cb = a.crop(box), b.crop(box)
w, h = ca.size
img = Image.new('RGB', (w, h * 2 + 4), (255, 0, 0))
img.paste(ca, (0, 0))
img.paste(cb, (0, h + 4))
img = img.resize((int(img.width * k), int(img.height * k)), Image.LANCZOS)
img.save(out)
print(out, img.size)
