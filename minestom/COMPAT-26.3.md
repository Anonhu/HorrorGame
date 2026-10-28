# Точная поддержка Minecraft 26.3

Здесь собрано всё, что в проекте привязано к версии, — и то, чем это проверяется.
Никаких «наверное подойдёт»: каждая строка ниже сверяется скриптом.

| Что | Значение для 26.3 | Чем проверено |
|---|---|---|
| Версия игры | `26.3` (release, 15.09.2026) | `version.json` тега `26.3-summary` |
| Протокол | **777** | там же, плюс `MinecraftConstants.PROTOCOL_VERSION` в Minestom `26_3` |
| Data pack | 121.0 | `version.json` |
| **Resource pack** | **97.1** | `version.json`, `pack.mcmeta` → `verify_26_3.py` |
| Java | 25 | `build.gradle.kts`, toolchain + foojay |
| Minestom | ветка `26_3`, HEAD `b7c32f3` (07.10.2026) | `check_minestom_26_3.py` |
| Iris (шейдеры) | ветка `26.3` | `check_iris_26_3.py` |
| Текстуры | 80 файлов, все имена ванильные | список файлов клиента 26.3 |
| Анимации | 8 текстур-лент + `.png.mcmeta` | `gen_textures.py`, `preview_anim.py` |
| Core-шейдер пака | `terrain.fsh`, `entity.fsh` — объявления один в один с ванильными | `check_core_shaders.py` |
| Java-сборка | ECJ 3.46.100 на JRE 25.0.2, 93 файла, 0 ошибок | `tools/build_offline.sh` |
| API для компиляции | 65 типов заглушек, 196 членов, 24 унаследованных, 0 расхождений | `tools/verify_stubs.py` |

## Проверки

```bash
cd minestom
python3 resourcepack/tools/verify_26_3.py     # пак: формат + имена файлов
python3 shaderpack/tools/check_iris_26_3.py   # шейдеры: только то, что умеет Iris 26.3
python3 tools/check_minestom_26_3.py          # Java: каждый вызов API есть в Minestom 26_3
python3 resourcepack/tools/check_core_shaders.py  # встроенный core-шейдер = ванильный 26.3 по объявлениям
python3 tools/verify_stubs.py                 # заглушки: каждый член есть в настоящем API
bash tools/build_offline.sh                   # компиляция + SelfTest без Gradle
```

Всё вместе: `bash tools/make-assets.sh` (добавьте `SKIP_BUILD=1`, чтобы пропустить Java-шаг).

Все три работают по эталону, скачанному с `api.github.com`, и кэшируют его в
`tools/*-26.3.json` — поэтому проверка не зависит от сети и от версии ветки на
момент вашего запуска. Обновить эталон: флаг `--refresh`.

### Что именно проверяет `verify_26_3.py`

* `pack_format = 97`, `min_format = [97, 0]`, `max_format = [97, 1]` — совпадает с
  `resource_pack_version: 97.1` настоящего 26.3 (новый формат — пара чисел, а не одно);
* каждый PNG в `assets/` существует в распакованном клиенте 26.3 по тому же пути.
  Именно эта проверка поймала, что в 26.3 **нет** `block/lodestone.png` (есть
  `lodestone_side` и `lodestone_top`) и `block/dark_oak_door.png` (есть `_top` и
  `_bottom`), а у компаса 32 кадра `item/recovery_compass_00..31`.

### Что проверяет `check_iris_26_3.py`

Скачивает трансформеры Iris с ветки `26.3`, достаёт оттуда список compatibility-имён,
которые Iris реально переписывает (`gl_TextureMatrix`, `gl_MultiTexCoord0`,
`gl_Vertex`, `ftransform`, `gl_FragColor`, `gl_Color`, `gl_FragData`, …), и убеждается,
что в наших шейдерах нет ни одного имени вне этого списка. Плюс сверяет директивы
`shaders.properties` с теми, что разбирает `ShaderProperties` ветки `26.3`:
`oldLighting`, `clouds`, `sun`, `moon`, `stars`, `vignette`, `underwaterOverlay`.

### Что проверяет `check_minestom_26_3.py`

Таблица из 97 записей «класс + метод + сигнатура»: `MinecraftServer.init`,
`setCompressionThreshold`, `getSchedulerManager`, `InstanceContainer.setGenerator`,
`Block.fromKey`, `Block.withProperty`, `Particle.fromKey`, `Player.playSound(Sound,x,y,z)`,
`Sidebar.createLine`, `InventoryPreClickEvent.getSlot`, `ResourcePackPushPacket(...)`,
`Conditions.playerOnly` и остальное, что вызывается из `ru.nochfonarey.mc`.
Каждая запись ищется в исходниках ветки `26_3`.

Проверка поймала две вещи, которые легко было сделать «по памяти»:
`Entity.setInstance` и `Entity.teleport` в 26.3 возвращают `CompletableFuture<Void>`
(а не `void`), а `Player.getUuid()` объявлен в `Entity`. Обе записи теперь в таблице
как есть.

## Сборка без Gradle

Песочница, в которой готовился проект, не имеет доступа к `services.gradle.org`,
`downloads.gradle.org`, Maven Central, JitPack и `plugins.gradle.org` (все отвечают
`000`), а у `gradle/gradle` на GitHub релизы без бинарных ассетов — скачать дистрибутив
неоткуда. Поэтому вместо `./gradlew build selfTest` выполняется эквивалент:

