"""process: turn a raw single shot into game-ready variants. Classic DSP only: filters, saturation, envelope shaping,
one plain sine for the sub, and (optionally) a Kenney CC0 sci-fi sound pitched down as a flavour layer. No AI audio.

  crisp   = a clear bright transient (transient shaper + a harmonic exciter on the 3.5 kHz+ band + presence EQ)
  crunch  = gritty, dense mids (parallel tanh saturation on 250 Hz-7 kHz + a touch of sample-and-hold aliasing)
  arc     = crisp + a pitched-down sci-fi sweetener (the 'energy' flavour)
"""
import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import uniform_filter1d

SR = 48000


def _sos(kind, f, sr=SR, order=4):
    return signal.butter(order, f, btype=kind, fs=sr, output="sos")


def hp(x, f, order=4): return signal.sosfilt(_sos("highpass", f, order=order), x)
def lp(x, f, order=4): return signal.sosfilt(_sos("lowpass", f, order=order), x)
def bp(x, lo, hi): return signal.sosfilt(_sos("bandpass", [lo, hi], order=3), x)


def peq(x, f0, gain_db, q=0.9, sr=SR):
    """RBJ peaking EQ."""
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / sr; al = np.sin(w) / (2 * q); c = np.cos(w)
    b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x)


def hshelf(x, f0, gain_db, sr=SR):
    """RBJ high shelf (slope 1)."""
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / sr; c, s = np.cos(w), np.sin(w); al = s / 2 * np.sqrt(2)
    b0 = A * ((A + 1) + (A - 1) * c + 2 * np.sqrt(A) * al); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - 2 * np.sqrt(A) * al)
    a0 = (A + 1) - (A - 1) * c + 2 * np.sqrt(A) * al; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - 2 * np.sqrt(A) * al
    return signal.lfilter(np.array([b0, b1, b2]) / a0, np.array([1, a1 / a0, a2 / a0]), x)


# ----------------------------------------------------------------- the stages
def prep(x, sr=SR, length=0.5):
    """Trim to the shot, remove DC and rumble, cap the length with a fade."""
    x = x - np.mean(x); x = hp(x, 32, 2); n = int(length * sr); x = x[:n]
    f = int(0.05 * sr); x = x.copy(); x[-f:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, f))); return x


def tail_tamer(x, start=0.07, tau=0.12, sr=SR):
    """Dry out the room: an extra exponential decay that begins `start` seconds after the peak."""
    i = int(np.argmax(np.abs(x))); t = np.arange(len(x)) / sr - i / sr
    g = np.where(t > start, np.exp(-(t - start) / tau), 1.0); return x * g


def transient_shape(x, amount=0.8, sr=SR):
    """Boost the first few milliseconds: where a fast envelope runs ahead of a slow one, add gain (up to ~+6 dB)."""
    a = np.abs(x); ef = uniform_filter1d(a, max(1, int(0.0004 * sr))); es = uniform_filter1d(a, max(1, int(0.014 * sr)))
    r = np.log2((ef + 1e-5) / (es + 1e-5)); g = 1 + amount * np.clip(r, 0, 2) / 2 * 0.9
    g = uniform_filter1d(g, max(1, int(0.0003 * sr))); return x * g


def exciter(x, mix=0.3, drive=4.0, f=3500, sr=SR):
    """Crispness: saturate the high band so it grows new harmonics, then add only the new top end back."""
    h = hp(x, f); h = np.tanh(h * drive) / np.tanh(drive); h = hp(h, f * 1.4); return x + mix * h * (np.max(np.abs(x)) / (np.max(np.abs(h)) + 1e-9))


