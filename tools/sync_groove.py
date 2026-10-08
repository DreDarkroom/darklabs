"""Copies the groove engine (kit/groove) and the three meow recordings into the home page's repo, so the two sites run the same engine.
The home page loads the engine from its own folder (it must start fast and cannot depend on another site being up), so this copy is deliberate.
Usage: python tools/sync_groove.py [path to DreDarkroom.github.io]"""
import os, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
HOME = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser("~"), "Documents", "GitHub", "DreDarkroom.github.io")
if not os.path.isdir(HOME):
    sys.exit(f"home page repo not found at {HOME}")
n = 0
for sub in ("", "worklets"):
    src = os.path.join(ROOT, "kit", "groove", sub)
    dst = os.path.join(HOME, "kit", "groove", sub)
    os.makedirs(dst, exist_ok=True)
    for f in sorted(os.listdir(src)):
        if f.endswith(".js"):
            shutil.copyfile(os.path.join(src, f), os.path.join(dst, f)); n += 1
os.makedirs(os.path.join(HOME, "samples"), exist_ok=True)
for f in ("classic.mp3", "chirp.mp3", "swell.mp3"):
    shutil.copyfile(os.path.join(ROOT, "samples", f), os.path.join(HOME, "samples", f)); n += 1
print(f"copied {n} files to {HOME}")
