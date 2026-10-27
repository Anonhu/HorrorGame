# PS1-текстуры «ТРИ НОЧИ»

Ресурспак для Minecraft 26.3: 16×16, ограниченная палитра, упорядоченный джиттер
(Bayer 4×4) и квантование в **5 бит на канал** — ровно то, что делала PlayStation
с цветом. Плюс холодная ночь, тёплые огни и костяные блики.

```
resourcepack/
├── pack.mcmeta                  описание пака (формат 40–99, чтобы не сломаться на 26.3)
├── pack.png                     64×64 иконка: фонарь в ночи
├── assets/minecraft/textures/
│   ├── block/                   36 текстур блоков
│   └── item/                    7 иконок предметов
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
| двор | `dark_oak_door`, `iron_bars`, `red_wool` |
| предметы | `lantern`, `soul_lantern`, `candle`, `campfire`, `beacon`, `dark_oak_door`, `recovery_compass` |

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

## Честно про формат

`pack_format: 65` + `supported_formats: [40, 99]`: точный номер для 26.3 в этой
песочнице проверить негде, поэтому диапазон широкий — клиент примет пак при любой
раскладке 1.21–26.3. Если клиент ругнётся на формат, поправьте число в `pack.mcmeta`
(иконка и текстуры от этого не зависят).
