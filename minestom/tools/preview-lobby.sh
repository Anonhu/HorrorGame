#!/usr/bin/env bash
# Картинки лобби и комнат ожидания — без клиента Minecraft.
#
#   1) ECJ собирает только core (там раскладка) + tools/preview/LobbyPreview.java;
#   2) LobbyPreview выгружает TSV «сцена x y z ключ»;
#   3) resourcepack/tools/render_blocks.py рисует изометрию настоящими
#      текстурами пака.
#
# Результат: resourcepack/preview-lobby-{lobby,lantern,relay,inn}.png
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
CACHE="${THREE_NIGHTS_CACHE:-$HOME/.cache/three-nights}"
OUT="$CACHE/preview"

JAVA_BIN="${JAVA:-$CACHE/jdk4py/jdk4py/java-runtime/bin/java}"
ECJ_JAR="${ECJ:-$(ls "$CACHE"/ecj-*.jar 2>/dev/null | head -1)}"
[ -x "$JAVA_BIN" ] || { echo "нет java: сначала bash tools/build_offline.sh" >&2; exit 1; }
[ -f "$ECJ_JAR" ] || { echo "нет ecj: сначала bash tools/build_offline.sh" >&2; exit 1; }

rm -rf "$OUT" && mkdir -p "$OUT/classes"
"$JAVA_BIN" -jar "$ECJ_JAR" -17 -encoding UTF-8 -proc:none -nowarn \
    -d "$OUT/classes" \
    "$ROOT"/src/main/java/ru/nochfonarey/core/*.java \
    "$HERE/preview/LobbyPreview.java"

"$JAVA_BIN" -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 \
    -cp "$OUT/classes" LobbyPreview "$OUT/layout.tsv"

python3 "$ROOT/resourcepack/tools/render_blocks.py" "$OUT/layout.tsv" "$ROOT/resourcepack"
