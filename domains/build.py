#!/usr/bin/env python3
"""Assemble every site in domains/ into domains/dist/<domain>/ as a self-contained folder (deployable to any static host).
Sites that import ../_shared/room.js get a local copy of room.js and the kit, with the import paths rewritten.
Usage: python domains/build.py [domain ...]     (no args = all)"""
import shutil, sys, pathlib, re
HERE = pathlib.Path(__file__).resolve().parent
KIT = HERE.parent / "kit"
DIST = HERE / "dist"
only = set(sys.argv[1:])
DIST.mkdir(exist_ok=True)
for d in sorted(p for p in HERE.iterdir() if p.is_dir() and p.name not in ("_shared", "dist") and not p.name.startswith(".")):
    if only and d.name not in only: continue
    out = DIST / d.name
    if out.exists(): shutil.rmtree(out)
    shutil.copytree(d, out)
    used = False
    for html in out.rglob("*.html"):
        s = html.read_text(encoding="utf-8")
        if "../_shared/room.js" in s:
            used = True; html.write_text(s.replace("../_shared/room.js", "./room.js"), encoding="utf-8", newline="\n")
    if used:
        r = (HERE / "_shared" / "room.js").read_text(encoding="utf-8").replace("../../kit/", "./kit/")
        (out / "room.js").write_text(r, encoding="utf-8", newline="\n")
        (out / "kit").mkdir()
        for f in KIT.glob("*.js"): shutil.copy(f, out / "kit" / f.name)
    n = sum(1 for _ in out.rglob("*") if _.is_file()); size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file()) // 1024
    print(f"{d.name:22} {n:3} files {size:6} KB  {'(uses the kit)' if used else ''}")
