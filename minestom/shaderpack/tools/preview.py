#!/usr/bin/env python3
"""
Честный превью-кадр: сцена собрана из наших 16×16 текстур (не скриншот игры)
и обработана ровно теми же формулами, что в shaders/final.fsh.
Слева — как рендерит Minecraft, справа — после PS1-прохода.
"""
import os
import struct
import zlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TEX = os.path.join(ROOT, "resourcepack", "assets", "minecraft", "textures", "block")
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def read_png(path):
    data = open(path, "rb").read()
    pos, w, h, idat = 8, 0, 0, b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        if tag == b"IHDR":
            w, h = struct.unpack(">II", chunk[:8])
        elif tag == b"IDAT":
            idat += chunk
        pos += 12 + length
    raw = zlib.decompress(idat)
    px, stride = [], w * 4
    prev = bytearray(stride)
    i = 0
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
                line[x] = (line[x] + a) & 0xFF
            elif f == 2:
                line[x] = (line[x] + b) & 0xFF
            elif f == 3:
                line[x] = (line[x] + (a + b) // 2) & 0xFF
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 0xFF
        prev = line
        px.append([tuple(line[x * 4:x * 4 + 4]) for x in range(w)])
    return px


def write_png(path, img):
    h, w = len(img), len(img[0])
    raw = b"".join(b"\x00" + b"".join(bytes(p[:4]) for p in row) for row in img)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    open(path, "wb").write(png)


def clamp(v, a=0.0, b=1.0):
    return max(a, min(b, v))


def bayer2(x, y):
    import math
    x, y = math.floor(x), math.floor(y)
    return ((x / 2.0) + (y * y) * 0.75) % 1.0


def bayer4(x, y):
    return bayer2(0.5 * x, 0.5 * y) * 0.25 + bayer2(x, y)


def smoothstep(a, b, x):
    t = clamp((x - a) / (b - a))
    return t * t * (3 - 2 * t)


def scene():
    """96×96: стена из тёмного дуба, пол из камня, фонарь и костёр."""
    W = Hh = 96
    img = [[(0.0, 0.0, 0.0) for _ in range(W)] for _ in range(Hh)]
    planks = read_png(os.path.join(TEX, "dark_oak_planks.png"))
    stones = read_png(os.path.join(TEX, "stone.png"))
    lantern = read_png(os.path.join(TEX, "lantern.png"))
    fire = read_png(os.path.join(TEX, "campfire_fire.png"))
    night = (0.04, 0.05, 0.09)

    for y in range(Hh):
        for x in range(W):
            if y < 12:                               # небо
                t = y / 12.0
                img[y][x] = (night[0] * (1 - t * 0.5), night[1] * (1 - t * 0.4), night[2] * (1 - t * 0.2))
            elif y < 66:                             # стена
                p = planks[(y - 12) % 16][x % 16]
                k = 0.55 + 0.45 * smoothstep(96, 0, x)
                img[y][x] = (p[0] / 255 * k, p[1] / 255 * k, p[2] / 255 * k)
            else:                                    # пол
                p = stones[(y - 66) % 16][x % 16]
                k = 0.5 + 0.5 * (1 - (y - 66) / 30.0)
                img[y][x] = (p[0] / 255 * k, p[1] / 255 * k, p[2] / 255 * k)

    def blit(sprite, ox, oy, scale=1):
        for y in range(16):
            for x in range(16):
                p = sprite[y][x]
                if p[3] < 128:
                    continue
                for dy in range(scale):
                    for dx in range(scale):
                        yy, xx = oy + y * scale + dy, ox + x * scale + dx
                        if 0 <= yy < Hh and 0 <= xx < W:
                            img[yy][xx] = (p[0] / 255, p[1] / 255, p[2] / 255)

    blit(lantern, 20, 30, 2)
    blit(fire, 56, 44, 2)

    # свет от огня и фонаря
    for y in range(Hh):
        for x in range(W):
            for (lx, ly, r, col) in ((36, 46, 34, (1.0, 0.55, 0.16)), (64, 60, 30, (1.0, 0.45, 0.10))):
                d = ((x - lx) ** 2 + (y - ly) ** 2) ** 0.5 / r
                if d < 1:
                    g = (1 - d) ** 2 * 0.9
                    p = img[y][x]
                    img[y][x] = (p[0] + col[0] * g, p[1] + col[1] * g, p[2] + col[2] * g)
    return [[tuple(clamp(v) for v in p) for p in row] for row in img]


def ps1(img):
    """Ровно то, что делает shaders/final.fsh."""
    Hh, W = len(img), len(img[0])
    out = []
    for y in range(Hh):
        row = []
        for x in range(W):
            r, g, b = img[y][x]
            l = 0.299 * r + 0.587 * g + 0.114 * b
            r = l + (r - l) * 1.18
            g = l + (g - l) * 1.18
            b = l + (b - l) * 1.18
            t = smoothstep(0.12, 0.80, l)
            r *= 0.84 + (1.08 - 0.84) * t
            g *= 0.90 + (1.02 - 0.90) * t
            b *= 1.08 + (0.92 - 1.08) * t
            qx, qy = (x + 0.5) / W - 0.5, (y + 0.5) / Hh - 0.5
            v = 1.0 - (qx * qx + qy * qy) * 0.60
            r, g, b = r * v, g * v, b * v
            s = 0.94 + 0.06 * __import__("math").sin((Hh - y) * 3.14159265)
            r, g, b = r * s, g * s, b * s
            d = bayer4(x, Hh - y)
            row.append((clamp(int(min(31.0, r * 31.0 + d)) / 31.0),
                        clamp(int(min(31.0, g * 31.0 + d)) / 31.0),
                        clamp(int(min(31.0, b * 31.0 + d)) / 31.0)))
        out.append(row)
    return out


def upscale(img, k=6):
    return [[p for p in px for _ in range(k)] for px in [row for row in img for _ in range(k)]]


def gradient(w=96, h=16):
    """Гладкий градиент — на нём джиттер видно лучше всего."""
    img = []
    for y in range(h):
        row = []
        for x in range(w):
            t = x / (w - 1.0)
            row.append((t ** 1.3 * 0.95, t ** 1.1 * 0.72, t * 0.42 + (1 - t) * 0.12))
        img.append(row)
    return img


def pair(a, b, k=6):
    left, right = upscale(a, k), upscale(b, k)
    gap = 12
    Hh, W = len(left), len(left[0])
    canvas = [[(0.05, 0.05, 0.07) for _ in range(W * 2 + gap)] for _ in range(Hh)]
    for y in range(Hh):
        for x in range(W):
            canvas[y][x] = left[y][x]
            canvas[y][x + W + gap] = right[y][x]
    return canvas


def main():
    top = pair(scene(), ps1(scene()))
    strip = gradient()
    bottom = pair(strip, ps1(strip))
    gap = 16
    H1, W1 = len(top), len(top[0])
    H2, W2 = len(bottom), len(bottom[0])
    W = max(W1, W2)
    canvas = [[(0.05, 0.05, 0.07) for _ in range(W)] for _ in range(H1 + gap + H2)]
    for y in range(H1):
        for x in range(W1):
            canvas[y][x] = top[y][x]
    for y in range(H2):
        for x in range(W2):
            canvas[H1 + gap + y][x] = bottom[y][x]
    out = [[(int(c[0] * 255), int(c[1] * 255), int(c[2] * 255), 255) for c in row] for row in canvas]
    path = os.path.join(ROOT, "shaderpack", "preview-raw.png")
    write_png(path, out)
    print("preview-raw:", path)


if __name__ == "__main__":
    main()
