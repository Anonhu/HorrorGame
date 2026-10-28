#!/usr/bin/env python3
"""
Проверка «пак собран точно под Minecraft 26.3».

Сверяет pack.mcmeta с настоящими номерами версии и каждое имя текстуры
со списком файлов ванильного клиента 26.3. Источник — misode/mcmeta,
теги `26.3-summary` и `26.3-assets` (распакованный клиент 26.3).

    python3 tools/verify_26_3.py            проверить (кэш из репозитория)
    python3 tools/verify_26_3.py --refresh  перекачать список и обновить кэш
"""
import base64
import json
import struct
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
CACHE = os.path.join(HERE, "vanilla-26.3.json")
VERSION_TAG = "26.3-summary"
ASSETS_TAG = "26.3-assets"

EXPECT_MINOR = (97, 0)
EXPECT_MAX = (97, 1)
EXPECT_INT = 97


def api(path):
    req = urllib.request.Request("https://api.github.com" + path,
                                 headers={"User-Agent": "three-nights-verify"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def fetch():
    """Скачивает version.json и список текстур настоящего клиента 26.3."""
    version = json.loads(base64.b64decode(
        api("/repos/misode/mcmeta/contents/version.json?ref=" + VERSION_TAG)["content"]).decode())
    tree = api("/repos/misode/mcmeta/git/trees/" + ASSETS_TAG + "?recursive=1")
    paths = sorted(t["path"] for t in tree["tree"]
                   if t["type"] == "blob"
                   and (t["path"].startswith("assets/minecraft/textures/block/")
                        or t["path"].startswith("assets/minecraft/textures/item/")))
    data = {
        "source": "github.com/misode/mcmeta tags " + VERSION_TAG + " / " + ASSETS_TAG,
        "version": {
            "id": version["id"],
            "protocol": version["protocol_version"],
            "data_pack": [version["data_pack_version"], version["data_pack_version_minor"]],
            "resource_pack": [version["resource_pack_version"], version["resource_pack_version_minor"]],
        },
        "textures": paths,
    }
    json.dump(data, open(CACHE, "w"), ensure_ascii=False, indent=0)
    return data


def load(refresh):
    if refresh or not os.path.exists(CACHE):
        try:
            print("· качаю список текстур 26.3 с api.github.com…")
            return fetch()
        except Exception as e:
            if not os.path.exists(CACHE):
                print("НЕ УДАЛОСЬ получить эталон 26.3:", e)
                sys.exit(2)
            print("· сеть недоступна, беру кэш:", e)
    return json.load(open(CACHE))


def main():
    refresh = "--refresh" in sys.argv
    data = load(refresh)
    v = data["version"]
    mine = set(data["textures"])
    fails = 0

    print("эталон:", v["id"], "| protocol", v["protocol"],
          "| data pack", ".".join(map(str, v["data_pack"])),
          "| resource pack", ".".join(map(str, v["resource_pack"])))

    meta = json.load(open(os.path.join(ROOT, "pack.mcmeta")))["pack"]
    checks = [
        ("pack_format", meta.get("pack_format"), EXPECT_INT),
        ("min_format", tuple(meta.get("min_format", ())), EXPECT_MINOR),
        ("max_format", tuple(meta.get("max_format", ())), EXPECT_MAX),
    ]
    for name, got, want in checks:
        ok = got == want
        fails += 0 if ok else 1
        print(("  ok   " if ok else "  FAIL ") + f"{name}: {got} (нужно {want})")

    if tuple(v["resource_pack"]) != (EXPECT_INT, EXPECT_MAX[1]):
        print("  ВНИМАНИЕ: эталон 26.3 говорит resource pack",
              ".".join(map(str, v["resource_pack"])), "— обновите pack.mcmeta")

    missing, shipped = [], 0
    tex_root = os.path.join(ROOT, "assets", "minecraft", "textures")
    for base, _dirs, names in os.walk(tex_root):
        for n in names:
            if not n.endswith(".png"):
                continue
            rel = os.path.relpath(os.path.join(base, n), os.path.join(ROOT, "assets")).replace(os.sep, "/")
            rel = "assets/" + rel
            shipped += 1
            if rel not in mine:
                missing.append(rel)

    print(f"  ok   текстур в паке: {shipped}" if not missing else f"  FAIL текстур в паке: {shipped}")
    for m in missing:
        fails += 1
        print("       нет в ваниле 26.3:", m)

    fails += check_animations(tex_root)

    if fails == 0:
        print("ИТОГ: пак собран точно под Minecraft 26.3 — все имена файлов существуют в клиенте.")
    else:
        print("ИТОГ: проблем —", fails)
    sys.exit(1 if fails else 0)


def png_size(path):
    """(ширина, высота) из IHDR без внешних библиотек."""
    data = open(path, "rb").read(24)
    return struct.unpack(">II", data[16:24])


def check_animations(tex_root):
    """Анимации: лента 16×16N плюс .png.mcmeta — иначе клиент покажет один кадр.

    Правило клиента: `animation` в .mcmeta нужен, чтобы PNG высотой больше 16
    считался лентой; без него берётся первый кадр (костёр «не горит»).
    """
    anim = ["campfire_fire", "campfire_log_lit", "lantern", "soul_lantern",
            "water_still", "oak_leaves", "pale_oak_leaves", "sculk_vein"]
    fails = 0
    print("  ·    анимации:")
    for name in anim:
        png = os.path.join(tex_root, "block", name + ".png")
        if not os.path.isfile(png):
            fails += 1
            print(f"  FAIL {name}.png нет")
            continue
        w, h = png_size(png)
        meta = png + ".mcmeta"
        frames = h / 16
        ok = True
        why = ""
        if w != 16 or h % 16:
            ok, why = False, f"лента должна быть 16×(16·кадры), а она {w}×{h}"
        elif frames < 2:
            ok, why = False, "один кадр — это не анимация"
        elif not os.path.isfile(meta):
            ok, why = False, "нет .png.mcmeta — клиент возьмёт только первый кадр"
        else:
            try:
                anim_cfg = json.load(open(meta))["animation"]
            except Exception as e:  # noqa: BLE001
                ok, why = False, f".mcmeta не читается: {e}"
            else:
                if "frametime" not in anim_cfg and "frames" not in anim_cfg:
                    ok, why = False, ".mcmeta без frametime/frames"
        if ok:
            ft = json.load(open(meta))["animation"].get("frametime", 1)
            print(f"  ok   {name}: {int(frames)} кадров, frametime {ft}, лента {w}×{h}")
        else:
            fails += 1
            print(f"  FAIL {name}: {why}")
    # лишние .mcmeta без ленты тоже ошибка: клиент сочтёт текстуру лентой
    for base, _d, names in os.walk(tex_root):
        for n in names:
            if not n.endswith(".png.mcmeta"):
                continue
            png = os.path.join(base, n[:-7])
            if not os.path.isfile(png):
                fails += 1
                print(f"  FAIL {n}: рядом нет PNG")
            elif png_size(png)[1] <= 16:
                fails += 1
                print(f"  FAIL {n}: PNG высотой 16, а .mcmeta обещает ленту")
    return fails


if __name__ == "__main__":
    main()
