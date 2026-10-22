"""The client's render and the model seen with the render's camera, for checking the match.
   tools/py tools/compare.py RENDER MODEL.png OUT.png [--mode blend|edges|side] [--crop x0,y0,x1,y1]
blend: the two half and half; edges: the model's edges in red over the render; side: side by side."""
import sys

import cv2
import numpy as np
from PIL import Image

args = sys.argv[1:]
mode = 'edges'
crop = None
if '--mode' in args:
    i = args.index('--mode')
    mode = args[i + 1]
    del args[i:i + 2]
if '--crop' in args:
    i = args.index('--crop')
    crop = [int(v) for v in args[i + 1].split(',')]
    del args[i:i + 2]
src, mod, out = args[:3]
a = Image.open(src).convert('RGB')
b = Image.open(mod).convert('RGB').resize(a.size, Image.LANCZOS)
A, B = np.asarray(a).astype(np.float32), np.asarray(b).astype(np.float32)
if mode == 'blend':
    C = (A * 0.5 + B * 0.5)
elif mode == 'side':
    C = np.concatenate([A, B], axis=1)
else:
    g = cv2.cvtColor(B.astype(np.uint8), cv2.COLOR_RGB2GRAY)
    e = cv2.Canny(g, 40, 110)
    C = A * 0.75
    C[e > 0] = [255, 30, 30]
img = Image.fromarray(np.clip(C, 0, 255).astype(np.uint8))
if crop:
    img = img.crop(crop)
img.save(out)
print(out, img.size)
