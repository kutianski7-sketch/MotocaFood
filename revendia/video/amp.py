"""Envelope de amplitude da voz por quadro (boca da revendedora e ondas da cena da assistente de voz)."""
import json, numpy as np, soundfile as sf
FPS = 30
x, sr = sf.read("audio/voz.wav")
hop = sr // FPS
n = len(x) // hop + 1
rms = np.array([np.sqrt(np.mean(x[i*hop:(i+1)*hop]**2) + 1e-12) for i in range(n)])
rms = np.clip(rms / np.percentile(rms[rms > 0.01], 95), 0, 1)
rms = np.convolve(rms, [0.25, 0.5, 0.25], mode="same")
json.dump([round(float(v), 3) for v in rms], open("amp.json", "w"))
print(n)
