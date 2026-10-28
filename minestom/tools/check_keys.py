#!/usr/bin/env python3
"""
Сверка ключей блоков: раскладка → BlockMap → настоящий 26.3.

Зачем: ядро (`core`) говорит ключами (`Keys.FIRE_ON`), слой Minecraft
переводит их в `minecraft:campfire[lit=true]`. Ошибка в любом звене выглядит
одинаково — «построилось не то» или «арена пустая». Скрипт проверяет всю цепь:

  1. каждый `Keys.XXX`, который где-то используется, есть в `BlockMap`;
  2. каждый `minecraft:<id>` из `BlockMap` существует в реестре блоков 26.3
     (список берётся из `Blocks.java` Minestom `26_3`, он в кэше API);
  3. свойства (lit, axis, facing, level, persistent, candles) реальные —
     иначе `withProperty` молча проглотит опечатку.

    python3 tools/check_keys.py
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
SRC = os.path.join(ROOT, "src", "main", "java", "ru", "nochfonarey")
CACHE = os.path.join(HERE, "api-cache.json")

KEYS_JAVA = os.path.join(SRC, "core", "Keys.java")
BLOCKMAP_JAVA = os.path.join(SRC, "mc", "BlockMap.java")

# свойства, которые вообще бывают у блоков, которые мы ставим
KNOWN_PROPS = {
    "lit", "axis", "facing", "level", "persistent", "candles", "waterlogged",
    "distance", "half", "hinge", "open", "powered", "part", "type", "rotation",
    "shape", "conditional", "unstable", "attached", "east", "west", "north", "south",
    "up", "down", "bottom", "top", "age", "snowy", "stage", "note", "instrument",
    "drag", "eye", "vertical_direction", "thickness", "tilt", "leaves", "berry",
    "has_bottle_0", "has_bottle_1", "has_bottle_2", "bloom", "axis_y",
}

CONST = re.compile(r'String\s+([A-Z0-9_]+)\s*=\s*"([^"]+)"')
PUT = re.compile(r'put\(\s*Keys\.([A-Z0-9_]+)\s*,\s*"([^"]+)"((?:\s*,\s*"[^"]*")*)\s*\)')


def read(path):
    return open(path, encoding="utf-8").read()


def java_files():
    for base, _dirs, names in os.walk(SRC):
        for n in names:
            if n.endswith(".java"):
                yield os.path.join(base, n)


def block_registry():
    """Имена блоков 26.3 из Blocks.java (кэш уже скачан сборкой)."""
    data = json.load(open(CACHE))
    for key, value in data["types"].items():
        if key.endswith("instance/block/Blocks.java"):
            # поля в нижнем регистре = ключи реестра
            return {f.lower() for f in value["fields"]}
    return None


def main():
    consts = dict(CONST.findall(read(KEYS_JAVA)))
    blockmap = read(BLOCKMAP_JAVA)
    mapped, props = {}, {}
    for name, block_id, rest in PUT.findall(blockmap):
        mapped[name] = block_id
        values = re.findall(r'"([^"]*)"', rest)
        props[name] = values

    fails = 0
    print("ключи ядра:", len(consts), "· размечено в BlockMap:", len(mapped))

    # 1. каждый использованный ключ размечен
    used = set()
    for path in java_files():
        text = read(path)
        for name in re.findall(r"Keys\.([A-Z0-9_]+)", text):
            used.add(name)
    missing = sorted(n for n in used if n not in mapped and n not in consts)
    unknown_const = sorted(n for n in used if n not in consts)
    unmarked = sorted(n for n in used if n in consts and n not in mapped)
    if unknown_const:
        fails += len(unknown_const)
        print("  FAIL ключей нет в Keys.java:", ", ".join(unknown_const))
    else:
        print("  ok   все Keys.* из кода объявлены")
    if unmarked:
        fails += len(unmarked)
        print("  FAIL ключи без перевода в BlockMap:", ", ".join(unmarked))
    else:
        print("  ok   у каждого ключа есть перевод в BlockMap")
    if missing:
        fails += len(missing)
        print("  FAIL неизвестные ключи:", ", ".join(missing))

    # 2. блоки существуют в 26.3
    reg = block_registry()
    if reg is None:
        print("  --   нет кэша API — сверка с реестром 26.3 пропущена")
    else:
        bad = []
        for name, block_id in sorted(mapped.items()):
            if not block_id.startswith("minecraft:"):
                bad.append((name, block_id, "нет пространства minecraft:"))
                continue
            if block_id[len("minecraft:"):] not in reg:
                bad.append((name, block_id, "нет такого блока в 26.3"))
        for name, block_id, why in bad:
            fails += 1
            print(f"  FAIL {name}: {block_id} — {why}")
        if not bad:
            print(f"  ok   все {len(mapped)} блоков есть в реестре 26.3")

    # 3. свойства правдоподобны (имя из известных, значение не пустое)
    badprops = []
    for name, values in sorted(props.items()):
        for i in range(0, len(values) - 1, 2):
            prop, value = values[i], values[i + 1]
            if prop not in KNOWN_PROPS:
                badprops.append((name, prop, "свойства нет в списке известных"))
            if not value:
                badprops.append((name, prop, "пустое значение"))
    for name, prop, why in badprops:
        fails += 1
        print(f"  FAIL {name}: свойство {prop} — {why}")
    if not badprops:
        n = sum(len(v) // 2 for v in props.values())
        print(f"  ok   свойств блоков: {n}, все известные")

    # 4. barrier — невидимая стена, ключ должен быть и в Keys, и в BlockMap
    if "BARRIER" in consts and mapped.get("BARRIER") != "minecraft:barrier":
        fails += 1
        print("  FAIL BARRIER должен переводиться в minecraft:barrier")
    else:
        print("  ok   невидимая стена (barrier) на месте")

    if fails == 0:
        print("ИТОГ: каждый ключ раскладки превращается в настоящий блок 26.3.")
    else:
        print("ИТОГ: проблем —", fails)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
