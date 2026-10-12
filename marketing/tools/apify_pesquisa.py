"""Pesquisa de público com o Apify (plano gratuito): posts públicos de hashtags do nicho em São Paulo.

Roda o ator apify/instagram-hashtag-scraper, filtra posts de São Paulo feitos por motoboys de
aplicativo (iFood, 99, Uber Eats, Rappi, Loggi...) e motoristas de app (Uber, 99, inDrive...) e grava:

  data/pesquisa_publico.json  -> resumo para o agente: horários em que o nicho mais engaja,
                                 hashtags e termos em alta, e perfis com mais engajamento
                                 (candidatos a parceria/colab, abordados manualmente por você).

Não envia mensagens, não comenta e não segue ninguém: isso violaria os Termos do Instagram e
derrubaria a conta. A divulgação para esse público é feita por hashtags/local nos posts, collabs
e anúncios pagos segmentados (veja README.md).

Variáveis de ambiente: APIFY_TOKEN
Uso: python apify_pesquisa.py [posts_por_hashtag]
"""
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime

from comum import DADOS, SP, agora_sp, env, gravar_json, http, ler_estrategia

ATOR = "apify~instagram-hashtag-scraper"
DIAS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]

TERMOS_SP = [
    "são paulo", "sao paulo", "sampa", "#sp", " sp ", "zona leste", "zona sul", "zona norte", "zona oeste",
    "capão redondo", "itaquera", "guarulhos", "osasco", "santo andré", "são bernardo", "abc paulista",
    "marginal", "paulista", "centro sp",
]
TERMOS_ENTREGADOR = [
    "ifood", "i food", "99food", "99 food", "ubereats", "uber eats", "rappi", "loggi", "lalamove",
    "entregador", "entregas", "motoboy", "motofrete", "bag", "delivery", "app de entrega",
]
TERMOS_MOTORISTA = [
    "uber", "99pop", "99 pop", "99taxi", "99 táxi", "99 taxi", "indrive", "motorista de app",
    "motorista de aplicativo", "corrida", "corridas", "passageiro",
]


def _texto(post: dict) -> str:
    partes = [post.get("caption") or "", post.get("locationName") or "", " ".join(post.get("hashtags") or [])]
    return " " + " ".join(partes).lower() + " "


def _segmento(texto: str) -> str | None:
    if any(t in texto for t in TERMOS_ENTREGADOR):
        return "entregador"
    if any(t in texto for t in TERMOS_MOTORISTA):
        return "motorista"
    return None


def coletar(hashtags: list[str], limite: int) -> list[dict]:
    return http("POST", f"https://api.apify.com/v2/acts/{ATOR}/run-sync-get-dataset-items",
                {"token": env("APIFY_TOKEN")},
                {"hashtags": hashtags, "resultsType": "posts", "resultsLimit": limite}, timeout=600)


def analisar(posts: list[dict]) -> dict:
    por_hora = defaultdict(list)
    por_dia = defaultdict(list)
    hashtags = Counter()
    perfis = defaultdict(lambda: {"posts": 0, "engajamento": 0, "segmento": None})
    segmentos = Counter()
    relevantes = 0

    for post in posts:
        texto = _texto(post)
        segmento = _segmento(texto)
        if not segmento or not any(t in texto for t in TERMOS_SP):
            continue
        relevantes += 1
        segmentos[segmento] += 1
        engajamento = (post.get("likesCount") or 0) + 3 * (post.get("commentsCount") or 0)
        if post.get("timestamp"):
            momento = datetime.fromisoformat(post["timestamp"].replace("Z", "+00:00")).astimezone(SP)
            por_hora[momento.hour].append(engajamento)
            por_dia[DIAS[momento.weekday()]].append(engajamento)
        hashtags.update(h.lower() for h in post.get("hashtags") or [])
        dono = post.get("ownerUsername")
        if dono:
            perfis[dono]["posts"] += 1
            perfis[dono]["engajamento"] += engajamento
            perfis[dono]["segmento"] = segmento

    def media(valores):
        return round(sum(valores) / len(valores), 1) if valores else 0

    return {
        "atualizado_em": agora_sp().isoformat(timespec="minutes"),
        "posts_analisados": len(posts),
        "posts_relevantes_sp": relevantes,
        "segmentos": dict(segmentos),
        "engajamento_medio_por_hora_sp": {h: {"posts": len(v), "media": media(v)} for h, v in sorted(por_hora.items())},
        "engajamento_medio_por_dia": {d: {"posts": len(v), "media": media(v)} for d, v in por_dia.items()},
        "hashtags_em_alta": [h for h, _ in hashtags.most_common(30)],
        "perfis_para_parceria": sorted(
            ({"usuario": u, **d} for u, d in perfis.items()), key=lambda p: -p["engajamento"]
        )[:25],
    }


if __name__ == "__main__":
    estrategia = ler_estrategia()
    limite = int(sys.argv[1]) if len(sys.argv) > 1 else estrategia["apify"]["posts_por_hashtag"]
    hashtags = [re.sub(r"^#", "", h) for h in estrategia["apify"]["hashtags_pesquisa"]]
    resumo = analisar(coletar(hashtags, limite))
    gravar_json(DADOS / "pesquisa_publico.json", resumo)
    print(f"{resumo['posts_relevantes_sp']} posts relevantes de {resumo['posts_analisados']} -> data/pesquisa_publico.json")
