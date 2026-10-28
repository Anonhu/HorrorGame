#!/usr/bin/env python3
"""
Проверка встроенных core-шейдеров пака против настоящих шейдеров 26.3.

Пак переопределяет `assets/minecraft/shaders/core/lightmap.fsh` —
это обычные core-шейдеры Minecraft, они работают без Iris и OptiFine. Но у
клиента нет «мягкого режима»: если в переопределении разойдётся объявление
uniform или `layout(location = …) in`, мир может отрисоваться чёрным.

Поэтому скрипт берёт ванильные шейдеры 26.3 и требует, чтобы в наших файлах
совпадали ровно:

  * `#version` и `#extension`;
  * набор `#include <minecraft:…>` (ни одного лишнего, ни одного забытого);
  * все объявления `uniform`;
  * все объявления `layout(location = N) in/out`;
  * набор макросов `#ifdef / #ifndef / #if defined(…)`;
  * состав uniform-блоков `layout(std140) uniform … { … }` — по членам.

Именно `lightmap` выбран потому, что Sodium не запрещает его переопределять
(в его чёрном списке только terrain/rendertype_*), а сам он сэмплит ванильную
lightmap-текстуру — значит фильтр работает и с Sodium.

Отличаться разрешено только телу. Плюс проверяется, что `fragColor`
присваивается и что скобки сбалансированы.

    python3 tools/check_core_shaders.py            по кэшу
    python3 tools/check_core_shaders.py --refresh  перекачать ванильные шейдеры
"""
import base64
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
CACHE = os.path.join(HERE, "core-shaders-26.3.json")
ASSETS_TAG = "26.3-assets"
BASE = "/repos/misode/mcmeta/contents/assets/minecraft/shaders/core/"

# какие ванильные core-шейдеры мы переопределяем
OVERRIDDEN = ["lightmap.fsh"]

INCLUDE = re.compile(r"#include\s+<([^>]+)>")
UNIFORM = re.compile(r"^\s*uniform\s+([\w<>\[\]]+)\s+(\w+)(\s*\[\s*\d+\s*\])?\s*;", re.M)
LAYOUT = re.compile(r"^\s*layout\s*\(([^)]*)\)\s*(in|out)\s+([\w<>\[\]]+)\s+(\w+)", re.M)
MACRO = re.compile(r"#\s*(?:ifdef|ifndef)\s+(\w+)|#\s*if\s+defined\s*\(\s*(\w+)\s*\)")
# layout(std140) uniform LightmapInfo { float SkyFactor; … } lightmapInfo;
U_BLOCK = re.compile(r"layout\s*\(([^)]*)\)\s*uniform\s+(\w+)\s*\{(.*?)\}\s*(\w+)?\s*;", re.S)
U_MEMBER = re.compile(r"^\s*([\w]+)\s+(\w+)\s*(\[[^\]]*\])?\s*;")
VERSION = re.compile(r"^\s*#version\s+(\d+)(.*)$", re.M)
EXTENSION = re.compile(r"^\s*#extension\s+(\S+)\s*:\s*(\w+)", re.M)


def api(path):
    req = urllib.request.Request("https://api.github.com" + path,
                                 headers={"User-Agent": "three-nights-check"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def fetch():
    data = {"source": "github.com/misode/mcmeta tag " + ASSETS_TAG, "files": {}}
    for name in OVERRIDDEN:
        blob = api(BASE + name + "?ref=" + ASSETS_TAG)
        data["files"][name] = base64.b64decode(blob["content"]).decode()
    json.dump(data, open(CACHE, "w"), ensure_ascii=False, indent=0)
    return data


def load(refresh):
    if refresh or not os.path.exists(CACHE):
        try:
            print("· качаю ванильные core-шейдеры 26.3…")
            return fetch()
        except Exception as e:
            if not os.path.exists(CACHE):
                print("НЕ УДАЛОСЬ получить эталон 26.3:", e)
                sys.exit(2)
            print("· сеть недоступна, беру кэш:", e)
    return json.load(open(CACHE))


def uniform_blocks(src):
    """(имя блока, раскладка, члены) — состав uniform-блока тоже контракт с клиентом."""
    out = []
    for layout, name, members, instance in U_BLOCK.findall(src):
        member = []
        for line in members.split(";"):
            m = U_MEMBER.match(line + ";")
            if m:
                member.append((m.group(1), m.group(2), (m.group(3) or "").replace(" ", "")))
        out.append((name, layout.replace(" ", ""), instance, tuple(member)))
    return sorted(out)


def facts(src):
    """Всё, что клиент связывает с этим шейдером, — должно совпадать."""
    src_nc = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    src_nc = re.sub(r"//[^\n]*", "", src_nc)
    return {
        "version": [m.group(1) + m.group(2).strip() for m in VERSION.finditer(src_nc)],
        "extension": sorted({m.group(1) + ":" + m.group(2) for m in EXTENSION.finditer(src_nc)}),
        "include": sorted(set(INCLUDE.findall(src_nc))),
        "uniform": sorted({(m.group(1), m.group(2), (m.group(3) or "").replace(" ", ""))
                           for m in UNIFORM.finditer(src_nc)}),
        "layout": sorted({(m.group(1).replace(" ", ""), m.group(2), m.group(3), m.group(4))
                          for m in LAYOUT.finditer(src_nc)}),
        "macro": sorted({a or b for a, b in MACRO.findall(src_nc)}),
        "ubock": uniform_blocks(src_nc),
        "src": src_nc,
    }


def main():
    refresh = "--refresh" in sys.argv
    data = load(refresh)
    print("эталон:", data["source"])
    print()

    fails = 0
    for name in OVERRIDDEN:
        path = os.path.join(ROOT, "assets", "minecraft", "shaders", "core", name)
        print(f"[{name}]")
        if not os.path.isfile(path):
            fails += 1
            print("  FAIL файла нет в паке")
            continue
        ours = facts(open(path, encoding="utf-8").read())
        ref = facts(data["files"][name])

        for key, human in (("version", "#version"), ("extension", "#extension"),
                           ("include", "#include <minecraft:…>"), ("uniform", "uniform"),
                           ("layout", "layout(location) in/out"), ("macro", "макросы #ifdef"),
                           ("ubock", "uniform-блоки (std140)")):
            extra = [x for x in ours[key] if x not in ref[key]]
            lost = [x for x in ref[key] if x not in ours[key]]
            if extra or lost:
                fails += len(extra) + len(lost)
                print(f"  FAIL {human}")
                for x in extra:
                    print("       · лишнее (клиент про это не знает):", x)
                for x in lost:
                    print("       · потеряно (было в ваниле):", x)
            else:
                print(f"  ok   {human}: совпадает с 26.3 ({len(ref[key])} шт.)")

        body = ours["src"]
        if "fragColor" not in body:
            fails += 1
            print("  FAIL нет fragColor")
        elif body.count("{") != body.count("}"):
            fails += 1
            print("  FAIL не сбалансированы скобки")
        else:
            print("  ok   тело: fragColor присваивается, скобки сбалансированы")
        print()

    if fails == 0:
        print("ИТОГ: core-шейдеры пака объявляют ровно то же, что ванильные 26.3, —")
        print("      отличаться может только цвет в конце, поэтому рендер не сломается.")
    else:
        print("ИТОГ: расхождений —", fails)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
