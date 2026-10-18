#!/usr/bin/env bash
# Junta os quadros + voz + trilha (com ducking) no MP4 final (1080x1920, 30 fps, H.264 + AAC, -14 LUFS).
# Uso: ./encode.sh <pasta_dos_quadros> [saida.mp4] [crf]
set -euo pipefail
cd "$(dirname "$0")"
FRAMES=${1:-frames}
OUT=${2:-revendia_explicativo.mp4}
CRF=${3:-22}
ffmpeg -y -framerate 30 -i "$FRAMES/f_%05d.jpg" -i audio/voz.wav -i audio/trilha.wav -filter_complex "
  [1:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=80,equalizer=f=3000:t=q:w=1:g=2,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,volume=1.8,asplit=2[voz][sc];
  [2:a]aresample=48000,volume=0.32[mus];
  [mus][sc]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[duck];
  [voz][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9,aresample=48000[a]" \
  -map 0:v -map "[a]" -c:v libx264 -profile:v high -preset slow -crf "$CRF" -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 160k -ar 48000 -movflags +faststart -shortest "$OUT"
