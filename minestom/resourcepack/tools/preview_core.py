#!/usr/bin/env python3
"""
Как выглядит мир со встроенным core-шейдером пака — без клиента.

Берёт изометрическую картинку лобби и прогоняет через ту же самую
математику, что в `assets/minecraft/shaders/core/terrain.fsh` (функция
`ps1_grade`): холодные тени, тёплые огни, сканлайны и 15-битный цвет
с упорядоченным джиттером. Слева — без шейдера, справа — с ним.

    python3 tools/preview_core.py [картинка.png]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_blocks import write_png  # noqa: E402

import struct
import zlib


def read_png(path):
    """Полное RGBA-чтение (render_blocks.read_png обрезает до текстуры 16×16)."""
    data = open(path, "rb").read()
    pos, idat = 8, b""
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        if tag == b"IHDR":
            w, h, _bd, ct = struct.unpack(">IIBB", body[:10])
        elif tag == b"IDAT":
            idat += body
        pos += 12 + ln
    assert ct == 6, "ожидается RGBA"
    raw = zlib.decompress(idat)
    stride = w * 4
    out, prev, i = [], bytearray(stride), 0
    for _y in range(h):
        f = raw[i]
        i += 1
        line = bytearray(raw[i:i + stride])
        i += stride
        for x in range(stride):
            a = line[x - 4] if x >= 4 else 0
            b = prev[x]
            c = prev[x - 4] if x >= 4 else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + b) & 255
            elif f == 3:
                line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        prev = line
        out.append([tuple(line[x * 4:x * 4 + 4]) for x in range(w)])
    return out

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))

BAYER = [[0, 8, 2, 10],
         [12, 4, 14, 6],
         [3, 11, 1, 9],
         [15, 7, 13, 5]]


def clamp(v, a=0.0, b=1.0):
    return a if v < a else (b if v > b else v)


def smoothstep(a, b, x):
    t = clamp((x - a) / (b - a))
    return t * t * (3 - 2 * t)


def ps1_grade(r, g, b, x, y):
    """Пиксель-в-пиксель то же, что делает ps1_grade() в terrain.fsh."""
    l = 0.299 * r + 0.587 * g + 0.114 * b
    # mix(vec3(l), c, 1.14)
    r, g, b = l + (r - l) * 1.14, l + (g - l) * 1.14, l + (b - l) * 1.14
    # холодная ночь → тёплые огни
    t = smoothstep(0.08, 0.72, l)
    cold = (0.88, 0.93, 1.07)
    warm = (1.08, 1.01, 0.92)
    r *= cold[0] + (warm[0] - cold[0]) * t
    g *= cold[1] + (warm[1] - cold[1]) * t
    b *= cold[2] + (warm[2] - cold[2]) * t
    # сканлайны
    scan = 1.0 - 0.05 * (0.5 + 0.5 * __import__("math").sin(y * 3.14159265))
    r, g, b = r * scan, g * scan, b * scan
    # 5 бит на канал + джиттер
    d = BAYER[y & 3][x & 3] / 15.0 - 0.5
    out = []
    for c in (r, g, b):
        v = c * 31.0 + d + 0.5
        out.append(int(max(0, min(31, int(v // 1)))) * 255 / 31.0)
    return tuple(int(max(0, min(255, v))) for v in out)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "lobby-lobby.png")
    img = read_png(src)
    h, w = len(img), len(img[0])

    left, right = [], []
    for y in range(h):
        lrow, rrow = [], []
        for x in range(w):
            px = img[y][x]
            r0, g0, b0 = px[0] / 255.0, px[1] / 255.0, px[2] / 255.0
            lrow.append(bytes((px[0], px[1], px[2], 255)))
            r0, g0, b0 = ps1_grade(r0, g0, b0, x, y)
            rrow.append(bytes((r0, g0, b0, 255)))
        left.append(lrow)
        right.append(rrow)

    # полоса с подписью-разделителем
    gap = 6
    out = []
    for y in range(h):
        out.append(left[y] + [bytes((120, 40, 40, 255))] * gap + right[y])
    path = os.path.join(ROOT, "preview-core-shader.png")
    write_png(path, w * 2 + gap, h, [b"".join(row) for row in out])
    print(f"{os.path.basename(src)} → {os.path.basename(path)} "
          f"({w * 2 + gap}×{h}); слева ваниль, справа core-шейдер пака")


if __name__ == "__main__":
    main()
