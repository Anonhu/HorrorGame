#!/usr/bin/env python3
"""
Изометрический рендер раскладки без Minecraft.

Читает TSV, который выгружает `tools/preview/LobbyPreview.java`
(вид: `сцена  x  y  z  ключ`), и рисует картинку настоящими текстурами
нашего пака. Нужен, чтобы смотреть лобби и комнаты ожидания, не запуская
клиент.

    python3 tools/render_blocks.py <layout.tsv> <out-dir>
"""
import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
TEX = os.path.join(ROOT, "assets", "minecraft", "textures", "block")

# ключ раскладки → (верх, бок, цвет-заглушка)
BLOCKS = {
    "tiles": ("deepslate_tiles", "deepslate_tiles", (60, 64, 76)),
    "brick": ("stone_bricks", "stone_bricks", (96, 100, 112)),
    "mossy_brick": ("mossy_stone_bricks", "mossy_stone_bricks", (70, 92, 70)),
    "moss": ("moss_block", "moss_block", (60, 88, 50)),
    "path": ("coarse_dirt", "coarse_dirt", (86, 70, 50)),
    "dirt": ("dirt", "dirt", (66, 48, 34)),
    "grass_block": ("grass_block_top", "grass_block_side", (62, 84, 50)),
    "stone": ("stone", "stone", (74, 79, 92)),
    "water": ("water_still", "water_still", (30, 56, 90)),
    "sand": ("sand", "sand", (140, 128, 100)),
    "leaves": ("pale_oak_leaves", "pale_oak_leaves", (150, 146, 126)),
    "bush": ("fern", "fern", (44, 66, 58)),
    "fern": ("fern", "fern", (44, 66, 58)),
    "dead_bush": ("dead_bush", "dead_bush", (110, 92, 60)),
    "trunk": ("dark_oak_log_top", "dark_oak_log", (50, 38, 26)),
    "log_dark": ("dark_oak_log_top", "dark_oak_log", (44, 33, 24)),
    "pale_log": ("pale_oak_log", "pale_oak_log", (176, 170, 148)),
    "oak_log": ("oak_log_top", "oak_log", (108, 78, 48)),
    "planks_dark": ("dark_oak_planks", "dark_oak_planks", (52, 40, 28)),
    "planks_spruce": ("spruce_planks", "spruce_planks", (60, 44, 30)),
    "floor_hall": ("dark_oak_planks", "dark_oak_planks", (60, 46, 32)),
    "floor_room": ("oak_planks", "oak_planks", (110, 82, 52)),
    "floor_cellar": ("deepslate_tiles", "deepslate_tiles", (56, 60, 70)),
    "chapel": ("stone_bricks", "stone_bricks", (100, 104, 116)),
    "altar": ("lodestone_top", "lodestone_side", (70, 74, 90)),
    "lodestone": ("lodestone_top", "lodestone_side", (70, 74, 90)),
    "fire_on": ("campfire_log", "campfire_fire", (255, 138, 43)),
    "fire_off": ("campfire_log", "campfire_log", (70, 50, 32)),
    # синее пламя в паке не переопределено: берём форму нашего огня и
    # перекрашиваем по яркости в холодную палитру (пятый элемент — цвет)
    "soul_campfire": ("campfire_fire", "campfire_fire", (86, 210, 220), (30, 150, 170)),
    "lantern": ("lantern", "lantern", (255, 176, 70)),
    "soul_lantern": ("soul_lantern", "soul_lantern", (90, 200, 210)),
    "jack": ("jack_o_lantern", "jack_o_lantern", (240, 130, 30)),
    "pumpkin": ("pumpkin_top", "carved_pumpkin", (170, 90, 20)),
    "cobweb": ("cobweb", "cobweb", (210, 210, 205)),
    "barrel": ("barrel_side", "barrel_side", (96, 66, 34)),
    "bookshelf": ("bookshelf", "bookshelf", (120, 90, 56)),
    "hay": ("hay_block_top", "hay_block_side", (176, 150, 40)),
    "skull": ("skeleton_skull", "skeleton_skull", (200, 196, 176)),
    "candle_on": ("candle_lit", "candle_lit", (230, 200, 130)),
    "candle_off": ("candle", "candle", (200, 190, 160)),
    "carpet": ("red_wool", "red_wool", (150, 26, 38)),
    "wool_red": ("red_wool", "red_wool", (150, 26, 38)),
    "iron_bars": ("iron_bars", "iron_bars", (110, 116, 126)),
    "door_locked": ("iron_bars", "iron_bars", (110, 116, 126)),
    "sea_lantern": ("beacon", "beacon", (140, 230, 220)),
    "beacon": ("beacon", "beacon", (140, 230, 220)),
    "sculk_vein": ("sculk_vein", "sculk_vein", (42, 92, 90)),
    "soul_torch": ("soul_torch", "soul_torch", (90, 200, 210)),
    "torch": ("torch", "torch", (255, 200, 90)),
    "iron_chain": ("iron_bars", "iron_bars", (100, 104, 112)),
    "wall": ("spruce_planks", "spruce_planks", (60, 44, 30)),
    "body": ("skeleton_skull", "skeleton_skull", (200, 196, 176)),
    "grabber": ("sculk_vein", "sculk_vein", (42, 92, 90)),
    "logs": ("oak_log_top", "oak_log", (108, 78, 48)),
    "wisp": ("beacon", "beacon", (140, 230, 220)),
    "decoy": ("soul_torch", "soul_torch", (90, 200, 210)),
    "candle": ("candle", "candle", (200, 190, 160)),
}

