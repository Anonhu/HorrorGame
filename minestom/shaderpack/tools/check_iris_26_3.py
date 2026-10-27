#!/usr/bin/env python3
"""
Проверка шейдерпаков «точно под Minecraft 26.3 / Iris 26.3».

Скрипт скачивает исходники Iris с ветки `26.3` (та, что собирается под MC 26.3),
вытаскивает из трансформеров список compatibility-имён, которые Iris реально
переписывает, и проверяет, что каждый `gl_*`/`ftransform` в наших шейдерах
попадает в этот список. Плюс проверяет директивы shaders.properties по
белому списку Iris 26.3 и синтаксис GLSL (скобки, наличие #version).

    python3 tools/check_iris_26_3.py            проверить по кэшу
    python3 tools/check_iris_26_3.py --refresh  обновить эталон с GitHub
"""
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
CACHE = os.path.join(HERE, "iris-26.3.json")
REF = "26.3"

SOURCES = [
    "common/src/main/java/net/irisshaders/iris/pipeline/transform/transformer/CommonTransformer.java",
    "common/src/main/java/net/irisshaders/iris/pipeline/transform/transformer/CompositeTransformer.java",
    "common/src/main/java/net/irisshaders/iris/pipeline/transform/transformer/SodiumTransformer.java",
    "common/src/main/java/net/irisshaders/iris/pipeline/transform/transformer/VanillaTransformer.java",
    "common/src/main/java/net/irisshaders/iris/pipeline/transform/transformer/VanillaCoreTransformer.java",
    "common/src/main/java/net/irisshaders/iris/shaderpack/properties/ShaderProperties.java",
]

# что GLSL сам по себе даёт в любом профиле — переписывать не нужно
ALWAYS_OK = {
    "gl_Position", "gl_FragCoord", "gl_FragData", "gl_PointSize", "gl_PointCoord",
    "gl_FrontFacing", "gl_VertexID", "gl_InstanceID", "gl_ClipDistance", "gl_DepthRange",
}

DIRECTIVES_OK = {
    "clouds", "oldLighting", "underwaterOverlay", "sun", "moon", "vignette", "weather",
    "stars", "sky", "frustum.culling", "occlusion.culling", "separateAo",
    "shadow.enabled", "shadowTerrain", "shadowEntities", "shadowPlayer", "shadowBlockEntities",
    "shadowTranslucent", "shadowLightBlockEntities", "shadow.culling",
    "beacon.beam.depth", "rain.depth", "dynamicHandLight", "oldHandLight",
    "particles.ordering", "particles.before.deferred", "shadow.culling",
    "skipAllRendering", "separateEntityDraws", "prepareBeforeShadow",
}


def api(path):
    req = urllib.request.Request("https://api.github.com" + path,
                                 headers={"User-Agent": "three-nights-check"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def fetch():
    import base64
    known, raw_names = set(), {}
    for src in SOURCES:
        blob = api(f"/repos/IrisShaders/Iris/contents/{src}?ref={REF}")
        text = base64.b64decode(blob["content"]).decode("utf-8")
        found = set()
        for name in re.findall(r"\b(gl_[A-Za-z0-9_]+)\b", text):
            found.add(name)
        if "ftransform" in text:
            found.add("ftransform")
        known |= found
        raw_names[src.rsplit("/", 1)[-1]] = sorted(found)
    data = {"source": "github.com/IrisShaders/Iris@" + REF, "handled": sorted(known),
            "by_file": raw_names}
    json.dump(data, open(CACHE, "w"), ensure_ascii=False, indent=0)
    return data


def load(refresh):
    if refresh or not os.path.exists(CACHE):
        try:
            print("· качаю трансформеры Iris 26.3 с api.github.com…")
            return fetch()
        except Exception as e:
            if not os.path.exists(CACHE):
                print("НЕ УДАЛОСЬ получить эталон Iris 26.3:", e)
                sys.exit(2)
            print("· сеть недоступна, беру кэш:", e)
    return json.load(open(CACHE))


def strip_comments(src):
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"//.*", "", src)


def check_shader(path, handled):
    problems = []
    src = open(path).read()
    code = strip_comments(src)
    if "#version" not in code:
        problems.append("нет директивы #version")
    for ch, pair in (("{", "}"), ("(", ")")):
        if code.count(ch) != code.count(pair):
            problems.append(f"не сбалансированы {ch}{pair}")
    used = set(re.findall(r"\b(gl_[A-Za-z0-9_]+|ftransform)\b", code))
    for name in sorted(used):
        if name in ALWAYS_OK or name in handled:
            continue
        problems.append(f"Iris 26.3 не переписывает {name}")
    uniforms = set(re.findall(r"uniform\s+\w+\s+(\w+)", code))
    for u in sorted(uniforms):
        if u not in {"colortex0", "gtexture", "lightmap", "viewWidth", "viewHeight", "aspectRatio"}:
            problems.append(f"неизвестный uniform {u}")
    return problems, sorted(used)


def main():
    refresh = "--refresh" in sys.argv
    data = load(refresh)
    handled = set(data["handled"])
    print("эталон:", data["source"])
    print("Iris 26.3 переписывает:", ", ".join(sorted(handled)))
    print()

    fails = 0
    packs = [p for p in os.listdir(ROOT) if os.path.isdir(os.path.join(ROOT, p))]
    for pack in sorted(packs):
        shaders = os.path.join(ROOT, pack, "shaders")
        if not os.path.isdir(shaders):
            continue
        print(f"[{pack}]")
        for name in sorted(os.listdir(shaders)):
            path = os.path.join(shaders, name)
            if name.endswith((".vsh", ".fsh", ".gsh")):
                problems, used = check_shader(path, handled)
                if problems:
                    fails += len(problems)
                    print(f"  FAIL {name}")
                    for p in problems:
                        print(f"       · {p}")
                else:
                    print(f"  ok   {name}  ({', '.join(used) or 'без compat-имён'})")
            elif name == "shaders.properties":
                bad = []
                for line in open(path):
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key = line.split("=", 1)[0].split(".")[0]
                    full = line.split("=", 1)[0]
                    if full not in DIRECTIVES_OK and key not in DIRECTIVES_OK:
                        bad.append(full)
                if bad:
                    fails += len(bad)
                    print("  FAIL shaders.properties")
                    for b in bad:
                        print("       · Iris 26.3 не знает директиву", b)
                else:
                    print("  ok   shaders.properties (все директивы известны 26.3)")
        print()

    if fails == 0:
        print("ИТОГ: оба пака используют только то, что Iris 26.3 действительно обрабатывает.")
    else:
        print("ИТОГ: проблем —", fails)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
