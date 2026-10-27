#!/usr/bin/env bash
# Пересобрать текстуры и архивы пака/шейдеров
set -e
cd "$(dirname "$0")/.."
python3 resourcepack/tools/gen_textures.py
python3 resourcepack/tools/build.py
python3 shaderpack/tools/build.py
