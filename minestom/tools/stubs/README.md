# Заглушки API для офлайн-проверки

Эти классы **не участвуют в обычной сборке проекта** (`./gradlew` их не видит).
Это минимальные объявления Minestom/Adventure-типов, которые использует
`ru.nochfonarey.mc`: с ними `tools/build_offline.sh` компилирует игру и прогоняет
`SelfTest` там, где нет доступа к Maven Central.

## Чем гарантируется, что заглушки не врут

`tools/verify_stubs.py` берёт каждый тип, каждый метод (имя + число аргументов)
и каждое поле из этой папки и ищет их в настоящих исходниках:

* Minestom, ветка `26_3`, HEAD `b7c32f3` — включая автогенерируемые
  `MinecraftConstants`, `Blocks`, `Materials` (там лежат `MinecraftServer.VERSION_NAME`,
  `Block.AIR`, `Material.STONE`);
* Adventure 5.2.0 — оттуда `Player` берёт `sendMessage`/`showTitle`/`playSound`.

Поиск идёт и по цепочке наследования (`Player` → `CommandSender` → `Audience`),
поэтому унаследованные методы проверяются, а не считаются «не найдено».
Итог последнего прогона: **66 типов, 216 членов, из них 29 унаследованных — расхождений 0**.

```bash
python3 tools/verify_stubs.py             # по кэшу tools/api-cache.json
python3 tools/verify_stubs.py --refresh   # перекачать исходники
```

Что скрипт **не** проверяет: типы возврата и дженерики (это делает
`tools/check_minestom_26_3.py` по строке сигнатуры — например,
`setInstance`/`teleport` → `CompletableFuture<Void>`). Тела методов пустые
осознанно: проверяется совместимость вызовов, а не поведение.

## Правила для правок

1. Заглушка повторяет **настоящее** имя пакета (`net.minestom.server.command.CommandSender`,
   а не `...command.builder`): ошибка в пакете сразу всплывает в проверке.
2. Добавили вызов нового метода — добавьте его в заглушку и прогоните
   `python3 tools/verify_stubs.py`. Красный вывод = такого члена в 26.3 нет.
3. Сборка на машине с интернетом использует настоящий Minestom из
   `build.gradle.kts` — эти файлы там не нужны и не подключаются.
