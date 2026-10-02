"""gunlab: slice real gunshot recordings into single shots, measure them, and score how suitable each is
for a snappy, punchy, game-style pistol. Everything here is classic DSP (no machine learning, no generated audio).

Terms:
  crisp   = a clear, bright transient: fast attack, strong 2-6 kHz "crack", short and clean.
  crunchy = dense, gritty harmonics in the 1-8 kHz range (what saturation adds): the sound has texture, not just a click.
"""
import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import maximum_filter1d, uniform_filter1d

SR = 48000

# ------------------------------------------------------------------ loading and slicing
def load_mono(path, sr=SR):
    x, fs = sf.read(path, always_2d=True, dtype="float64")
    x = x.mean(axis=1)                                       # mono mix
    if fs != sr:
        g = np.gcd(int(fs), int(sr)); x = signal.resample_poly(x, sr // g, int(fs) // g)
    x -= np.mean(x)                                          # remove DC
    return x


def envelope(x, sr=SR):
    e = maximum_filter1d(np.abs(x), size=max(1, int(0.001 * sr)))
    return uniform_filter1d(e, size=max(1, int(0.0005 * sr)))


def find_shots(x, sr=SR, min_gap=0.18, rel_height=0.22, max_len=1.6):
    """Return (start, end) sample pairs, one per shot. Echoes and reflections are skipped because a new shot must
    be well above the loudest part of the file and at least min_gap seconds after the last one."""
    env = envelope(x, sr); pk = env.max()
    if pk < 1e-4: return []
    peaks, _ = signal.find_peaks(env, height=rel_height * pk, distance=int(min_gap * sr))
    shots = []
    for i, p in enumerate(peaks):
        lo = max(0, p - int(0.03 * sr)); seg = env[lo:p + 1]
        below = np.where(seg < 0.04 * env[p])[0]
        start = lo + (below[-1] if len(below) else 0)                       # last quiet sample before the peak
        nxt = peaks[i + 1] - int(0.02 * sr) if i + 1 < len(peaks) else len(x)
        end = min(nxt, p + int(max_len * sr), len(x))
        shots.append((max(0, start - int(0.002 * sr)), end))              # 2 ms of pre-roll
    return shots


# ------------------------------------------------------------------ measuring
def band_energy(x, sr, lo, hi):
    if len(x) < 64: return 1e-12
    sos = signal.butter(4, [lo, min(hi, sr / 2 - 100)], btype="band", fs=sr, output="sos")
    y = signal.sosfilt(sos, x); return float(np.sum(y * y)) + 1e-12


def features(x, sr=SR, pre_noise=None):
    """Measure one isolated shot. x starts shortly before the onset."""
    e = envelope(x, sr); i_pk = int(np.argmax(e)); pk = float(np.max(np.abs(x))) + 1e-12
    # attack: 10% -> 90% of peak envelope
    pre = e[:i_pk + 1]; t10 = np.argmax(pre >= 0.1 * e[i_pk]); t90 = np.argmax(pre >= 0.9 * e[i_pk])
    attack_ms = max(0.0, (t90 - t10) / sr * 1000)
    # tail: time from the peak until the envelope falls 30 dB and 50 dB
    post = e[i_pk:]
    def t_below(db):
        idx = np.where(post < e[i_pk] * 10 ** (-db / 20))[0]; return (idx[0] / sr if len(idx) else len(post) / sr)
    t30, t50 = t_below(30), t_below(50)
    # energy windows
    a, b = i_pk, i_pk + int(0.040 * sr)            # the report: first 40 ms from the peak
    c, d_ = i_pk + int(0.060 * sr), i_pk + int(0.400 * sr)   # the room/tail: 60-400 ms
    first, room = x[a:b], x[c:d_]
    e_first = float(np.sum(first ** 2)) + 1e-12; e_room = float(np.sum(room ** 2)) + 1e-12
    room_db = 10 * np.log10(e_room / e_first)                                  # lower (more negative) = drier
    # bands over the first 40 ms
    seg = x[max(0, i_pk - int(0.002 * sr)):b]
    bands = {"sub": band_energy(seg, sr, 30, 120), "body": band_energy(seg, sr, 120, 400), "mid": band_energy(seg, sr, 400, 2000),
             "crack": band_energy(seg, sr, 2000, 6000), "air": band_energy(seg, sr, 6000, 16000)}
    tot = sum(bands.values()); frac = {k: v / tot for k, v in bands.items()}
    # spectral centroid of the first 40 ms
    sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2; fr = np.fft.rfftfreq(len(seg), 1 / sr)
    centroid = float(np.sum(fr * sp) / (np.sum(sp) + 1e-12))
    # crunch: how noise-like (flat) and dense the 1-8 kHz spectrum is; flat = lots of gritty partials, peaky = a few tones
    m = (fr >= 1000) & (fr <= 8000); s = sp[m] + 1e-12
    flat = float(np.exp(np.mean(np.log(s))) / np.mean(s))
    nseg = seg / pk
    low_db = float(10 * np.log10(band_energy(nseg, sr, 60, 300) / len(nseg)))                 # weight: low-end energy relative to the peak
    sub_db = float(10 * np.log10(band_energy(nseg, sr, 30, 100) / len(nseg)))
    sh = x[i_pk:b]; kurt = float(np.mean((sh - sh.mean()) ** 4) / (np.var(sh) ** 2 + 1e-12))     # saturation squashes the peaks: kurtosis falls
    clip = float(np.mean(np.abs(x) >= 0.995))
    noise = pre_noise if pre_noise is not None else float(np.sqrt(np.mean(x[:max(1, int(0.002 * sr))] ** 2)) + 1e-9)
    # floor measured at the very end of the shot
    tail_floor = float(np.sqrt(np.mean(x[-int(0.05 * sr):] ** 2)) + 1e-9) if len(x) > int(0.1 * sr) else 1e-9
    rms100 = float(np.sqrt(np.mean(x[a:a + int(0.1 * sr)] ** 2)) + 1e-12)
    return {"peak_db": 20 * np.log10(pk), "attack_ms": attack_ms, "t30_ms": t30 * 1000, "t50_ms": t50 * 1000, "room_db": room_db,
            "crest_db": 20 * np.log10(pk / rms100), "centroid_hz": centroid, "flat": flat, "clip_frac": clip,
            "snr_db": 20 * np.log10(pk / tail_floor), "kurt": kurt, "low_db": low_db, "sub_db": sub_db, "frac": frac, "length_ms": len(x) / sr * 1000}


# ------------------------------------------------------------------ scoring: how well does a shot fit a snappy game pistol?
def trap(v, lo0, lo1, hi1, hi0):
    """1.0 inside [lo1, hi1], falling linearly to 0 at lo0 and hi0."""
    if v < lo0 or v > hi0: return 0.0
    if v < lo1: return (v - lo0) / (lo1 - lo0)
    if v > hi1: return (hi0 - v) / (hi0 - hi1)
    return 1.0

TARGET = {   # the profile of a punchy, bright, short, dry game pistol (an approximation; see README: a reference clip can replace it)
    "attack_ms": (0.0, 0.0, 1.6, 6.0), "t50_ms": (60, 140, 480, 1200), "room_db": (-60, -40, -18, -4),
    "crack": (0.04, 0.10, 0.45, 0.75), "body": (0.02, 0.06, 0.40, 0.70), "centroid": (700, 1500, 4800, 9000), "snr_db": (20, 38, 200, 300), "low_db": (-48, -34, 0, 10),
}
WEIGHTS = {"attack": 14, "tail": 11, "dry": 14, "clip": 13, "clean": 7, "crack": 14, "body": 10, "bright": 9, "weight": 8}

def suitability(f):
    parts = {
        "attack": trap(f["attack_ms"], *TARGET["attack_ms"]),
        "tail": trap(f["t50_ms"], *TARGET["t50_ms"]),
        "dry": trap(f["room_db"], *TARGET["room_db"]),
        "clip": 1.0 - min(1.0, f["clip_frac"] * 400),              # 0.25% of samples at full scale already costs everything
        "clean": trap(f["snr_db"], *TARGET["snr_db"]),
        "crack": trap(f["frac"]["crack"], *TARGET["crack"]),
        "body": trap(f["frac"]["body"] + f["frac"]["sub"], *TARGET["body"]),
        "bright": trap(f["centroid_hz"], *TARGET["centroid"]),
        "weight": trap(f["low_db"], *TARGET["low_db"]),
    }
    score = sum(WEIGHTS[k] * parts[k] for k in parts) / sum(WEIGHTS.values()) * 100
    return round(score, 1), {k: round(v, 2) for k, v in parts.items()}


def crisp_index(f):      # 0-100: bright, fast, short
    return round(100 * (0.45 * trap(f["frac"]["crack"] + f["frac"]["air"], 0.05, 0.2, 0.8, 1.0) + 0.3 * trap(f["attack_ms"], 0, 0, 1.2, 5) + 0.25 * trap(f["t30_ms"], 30, 80, 300, 900)), 0)

def crunch_index(f):     # 0-100: dense, gritty, saturated. A squashed peak (low crest, low kurtosis) plus a dense, flat mid-high spectrum.
    squash = float(np.clip((26 - f["crest_db"]) / 16, 0, 1)); kn = float(np.clip((16 - f["kurt"]) / 12, 0, 1)); dens = min(1.0, f["flat"] / 0.35)
    return round(100 * (0.4 * squash + 0.4 * kn + 0.2 * dens), 0)