def crunch(x, drive=3.5, mix=0.5, grit=0.15, sr=SR):
    """Crunch: parallel asymmetric saturation on the mids (250 Hz - 7 kHz), plus a little sample-and-hold aliasing."""
    mid = bp(x, 250, 7000); pk = np.max(np.abs(mid)) + 1e-9; m = mid / pk
    s = np.tanh(drive * (m + 0.22 * m * m)); s -= np.mean(s); s *= pk / (np.max(np.abs(s)) + 1e-9)
    if grit > 0:
        dec = np.repeat(s[::3], 3)[:len(s)]; dec = lp(dec, 13000, 2); s = (1 - grit) * s + grit * dec
    return x + mix * (s - mid)


def sub_thump(peak, gain_db=-15.0, f0=58, sweep=70, decay=0.024, length=0.10, sr=SR):
    """A plain sine that falls from ~150 Hz to ~54 Hz: the weight real recordings usually don't capture. Synthesised by code."""
    t = np.arange(int(length * sr)) / sr; f = f0 + sweep * np.exp(-t / 0.028); ph = 2 * np.pi * np.cumsum(f) / sr
    y = np.cos(ph) * np.exp(-t / decay) * (peak * 10 ** (gain_db / 20)); f_ = int(0.004 * sr); y[:f_] *= np.linspace(0.3, 1, f_)
    return hp(y, 38, 2)


def sweetener(path, peak, semitones=-4, gain_db=-23.0, length=0.11, sr=SR):
    """A Kenney CC0 sci-fi sound, pitched down and low-passed, placed under the shot as an energy flavour."""
    y, fs = sf.read(path, always_2d=True, dtype="float64"); y = y.mean(axis=1)
    ratio = 2 ** (semitones / 12); n = int(len(y) / ratio * sr / fs); y = signal.resample(y, n)               # resample slower = lower pitch
    y = y[:int(length * sr)]; y = hp(lp(y, 6500, 2), 450, 2); f = int(0.05 * sr); y[-f:] *= np.linspace(1, 0, f)
    return y / (np.max(np.abs(y)) + 1e-9) * peak * 10 ** (gain_db / 20)


def finish(x, sr=SR, ceiling_db=-1.0, length=0.5):
    x = hp(x - np.mean(x), 35, 4); y = np.tanh(1.15 * x) / np.tanh(1.15)                     # gentle soft limit
    f = int(0.015 * sr); y[-f:] *= np.linspace(1, 0, f)
    pk = np.max(np.abs(y)) + 1e-9; y = y * (10 ** (ceiling_db / 20) / pk)
    env = np.abs(y); idx = np.where(env > 10 ** (-60 / 20))[0]                              # trim trailing silence
    return y[:min(len(y), (idx[-1] + int(0.02 * sr)) if len(idx) else len(y))]


# ----------------------------------------------------------------- the variants
def variant(raw, kind, sweet_path=None, sub_db=None, sr=SR):
    x = prep(raw, sr)
    pk = np.max(np.abs(x)) + 1e-9
    if kind == "crisp" or kind == "arc":
        x = tail_tamer(x, 0.075, 0.12); x = transient_shape(x, 0.9); x = peq(x, 3600, 3.5, 0.8); x = hshelf(x, 9000, 2.0); x = exciter(x, 0.30)
        layer = sub_thump(pk, sub_db if sub_db is not None else -15.0)
    else:  # crunch
        x = tail_tamer(x, 0.08, 0.14); x = transient_shape(x, 0.8); x = crunch(x, 3.5, 0.55, 0.15); x = peq(x, 2800, 2.5, 0.9); x = hshelf(x, 7500, 2.0); x = exciter(x, 0.16, 3.0, 4500)
        layer = sub_thump(pk, (sub_db if sub_db is not None else -13.0), f0=52, decay=0.03)
    y = x.copy(); y[:len(layer)] += layer[:len(y)]
    if kind == "arc" and sweet_path:
        i = int(np.argmax(np.abs(x))); sw = sweetener(sweet_path, pk); end = min(len(y), i + len(sw)); y[i:end] += sw[:end - i]
    return finish(y, sr)
