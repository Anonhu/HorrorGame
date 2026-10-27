# PS1-текстуры «ТРИ НОЧИ»

Ресурспак для Minecraft 26.3: 16×16, ограниченная палитра, упорядоченный джиттер
(Bayer 4×4) и квантование в **5 бит на канал** — ровно то, что делала PlayStation
с цветом. Плюс холодная ночь, тёплые огни и костяные блики.

```
resourcepack/
├── pack.mcmeta                  формат ресурспака 26.3: 97, [97,0]–[97,1]
├── pack.png                     64×64 иконка: фонарь в ночи
├── assets/minecraft/textures/
│   ├── block/                   37 текстур блоков
│   └── item/                    5 иконок + 32 кадра компаса
├── ps1-halloween.zip            готовый пак — его раздаёт сервер
├── preview.png                  лист всех текстур (увеличение ×8)
└── tools/
    ├── gen_textures.py          генератор: палитра + джиттер + PNG вручную
    └── build.py                 собирает zip
```

## Что перерисовано

| Группа | Блоки |
|---|---|
| земля и камень | `stone`, `dirt`, `coarse_dirt`, `deepslate_tiles`, `stone_bricks`, `sand`, `water_still` |
| трава | `grass_block_top`, `grass_block_side`, `grass_block_side_overlay` |
| дерево | `oak_planks`, `spruce_planks`, `dark_oak_planks`, `oak_log`, `oak_log_top`, `dark_oak_log`, `pale_oak_leaves`, `oak_leaves`, `fern`, `sculk_vein` |
| свет | `lantern`, `soul_lantern`, `torch`, `soul_torch`, `candle`, `candle_lit`, `campfire_log`, `campfire_log_lit`, `campfire_fire`, `beacon`, `lodestone` |
| двор | `dark_oak_door_top`, `dark_oak_door_bottom`, `iron_bars`, `red_wool` |
| камень-магнит | `lodestone_side`, `lodestone_top` |
| предметы | `lantern`, `soul_lantern`, `candle`, `campfire`, `dark_oak_door` |
| компас | `recovery_compass_00…31` — 32 кадра, стрелка поворачивается |

Все имена — ванильные, поэтому пак работает и в обычном мире, не только на нашем сервере.

## Как подключить

**Автоматически.** Сервер сам раздаёт пак по HTTP и присылает клиенту при входе
(необязательный, можно отказаться). Порт раздачи — `PACK_PORT`, по умолчанию `8123`:

```
http://localhost:8123/          страничка со ссылками
http://localhost:8123/pack.zip  сам пак
```

**Вручную.** Положить `ps1-halloween.zip` в `.minecraft/resourcepacks/` и включить
в «Наборы ресурсов». Порядок важен: пак должен быть выше ванильного.

## Пересобрать текстуры

```bash
cd minestom
bash tools/make-assets.sh        # текстуры → zip пака → zip шейдеров
```

Крутить стиль — в `tools/gen_textures.py`:

* `quantize(img, levels=32)` — 5 бит на канал, больше `levels` → мягче джиттер;
* `ramp()` — кладёт цвет из рампы с джиттером; поменяв рампы (`STONE_*`, `FIRE_*`),
  меняется вся палитра;
* `dither()` — матрица Байера 4×4; замените на 2×2 для более грубого вида.

## Формат: ровно 26.3

```json
"pack_format": 97,
"min_format": [97, 0],
"max_format": [97, 1]
```

Это значения настоящего 26.3 (`resource_pack_version: 97.1`). В 26.x формат задаётся
парой чисел — одним `pack_format` уже не обойтись, поэтому указаны все три поля.

Проверка одной командой:

```bash
python3 tools/verify_26_3.py
```

Она сверяет формат и **каждый** PNG со списком файлов клиента 26.3 и падает, если
хоть одно имя не существует. Именно так выяснилось, что дверь и лодстоун в 26.3
разбиты на `_top`/`_bottom` и `_side`/`_top`, а компас — на 32 кадра: первая версия
пака ссылалась на несуществующие файлы и просто не применилась бы.
