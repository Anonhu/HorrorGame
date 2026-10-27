#!/usr/bin/env python3
"""
Генератор PS1-текстур для «ТРЁХ НОЧЕЙ» (Minecraft 26.3).

16×16, ограниченная палитра, упорядоченный джиттер (Bayer 4×4) и
финальное квантование в 5 бит на канал — как на PlayStation.
Запуск:  python3 tools/gen_textures.py   (из папки resourcepack/)
"""
import os
import struct
import zlib

W = H = 16
OUT_BLOCK = os.path.join(os.path.dirname(__file__), "..", "assets", "minecraft", "textures", "block")
OUT_ITEM = os.path.join(os.path.dirname(__file__), "..", "assets", "minecraft", "textures", "item")

# ───────────────────────── палитра ─────────────────────────

def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


NIGHT = (10, 12, 18)
STONE_D, STONE_M, STONE_L = (34, 37, 45), (52, 56, 66), (74, 79, 92)
DIRT_D, DIRT_M, DIRT_L = (48, 35, 26), (66, 48, 34), (86, 64, 45)
WOOD_D, WOOD_M, WOOD_L = (46, 33, 24), (66, 47, 33), (88, 64, 44)
BONE_D, BONE_M, BONE_L = (120, 116, 100), (168, 162, 140), (214, 208, 182)
MOSS_D, MOSS_M, MOSS_L = (28, 46, 41), (40, 66, 58), (58, 89, 76)
GRASS_D, GRASS_M, GRASS_L = (44, 60, 38), (62, 84, 50), (86, 110, 66)
FIRE_D, FIRE_M, FIRE_L = (196, 74, 18), (255, 138, 43), (255, 216, 122)
SOUL_D, SOUL_M, SOUL_L = (24, 96, 120), (56, 186, 196), (176, 244, 236)
BLOOD_D, BLOOD_M, BLOOD_L = (72, 12, 22), (122, 18, 32), (176, 30, 44)
PURPLE_D, PURPLE_M, PURPLE_L = (44, 26, 62), (74, 44, 104), (112, 70, 150)
SAND_D, SAND_M, SAND_L = (92, 82, 62), (122, 110, 84), (152, 140, 110)
IRON_D, IRON_M, IRON_L = (38, 40, 46), (62, 66, 74), (96, 102, 112)
CLEAR = (0, 0, 0, 0)

# ───────────────────────── утилиты ─────────────────────────

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def dither(x, y):
    return (BAYER[y & 3][x & 3] + 0.5) / 16.0


def hsh(x, y, s=0):
    n = (x * 374761393 + y * 668265263 + s * 1274126177) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFFFF) / 0xFFFFFFFF


def blank():
    return [[CLEAR for _ in range(W)] for _ in range(H)]


def put(img, x, y, c):
    if 0 <= x < W and 0 <= y < H:
        if len(c) == 3:
            c = (c[0], c[1], c[2], 255)
        img[y][x] = c


def ramp(img, x, y, colors, t):
    """Кладёт цвет из рампы с джиттером — основа «плойки»."""
    t = max(0.0, min(0.999, t))
    di = (t * (len(colors) - 1)) + (dither(x, y) - 0.5) * 0.9
    i = max(0, min(len(colors) - 1, int(round(di))))
    put(img, x, y, colors[i])


def quantize(img, levels=32):
    """5 бит на канал + шум — финальный «цифровой» вид PS1."""
    out = []
    for y in range(H):
        row = []
        for x in range(W):
            p = img[y][x]
            if p[3] == 0:
                row.append(CLEAR)
                continue
            d = (dither(x, y) - 0.5) * (255.0 / levels)
            row.append(tuple(max(0, min(255, int(round((p[i] + d) / (256.0 / levels)) * (256.0 / levels))))
                             for i in range(3)) + (p[3],))
        out.append(row)
    return out


# ───────────────────────── блоки ─────────────────────────

