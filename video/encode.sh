#!/usr/bin/env bash
# Junta os quadros + voz + trilha (com ducking) no MP4 final para Reels (1080x1920, 30fps).
set -euo pipefail
FRAMES=${1:-frames}
OUT=${2:-motocafood_reels.mp4}
ffmpeg -y -framerate 30 -i "$FRAMES/f_%05d.jpg" -i audio/voz.wav -i audio/trilha.wav -filter_complex "
  [1:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=70,acompressor=threshold=-18dB:ratio=3:attack=5:release=80,volume=1.6,asplit=2[voz][sc];
  [2:a]aresample=48000,volume=0.32[mus];
  [mus][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=300[duck];
  [voz][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9,aresample=48000[a]" \
  -map 0:v -map "[a]" -c:v libx264 -profile:v high -preset slow -crf 18 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest "$OUT"
