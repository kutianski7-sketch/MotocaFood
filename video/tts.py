"""Gera a narração (voz pt-BR local, Kokoro) por trecho e salva timings.json."""
import json, sys, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

MODELS = sys.argv[1] if len(sys.argv) > 1 else "models"
# (texto exibido na legenda, texto falado — grafia ajustada p/ pronúncia)
SEGMENTS = [
    ("Fala, Motocas!", "Fala, Motocas!"),
    ("Chegou o Motoca Food, o primeiro e único app que se importa de verdade com o Motoca!",
     "Chegou o Motoca Fúd, o primeiro e único ápi que se importa de verdade com o Motoca!"),
    ("Uma central de parceiros com descontos pra facilitar sua vida.",
     "Uma central de parceiros com descontos pra facilitar sua vida."),
    ("Nessa primeira fase, restaurantes pro Motoca comer barato, com almoço e jantar por até vinte reais,",
     "Nessa primeira fase, restaurantes pro Motoca comer barato, com almoço e jantar por até vinte reais,"),
    ("além de borracharias, mecânicos e guinchos baratos.",
     "além de borracharias, mecânicos e guinchos baratos."),
    ("Em breve, postos de gasolina, advogados, médicos e contadores com preços muito baratos pros Motocas.",
     "Em breve, postos de gasolina, advogados, médicos e contadores com preços muito baratos pros Motocas."),
    ("E você, Motoca, é o agente multiplicador:",
     "E você, Motoca, é o agente multiplicador!"),
    ("chama aquele restaurante onde você já come, aquele borracheiro e mecânico pra virar parceiro.",
     "chama aquele restaurante onde você já come, aquele borracheiro e mecânico pra virar parceiro."),
    ("O acesso é gratuito pra você Motoca e pros parceiros.",
     "O acesso é gratuito pra você Motoca e pros parceiros."),
    ("Chegou a hora de o Motoca ter qualidade de vida e ser ouvido!",
     "Chegou a hora de o Motoca ter qualidade de vida e ser ouvido!"),
    ("Bora acelerar, Motoca! Chegou a nossa vez!",
     "Bora acelerar, Motoca! Chegou a nossa vez!"),
]
LEAD, GAP, TAIL = 0.6, 0.25, 2.2  # silêncio inicial, entre trechos e final (s)

k = Kokoro(f"{MODELS}/kokoro-v1.0.onnx", f"{MODELS}/voices-v1.0.bin")
sr = 24000
out, t, timings = [np.zeros(int(LEAD * sr), np.float32)], LEAD, []
for shown, spoken in SEGMENTS:
    s, sr = k.create(spoken, voice="pm_alex", speed=1.12, lang="pt-br")
    # corta silêncio nas bordas
    idx = np.where(np.abs(s) > 0.01)[0]
    s = s[max(idx[0] - 600, 0): idx[-1] + 1200].astype(np.float32)
    timings.append({"text": shown, "start": round(t, 3), "end": round(t + len(s) / sr, 3)})
    out += [s, np.zeros(int(GAP * sr), np.float32)]
    t += len(s) / sr + GAP
out.append(np.zeros(int(TAIL * sr), np.float32))
voice = np.concatenate(out)
voice = voice / np.max(np.abs(voice)) * 0.9
sf.write("audio/voz.wav", voice, sr)
json.dump({"duration": round(len(voice) / sr, 3), "segments": timings},
          open("timings.json", "w"), ensure_ascii=False, indent=1)
print(len(voice) / sr)