def stone(img):
    for y in range(H):
        for x in range(W):
            n = hsh(x, y, 1) * 0.6 + hsh(x // 2, y // 2, 2) * 0.4
            ramp(img, x, y, [STONE_D, STONE_M, STONE_L], 0.25 + n * 0.6)
    for i in range(5):  # трещины
        x, y = int(hsh(i, 3, 7) * 15), int(hsh(i, 9, 8) * 15)
        for k in range(3):
            put(img, (x + k) % 16, (y + k // 2) % 16, STONE_D)


def dirt(img, coarse=False):
    for y in range(H):
        for x in range(W):
            n = hsh(x, y, 3) * 0.7 + hsh(x // 3, y // 3, 4) * 0.3
            ramp(img, x, y, [DIRT_D, DIRT_M, DIRT_L], 0.05 + n * 0.95)
    if coarse:
        for (x, y) in [(3, 4), (10, 3), (6, 11), (12, 12), (1, 13), (8, 6)]:
            put(img, x, y, STONE_L)
            put(img, x + 1, y, STONE_M)
            put(img, x, y + 1, STONE_D)


def grass_top(img):
    for y in range(H):
        for x in range(W):
            n = hsh(x, y, 5) * 0.7 + hsh(x // 2, y // 2, 6) * 0.3
            ramp(img, x, y, [GRASS_D, GRASS_M, GRASS_L], 0.2 + n * 0.8)


def grass_side(img):
    dirt(img)
    for x in range(W):
        depth = 3 + int(hsh(x, 0, 9) * 3)
        for y in range(depth):
            ramp(img, x, y, [GRASS_D, GRASS_M, GRASS_L], 0.3 + hsh(x, y, 10) * 0.6)


def grass_overlay(img):
    img[:] = blank()
    for x in range(W):
        depth = 3 + int(hsh(x, 0, 11) * 3)
        for y in range(depth):
            c = mix(GRASS_M, GRASS_L, hsh(x, y, 12))
            put(img, x, y, (c[0], c[1], c[2], 210))


def planks(img, dark=False, pale=False):
    if pale:
        base = [(52, 38, 26), (74, 54, 36), (98, 74, 48)]      # дуб
    if dark:
        base = [(26, 20, 16), (40, 30, 22), (56, 43, 30)]       # ель, почти чёрная
    if not dark and not pale:
        base = [(44, 31, 21), (62, 45, 30), (84, 62, 42)]       # тёмный дуб
    if dark and pale:
        base = [(60, 54, 42), (84, 76, 58), (110, 100, 76)]     # серые доски
    for y in range(H):
        board = y // 4
        seam = (y % 4 == 3)
        joint_x = 5 if board % 2 == 0 else 11
        tone = hsh(board, 0, 50) * 0.25
        for x in range(W):
            joint = (x == joint_x)
            n = hsh(x, y, 13) * 0.35 + hsh(x // 2, board, 14) * 0.65
            t = 0.28 + n * 0.55 + tone
            if seam:
                t = 0.02
            elif joint and not seam:
                t *= 0.25
            ramp(img, x, y, base, t)


def deepslate_tiles(img):
    for y in range(H):
        for x in range(W):
            grout = (x % 8 == 0) or (y % 8 == 0)
            n = hsh(x, y, 15) * 0.6 + hsh(x // 2, y // 2, 16) * 0.4
            if grout:
                ramp(img, x, y, [NIGHT, STONE_D], 0.3 + n * 0.5)
            else:
                ramp(img, x, y, [STONE_D, STONE_M, STONE_L], 0.1 + n * 0.7)


def stone_bricks(img):
    for y in range(H):
        for x in range(W):
            row = y // 8
            off = 0 if row == 0 else 4
            mortar = (y % 8 == 7) or ((x + off) % 8 == 7)
            n = hsh(x, y, 17) * 0.6 + hsh(x // 2, y // 2, 18) * 0.4
            if mortar:
                ramp(img, x, y, [STONE_D, STONE_M], 0.1 + n * 0.4)
            else:
                ramp(img, x, y, [STONE_M, STONE_L], 0.2 + n * 0.7)


def sand(img):
    for y in range(H):
        for x in range(W):
            n = hsh(x, y, 19)
            ramp(img, x, y, [SAND_D, SAND_M, SAND_L], 0.2 + n * 0.7)


def water(img):
    for y in range(H):
        for x in range(W):
            w = 0.5 + 0.5 * ((x * 0.55 + y * 0.3) % 3.0) / 3.0
            n = hsh(x, y, 20) * 0.35 + w * 0.65
            ramp(img, x, y, [(12, 24, 34), (20, 38, 52), (30, 56, 74)], 0.1 + n * 0.8)


def log_side(img, dark=False):
    base = [(58, 42, 28), (84, 60, 38), (112, 82, 50)]
    if dark:
        base = [(28, 21, 16), (44, 33, 24), (62, 47, 33)]
    for y in range(H):
        for x in range(W):
            edge = x in (0, 15)
            grain = 0.5 + 0.5 * ((x * 1.9 + (hsh(x // 2, y, 21) - 0.5) * 3.0) % 3.0) / 3.0
            n = hsh(x, y, 22) * 0.35 + grain * 0.65
            t = 0.1 + n * 0.85
            if edge:
                t *= 0.3
            ramp(img, x, y, base, t)


def log_top(img, dark=False):
    base = [WOOD_D, WOOD_M, WOOD_L]
    if dark:
        base = [tuple(int(c * 0.6) for c in v) for v in base]
    for y in range(H):
        for x in range(W):
            d = max(abs(x - 7.5), abs(y - 7.5))
            ring = (int(d * 1.6) % 2 == 0)
            n = hsh(x, y, 23) * 0.3
            t = (0.75 if ring else 0.35) + n
            ramp(img, x, y, base, t)


def leaves(img, pale=True):
    if pale:
        base = [BONE_D, BONE_M, BONE_L]
    else:
        base = [MOSS_D, MOSS_M, MOSS_L]
    for y in range(H):
        for x in range(W):
            n = hsh(x, y, 24)
            if n < 0.16:                     # дыры в кроне
                continue
            t = n * 0.9
            if hsh(x // 2, y // 2, 25) > 0.82:
                t += 0.3
            ramp(img, x, y, base, t)


def fern(img):
    for y in range(H):
        for x in range(W):
            stem = abs(x - (7.5 + (y - 15) * 0.12)) < 1.1
            leaf = (y % 4 in (1, 2)) and abs(x - 7.5) < (6 - y * 0.3)
            if stem or (leaf and hsh(x, y, 26) > 0.35):
                ramp(img, x, y, [GRASS_D, GRASS_M, GRASS_L], 0.3 + hsh(x, y, 27) * 0.6)


def sculk_vein(img):
    for y in range(H):
        for x in range(W):
            v = hsh(x // 2, y // 2, 28)
            if v > 0.55:
                ramp(img, x, y, [(10, 20, 26), (24, 52, 54), (42, 92, 90)], 0.2 + hsh(x, y, 29) * 0.7)


def lantern(img, soul=False):
    frame = [IRON_D, IRON_M, IRON_L]
    for y in range(H):
        for x in range(W):
            edge = x in (0, 15) or y in (0, 15)
            corner = (x in (0, 15)) and (y in (0, 15))
            if corner:
                continue
            if edge or (x in (7, 8) and y in (0, 1)) or (y in (6, 9) and x in (0, 1, 14, 15)):
                ramp(img, x, y, frame, 0.3 + hsh(x, y, 30) * 0.6)
            else:
                inner = max(abs(x - 7.5), abs(y - 7.5))
                glow = 1.0 - inner / 8.0
                if soul:
                    ramp(img, x, y, [SOUL_D, SOUL_M, SOUL_L], 0.15 + glow * 0.9 + hsh(x, y, 31) * 0.2)
                else:
                    ramp(img, x, y, [FIRE_D, FIRE_M, FIRE_L], 0.1 + glow * 0.95 + hsh(x, y, 32) * 0.2)


def torch(img, soul=False):
    for y in range(16):
        if y < 6:
            continue
        for x in range(7, 9):
            ramp(img, x, y, [WOOD_D, WOOD_M, WOOD_L], 0.3 + hsh(x, y, 33) * 0.5)
    fl = [SOUL_D, SOUL_M, SOUL_L] if soul else [FIRE_D, FIRE_M, FIRE_L]
    for (x, y) in [(7, 2), (8, 2), (7, 3), (8, 3), (6, 3), (9, 3), (7, 4), (8, 4), (7, 1), (8, 1)]:
        ramp(img, x, y, fl, 0.5 + hsh(x, y, 34) * 0.5)


def candle(img, lit=True):
    for y in range(5, 16):
        half = 2 if y > 8 else 1
        for x in range(8 - half - 1, 8 + half):
            edge = x in (8 - half - 1, 7 + half)
            t = 0.35 if edge else 0.8
            ramp(img, x, y, [BONE_D, BONE_M, BONE_L], t + hsh(x, y, 35) * 0.2)
    for x in range(5, 12):                       # подтёк у основания
        ramp(img, x, 15, [BONE_D, BONE_M], 0.3)
    put(img, 7, 12, BONE_L)
    put(img, 4, 11, BONE_M)
    if lit:
        for (x, y, t) in [(7, 4, 0.95), (8, 4, 0.85), (7, 3, 1.0), (8, 3, 0.75), (7, 2, 0.65), (6, 4, 0.6)]:
            ramp(img, x, y, [FIRE_D, FIRE_M, FIRE_L], t)
    else:
        put(img, 8, 4, (26, 22, 20))
        put(img, 8, 3, (26, 22, 20))


def iron_bars(img):
    for y in range(H):
        for x in range(W):
            if x in (2, 3, 10, 11) or y in (3, 12):
                ramp(img, x, y, [IRON_D, IRON_M, IRON_L], 0.3 + hsh(x, y, 36) * 0.6)


def lodestone(img):
    stone(img)
    for i in range(16):  # руна
        x, y = i, 8
        put(img, x, y, (18, 18, 22))
    for (x, y) in [(4, 4), (11, 4), (4, 11), (11, 11), (7, 7), (8, 8)]:
        ramp(img, x, y, [FIRE_D, FIRE_M], 0.6)
    for (x, y) in [(5, 5), (10, 10), (10, 5), (5, 10)]:
        put(img, x, y, PURPLE_L)


def campfire_logs(img, lit=False):
    for log in range(4):
        top = log * 4
        for x in range(W):
            if x in (0, 15):
                continue
            for k in range(3):
                y = top + k
                shade = [0.75, 0.45, 0.22][k]
                t = shade + hsh(x, y, 37) * 0.25
                if x < 3 or x > 12:
                    t *= 0.55
                if lit and k == 0 and hsh(x, y, 38) > 0.62:
                    ramp(img, x, y, [FIRE_D, FIRE_M], hsh(x, y, 39))
                else:
                    ramp(img, x, y, [WOOD_D, WOOD_M, WOOD_L], t)
            ramp(img, x, top + 3, [NIGHT, (20, 14, 10)], 0.6)


def campfire_fire(img):
    for y in range(H):
        for x in range(W):
            cxm = abs(x - 7.5) / 8.0
            flame = 1.0 - y / 16.0 - cxm * 0.9 + hsh(x, y, 40) * 0.35
            if flame > 0.25:
                ramp(img, x, y, [FIRE_D, FIRE_M, FIRE_L], flame)


def wool(img, c):
    for y in range(H):
        for x in range(W):
            n = hsh(x, y, 41) * 0.45 + hsh(x // 2, y // 2, 42) * 0.55
            put(img, x, y, mix(tuple(int(v * 0.55) for v in c), c, 0.35 + n * 0.65))


def beacon(img):
    for y in range(H):
        for x in range(W):
            d = max(abs(x - 7.5), abs(y - 7.5))
            if d > 5.5:
                ramp(img, x, y, [NIGHT, PURPLE_D], 0.4 + hsh(x, y, 43) * 0.5)
            else:
                ramp(img, x, y, [SOUL_D, SOUL_M, SOUL_L], 0.9 - d / 8.0)


def door(img):
    for y in range(H):
        for x in range(W):
            if x in (1, 14) or y == 0:
                ramp(img, x, y, [WOOD_D, WOOD_M], 0.4)
            elif y == 5 or y == 10:
                ramp(img, x, y, [WOOD_D, WOOD_M], 0.3)
            elif 3 <= y <= 4 and 10 <= x <= 12:
                ramp(img, x, y, [PURPLE_D, PURPLE_M], 0.5)
            else:
                ramp(img, x, y, [WOOD_M, WOOD_L], 0.2 + hsh(x, y, 44) * 0.6)


def compass(img):
    for y in range(H):
        for x in range(W):
            d = ((x - 7.5) ** 2 + (y - 7.5) ** 2) ** 0.5
            if 5.2 < d < 7.2:
                ramp(img, x, y, [IRON_D, IRON_M, IRON_L], 0.4 + hsh(x, y, 45) * 0.5)
            elif d <= 5.2:
                ramp(img, x, y, [NIGHT, PURPLE_D], 0.3 + hsh(x, y, 46) * 0.5)
    for i in range(6):
        put(img, 7 + (i % 2), 3 + i, BLOOD_L if i < 3 else BONE_L)


# ───────────────────────── запись ─────────────────────────

def write_png(path, img):
    raw = b""
    for row in img:
        raw += b"\x00"
        for p in row:
            raw += bytes((p[0], p[1], p[2], p[3] if len(p) > 3 else 255))
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)


def pack_icon():
    """64×64 иконка пака: фонарь в ночи."""
    size = 64
    img = [[(0, 0, 0, 255)] * size for _ in range(size)]
    for y in range(size):
        for x in range(size):
            d = ((x - 32) ** 2 + (y - 32) ** 2) ** 0.5 / 45.0
            c = mix(mix(PURPLE_D, NIGHT, min(1.0, d)), (6, 7, 11), 0.35)
            j = (dither(x, y) - 0.5) * 12
            img[y][x] = (max(0, min(255, c[0] + int(j))), max(0, min(255, c[1] + int(j))),
                         max(0, min(255, c[2] + int(j))), 255)
    # тёплое свечение
    for y in range(size):
        for x in range(size):
            d = ((x - 32) ** 2 + (y - 30) ** 2) ** 0.5
            if d < 26:
                g = (1 - d / 26) ** 2
                p0 = img[y][x]
                img[y][x] = (min(255, int(p0[0] + 90 * g)), min(255, int(p0[1] + 46 * g)),
                             min(255, int(p0[2] + 12 * g)), 255)
    lantern_img = blank()
    lantern(lantern_img)
    for y in range(32):
        for x in range(32):
            src = lantern_img[y // 2][x // 2]
            if src[3] == 0:
                continue
            img[16 + y][16 + x] = (src[0], src[1], src[2], 255)
    for i in range(size):     # рамка
        for (x, y) in ((i, 0), (i, size - 1), (0, i), (size - 1, i)):
            img[y][x] = (BONE_D[0], BONE_D[1], BONE_D[2], 255)
    return img


def write_generic(path, img):
    h = len(img)
    w = len(img[0])
    raw = b""
    for row in img:
        raw += b"\x00"
        for p in row:
            raw += bytes(p[:4])
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    blocks = {}

    def add(name, fn, *a, **kw):
        img = blank()
        fn(img, *a, **kw)
        blocks[name] = quantize(img)

    add("stone", stone)
    add("dirt", dirt)
    add("coarse_dirt", dirt, coarse=True)
    add("grass_block_top", grass_top)
    add("grass_block_side", grass_side)
    add("grass_block_side_overlay", grass_overlay)
    add("oak_planks", planks)
    add("spruce_planks", planks, dark=True)
    add("dark_oak_planks", planks, dark=True, pale=True)
    add("deepslate_tiles", deepslate_tiles)
    add("stone_bricks", stone_bricks)
    add("sand", sand)
    add("water_still", water)
    add("oak_log", log_side)
    add("oak_log_top", log_top)
    add("dark_oak_log", log_side, dark=True)
    add("dark_oak_log_top", log_top, dark=True)
    add("pale_oak_leaves", leaves)
    add("oak_leaves", leaves, pale=False)
    add("fern", fern)
    add("sculk_vein", sculk_vein)
    add("lantern", lantern)
    add("soul_lantern", lantern, soul=True)
    add("torch", torch)
    add("soul_torch", torch, soul=True)
    add("candle", candle, lit=False)
    add("candle_lit", candle, lit=True)
    add("iron_bars", iron_bars)
    add("lodestone", lodestone)
    add("campfire_log", campfire_logs)
    add("campfire_log_lit", campfire_logs, lit=True)
    add("campfire_fire", campfire_fire)
    add("red_wool", wool, BLOOD_M)
    add("beacon", beacon)
    add("dark_oak_door", door)
    add("recovery_compass", compass)

    for name, img in blocks.items():
        write_png(os.path.join(OUT_BLOCK, name + ".png"), img)

    # иконки предметов — те же мотивы, отдельная папка
    items = {
        "lantern": blocks["lantern"],
        "soul_lantern": blocks["soul_lantern"],
        "candle": blocks["candle_lit"],
        "campfire": blocks["campfire_fire"],
        "beacon": blocks["beacon"],
        "dark_oak_door": blocks["dark_oak_door"],
        "recovery_compass": blocks["recovery_compass"],
    }
    for name, img in items.items():
        write_png(os.path.join(OUT_ITEM, name + ".png"), img)

    write_generic(os.path.join(os.path.dirname(__file__), "..", "pack.png"), pack_icon())
    print("текстур:", len(blocks), "+ предметов:", len(items))


if __name__ == "__main__":
    main()
