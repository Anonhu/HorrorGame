#!/usr/bin/env bash
# Пересобрать PS1-текстуры, архивы пака и шейдеров, затем проверить всё под 26.3.
# Последний шаг — офлайн-сборка Java (ECJ + SelfTest), см. tools/build_offline.sh.
# SKIP_BUILD=1 bash tools/make-assets.sh — только ресурсы и API-проверки.
set -e
cd "$(dirname "$0")/.."
python3 resourcepack/tools/gen_textures.py
python3 resourcepack/tools/build.py
python3 shaderpack/tools/build.py
python3 shaderpack/tools/preview.py
echo
python3 resourcepack/tools/verify_26_3.py
echo
python3 shaderpack/tools/check_iris_26_3.py
echo
python3 tools/check_minestom_26_3.py | tail -3
echo
python3 tools/verify_stubs.py | tail -5
if [ "${SKIP_BUILD:-0}" != "1" ]; then
    echo
    bash tools/build_offline.sh
fi
