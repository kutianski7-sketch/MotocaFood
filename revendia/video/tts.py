"""Gera a narração (voz pt-BR local, Kokoro, voz feminina) por trecho e salva timings.json."""
import json, sys, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

MODELS = sys.argv[1] if len(sys.argv) > 1 else "models"
VOICE, SPEED = "pf_dora", 1.10
# (texto exibido na legenda, texto falado — grafia ajustada p/ pronúncia)
SEGMENTS = [
    # ---------- ANTES ----------
    ("Você é revendedora e vive assim?", "Você é revendedora, e vive assim?"),
    ("Anotando pedido no caderno, digitando tudo no app da marca, somando boleto na calculadora...",
     "Anotando pedido no caderno, digitando tudo no ápi da marca, somando boleto na calculadora..."),
    ("E os clientes reclamando: cadê meu perfume? Já faz duas semanas!",
     "E os clientes reclamando: cadê meu perfume? Já faz duas semanas!"),
    ("Sem tempo pra postar, sem saber se teve lucro no fim do mês.",
     "Sem tempo pra postar, sem saber se teve lucro no fim do mês."),
    # ---------- DEPOIS ----------
    ("Chegou a RevendIA: a inteligência artificial que cuida da sua revenda por você.",
     "Chegou a Revendía: a inteligência artificial que cuida da sua revenda por você."),
    ("Pra começar, é só o seu WhatsApp e um código de verificação. Pagou no Pix ou no cartão, tá pronta.",
     "Pra começar, é só o seu uótsápi e um código de verificação. Pagou no Píx ou no cartão, tá pronta."),
    ("Você conecta sua conta do Boticário ou da Natura em poucos cliques e o catálogo aparece sozinho.",
     "Você conecta sua conta do Boticário ou da Natura em poucos cliques, e o catálogo aparece sozinho."),
    ("Chegou pedido no WhatsApp? A IA anota, confere o estoque e já repassa o pedido pra marca.",
     "Chegou pedido no uótsápi? A IA anota, confere o estoque, e já repassa o pedido pra marca."),
    ("Todo dia de manhã, você recebe uma lista só com os boletos pra pagar. Você paga, e a gente identifica o pagamento na hora.",
     "Todo dia de manhã, você recebe uma lista só com os boletos pra pagar. Você paga, e a gente identifica o pagamento na hora."),
    ("Seu cliente é avisado de quando o produto chega e quando vai ser entregue.",
     "Seu cliente é avisado de quando o produto chega, e quando vai ser entregue."),
    ("E quando o produto chega, a IA chama um motoboy, que retira na sua casa e entrega pro cliente.",
     "E quando o produto chega, a IA chama um motobói, que retira na sua casa e entrega pro cliente."),
    ("No Instagram, a IA cria e publica os posts sozinha, com estratégia pra você vender mais.",
     "No Ínstagrãm, a IA cria e publica os pósts sozinha, com estratégia pra você vender mais."),
    ("Campanhas e combos promocionais vão direto pra sua lista de transmissão.",
     "Campanhas e combos promocionais vão direto pra sua lista de transmissão."),
    ("O financeiro roda sozinho: relatório todo mês, lucro na palma da mão.",
     "O financeiro roda sozinho: relatório todo mês, lucro na palma da mão."),
    ("São agentes de IA trabalhando por você em cada área: marketing cria conteúdos, anúncios e roteiros de vídeo; o comercial faz a triagem de leads, follow-up e propostas; as operações cuidam do suporte e do pós-venda; e o financeiro faz cobrança, conciliação, fluxo de caixa e DRE.",
     "São agentes de IA trabalhando por você em cada área: o márketin cria conteúdos, anúncios e roteiros de vídeo, o comercial faz a triagem de lídis, fólou ápi e propostas, as operações cuidam do suporte e do pós-venda, e o financeiro faz cobrança, conciliação, fluxo de caixa e dê erre é."),
    ("Precisa de algo? É só falar. A assistente de voz da RevendIA te responde e resolve.",
     "Precisa de algo? É só falar. A assistente de voz da Revendía te responde e resolve."),
    ("Você só entrega, paga e lucra. O resto, a RevendIA faz.",
     "Você só entrega, paga e lucra. O resto, a Revendía faz."),
    ("RevendIA. Sua revenda no piloto automático. Assine agora.",
     "Revendía. Sua revenda no piloto automático. Assine agora!"),
]
LEAD, GAP, TAIL = 0.6, 0.28, 2.4       # silêncio inicial, entre trechos e final (s)
EXTRA_GAP = {3: 1.3}
SPEED_SEG = {14: 1.16}               # trecho dos agentes um pouco mais rápido
MAX_PAUSE = 0.30                      # pausas internas mais longas que isso são encurtadas (s)


def squeeze_pauses(s, sr):
    """Encurta silêncios internos longos (o Kokoro às vezes pausa demais em vírgulas)."""
    win = int(0.01 * sr)
    n = len(s) // win
    loud = np.array([np.max(np.abs(s[i * win:(i + 1) * win])) > 0.012 for i in range(n)])
    keep, run = [], 0
    for i in range(n):
        run = 0 if loud[i] else run + 1
        if run * 0.01 <= MAX_PAUSE: keep.append(i)
    out = np.concatenate([s[i * win:(i + 1) * win] for i in keep] + [s[n * win:]])
    return out

k = Kokoro(f"{MODELS}/kokoro-v1.0.onnx", f"{MODELS}/voices-v1.0.bin")
sr = 24000
out, t, timings = [np.zeros(int(LEAD * sr), np.float32)], LEAD, []
for i, (shown, spoken) in enumerate(SEGMENTS):
    s, sr = k.create(spoken, voice=VOICE, speed=SPEED_SEG.get(i, SPEED), lang="pt-br")
    idx = np.where(np.abs(s) > 0.01)[0]
    s = squeeze_pauses(s[max(idx[0] - 600, 0): idx[-1] + 1200].astype(np.float32), sr)
    timings.append({"text": shown, "start": round(t, 3), "end": round(t + len(s) / sr, 3)})
    gap = GAP + EXTRA_GAP.get(i, 0)
    out += [s, np.zeros(int(gap * sr), np.float32)]
    t += len(s) / sr + gap
out.append(np.zeros(int(TAIL * sr), np.float32))
voice = np.concatenate(out)
voice = voice / np.max(np.abs(voice)) * 0.9
sf.write("audio/voz.wav", voice, sr)
json.dump({"duration": round(len(voice) / sr, 3), "transition": 3, "segments": timings},
          open("timings.json", "w"), ensure_ascii=False, indent=1)
print(len(voice) / sr)
