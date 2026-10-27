#!/usr/bin/env python3
"""Собирает ps1-halloween.zip из pack.mcmeta + pack.png + assets."""
import os, zipfile

root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
out = os.path.join(root, "ps1-halloween.zip")

files = ["pack.mcmeta", "pack.png"]
for base, _dirs, names in os.walk(os.path.join(root, "assets")):
    for n in names:
        files.append(os.path.relpath(os.path.join(base, n), root))

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(files):
        z.write(os.path.join(root, f), f)

print("resourcepack:", out, round(os.path.getsize(out) / 1024, 1), "КБ,", len(files), "файлов")
