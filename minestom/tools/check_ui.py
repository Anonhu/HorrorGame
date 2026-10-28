#!/usr/bin/env python3
"""Проверка «входной» части, которую headless SelfTest не видит.

SelfTest проверяет правила раунда, но не видит, что лежит в инвентаре лобби,
какой предмет открывает меню и не сломали ли обработчики кликов. А именно там
и были баги, о которых писали игроки:

  * «предмет меню не работает» — в руках лежал recovery_compass;
  * «зачем в лобби предметы других игр» — в слотах 4–6 лежали предметы трёх
    режимов;
  * «свеча не работает» — зажигание было только на удержании Shift.

Скрипт читает исходники и проверяет эти связки. Запуск: python3 tools/check_ui.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "main" / "java" / "ru" / "nochfonarey"

fails: list[str] = []
oks = 0


def read(rel: str) -> str:
    path = SRC / rel
    if not path.exists():
        fails.append(f"нет файла {rel}")
        return ""
    return path.read_text(encoding="utf-8")


def ok(cond: bool, what: str) -> None:
    global oks
    if cond:
        oks += 1
        print(f"  ok   {what}")
    else:
        fails.append(what)
        print(f"  FAIL {what}")


items = read("mc/Items.java")
hub = read("mc/Hub.java")
interact = read("mc/Interact.java")
cmd = read("mc/Cmd.java")
hud = read("mc/Hud.java")
inn = read("core/InnMode.java")
mode = read("core/Mode.java")
night = read("core/Night.java")

print("ПРЕДМЕТ МЕНЮ")
ok('"minecraft:recovery_compass"' not in items, "в предметах нет recovery_compass")
ok('"minecraft:compass"' in items, "предмет меню — обычный компас")
ok("Меню режимов" in items, "у предмета понятное имя")
ok("ПКМ" in items, "в лоре написано, как открывать меню")

print("ИНВЕНТАРЬ ЛОББИ")
kit = ""
if "static void giveLobbyKit" in hub:
    kit = hub[hub.index("static void giveLobbyKit") :]
    kit = kit[: kit.index("player.refreshHeldSlot") + 40]
ok("setItemStack(0" in kit, "в лобби один предмет — в слоте 0")
ok("menuLantern" not in kit and "menuRelay" not in kit and "menuInn" not in kit,
   "в лобби нет предметов режимов")
ok("setItemStack(4" not in kit and "setItemStack(5" not in kit and "setItemStack(6" not in kit,
   "слоты 4–6 свободны")

print("М Е Н Ю")
ok("slot == 4" not in interact, "клик в лобби не привязан к слоту 4")
ok("slot == 5" not in interact and "slot == 6" not in interact, "и к слотам 5–6")
ok(interact.count("openMenu(hub, player)") >= 2, "меню открывается из клика по предмету")
ok("PlayerUseItemEvent" in interact, "ПКМ обрабатывается")
ok("PlayerBlockInteractEvent" in interact, "ПКМ по блоку тоже обрабатывается")
ok("PlayerSwapItemEvent" in interact, "F тоже открывает меню")
ok("offerMenu" in hub, "меню показывается само при входе в лобби")
ok("offerMenu();" in hub, "и вызывается из тика")
ok('ArgumentType.Literal("menu")' in cmd, "есть /h menu")
ok("hub.defer(" in interact, "клик по меню откладывается на тик (без рассинхрона окна)")

print("СВЕЧА ВО ДВОРЕ")
ok("useCandle" in inn, "одиночное действие у свечи (F/ПКМ)")
ok('"use".equals(action) || "shout".equals(action)' in inn, "F и ПКМ доходят до свечи")
ok("relight(" in inn, "свечу можно зажечь заново")
ok("LIGHT_TIME" in inn and "lightProg" in inn, "удержание Shift тоже зажигает")
ok("CANDLE_ON" in inn and "Keys.CANDLE_OFF" in inn, "блок свечи меняет состояние")
ok("litCandles" in hud, "в HUD видно, сколько свечей горит")
ok("candleNear(me" in hud, "подсказка появляется у подсветочника")

print("НОЧНЫЕ СОБЫТИЯ")
ok("nightTick()" in mode and "applyNight" in mode, "каркас событий в Mode")
ok(mode.count("planNight(3)") == 0, "planNight вызывает режим, а не Mode")
for f, pool in (("core/LanternMode.java", "LANTERN"), ("core/RelayMode.java", "RELAY"),
                ("core/InnMode.java", "INN")):
    src = read(f)
    ok("nightPool()" in src and "applyNight" in src, f"{f}: свой набор событий")
    ok("planNight(3)" in src, f"{f}: прогноз объявляется в начале")
    ok("nightTick()" in src, f"{f}: события идут по часам")
    ok(len(re.findall(r'new Event\("', night.split(f"Event[] {pool} = {{")[1].split("};")[0])) >= 3,
       f"в наборе {pool} минимум 3 события")
ok("событие" in night.lower() and "forecast" in night, "есть прогноз на ночь")
ok("nextNightAt" in hud, "HUD показывает, когда ждать следующее событие")

print()
if fails:
    print(f"ИТОГ: провалено {len(fails)}")
    for f in fails:
        print("  - " + f)
    sys.exit(1)
print(f"ИТОГ: проверок {oks}, все пройдены")
