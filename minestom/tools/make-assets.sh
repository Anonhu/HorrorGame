#!/usr/bin/env bash
# Пересобрать PS1-текстуры (включая анимации), архивы пака и шейдеров,
# нарисовать превью лобби и проверить всё под 26.3.
#
#   SKIP_BUILD=1 bash tools/make-assets.sh   без Java-шагов (сборка и тесты)
#   SKIP_PREVIEW=1 …                         без картинок лобби
set -e
cd "$(dirname "$0")/.."

echo "== текстуры пака =="
python3 resourcepack/tools/gen_textures.py
python3 resourcepack/tools/build.py
echo
echo "== шейдерпаки для Iris =="
python3 shaderpack/tools/build.py
python3 shaderpack/tools/preview.py
echo
echo "== проверки 26.3 =="
python3 resourcepack/tools/verify_26_3.py
echo
python3 resourcepack/tools/check_core_shaders.py
echo
python3 shaderpack/tools/check_iris_26_3.py
echo
python3 tools/check_minestom_26_3.py | tail -3
echo
python3 tools/check_keys.py
python3 tools/check_ui.py | tail -3
echo
python3 tools/verify_stubs.py | tail -5

if [ "${SKIP_PREVIEW:-0}" != "1" ]; then
    echo
    echo "== картинки лобби и анимаций =="
    bash tools/preview-lobby.sh
    python3 resourcepack/tools/preview_anim.py | tail -8
fi

if [ "${SKIP_BUILD:-0}" != "1" ]; then
    echo
    bash tools/build_offline.sh
fi
