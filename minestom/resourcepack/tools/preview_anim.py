#!/usr/bin/env python3
"""
Плёнка анимации: показывает кадры анимированной текстуры пака рядом.

Нужна, чтобы «анимация есть» было видно, а не только написано: любая
текстура из assets/…/textures/block/<имя>.png — вертикальная лента
16×16N; скрипт режет её на кадры и собирает в один PNG.

    python3 tools/preview_anim.py                 все анимированные текстуры
    python3 tools/preview_anim.py campfire_fire   одну
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_blocks import Textures, write_png  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
TEX = os.path.join(ROOT, "assets", "minecraft", "textures", "block")
SCALE = 6
GAP = 4


def strip(name):
    """(кадры, frametime) из ленты 16×16N и соседнего .mcmeta."""
    path = os.path.join(TEX, name + ".png")
    if not os.path.isfile(path):
        return None, 0
    import struct
    import zlib
    data = open(path, "rb").read()
    w, h = struct.unpack(">II", data[16:24])
    frames = h // 16
    frametime = 0
    meta = path + ".mcmeta"
    if os.path.isfile(meta):
        frametime = json.load(open(meta))["animation"].get("frametime", 1)
    # Textures.read_png берёт первые 16 строк — читаем сами, кадр за кадром
    rows = read_strip(path)
    return [rows[i * 16:(i + 1) * 16] for i in range(frames)], frametime


def read_strip(path):
    import struct
    import zlib
    data = open(path, "rb").read()
    pos, idat = 8, b""
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        if tag == b"IHDR":
            w, h = struct.unpack(">II", body[:8])
        elif tag == b"IDAT":
            idat += body
        pos += 12 + ln
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


def film(frames, path, bg=(14, 16, 22)):
    per = len(frames)
    W = per * 16 * SCALE + (per + 1) * GAP
    H = 16 * SCALE + 2 * GAP
    rows = [[bg + (255,) for _ in range(W)] for _ in range(H)]
    for i, frame in enumerate(frames):
        ox = GAP + i * (16 * SCALE + GAP)
        for y in range(16):
            for x in range(16):
                px = frame[y][x]
                if px[3] < 30:
                    continue
                for dy in range(SCALE):
                    for dx in range(SCALE):
                        rows[GAP + y * SCALE + dy][ox + x * SCALE + dx] = px
    write_png(path, W, H, [bytes(c for px in row for c in px) for row in rows])
    return W, H


def main():
    names = sys.argv[1:] or ["campfire_fire", "campfire_log_lit", "lantern",
                             "soul_lantern", "water_still", "sculk_vein", "pale_oak_leaves"]
    for name in names:
        frames, frametime = strip(name)
        if not frames:
            print(f"{name}: нет файла")
            continue
        out = os.path.join(ROOT, "preview-anim-" + name + ".png")
        w, h = film(frames, out)
        print(f"{name}: {len(frames)} кадров по {frametime} тик(ов) → "
              f"{os.path.basename(out)} ({w}×{h})")


if __name__ == "__main__":
    main()
