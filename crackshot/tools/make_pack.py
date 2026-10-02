"""make_pack: process the best raw shots into crisp / crunch / arc variants, score before and after, write WAVs + manifest + licences."""
import json
import os
import re
import numpy as np
import soundfile as sf
import gunlab as G
import process as P

OUT = "out"; PACK = OUT + "/pack"
K = "C:/Users/Dell/OneDrive/Desktop/dredarkroom/sonicsmithy/library/cc0/kenney-sci-fi-sounds/Audio/"
SWEETS = ["laserRetro_000", "laserRetro_001", "laserRetro_002", "laserRetro_003", "laserSmall_000", "laserSmall_001", "laserSmall_002", "laserRetro_004"]
SUB = {"crisp": -14.0, "crunch": -17.0, "arc": -14.0}
for k in SUB: os.makedirs(f"{PACK}/{k}", exist_ok=True)
os.makedirs(f"{PACK}/roundrobin", exist_ok=True)

cands = json.load(open(OUT + "/candidates.json"))
usable = [c for c in cands if c["metrics"]["clip_pct"] <= 0.05 and c["score"] >= 70 and c["type"] != "unknown" or (c["gun"] == "unidentified gun" and c["metrics"]["clip_pct"] <= 0.05)]
print(len(usable), "usable raw shots (clip <= 0.05%, score >= 70)")

def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

results = []
for c in usable:
    x, sr = sf.read(f"{OUT}/raw/{c['id']}.wav"); sweet = K + SWEETS[sum(map(ord, c["id"])) % len(SWEETS)] + ".ogg"
    f0 = G.features(x); s0, _ = G.suitability(f0); res = dict(id=c["id"], gun=c["gun"], sweetener=os.path.basename(sweet), raw=dict(score=s0, crisp=int(G.crisp_index(f0)), crunch=int(G.crunch_index(f0))), variants={})
    for kind in ["crisp", "crunch", "arc"]:
        y = P.variant(x, kind, sweet, SUB[kind]); f = G.features(y); sc, parts = G.suitability(f)
        fn = f"{slug(c['gun'])}-{c['id'].split('-')[-2] if c['mic'] in ('near','mid') else 'rm'}-{c['shot']}_{kind}.wav"
        res["variants"][kind] = dict(file=fn, score=sc, parts=parts, crisp=int(G.crisp_index(f)), crunch=int(G.crunch_index(f)), len_ms=int(len(y) / G.SR * 1000),
                                     metrics=dict(attack_ms=round(f["attack_ms"], 2), t50_ms=round(f["t50_ms"]), room_db=round(f["room_db"], 1), centroid_hz=round(f["centroid_hz"]), low_db=round(f["low_db"], 1), peak_db=round(f["peak_db"], 1)), _y=y)
    results.append(res)

# keep up to two sources per gun, best processed score first, and cap the pack
# a punchy pistol wants weight: the little .22s are dry and bright but thin, so they get a small selection penalty (their scores are unchanged)
BIAS = {"Walther PPQ": 1.0, "1911": 1.0, "Bersa": 0.99, "Smith & Wesson 642": 0.98, "unidentified gun": 0.98, "black powder pistol": 0.96, ".22 Magnum": 0.91, "Ruger Mark III": 0.9, ".22 pistol": 0.88, "Ruger Single Six": 0.9}
def best(r): return max(v["score"] for v in r["variants"].values()) * BIAS.get(r["gun"], 0.9)
by_gun = {}
for r in sorted(results, key=lambda r: -best(r)): by_gun.setdefault(r["gun"], []).append(r)
keep = []
for g, lst in by_gun.items(): keep += lst[:2]
keep.sort(key=lambda r: -best(r)); keep = keep[:14]
print("keepers:", [(r["id"], round(float(best(r)), 1)) for r in keep])

manifest = []
for r in keep:
    for kind, v in r["variants"].items(): sf.write(f"{PACK}/{kind}/{v['file']}", v["_y"], G.SR, subtype="PCM_16")
# the round-robin set: eight distinct shots, rotating through the three flavours
order = ["crisp", "arc", "crunch", "crisp", "arc", "crunch", "crisp", "arc"]
# round robin: the best shot of each gun first (variety), then fill with the next best
first = []; seen = set()
for r in keep:
    if r["gun"] not in seen: first.append(r); seen.add(r["gun"])
rr_list = (first + [r for r in keep if r not in first])[:8]
for i, r in enumerate(rr_list):
    kind = order[i]; v = r["variants"][kind]; sf.write(f"{PACK}/roundrobin/pistol_{i + 1:02d}.wav", v["_y"], G.SR, subtype="PCM_16")
    manifest.append(dict(file=f"roundrobin/pistol_{i + 1:02d}.wav", source=r["id"], flavour=kind, gun=r["gun"], score=v["score"]))
# level-match the round-robin set (RMS of the first 120 ms from the peak) so no shot jumps out when they cycle; never above -1 dBFS
_files = [f"{PACK}/roundrobin/pistol_{i + 1:02d}.wav" for i in range(len(rr_list))]; _d = {}; _rms = {}
for _f in _files:
    _y, _ = sf.read(_f); _i = int(np.argmax(np.abs(_y))); _d[_f] = _y; _rms[_f] = 20 * np.log10(np.sqrt(np.mean(_y[_i:_i + int(0.12 * G.SR)] ** 2)) + 1e-12)
_t = float(np.median(list(_rms.values())))
for _f in _files:
    _y = _d[_f] * 10 ** ((_t - _rms[_f]) / 20); _pk = np.max(np.abs(_y))
    if _pk > 10 ** (-1 / 20): _y = _y * (10 ** (-1 / 20) / _pk)
    sf.write(_f, _y, G.SR, subtype="PCM_16")
print("round-robin level spread before %.1f dB" % (max(_rms.values()) - min(_rms.values())))
for r in results:
    for v in r["variants"].values(): v.pop("_y", None)
json.dump(dict(keepers=[r["id"] for r in keep], results=results, roundrobin=manifest), open(OUT + "/pack_results.json", "w"), indent=1)

print("\nBEFORE -> AFTER (suitability, crisp, crunch) for the keepers:")
for r in keep:
    print(f"  {r['id']:22} raw {r['raw']['score']:5.1f}/{r['raw']['crisp']:3d}/{r['raw']['crunch']:3d} | " + " | ".join(f"{k} {v['score']:5.1f}/{v['crisp']:3d}/{v['crunch']:3d}" for k, v in r["variants"].items()))
n = sum(len(os.listdir(f"{PACK}/{d}")) for d in os.listdir(PACK)); print("\nfiles written:", n, "->", PACK)
rr = [m for m in manifest]; print("round robin:", [(m["file"], m["flavour"], m["gun"]) for m in rr])
