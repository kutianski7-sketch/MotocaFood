"""Trilha de fundo sintetizada (beat 118 BPM) + ronco de moto na abertura."""
import json, numpy as np, soundfile as sf

SR = 44100
dur = json.load(open("timings.json"))["duration"]
N = int(dur * SR)
rng = np.random.default_rng(7)
mix = np.zeros(N)
bpm = 118
beat = 60 / bpm

def add(sig, t, gain=1.0):
    i = int(t * SR)
    if i >= N: return
    sig = sig[: N - i]
    mix[i:i + len(sig)] += sig * gain

def env(n, a=0.002, d=0.2):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1) * np.exp(-t / d)

def kick():
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 50 + 110 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.12)

def clap():
    n = int(0.2 * SR)
    return rng.standard_normal(n) * env(n, 0.001, 0.05)

def hat():
    n = int(0.06 * SR); x = rng.standard_normal(n)
    x = np.diff(x, prepend=0)  # brilho
    return x * env(n, 0.0005, 0.015)

def bass(freq, length):
    n = int(length * SR); t = np.arange(n) / SR
    saw = 2 * ((t * freq) % 1) - 1
    sq = np.sign(np.sin(2 * np.pi * freq * t))
    x = 0.6 * saw + 0.4 * sq
    # low-pass simples
    for _ in range(3):
        x = np.convolve(x, np.ones(12) / 12, mode="same")
    return x * env(n, 0.005, length * 0.6)

def pad(freqs, length):
    n = int(length * SR); t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) for f in freqs)
    a = np.minimum(t / 0.3, 1) * np.minimum((length - t) / 0.3, 1)
    return x * a / len(freqs)

# Am - F - C - G
chords = [(110.0, [220.0, 261.63, 329.63]), (87.31, [174.61, 220.0, 261.63]),
          (130.81, [261.63, 329.63, 392.0]), (98.0, [196.0, 246.94, 293.66])]
start = 1.2  # beat entra depois do "Fala, Motocas!"
bar = 4 * beat
nbars = int((dur - start) / bar) + 1
for b in range(nbars):
    t0 = start + b * bar
    root, notes = chords[b % 4]
    add(pad(notes, bar), t0, 0.10)
    for q in range(4):
        tq = t0 + q * beat
        add(kick(), tq, 0.9)
        if q in (1, 3): add(clap(), tq, 0.25)
        add(hat(), tq + beat / 2, 0.18)
        add(hat(), tq + beat / 4 * 3, 0.07)
        for e in (0, 0.5):
            add(bass(root if (q + e) % 2 == 0 else root * 2, beat / 2 * 0.9), tq + e * beat, 0.35)

# ronco de moto (abertura): serra com frequência subindo + ruído
n = int(1.6 * SR); t = np.arange(n) / SR
f = 35 + 70 * (1 - np.exp(-t * 3)) + 8 * np.sin(2 * np.pi * 9 * t)
ph = np.cumsum(f) / SR
eng = (2 * (ph % 1) - 1) + 0.5 * np.sign(np.sin(2 * np.pi * ph * 2))
eng += 0.3 * rng.standard_normal(n)
for _ in range(2):
    eng = np.convolve(eng, np.ones(20) / 20, mode="same")
eng *= np.minimum(t / 0.1, 1) * np.clip((1.6 - t) / 0.6, 0, 1)
add(eng, 0.0, 0.8)

# fade-out final
fo = int(2.0 * SR)
mix[-fo:] *= np.linspace(1, 0, fo)
mix = mix / np.max(np.abs(mix)) * 0.8
sf.write("audio/trilha.wav", np.stack([mix, mix], 1).astype(np.float32), SR)
print("ok", dur)
