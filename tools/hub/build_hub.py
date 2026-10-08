"""Builds the Darklabs home page (index.html) and the desk's project list (desk/projects.js) from hub_data.py.
The page itself is lean: markup only, linking hub/hub.css and hub/hub.js. Edit the cards in hub_data.py, the look in hub/hub.css, the behaviour in hub/*.js."""
import io, json, os, re, sys
import html as _html

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
from hub_data import HERO, MAIN, WIP, SOON, TAGS

# 3D icon models (only used if someone switches "3D card icons" on)
MODEL = {"penrosepulse": "stairs", "chunguscello": "cello", "meowsynth": "cat", "monkeybeat": "monkey", "both": "keys", "drumdj": "deck",
         "circuitstomp": "robot", "glowgrain": "sun", "blueheronbass": "bass", "radio": "radio", "cratecall": "headphones", "sonicsmithy": "anvil",
         "dark-cinema-lab": "clapper", "promptlab": "flask", "resonance-core": "core", "resonic-toolkit": "gear", "brokebots": "robot",
         "darkography": "camera", "throattapper": "mic", "pipeline-test": "pipe", "contact-sheet": "film", "safelight": "vinyl", "obscura": "eye",
         "earshot": "spiral", "crate-capture": "crate", "darklabsfm": "radio", "idea": "robot", "vrlab": "eye", "klartext": "mic", "wordlab": "core",
         "drevelopdrop": "core", "mixingmagic": "keys", "crate-club": "crate", "wordlab-more": "core", "wipelight": "core", "mobile-wip": "gear",
         "perf-lab": "core", "ask-dre": "mic", "lobby": "crate", "penrose-visuals": "spiral", "fm-replies": "radio", "shared-kit": "gear", "darklabs-caps": "core"}

TAG_ORDER = ["featured", "vr", "mobile", "learn", "wip", "experimental", "idea", "retired"]


def attr(s):
    return _html.escape(s, quote=True)


def tag_chip(key, legend=False):
    glyph, label, tip = TAGS[key]
    if legend:      # the legend holds the full sentence once, for everyone (screen readers read it through aria-describedby)
        return (f'<li><span class="tag" tabindex="0" data-t="{key}" aria-describedby="tip-{key}"><span aria-hidden="true">{glyph}</span><b>{label}</b></span>'
                f'<span class="sr" id="tip-{key}">{tip}</span></li>')
    return f'<span class="tag" tabindex="0" role="img" data-t="{key}" aria-label="{attr(label)}" aria-describedby="tip-{key}">{glyph}</span>'


def tag_css():      # each tooltip's text lives in the stylesheet once, as a custom property the ::after reads
    return "".join(f'.tag[data-t={k}]{{--tip:"{label}: {tip}"}}' for k, (_g, label, tip) in TAGS.items())


def tags_html(c):
    keys = [k for k in TAG_ORDER if k in c.get("tags", [])]
    return f'<span class="tags">{"".join(tag_chip(k) for k in keys)}</span>' if keys else ""


def card(c, i):
    cls = "print"
    if c.get("big"): cls += " print--big"
    if "retired" in c.get("tags", []): cls += " print--retired"
    if c.get("kind"): cls += " print--" + c["kind"]
    sub = f'<span class="sub">{c["sub"]}</span>' if c.get("sub") else ""
    note = f'<p class="note">{c["note"]}</p>' if c.get("note") else ""
    apk = ""
    if c.get("apk"):
        apk = ('<div class="apk"><div class="apk-badge">&#x1F4F1; Mobile App Available</div><div class="apk-box"><p><strong>Testing APK for Android:</strong></p><ol>'
               '<li>Download the .apk file from the <a href="https://github.com/DreDarkroom/darklabs/releases">releases</a></li>'
               '<li>Enable "Install from Unknown Sources" in your Android settings</li><li>Tap the downloaded file to install</li><li>Open MeowSynth app and enjoy</li></ol></div></div>')
    ext = ' rel="noopener"' if c.get("href", "").startswith("http") else ""
    btn = "" if c.get("teaser") else f'<a class="btn" href="{c.get("href", "")}"{ext}>{c["btn"]}</a>'
    teaser = ' aria-disabled="true"' if c.get("teaser") else ""
    boost = f" data-boost='{json.dumps(c['boost'], separators=(',', ':'))}'" if c.get("boost") else ""
    return (f'<div class="hang" data-id="{c["id"]}" data-i="{i}"{boost}>'
            f'<article class="{cls}" id="{c["id"]}"{teaser}>{tags_html(c)}<div class="icon" aria-hidden="true" data-model="{MODEL.get(c["id"], "vinyl")}"><span class="emoji">{c["icon"]}</span></div>'
            f'<h3>{c["title"]}{sub}</h3><p>{c["desc"]}</p>{note}{btn}{apk}</article></div>')


