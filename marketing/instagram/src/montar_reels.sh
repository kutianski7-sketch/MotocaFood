#!/usr/bin/env bash
# Monta um Reels a partir das cenas renderizadas (artes/<nome>/c1.png, c2.png, ...).
# Gera duas versões: com a trilha do projeto e sem áudio (para colocar um áudio em alta direto no Instagram).
# Uso (de marketing/instagram): ./src/montar_reels.sh <nome> <dur_c1> <dur_c2> ...
#   ex.: ./src/montar_reels.sh como-funciona 2.6 3.0 3.4 3.4 3.4 2.6 3.0
set -euo pipefail
NOME=$1; shift
DUR=("$@")
D=artes/reels-$NOME
TRILHA=../../video/audio/trilha.wav
X=0.35   # duração da transição
N=${#DUR[@]}
in=(); f=""
for ((i=0; i<N; i++)); do
  fr=$(python3 -c "print(round(${DUR[$i]}*30))")
  in+=(-loop 1 -framerate 30 -t "${DUR[$i]}" -i "$D/c$((i+1)).png")
  f+="[$i:v]scale=1188:2112,zoompan=z='1+0.035*on/$fr':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,setsar=1,format=yuv420p[v$i];"
done
prev="v0"; off=0
for ((i=1; i<N; i++)); do
  off=$(python3 -c "print(round($off+${DUR[$((i-1))]}-$X,3))")
  f+="[$prev][v$i]xfade=transition=slideleft:duration=$X:offset=$off[x$i];"; prev="x$i"
done
TOTAL=$(python3 -c "print(round(sum(map(float,'${DUR[*]}'.split()))-($N-1)*$X,3))")
mkdir -p reels
ffmpeg -y -loglevel error "${in[@]}" -filter_complex "${f%;}" -map "[$prev]" -c:v libx264 -profile:v high -preset slow -crf 18 \
  -pix_fmt yuv420p -r 30 -movflags +faststart -t "$TOTAL" "reels/${NOME}_sem-audio.mp4"
ffmpeg -y -loglevel error -i "reels/${NOME}_sem-audio.mp4" -i "$TRILHA" -filter_complex \
  "[1:a]atrim=0:$TOTAL,afade=t=in:d=0.3,afade=t=out:st=$(python3 -c "print($TOTAL-1.2)"):d=1.2,loudnorm=I=-14:TP=-1.5,aresample=48000[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "reels/${NOME}.mp4"
echo "ok: reels/${NOME}.mp4 ($TOTAL s)"
