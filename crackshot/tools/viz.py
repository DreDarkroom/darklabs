"""viz: tiny dependency-free picture maker (numpy + zlib only): waveform + spectrogram panels as PNG, so shots can be inspected by eye."""
import struct
import zlib
import numpy as np

# an "inferno"-like colour ramp (black -> purple -> red -> orange -> pale yellow)
_STOPS = np.array([[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]], dtype=float)


def _ramp(v):
    v = np.clip(v, 0, 1) * (len(_STOPS) - 1); i = np.minimum(v.astype(int), len(_STOPS) - 2); f = (v - i)[..., None]
    return (_STOPS[i] * (1 - f) + _STOPS[i + 1] * f).astype(np.uint8)


def write_png(path, rgb):
    h, w, _ = rgb.shape
    raw = b"".join(b"\x00" + rgb[y].tobytes() for y in range(h))
    def chunk(t, d): c = struct.pack(">I", len(d)) + t + d; return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
    open(path, "wb").write(png)


def spectrogram(x, sr, dur=0.5, n_fft=1024, hop=96, fmax=18000, floor_db=-95, px_x=2):
    x = x[: int(dur * sr)]; win = np.hanning(n_fft)
    frames = 1 + max(0, (len(x) - n_fft) // hop); S = np.empty((n_fft // 2 + 1, frames))
    for i in range(frames): S[:, i] = np.abs(np.fft.rfft(x[i * hop:i * hop + n_fft] * win)) + 1e-9
    S = 20 * np.log10(S / (n_fft / 4)); kmax = int(fmax / (sr / 2) * (S.shape[0] - 1)); S = S[:kmax][::-1]       # high frequencies at the top
    img = _ramp((S - floor_db) / (-floor_db * 0.85)); return np.repeat(img, px_x, axis=1)


def waveform(x, sr, dur=0.5, w=0, h=110):
    x = x[: int(dur * sr)]; w = w or len(x) // 48; img = np.zeros((h, w, 3), np.uint8); img[:] = (6, 4, 8); step = max(1, len(x) // w)
    for c in range(w):
        seg = x[c * step:(c + 1) * step]
        if not len(seg): continue
        hi, lo = seg.max(), seg.min(); y0, y1 = int((1 - (min(1, hi) + 1) / 2) * (h - 1)), int((1 - (max(-1, lo) + 1) / 2) * (h - 1)); img[y0:y1 + 1, c] = (240, 80, 90)
    img[h // 2, :] = (60, 30, 40); return img


def panel(x, sr, path, dur=0.5):
    sp = spectrogram(x, sr, dur); wv = waveform(x, sr, dur, w=sp.shape[1]); gap = np.full((6, sp.shape[1], 3), 30, np.uint8)
    write_png(path, np.vstack([wv, gap, sp]))


def stack(paths_imgs, out, gap=10):
    """Stack several panel arrays vertically into one PNG (widths are padded to match)."""
    w = max(i.shape[1] for i in paths_imgs); rows = []
    for i in paths_imgs:
        pad = np.zeros((i.shape[0], w - i.shape[1], 3), np.uint8); rows += [np.hstack([i, pad]), np.full((gap, w, 3), 90, np.uint8)]
    write_png(out, np.vstack(rows))


def panel_img(x, sr, dur=0.5):
    sp = spectrogram(x, sr, dur); wv = waveform(x, sr, dur, w=sp.shape[1]); return np.vstack([wv, np.full((4, sp.shape[1], 3), 30, np.uint8), sp])