hero = (f'<section class="hero" aria-labelledby="hero-title"><div class="hero-print" id="{HERO["id"]}">{tags_html(HERO)}'
        '<div class="kaleido" aria-hidden="true"><i></i><i></i><i></i><b></b></div>'
        f'<div class="hero-text"><p class="eyebrow">{HERO["note"]}</p><h2 id="hero-title">{HERO["title"]}</h2><p class="hero-desc">{HERO["desc"]}</p>'
        f'<a class="btn btn--hero" href="{HERO["href"]}" rel="noopener">{HERO["btn"]}</a></div></div></section>')

main = '<div class="line">' + "".join(card(c, i) for i, c in enumerate(MAIN)) + "</div>"
wip = '<div class="trays">' + "".join(card(c, i) for i, c in enumerate(WIP)) + "</div>"
soon = '<div class="sheet">' + "".join(card(c, i) for i, c in enumerate(SOON)) + "</div>"
letters = "".join(f'<span class="L{i}">{ch}</span>' for i, ch in enumerate("DARKLABS"))
legend = '<ul class="legend" aria-label="What the symbols mean">' + "".join(tag_chip(k, True) for k in TAG_ORDER) + "</ul>"

HTML = f'''<!doctype html>
<html lang="en" data-cursor="on">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="darkreader-lock">
<title>Darkroom Labs</title>
<meta name="description" content="Dre Darklabs: experimental browser instruments and games, developed in the dark.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2214%22 fill=%22%23060607%22/><text x=%2250%22 y=%2268%22 font-size=%2258%22 font-family=%22monospace%22 font-weight=%22700%22 text-anchor=%22middle%22 fill=%22%23d1122b%22>DL</text></svg>">
<link rel="stylesheet" href="hub/hub.css">
<style>{tag_css()}</style>
</head>
<body>
<a class="skip" href="#main">Skip to the projects</a>
<div id="bg" aria-hidden="true"><div class="layer wall" data-depth=".02"></div><div class="layer shelf" data-depth=".05"></div><div class="layer pipes" data-depth=".09"></div><div class="layer strips" data-depth=".14"></div></div>
<div id="vignette" aria-hidden="true"></div>
<div class="wrap">
<div class="topbar"><a href="/">&larr; Home</a></div>
<header>
<h1 class="sign" aria-label="Darklabs">{letters}</h1>
<p class="tagline">Experimental instruments &middot; developed in the dark</p>
{legend}
</header>
<main id="main">
{hero}
<h2 class="sect">On the line</h2>
<p class="sect-sub">Ready to play</p>
{main}
<h2 class="sect">In the trays</h2>
<p class="sect-sub">Work in progress &mdash; still developing, rough edges expected</p>
{wip}
<h2 class="sect">Roadmap To The Future</h2>
<p class="sect-sub">What's playable now, and what's waiting its turn</p>
<p class="roadnote">The first few are playable or in preview. The rest are projects on the <strong>back burner for now</strong>: some half-built, some just ideas in a drawer, all of them waiting while the instruments above get finished. Nothing here is abandoned.</p>
{soon}
</main>
</div>
<footer><p>Part of <a href="https://github.com/DreDarkroom/darklabs">Dre Darkroom</a> &middot; the gear in the corner has the extras: robots, motion, the safelight beam.</p></footer>
<script type="module" src="hub/hub.js"></script>
<script type="module" src="kit/ctx.js"></script>
</body>
</html>
'''
io.open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8", newline="\n").write(HTML)
print("hub built", len(HTML), "bytes;", len(MAIN), "main,", len(WIP), "wip,", len(SOON), "soon")

# ---- DarkDesk's built-in project list: the same public facts as the cards, as data ----
def _plain(s):
    return _html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()

def _status(c, group):
    t = c.get("tags", [])
    if "retired" in t or "idea" in t: return "Paused"
    if "wip" in t: return "Building"
    if "experimental" in t: return "Testing"
    return "Paused" if group == "roadmap" else "Live"

_seeds = []
for _group, _items in (("featured", [HERO]), ("on the line", MAIN), ("in the trays", WIP), ("roadmap", SOON)):
    for _c in _items:
        _seeds.append(dict(id=_c["id"], title=_plain(_c["title"]), blurb=_plain(_c.get("desc")), url=_c.get("href", ""), status=_status(_c, _group), group=_group))
_out = os.path.join(ROOT, "desk", "projects.js")
os.makedirs(os.path.dirname(_out), exist_ok=True)
io.open(_out, "w", encoding="utf-8", newline="\n").write("/* Generated by tools/hub/build_hub.py from the home page's cards: the public facts only. Edit hub_data.py, not this file. */\nexport const SEEDS = " + json.dumps(_seeds, indent=1, ensure_ascii=False) + ";\n")
print("desk projects:", len(_seeds))