SCALE = int(os.environ.get("SCALE", "3"))    # увеличение без сглаживания
HW, HH, VH = 7.0, 3.5, 7.0      # полуширина, полувысота ромба и высота блока


def read_png(path):
    """16×16 RGBA (или лента — берём первый кадр)."""
    with open(path, "rb") as f:
        d = f.read()
    pos, idat, pal, trns = 8, b"", None, None
    w = h = bd = ct = 0
    while pos < len(d):
        ln, typ = struct.unpack(">I4s", d[pos:pos + 8])
        pos += 8
        body = d[pos:pos + ln]
        pos += ln + 4
        if typ == b"IHDR":
            w, h, bd, ct, _c, _f, _i = struct.unpack(">IIBBBBB", body)
        elif typ == b"IDAT":
            idat += body
        elif typ == b"PLTE":
            pal = body
        elif typ == b"tRNS":
            trns = body
    raw = zlib.decompress(idat)
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ct]
    bpp = max(1, ch * bd // 8)
    stride = w * bpp
    rows, prev, i = [], bytearray(stride), 0
    for _y in range(h):
        f = raw[i]
        i += 1
        line = bytearray(raw[i:i + stride])
        i += stride
        if f == 1:
            for x in range(bpp, stride):
                line[x] = (line[x] + line[x - bpp]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        row = []
        for x in range(w):
            if ct == 6:
                r, g, b_, a = line[x * 4:x * 4 + 4]
            elif ct == 2:
                r, g, b_ = line[x * 3:x * 3 + 3]
                a = 255
            elif ct == 0:
                r = g = b_ = line[x]
                a = 255
            else:
                idx = line[x]
                r, g, b_ = pal[idx * 3:idx * 3 + 3]
                a = trns[idx] if trns and idx < len(trns) else 255
            row.append((r, g, b_, a))
        rows.append(row[:16] if w >= 16 else row)
        prev = line
    return rows[:16]


def write_png(path, w, h, pixels):
    raw = b""
    for y in range(h):
        raw += b"\x00" + bytes(pixels[y])

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 6))
    png += chunk(b"IEND", b"")
    open(path, "wb").write(png)


class Textures:
    def __init__(self):
        self.cache = {}

    def get(self, name):
        if name in self.cache:
            return self.cache[name]
        path = os.path.join(TEX, name + ".png")
        tex = None
        if os.path.isfile(path):
            try:
                tex = read_png(path)
            except Exception:
                tex = None
        self.cache[name] = tex
        return tex


def face_tint(key, side):
    """Цвет для грани, если текстуры нет (или поверх неё)."""
    entry = BLOCKS.get(key, (None, None, (120, 120, 130)))
    col = entry[2]
    k = 1.0 if side == "top" else (0.72 if side == "left" else 0.55)
    return tuple(min(255, int(c * k)) for c in col)


def tint_of(key):
    """Куда перекрашивать огонь: цвет верхней яркости (нужен для синего пламени)."""
    entry = BLOCKS.get(key)
    if entry and len(entry) > 3:
        return entry[3]
    return None


def shade(px, k):
    return (int(px[0] * k), int(px[1] * k), int(px[2] * k), px[3])


