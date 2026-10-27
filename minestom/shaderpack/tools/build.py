#!/usr/bin/env python3
"""Собирает ps1-lite.zip и ps1-full.zip (папка shaders внутри)."""
import os, zipfile

root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
for name in ("ps1-lite", "ps1-full"):
    src = os.path.join(root, name)
    out = os.path.join(root, name + ".zip")
    files = []
    for base, _dirs, names in os.walk(src):
        for n in names:
            files.append((os.path.join(base, n), os.path.relpath(os.path.join(base, n), src)))
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for path, rel in sorted(files, key=lambda t: t[1]):
            z.write(path, rel)
    print("shaderpack:", out, round(os.path.getsize(out) / 1024, 1), "КБ")
