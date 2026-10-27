# ЛЕС СЛУШАЕТ — Minestom 26.3 сервер

Серверная часть вертикального среза: процедурный лес из блоков Minecraft 26.3 «Wilderness Bound»,
четыре тотема, заброшенные лагеря и Полый Олень, который двигается только когда на него не смотрят.

## Требования

- **JDK 25** (Minecraft 26.x требует Java 25)
- Gradle 8.10+ (или добавьте wrapper: `gradle wrapper --gradle-version 8.10`)
- Доступ к Maven Central + JitPack

## Сборка и запуск

```bash
cd minestom
gradle run
```

Сервер поднимется на `localhost:25565`. Подключитесь клиентом **Minecraft Java 26.3** (offline-mode).

### Зависимость от 26.3

Minestom пока **не выпустил** 26.3 в Maven Central (PR `Minestom#3369` открыт на момент написания).
В `build.gradle.kts` используется ветка через JitPack:

```kotlin
implementation("com.github.Minestom.Minestom:minestom:26_3-SNAPSHOT")
```

Варианты, если JitPack не собрал ветку:

1. Собрать Minestom локально:
   ```bash
   git clone -b 26_3 https://github.com/Minestom/Minestom.git
   cd Minestom && ./gradlew publishToMavenLocal
   ```
   и заменить зависимость на `mavenLocal()` + `net.minestom:minestom:<версия>`.
2. Откатиться на стабильную 26.2 одной строкой:
   ```kotlin
   implementation("net.minestom:minestom:2026.10.07-26.2")
   ```
   Геймплейный код написан на общем для 26.2/26.3 API; из блоков 26.3 (`POPLAR_*`, `STRAW_BED`)
   на 26.2 упадут только декоративные константы в `Palette.java` — замените их на oak/red_wool.

## Карта кода

| Файл | Что делает |
|---|---|
| `Main.java` | инициализация сервера, event-node, тик-таск 100 мс, статическая расстановка |
| `LesListener.java` | вход/спавн, эхо-импульс (ПКМ), шум бега, волны частиц |
| `world/Plan.java` | координаты тотемов, лагерей, тропы; общий план мира |
| `world/ForestGenerator.java` | генератор попларового леса на `GenerationUnit` |
| `world/LesWorld.java` | инстанс, вечная ночь 23:40, тотемы/лагеря/ритуальный круг |
| `world/Palette.java` | все блоки стиля и текстовые хелперы (один файл для ре-скина) |
| `game/Shrine.java` | тотем: прогресс «стой в круге», зажигание, сброс |
| `game/Session.java` | шум, сердца, sidebar/actionbar, обряд, победа/поражение |
| `game/StagHollow.java` | ИИ Полого Оленя (DORMANT/STALK/FREEZE/CHARGE/RETREAT/STUN) + частицы |
| `game/SessionManager.java` | сессии игроков, ближайший живой, тик |

## Как играть

1. ЗАЙТИ → вы в ритуальном круге, в 5-м слоте «Костяной фонарь».
2. Идти по оранжевой листве от тотема к тотему.
3. Встать в кольцо тотема и **не двигаться** ~2.4 с — тыква зажжётся.
4. ПКМ — эхо: подсветит силуэт Оленя и оглушит его на 5 с. Шумит.
5. После 4 тотемов — вернуться в центр и простоять 6 с.

Отладка: `/gamemode creative`, координаты тотемов — в `Plan.java`
(47 32 · -38 56 · -61 -22 · 21 -68, высота 62–66).

## Что дальше по серверной части

- `[ ]` Заменить сущность-заглушку (`RAVAGER`, невидимая) на кастомную модель через `EntityMeta`/ресурспак.
- `[ ]` Свет от тотемов через `Light`/`BlockLight`, а не только частицы.
- `[ ]` Лобби и переподключение, сохранение прогресса ночи.
- `[ ]` Кооп: тотем требует всех игроков в круге.
- `[ ]` Погода/туман: `Instance#setWeather`, ambient particles биома.
