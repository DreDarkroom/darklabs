"""Slice every source recording into single shots, score them, save the raw slices, and write candidates.json."""
import csv
import glob
import io
import json
import os
import numpy as np
import soundfile as sf
import gunlab as G

OUT = "out"; os.makedirs(OUT + "/raw", exist_ok=True)
FL = "fl/Prepared SFX Library/"
FL_CREDIT = "Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney"
FL_URL = "https://opengameart.org/content/the-free-firearm-sound-library"

def master():
    raw = open(FL + "Prepared Master Sheet.csv", encoding="utf-8", errors="ignore", newline="").read().replace("\r\n", "\n").replace("\r", "\n")
    return {r["Filename"]: r for r in csv.DictReader(io.StringIO(raw))}

sources = []   # (path, id_prefix, gun, kind, distance, credit, license, url, note)
M = master()
for gun, short in [("1911", "1911"), ("Bersa", "bersa"), ("Ruger Mark III", "ruger-mk3"), ("Ruger Single Six", "ruger-ss"), ("Smith & Wesson 642", "sw642"), ("Walther PPQ", "ppq")]:
    for f in sorted(glob.glob(FL + gun + "/*.wav")):
        fn = os.path.basename(f); d = M[fn]["Description"]; dist = "near" if "near distance" in d else "mid"
        cal = [t.strip() for t in d.split(",") if t.strip().startswith(".") or "mm" in t][:1]
        sources.append(dict(path=f, prefix=f"{short}-{dist}", gun=gun, caliber=(cal[0] if cal else ""), type="revolver" if "revolver" in d else "semi-auto pistol", dist=dist,
                            credit=FL_CREDIT, license="CC0 1.0", url=FL_URL, note="Real firearm recording, 96 kHz / 24-bit stereo, summed to mono.", minGap=0.35, relH=0.3))
for fn, gun, cal, typ in [("22 Pistol.wav", ".22 pistol", ".22", "pistol"), ("22 Magnum.wav", ".22 Magnum", ".22 WMR", "pistol"), ("Black Powder.wav", "black powder pistol", "", "pistol"), ("Unkown.wav", "unidentified gun", "", "unknown")]:
    sources.append(dict(path="raw/" + fn, prefix="kurt-" + fn.split(".")[0].replace(" ", "").lower(), gun=gun, caliber=cal, type=typ, dist="room", credit="kurt",
                        license="CC0 1.0", url="https://opengameart.org/content/gunshots", note="Several shots per file with some room echo.", minGap=0.18, relH=0.22))
sources.append(dict(path="tabasco/sounds/cz.wav", prefix="cz52", gun="CZ-52", caliber="7.62x25", type="semi-auto pistol", dist="range", credit="Vincent Sevedge ('Tabasco')",
                    license="CC BY 3.0 (the bundled text says so; the OpenGameArt page says CC0, so the stricter one is honoured)", url="https://opengameart.org/content/gunshot-sounds",
                    note="Recorded while target shooting; the recorder clipped on loud shots.", minGap=0.18, relH=0.22))

cands = []
for s in sources:
    x = G.load_mono(s["path"]); shots = G.find_shots(x, min_gap=s["minGap"], rel_height=s["relH"], max_len=0.7)
    for i, (a, b) in enumerate(shots):
        seg = x[a:b].copy(); ft = G.features(seg); sc, parts = G.suitability(ft)
        fade = int(0.03 * G.SR); seg[-fade:] *= np.linspace(1, 0, fade)                      # the slice ends with a short fade
        pk = np.max(np.abs(seg)) + 1e-12; norm = seg * (10 ** (-1 / 20) / pk)                # raw slices are peak-normalised to -1 dBFS for audition
        cid = f"{s['prefix']}-{i}"; sf.write(f"{OUT}/raw/{cid}.wav", norm, G.SR, subtype="PCM_24")
        cands.append(dict(id=cid, source=os.path.basename(s["path"]), gun=s["gun"], caliber=s["caliber"], type=s["type"], mic=s["dist"], shot=i, credit=s["credit"], license=s["license"],
                          url=s["url"], note=s["note"], score=sc, parts=parts, crisp=int(G.crisp_index(ft)), crunch=int(G.crunch_index(ft)),
                          metrics=dict(peak_db=round(ft["peak_db"], 1), attack_ms=round(ft["attack_ms"], 2), t30_ms=round(ft["t30_ms"]), t50_ms=round(ft["t50_ms"]), room_db=round(ft["room_db"], 1),
                                       crest_db=round(ft["crest_db"], 1), low_db=round(ft["low_db"], 1), centroid_hz=round(ft["centroid_hz"]), clip_pct=round(ft["clip_frac"] * 100, 3), snr_db=round(ft["snr_db"], 1),
                                       length_ms=round(ft["length_ms"]), bands={k: round(v * 100, 1) for k, v in ft["frac"].items()})))
cands.sort(key=lambda c: -c["score"])
json.dump(cands, open(OUT + "/candidates.json", "w"), indent=1)
print(len(cands), "single shots from", len(sources), "recordings")
for c in cands[:16]:
    m = c["metrics"]; print(f"{c['score']:5.1f} {c['id']:22} {c['gun']:22} att {m['attack_ms']:4.2f}ms t50 {m['t50_ms']:4d}ms room {m['room_db']:6.1f} crack {m['bands']['crack']:5.1f}% body+sub {m['bands']['body']+m['bands']['sub']:5.1f}% clip {m['clip_pct']:.3f}% crisp {c['crisp']:3d} crunch {c['crunch']:3d}")
