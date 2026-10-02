"""match_reference: which shots in this pack sound closest to a sound you like?

    python match_reference.py my_reference.wav

Give it a short clip of ANY pistol sound you want to match (a recording of your own, a clip you captured for private study).
It slices the shots out of your clip, measures them the same way the pack was measured (attack, tail, dryness, crack, body,
weight, brightness, crisp, crunch) and lists the pack's shots in order of how close they are. Nothing is uploaded anywhere:
the clip is read, measured and forgotten. It does not copy or reuse the reference audio.

Needs: numpy, scipy, soundfile.   Run it from the folder that has gunlab.py next to it (this tools folder).
"""
import json
import os
import sys
import numpy as np
import gunlab as G

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(HERE, "..", "audio", "index.json")

KEYS = [  # (name, getter, scale): the scale is roughly one 'noticeable difference' for that measure
    ("attack_ms", lambda f: f["attack_ms"], 1.0), ("tail_t50_ms", lambda f: f["t50_ms"], 120.0), ("room_db", lambda f: f["room_db"], 6.0),
    ("crack_pct", lambda f: f["frac"]["crack"] * 100, 10.0), ("body_pct", lambda f: (f["frac"]["body"] + f["frac"]["sub"]) * 100, 10.0),
    ("centroid_hz", lambda f: f["centroid_hz"], 700.0), ("low_db", lambda f: f["low_db"], 5.0), ("crisp", lambda f: G.crisp_index(f), 15.0), ("crunch", lambda f: G.crunch_index(f), 15.0),
]


def vec(f): return np.array([g(f) / s for _, g, s in KEYS])


def main():
    if len(sys.argv) < 2: print(__doc__); return
    x = G.load_mono(sys.argv[1]); shots = G.find_shots(x, min_gap=0.2, rel_height=0.25)
    if not shots: print("No shots found in that clip (is it too quiet or too short?)."); return
    feats = [G.features(x[a:b]) for a, b in shots]; ref = np.mean([vec(f) for f in feats], axis=0)
    print(f"Found {len(shots)} shot(s) in your clip. Your reference, measured:")
    for (name, g, s), v in zip(KEYS, ref): print(f"  {name:12} {v * s:9.2f}")
    idx = json.load(open(INDEX, encoding="utf-8")); rows = []
    for sh in idx["shots"]:
        for flavour, d in [("raw", sh["raw"])] + list((sh["variants"] or {}).items()):
            m = d.get("metrics", {})
            if not m or (flavour != "raw" and not d.get("file")): continue          # only list variants that have a file in this pack
            # variants and raw both carry these measurements in the index
            v = np.array([m.get("attack_ms", 0) / 1.0, m.get("t50_ms", 0) / 120.0, m.get("room_db", 0) / 6.0,
                          (m.get("bands", {}).get("crack", 0) if "bands" in m else 0) / 10.0, (m.get("bands", {}).get("body", 0) + m.get("bands", {}).get("sub", 0)) / 10.0 if "bands" in m else 0,
                          m.get("centroid_hz", 0) / 700.0, m.get("low_db", 0) / 5.0, d.get("crisp", 0) / 15.0, d.get("crunch", 0) / 15.0])
            used = [0, 1, 2, 5, 6, 7, 8]                                    # the measures present for every entry
            rows.append((float(np.linalg.norm((v - ref)[used])), sh["id"], flavour, d.get("file") or sh["raw"]["file"]))
    rows.sort()
    print("\nClosest matches (lower = closer):")
    for dist, sid, fl, fn in rows[:12]: print(f"  {dist:5.2f}  {sid:22} {fl:7} audio/{fn}")


if __name__ == "__main__":
    main()
