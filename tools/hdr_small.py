#!/usr/bin/env python3
"""A small copy of the sky HDRI for phones (src/quality.js skyRes): the HDRI only lights the scene
(the visible sky is drawn, src/world.js), and a 256 x 128 one lights it the same after the PMREM
blur, at a tenth of the download.

    python3 tools/hdr_small.py public/env/sky_1k.hdr public/env/sky_256.hdr 256
"""
import sys
import numpy as np


def read_hdr(path):
    with open(path, 'rb') as f:
        data = f.read()
    # header up to the blank line, then the resolution line
    pos = data.index(b'\n\n') + 2
    end = data.index(b'\n', pos)
    res = data[pos:end].decode().split()
    assert res[0] == '-Y' and res[2] == '+X', res
    h, w = int(res[1]), int(res[3])
    pos = end + 1
    out = np.zeros((h, w, 4), dtype=np.uint8)
    for y in range(h):
        if data[pos] == 2 and data[pos + 1] == 2 and (data[pos + 2] << 8 | data[pos + 3]) == w:
            pos += 4
            # new RLE: each channel in turn
            for c in range(4):
                x = 0
                while x < w:
                    n = data[pos]
                    pos += 1
                    if n > 128:
                        out[y, x:x + n - 128, c] = data[pos]
                        x += n - 128
                        pos += 1
                    else:
                        out[y, x:x + n, c] = np.frombuffer(data[pos:pos + n], dtype=np.uint8)
                        x += n
                        pos += n
        else:
            out[y] = np.frombuffer(data[pos:pos + w * 4], dtype=np.uint8).reshape(w, 4)
            pos += w * 4
    return out


def rgbe_to_float(rgbe):
    e = rgbe[..., 3].astype(np.int32)
    scale = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)
    return rgbe[..., :3].astype(np.float64) * scale[..., None]


def float_to_rgbe(rgb):
    m = rgb.max(axis=-1)
    mant, exp = np.frexp(m)
    scale = np.where(m > 1e-32, mant * 256.0 / np.maximum(m, 1e-32), 0.0)
    out = np.zeros(rgb.shape[:-1] + (4,), dtype=np.uint8)
    out[..., :3] = np.clip(rgb * scale[..., None], 0, 255).astype(np.uint8)
    out[..., 3] = np.where(m > 1e-32, exp + 128, 0).astype(np.uint8)
    return out


def write_hdr(path, rgbe):
    h, w = rgbe.shape[:2]
    with open(path, 'wb') as f:
        f.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n')
        f.write(f'-Y {h} +X {w}\n'.encode())
        f.write(rgbe.tobytes())  # flat scanlines (no RLE: small, and every reader takes it)


def main():
    src, dst, width = sys.argv[1], sys.argv[2], int(sys.argv[3])
    img = rgbe_to_float(read_hdr(src))
    h, w = img.shape[:2]
    k = w // width
    assert h % k == 0 and w % k == 0, (h, w, k)
    small = img.reshape(h // k, k, w // k, k, 3).mean(axis=(1, 3))
    write_hdr(dst, float_to_rgbe(small))
    print(f'{src} {w}x{h} -> {dst} {w // k}x{h // k}')


if __name__ == '__main__':
    main()