| Шаг | Gradle | Здесь |
|---|---|---|
| Компилятор | javac из toolchain | ECJ 3.46.100 (npm `exoproc-jjit`), JRE 25.0.2 (PyPI `jdk4py`) |
| Зависимости | Minestom 26.3 из JitPack/Maven | `tools/stubs` — заглушки, **сверенные** с исходниками `26_3` |
| Компиляция | `compileJava`, `options.release = 25` | `-17` (кода новее 17 в проекте нет) + `-encoding UTF-8` |
| Тесты | `selfTest` | тот же `ru.nochfonarey.core.SelfTest`, 29 проверок |

```
$ bash tools/build_offline.sh
  ok   java: openjdk version "25.0.2"
  ok   ecj: ~/.cache/three-nights/ecj-3.46.100.jar
  файлов: 93
  ok   компиляция без ошибок
  ИТОГ: все проверки пройдены
```

Проверка заглушек — не формальность: она ловит именно те ошибки, которые
`javac` поймал бы на настоящем Minestom. Уже поймала: `CommandSender` в 26.3
переехал из `...command.builder` в `...command`; `ChunkSupplier` — в
`...utils.chunk`; `PlayerEvent` — в `...event.trait`; `Command.Executor` больше
нет (есть отдельный `CommandExecutor.apply`); `PlayerInfo.onlinePlayers/maxPlayers`
вместо `online/max`. Все правки внесены, прогон — 65 типов / 196 членов / 0 расхождений.

Ограничение одно и честное: заглушки повторяют имена и арность, но не типы
возврата — типы сверяет `check_minestom_26_3.py` по строке сигнатуры.

## Core-шейдер пака: почему он не может сломать рендер

Пак переопределяет `assets/minecraft/shaders/core/terrain.fsh` и `entity.fsh`.
У клиента нет «мягкого режима»: если в переопределении разойдётся `uniform`
или `layout(location = N) in`, мир может стать чёрным. Поэтому
`check_core_shaders.py` берёт ванильные шейдеры тега `26.3-assets` и требует
полного совпадения объявлений:

| Что сверяется | terrain.fsh | entity.fsh |
|---|---|---|
| `#version` / `#extension` | 330 / `GL_ARB_separate_shader_objects` | то же |
| `#include <minecraft:…>` | 6 | 4 |
| `uniform` | 1 (`Sampler0`) | 3 |
| `layout(location = N) in/out` | 6 | 10 |
| макросы `#ifdef` | 4 | 9 |

Отличается только тело: в конце `fragColor` прогоняется через `ps1_grade()`
(холодные тени, тёплые огни, сканлайны 5 %, 5 бит на канал с джиттером Bayer 4×4).
Итог — 0 расхождений, то есть переопределение объявляет ровно тот же контракт.

Проверить глазами: `resourcepack/preview-core-shader.png` — слева ваниль,
справа тот же кадр через `ps1_grade()` (`tools/preview_core.py`).

## Что версия ломала и как это учтено

* **Формат пака.** В 26.x формат — не одно число, а пара `major.minor`. Старый
  `"supported_formats": [40, 99]` клиент 26.3 проигнорировал бы с предупреждением,
  а `pack_format: 65` из первой версии пака вообще не про 26.3. Сейчас ровно 97 / [97,0]–[97,1].
* **Анимации.** В ванильном 26.3 восемь наших текстур анимированы
  (`campfire_fire` — 8 кадров, `water_still` — 16, `lantern` — 3 и т. д.), и
  клиент ждёт ленту 16×16N + `.png.mcmeta`. Первая версия пака рисовала одиночный
  кадр: костёр выглядел потухшим, хотя `lit=true`. Сейчас ленты и `.mcmeta`
  собираются генератором, а `preview-anim-*.png` показывают кадры.
* **Ориентация пламени.** Верх текстуры — верх пламени; конус «остриём вниз»
  на модели костра переворачивал огонь. Пламя перерисовано широким внизу,
  а поленья — в ванильной раскладке (0–3 верх, 4–7 спил, 8–15 боковины).
* **Имена текстур.** Дверь и лодстоун в 26.3 разбиты на части, компас — на 32 кадра.
  Первая версия пака ссылалась на несуществующие файлы: они бы просто не применились,
  а пак выглядел бы «сломанным». Теперь все 74 имени сверены.
* **Minestom.** Ветка `26_3` — не релиз, а PR; Maven Central её не отдаёт. В `build.gradle.kts`
  координата JitPack и вторая строка для `com.github.Minestom:Minestom`. Сервер при старте
  печатает `Minestom 26.3 · protocol 777`, а если ветка окажется другой — предупреждает.
* **Ping.** В списке серверов клиент видит `26.3 / 777` (иначе 26.3 может показать
  «несовместимая версия», даже когда протокол совпадает).
* **Iris.** Ветка `26.3` существует и собирается под `sodium-fabric:0.9.2+mc26.3`,
  то есть шейдеры для 26.3 — не гипотеза. Ограничение осталось одно: конкретный
  GL-драйвер. Если шейдер не стартует, Iris пишет причину в лог — она будет про
  драйвер, а не про версию.

## Что проверить руками (единственное, что нельзя автоматизировать)

Ни в песочнице, ни в CI нельзя запустить настоящий клиент. Поэтому финальная
проверка — у вас:

1. `cd minestom && ./gradlew run` — в консоли должно быть `Minestom 26.3 · protocol 777`.
2. Клиент 26.3 → сервер. Если пак не пришёл сам: `http://localhost:8123/pack.zip`.
3. Iris + `ps1-full.zip` → в списке шейдеров пак должен загрузиться без ошибок.

Если что-то из этого не совпадёт — пришлите вывод консоли или лог Iris: адрес
проблемы будет уже известен, правка точечная.
