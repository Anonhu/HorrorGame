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
| Текстуры | 74 файла, все имена ванильные | список файлов клиента 26.3 |

## Три проверки

```bash
cd minestom
python3 resourcepack/tools/verify_26_3.py     # пак: формат + имена файлов
python3 shaderpack/tools/check_iris_26_3.py   # шейдеры: только то, что умеет Iris 26.3
python3 tools/check_minestom_26_3.py          # Java: каждый вызов API есть в Minestom 26_3
```

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

## Что версия ломала и как это учтено

* **Формат пака.** В 26.x формат — не одно число, а пара `major.minor`. Старый
  `"supported_formats": [40, 99]` клиент 26.3 проигнорировал бы с предупреждением,
  а `pack_format: 65` из первой версии пака вообще не про 26.3. Сейчас ровно 97 / [97,0]–[97,1].
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
