# Vídeo explicativo — RevendIA

O vídeo final fica em `../public/video/revendia_explicativo.mp4` (servido na landing page): vídeo vertical para a landing page (1080x1920, 30 fps, ~99 s, H.264 + AAC, -14 LUFS, legendas embutidas).
`../public/video/poster.jpg`: quadro de capa (revelação da marca, sem legenda).

Roteiro em duas partes:
- **ANTES** (tons frios/dessaturados, câmera tremendo, relógio tique-taque): a revendedora cansada à noite, caderno + app da marca + calculadora, clientes reclamando, sem posts e sem saber o lucro.
- **DEPOIS** (cores quentes, groove pop): logo RevendIA, cadastro (WhatsApp + código + Pix/cartão), conexão Boticário/Natura/Avon/Eudora + catálogo, pedido no WhatsApp repassado à marca, boletos do dia + pagamento identificado, aviso ao cliente, motoboy, Instagram automático, campanhas na lista de transmissão, financeiro, agentes de IA por área (Marketing, Comercial, Operações, Financeiro), assistente de voz, fechamento e cartela final ("Assine no PIX ou cartão" · revendia.com.br).

## Como regerar

```bash
pip install kokoro-onnx soundfile numpy
# modelos de voz (Kokoro v1.0): kokoro-v1.0.onnx e voices-v1.0.bin — NÃO versionar
# https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
python3 tts.py <pasta_dos_modelos>   # narração (voz feminina pf_dora) -> audio/voz.wav + timings.json
python3 music.py                     # trilha (não versionada; gere antes de codificar) (parte 1 menor + relógio, parte 2 pop) -> audio/trilha.wav
python3 amp.py                       # envelope da voz por quadro (boca/ondas da cena de voz) -> amp.json
NODE_PATH=/opt/node22/lib/node_modules node render.cjs /tmp/frames   # quadros JPG (Playwright/Chromium)
./encode.sh /tmp/frames revendia_explicativo.mp4 22                    # mux + ducking + loudnorm (-14 LUFS)
rm -rf /tmp/frames
```

- `render.cjs` é `.cjs` porque `revendia/package.json` declara `"type": "module"`.
- Prévia de quadros soltos (PNG): `node render.cjs /tmp/prev 5,20,40` (imprime também os intervalos das cenas).
- Re-renderizar só um trecho (mantém a numeração): `DE=60 ATE=65 node render.cjs /tmp/frames`.
- Poster sem legenda: `SEM_LEGENDA=1 node render.cjs /tmp/p 20.6` e converter `t_20.60.png` para `poster.jpg`.
- Texto da fala: `SEGMENTS` em `tts.py` — a 1ª coluna é a legenda, a 2ª é a grafia usada para a pronúncia
  (ex.: "Revendía", "uótsápi", "Píx", "Ínstagrãm", "ápi", "motobói", "márketin", "lídis", "fólou ápi", "dê erre é").
  `EXTRA_GAP` define a pausa da transição ANTES→DEPOIS (índice em `timings.json` → `transition`).
- Cenas, cores (variáveis em `:root`) e animações: `cenas.html` (uma `div.scene` por trecho de narração; `window.init(data)` monta, `window.render(t)` desenha o instante `t`).
- Tamanho do arquivo: ajuste o CRF (3º argumento do `encode.sh`; 22 ≈ 19 MB).
