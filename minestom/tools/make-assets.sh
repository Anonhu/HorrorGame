#!/usr/bin/env bash
# Пересобрать PS1-текстуры, архивы пака и шейдеров, затем проверить их под 26.3
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
