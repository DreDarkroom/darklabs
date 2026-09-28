#!/usr/bin/env python3
"""Pull CC0 sound packs into library/cc0 and write library/cc0/index.json.

Every entry records where the file came from, its licence, and its *source*
format + bitrate so exports can match it ("same quality in, same quality out").

    python tools/fetch_cc0.py            # fetch all packs
    python tools/fetch_cc0.py --rescan   # just rebuild index.json
"""
import io, json, os, re, struct, sys, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "library", "cc0")

# name, landing page (scraped for the current zip), licence, default tags
PACKS = [
    ("kenney-sci-fi-sounds", "https://kenney.nl/assets/sci-fi-sounds", "CC0 1.0", ["scifi"]),
    ("kenney-impact-sounds", "https://kenney.nl/assets/impact-sounds", "CC0 1.0", ["impact"]),
    ("kenney-digital-audio", "https://kenney.nl/assets/digital-audio", "CC0 1.0", ["scifi", "ui"]),
    ("kenney-interface-sounds", "https://kenney.nl/assets/interface-sounds", "CC0 1.0", ["ui"]),
]
UA = {"User-Agent": "SonicSmithy-fetch/0.1 (CC0 pack downloader)"}
EXTS = (".ogg", ".wav", ".mp3", ".flac")


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def zip_url(landing):
    html = get(landing).decode("utf8", "ignore")
    m = re.search(r"https://kenney\.nl/media/pages/assets/[^\"']+\.zip", html)
    if not m:
        raise RuntimeError("no zip link on " + landing)
    return m.group(0)


def probe(path):
    """Return {format, bitrate_kbps, samplerate, channels, duration}."""
    import soundfile as sf
    info = sf.info(path)
    ext = os.path.splitext(path)[1].lower().lstrip(".")
    out = {"format": ext, "samplerate": info.samplerate, "channels": info.channels,
           "duration": round(info.duration, 4), "subtype": info.subtype}
    with open(path, "rb") as f:
        head = f.read(65536)
    if ext == "ogg":
        i = head.find(b"\x01vorbis")
        if i >= 0:  # id header: 7B magic, ver, ch, rate, then max/nominal/min bitrate
            nom = struct.unpack("<i", head[i + 20:i + 24])[0]
            if nom > 0:
                out["bitrate_kbps"] = round(nom / 1000)
    elif ext == "mp3":
        for i in range(len(head) - 4):
            if head[i] == 0xFF and (head[i + 1] & 0xE0) == 0xE0:
                b = (head[i + 2] >> 4) & 0xF
                table = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
                out["bitrate_kbps"] = table[b]
                break
    elif ext == "wav":
        out["bitdepth"] = {"PCM_16": 16, "PCM_24": 24, "PCM_32": 32, "FLOAT": 32}.get(info.subtype, 16)
    return out


def scan():
    entries = []
    pack_meta = {p[0]: p for p in PACKS}
    for pack in sorted(os.listdir(DEST)):
        pdir = os.path.join(DEST, pack)
        if pack.startswith("_") or not os.path.isdir(pdir):
            continue
        meta = pack_meta.get(pack, (pack, "", "CC0 1.0", []))
        for dp, _, files in os.walk(pdir):
            for fn in sorted(files):
                if not fn.lower().endswith(EXTS) or fn.startswith("Preview"):
                    continue
                full = os.path.join(dp, fn)
                rel = os.path.relpath(full, DEST).replace(os.sep, "/")
                try:
                    p = probe(full)
                except Exception as e:  # unreadable file — skip, don't die
                    print("skip", rel, e)
                    continue
                entries.append({
                    "id": rel, "name": os.path.splitext(fn)[0], "url": "library/cc0/" + rel,
                    "pack": pack, "source": meta[1], "license": meta[2],
                    "tags": list(meta[3]), "src": p,
                })
    with open(os.path.join(DEST, "index.json"), "w") as f:
        json.dump({"version": 1, "sounds": entries}, f, indent=1)
    print("indexed", len(entries), "sounds")


def main():
    os.makedirs(DEST, exist_ok=True)
    if "--rescan" not in sys.argv:
        for name, landing, lic, _ in PACKS:
            pdir = os.path.join(DEST, name)
            if os.path.isdir(pdir) and os.listdir(pdir):
                print("have", name)
                continue
            url = zip_url(landing)
            print("fetch", name, url)
            z = zipfile.ZipFile(io.BytesIO(get(url)))
            for m in z.namelist():
                if m.lower().endswith(EXTS + (".txt",)) and "__MACOSX" not in m:
                    z.extract(m, pdir)
    scan()


if __name__ == "__main__":
    main()