def draw_parallelogram(img, W, H, p0, p1, p3, tex, key, side, tint, tint_mult=None):
    """Заливает параллелограмм p0 + u*(p1-p0) + v*(p3-p0) текстурой."""
    ax, ay = p1[0] - p0[0], p1[1] - p0[1]
    bx, by = p3[0] - p0[0], p3[1] - p0[1]
    det = ax * by - ay * bx
    if abs(det) < 1e-9:
        return
    xs = [p0[0], p1[0], p3[0], p1[0] + bx]
    ys = [p0[1], p1[1], p3[1], p1[1] + by]
    x0, x1 = int(min(xs)), int(max(xs)) + 1
    y0, y1 = int(min(ys)), int(max(ys)) + 1
    k = 1.0 if side == "top" else (0.74 if side == "left" else 0.56)
    for sy in range(max(0, y0), min(H, y1)):
        for sx in range(max(0, x0), min(W, x1)):
            dx = sx + 0.5 - p0[0]
            dy = sy + 0.5 - p0[1]
            u = (dx * by - dy * bx) / det
            v = (ax * dy - ay * dx) / det
            if u < 0 or u >= 1 or v < 0 or v >= 1:
                continue
            if tex is not None:
                px = tex[min(15, int(v * 16))][min(15, int(u * 16))]
                if px[3] < 30:
                    continue
                r, g, b, _a = shade(px, k)
                if tint_mult is not None:
                    # яркость исходного огня → холодная палитра
                    lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
                    deep = (18, 60, 78)
                    hot = tint_mult
                    r = int(deep[0] + (hot[0] - deep[0]) * lum)
                    g = int(deep[1] + (hot[1] - deep[1]) * lum)
                    b = int(deep[2] + (hot[2] - deep[2]) * lum)
            else:
                r, g, b = tuple(int(c * k) for c in tint)
            o = (sy * W + sx) * 4
            img[o:o + 3] = bytes((r, g, b))


def render(blocks, path, title=""):
    """Изометрия: считаем габарит по спроецированным углам, потом рисуем."""
    def proj(x, y, z):
        return ((x - z) * HW, (x + z) * HH - y * VH)

    corners = []
    for (x, y, z, _k) in blocks:
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    corners.append(proj(x + dx, y + dy, z + dz))
    minpx = min(c[0] for c in corners)
    maxpx = max(c[0] for c in corners)
    minpy = min(c[1] for c in corners)
    maxpy = max(c[1] for c in corners)

    pad = 12
    W = int(maxpx - minpx) + pad * 2
    H = int(maxpy - minpy) + pad * 2
    img = bytearray(b"\x10\x12\x18\xff" * (W * H))
    tex = Textures()

    def P(x, y, z):
        sx, sy = proj(x, y, z)
        return (sx - minpx + pad, sy - minpy + pad)

    order = sorted(blocks, key=lambda b: (b[0] + b[2], b[1], b[0]))
    for (x, y, z, key) in order:
        key = key.split("@")[0]
        entry = BLOCKS.get(key, (None, None, (120, 120, 130)))
        top_name, side_name = entry[0], entry[1]
        top_tex = tex.get(top_name) if top_name else None
        side_tex = tex.get(side_name) if side_name else None
        tint = face_tint(key, "top")
        mult = tint_of(key)
        draw_parallelogram(img, W, H, P(x, y + 1, z), P(x + 1, y + 1, z), P(x, y + 1, z + 1),
                           top_tex, key, "top", tint, mult)
        draw_parallelogram(img, W, H, P(x, y, z + 1), P(x + 1, y, z + 1), P(x, y + 1, z + 1),
                           side_tex, key, "left", tint, mult)
        draw_parallelogram(img, W, H, P(x + 1, y, z), P(x + 1, y, z + 1), P(x + 1, y + 1, z),
                           side_tex, key, "right", tint, mult)
    k = SCALE
    if k > 1:
        rows = []
        for i in range(H):
            row = img[i * W * 4:(i + 1) * W * 4]
            wide = bytearray()
            for x in range(W):
                wide += row[x * 4:x * 4 + 4] * k
            for _ in range(k):
                rows.append(bytes(wide))
        write_png(path, W * k, H * k, rows)
        return W * k, H * k
    write_png(path, W, H, [img[i * W * 4:(i + 1) * W * 4] for i in range(H)])
    return W, H


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "layout.tsv"
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "."
    scenes = {}
    for line in open(src, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        scene, x, y, z, key = line.split("\t")
        scenes.setdefault(scene, []).append((int(x), int(y), int(z), key))
    for scene, blocks in scenes.items():
        path = os.path.join(out_dir, "lobby-" + scene + ".png")
        w, h = render(blocks, path)
        print(f"{scene}: {len(blocks)} блоков → {path} ({w}×{h})")


if __name__ == "__main__":
    main()
