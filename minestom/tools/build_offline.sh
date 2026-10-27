#!/usr/bin/env bash
# Офлайн-сборка без Gradle.
#
# Почему не Gradle: в этой песочнице закрыты services.gradle.org, Maven Central,
# JitPack и plugins.gradle.org, поэтому ни дистрибутив Gradle, ни Minestom из
# репозитория не скачать (подробности — в COMPAT-26.3.md). Здесь то же самое
# делается руками: ECJ (компилятор Eclipse) + JRE из PyPI, а API вместо
# настоящего Minestom проверяет tools/verify_stubs.py по его исходникам.
#
#   bash tools/build_offline.sh            скачать тулчейн в кэш и собрать
#   bash tools/build_offline.sh --check    только проверки (без компиляции)
#   JAVA=/путь/java ECJ=/путь/ecj.jar bash tools/build_offline.sh   свой тулчейн
#
# Тулчейн кладётся в ~/.cache/three-nights и в git не попадает.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
CACHE="${THREE_NIGHTS_CACHE:-$HOME/.cache/three-nights}"
OUT="${THREE_NIGHTS_OUT:-$CACHE/build}"
ECJ_VERSION="3.46.100"
JJIT_VERSION="0.6.5"

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok()   { printf '  ok   %s\n' "$*"; }
bye()  { printf '  --   %s\n' "$*"; }

# ─── 1. проверка заглушек по настоящим исходникам ───────────────────────────
step "заглушки против настоящего API"
python3 "$HERE/verify_stubs.py"

if [ "${1:-}" = "--check" ]; then
    step "готово (--check: компиляция пропущена)"
    exit 0
fi

# ─── 2. тулчейн ─────────────────────────────────────────────────────────────
step "тулчейн"
mkdir -p "$CACHE"

find_java() {
    if [ -n "${JAVA:-}" ]; then echo "$JAVA"; return; fi
    if [ -x "$CACHE/jdk4py/jdk4py/java-runtime/bin/java" ]; then
        echo "$CACHE/jdk4py/jdk4py/java-runtime/bin/java"; return
    fi
    if command -v java >/dev/null 2>&1; then command -v java; return; fi
    echo ""
}

JAVA_BIN="$(find_java)"
if [ -z "$JAVA_BIN" ]; then
    bye "java нет — ставлю JRE из PyPI (jdk4py, Temurin)"
    python3 -m pip install --quiet --target "$CACHE/jdk4py" jdk4py
    JAVA_BIN="$CACHE/jdk4py/jdk4py/java-runtime/bin/java"
fi
[ -x "$JAVA_BIN" ] || { echo "java не найден: $JAVA_BIN" >&2; exit 1; }
ok "java: $("$JAVA_BIN" -version 2>&1 | head -1)"

find_ecj() {
    if [ -n "${ECJ:-}" ]; then echo "$ECJ"; return; fi
    ls "$CACHE"/ecj-*.jar 2>/dev/null | head -1 && return
    echo ""
}

ECJ_JAR="$(find_ecj)"
if [ -z "$ECJ_JAR" ]; then
    if ! command -v npm >/dev/null 2>&1; then
        echo "нет ни ECJ, ни npm: положите ecj.jar и задайте ECJ=/путь/ecj.jar" >&2
        exit 1
    fi
    bye "ECJ нет — беру из npm-пакета exoproc-jjit@$JJIT_VERSION"
    mkdir -p "$CACHE/npm"
    ( cd "$CACHE/npm" && npm pack --silent "exoproc-jjit@$JJIT_VERSION" >/dev/null )
    tar -xzf "$CACHE/npm"/*.tgz -C "$CACHE/npm"
    cp "$CACHE/npm/package/dist/ecj-$ECJ_VERSION.jar" "$CACHE/ecj-$ECJ_VERSION.jar"
    ECJ_JAR="$CACHE/ecj-$ECJ_VERSION.jar"
fi
ok "ecj: $ECJ_JAR"

# ─── 3. компиляция ──────────────────────────────────────────────────────────
step "компиляция src/main/java + tools/stubs"
rm -rf "$OUT" && mkdir -p "$OUT"
find "$ROOT/src/main/java" "$HERE/stubs" -name '*.java' | sort > "$OUT/sources.txt"
printf '  файлов: %s\n' "$(wc -l < "$OUT/sources.txt")"
"$JAVA_BIN" -jar "$ECJ_JAR" \
    -17 -encoding UTF-8 -proc:none -nowarn \
    -d "$OUT/classes" "@$OUT/sources.txt"
ok "компиляция без ошибок"

# ─── 4. SelfTest (те же проверки, что делает ./gradlew selfTest) ────────────
step "SelfTest"
"$JAVA_BIN" -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 \
    -cp "$OUT/classes" ru.nochfonarey.core.SelfTest

step "готово"
cat <<TXT
  собрано: $OUT/classes
  запуск сервера: $JAVA_BIN -cp "$OUT/classes" ru.nochfonarey.mc.Main
  (классы заглушек работают только для проверки правил; настоящий сервер
   собирается через ./gradlew, когда доступны Maven/JitPack)
TXT
