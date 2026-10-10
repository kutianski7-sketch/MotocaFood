# Vídeo Reels — Motoca Food

`motocafood_reels.mp4`: vídeo pronto para o Instagram (1080x1920, 30 fps, ~45 s, H.264 + AAC, -14 LUFS).

Cenas animadas narrando o texto, com legendas, e no final o Motoca aparece falando (lip-sync)
"Chegou a hora de o Motoca ter qualidade de vida e ser ouvido! Bora acelerar, Motoca! Chegou a nossa vez!",
fechando com a cartela da marca e o endereço motocafood.com.br.

## Como regerar

```bash
pip install kokoro-onnx soundfile numpy
# modelos de voz (Kokoro v1.0): kokoro-v1.0.onnx e voices-v1.0.bin
# https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
python3 tts.py <pasta_dos_modelos>   # narração -> audio/voz.wav + timings.json
python3 music.py                     # trilha  -> audio/trilha.wav
python3 amp.py                       # envelope da voz p/ lip-sync -> amp.json
node render.js /tmp/frames           # quadros (Playwright/Chromium)
./encode.sh /tmp/frames motocafood_reels.mp4
```

- Texto da fala: `SEGMENTS` em `tts.py` (a segunda coluna é a grafia usada para a pronúncia, ex.: "Motoca Fúd").
- Cores, textos e cenas: `cenas.html` (variáveis de cor em `:root`).
- Prévia de quadros soltos: `node render.js /tmp/prev 5,20,40`.
