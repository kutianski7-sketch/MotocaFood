"""Trilha sintetizada em duas partes:
ANTES  -> textura lenta, menor e abafada + relógio tique-taque;
DEPOIS -> groove pop quente (112 BPM, maior) a partir da transição (logo RevendIA)."""
import json, numpy as np, soundfile as sf

SR = 44100
T = json.load(open("timings.json"))
dur, seg = T["duration"], T["segments"]
tr = T.get("transition", 3)
SWITCH = seg[tr + 1]["start"] - 0.45      # downbeat da parte 2 (um pouco antes de "Chegou a RevendIA")
WIPE0 = seg[tr]["end"] + 0.1               # começo do whoosh
N = int(dur * SR)
rng = np.random.default_rng(11)
mix = np.zeros(N)

def add(sig, t, gain=1.0):
    i = int(t * SR)
    if i >= N or i < 0: return
    sig = sig[: N - i]
    mix[i:i + len(sig)] += sig * gain

def env(n, a=0.002, d=0.2):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1) * np.exp(-t / d)

def lp(x, k=12, passes=3):
    for _ in range(passes):
        x = np.convolve(x, np.ones(k) / k, mode="same")
    return x

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)

# ---------------- PARTE 1: ANTES ----------------
def dark_pad(notes, length):
    n = int(length * SR); t = np.arange(n) / SR
    x = np.zeros(n)
    for m in notes:
        f = hz(m)
        for det in (-0.12, 0.12):
            x += np.sin(2 * np.pi * (f + det) * t) + 0.25 * np.sin(2 * np.pi * 2 * (f + det) * t)
    x *= (1 + 0.15 * np.sin(2 * np.pi * 0.4 * t))     # leve tremolo
    a = np.minimum(t / 0.9, 1) * np.minimum((length - t) / 0.9, 1)
    return lp(x, 20, 2) * a / len(notes)

def tick(hi=True):
    n = int(0.05 * SR); t = np.arange(n) / SR
    f = 2600 if hi else 1900
    x = np.sin(2 * np.pi * f * t) * 0.6 + rng.standard_normal(n) * 0.4
    return x * env(n, 0.0003, 0.008)

def low_piano(m, length):
    n = int(length * SR); t = np.arange(n) / SR; f = hz(m)
    x = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * 2 * f * t) + 0.15 * np.sin(2 * np.pi * 3 * f * t)
    return x * env(n, 0.004, 0.9)

# Am - Fmaj7 - Dm - E (lento, menor)
p1 = [[57, 60, 64], [53, 57, 60, 64], [50, 53, 57], [52, 56, 59]]
bar1 = 3.2
t0 = 0.0; b = 0
while t0 < SWITCH:
    L = min(bar1, SWITCH - t0 + 0.6)
    add(dark_pad(p1[b % 4], L), t0, 0.16)
    add(low_piano(p1[b % 4][0] - 12, 2.5), t0, 0.22)
    add(low_piano(p1[b % 4][-1], 1.8), t0 + bar1 / 2, 0.08)
    t0 += bar1; b += 1
# relógio: 1 tique por segundo
s = 0.0
while s < SWITCH - 0.3:
    add(tick(int(s) % 2 == 0), s + 0.15, 0.32)
    s += 1.0
# fade-out da parte 1
i0, i1 = int((SWITCH - 0.8) * SR), int(SWITCH * SR)
part1_mask = np.ones(N); part1_mask[i0:i1] = np.linspace(1, 0, i1 - i0); part1_mask[i1:] = 0
mix *= part1_mask

# whoosh / riser na transição
n = int((SWITCH - WIPE0 + 0.3) * SR); t = np.arange(n) / SR
x = rng.standard_normal(n)
x = x - lp(x, 6, 2)                    # ruído com brilho
w = (t / t[-1]) ** 2
add(x * w * np.exp(-np.maximum(t - (t[-1] - 0.3), 0) * 12), WIPE0, 0.35)
# "sparkle" (arpejo rápido) no reveal do logo
for k, m in enumerate([84, 88, 91, 96, 100]):
    nn = int(0.5 * SR); tt = np.arange(nn) / SR
    add(np.sin(2 * np.pi * hz(m) * tt) * env(nn, 0.002, 0.18), SWITCH + 0.05 + k * 0.06, 0.12)

# ---------------- PARTE 2: DEPOIS ----------------
bpm = 112; beat = 60 / bpm; bar = 4 * beat

def kick():
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 48 + 100 * np.exp(-t * 32)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.13)

def clap():
    n = int(0.22 * SR); x = rng.standard_normal(n)
    x = x - lp(x, 4, 1)
    e = env(n, 0.001, 0.06)
    for d in (0.008, 0.016):          # 3 "mãos"
        k = int(d * SR); e[k:] += env(n - k, 0.001, 0.05)[: n - k] * 0.6
    return x * e

def hat(open_=False):
    n = int((0.16 if open_ else 0.05) * SR); x = rng.standard_normal(n)
    x = np.diff(x, prepend=0)
    return x * env(n, 0.0005, 0.05 if open_ else 0.012)

def bass(m, length):
    n = int(length * SR); t = np.arange(n) / SR; f = hz(m)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sign(np.sin(2 * np.pi * f * t))
    return lp(x, 10, 2) * env(n, 0.004, length * 0.7)

def pluck(m, length=0.4):
    n = int(length * SR); t = np.arange(n) / SR; f = hz(m)
    x = (2 * ((t * f) % 1) - 1) * 0.5 + np.sin(2 * np.pi * f * t)
    return lp(x, 5, 2) * env(n, 0.002, 0.12)

def warm_pad(notes, length):
    n = int(length * SR); t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * hz(m) * t) + 0.3 * np.sin(2 * np.pi * 2 * hz(m) * t + 0.5) for m in notes)
    a = np.minimum(t / 0.25, 1) * np.minimum((length - t) / 0.25, 1)
    return x * a / len(notes)

# F - C - G - Am  (I = C maior: Fmaj7, C, G, Am)
p2 = [(41, [65, 69, 72, 76]), (36, [64, 67, 72]), (43, [62, 67, 71]), (45, [64, 69, 72])]
arp = [0, 1, 2, 1, 2, 3, 2, 1]
end_music = dur - 0.2
nb = int((end_music - SWITCH) / bar) + 1
for bi in range(nb):
    tb = SWITCH + bi * bar
    root, notes = p2[bi % 4]
    add(warm_pad(notes, bar), tb, 0.09)
    intro = bi < 1                            # primeiro compasso só pad+arpejo
    for q in range(4):
        tq = tb + q * beat
        if not intro:
            add(kick(), tq, 0.85)
            if q in (1, 3): add(clap(), tq, 0.22)
            add(hat(), tq + beat / 2, 0.16)
            add(hat(), tq + beat / 4 * 3, 0.06)
            if q == 3: add(hat(True), tq + beat / 2, 0.06)
        for e in (0, 0.5):
            add(bass(root if e == 0 else root + 12, beat / 2 * 0.9), tq + e * beat, 0.30 if not intro else 0.15)
    for k in range(8):
        add(pluck(notes[arp[k] % len(notes)] + 12), tb + k * beat / 2, 0.07)

# fade-out final
fo = int(2.5 * SR)
mix[-fo:] *= np.linspace(1, 0, fo)
mix = mix / np.max(np.abs(mix)) * 0.8
# parte 1 um pouco mais baixa/abafada que a 2
sf.write("audio/trilha.wav", np.stack([mix, mix], 1).astype(np.float32), SR)
print("ok", dur, "switch", round(SWITCH, 2))
