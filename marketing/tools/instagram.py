"""Cliente mínimo da Instagram Graph API (conta Profissional: Criador de conteúdo ou Empresa).

Variáveis de ambiente:
  IG_ACCESS_TOKEN   token de longa duração com instagram_business_basic,
                    instagram_business_content_publish e instagram_business_manage_insights
  IG_USER_ID        ID da conta profissional do Instagram
  IG_GRAPH_HOST     opcional; padrão graph.instagram.com (login com Instagram).
                    Use graph.facebook.com se o token veio do login com Facebook.
  IG_GRAPH_VERSION  opcional; padrão v24.0

Uso pela linha de comando:
  python instagram.py conta
  python instagram.py publicar REELS https://.../video.mp4 "legenda"
  python instagram.py publicar STORIES https://.../video.mp4
  python instagram.py publicar IMAGE https://.../foto.jpg "legenda"
  python instagram.py desempenho [dias]
"""
import json
import os
import sys
import time
from datetime import datetime

from comum import env, http


def _base() -> str:
    host = os.environ.get("IG_GRAPH_HOST", "graph.instagram.com")
    versao = os.environ.get("IG_GRAPH_VERSION", "v24.0")
    return f"https://{host}/{versao}"


def _token() -> dict:
    return {"access_token": env("IG_ACCESS_TOKEN")}


def conta() -> dict:
    return http("GET", f"{_base()}/{env('IG_USER_ID')}", {
        **_token(), "fields": "username,followers_count,media_count",
    })


def publicar(tipo: str, url_midia: str, legenda: str = "") -> str:
    """Publica REELS, STORIES (vídeo ou imagem) ou IMAGE (feed). Retorna o ID da mídia publicada.

    A mídia precisa estar numa URL pública (ex.: o link de resultado do Higgsfield).
    """
    tipo = tipo.upper()
    e_video = url_midia.split("?")[0].lower().endswith((".mp4", ".mov"))
    params = {**_token()}
    if tipo == "REELS":
        params.update(media_type="REELS", video_url=url_midia, share_to_feed="true")
    elif tipo == "STORIES":
        params.update(media_type="STORIES", **({"video_url": url_midia} if e_video else {"image_url": url_midia}))
    elif tipo == "IMAGE":
        params.update(image_url=url_midia)
    else:
        raise ValueError(f"tipo desconhecido: {tipo}")
    if legenda and tipo != "STORIES":
        params["caption"] = legenda

    usuario = env("IG_USER_ID")
    container = http("POST", f"{_base()}/{usuario}/media", params)["id"]

    # Vídeos são processados de forma assíncrona: espera o container ficar FINISHED.
    for _ in range(60):
        status = http("GET", f"{_base()}/{container}", {**_token(), "fields": "status_code,status"})
        codigo = status.get("status_code")
        if codigo == "FINISHED" or (codigo is None and not e_video):
            break
        if codigo in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"Instagram recusou a mídia: {status}")
        time.sleep(10)
    else:
        raise RuntimeError("Tempo esgotado esperando o Instagram processar o vídeo.")

    return http("POST", f"{_base()}/{usuario}/media_publish", {**_token(), "creation_id": container})["id"]


def _insights_midia(media_id: str, tipo: str) -> dict:
    metricas = "reach,views,likes,comments,shares,saved" if tipo != "STORY" else "reach,views,replies,navigation"
    try:
        dados = http("GET", f"{_base()}/{media_id}/insights", {**_token(), "metric": metricas})["data"]
    except RuntimeError:
        return {}
    return {d["name"]: (d.get("values") or [{}])[0].get("value", d.get("total_value", {}).get("value")) for d in dados}


def desempenho(dias: int = 30) -> list[dict]:
    """Lista as mídias recentes com horário de publicação e métricas, para o agente aprender os melhores horários."""
    usuario = env("IG_USER_ID")
    limite = time.time() - dias * 86400
    resultado = []
    for campo, tipo_padrao in (("media", None), ("stories", "STORY")):
        try:
            itens = http("GET", f"{_base()}/{usuario}/{campo}", {
                **_token(), "fields": "id,timestamp,media_type,media_product_type,permalink", "limit": 100,
            }).get("data", [])
        except RuntimeError:
            continue
        for item in itens:
            ts = datetime.strptime(item["timestamp"], "%Y-%m-%dT%H:%M:%S%z").timestamp()
            if ts < limite:
                continue
            tipo = tipo_padrao or item.get("media_product_type", item.get("media_type"))
            resultado.append({**item, "tipo": tipo, "metricas": _insights_midia(item["id"], tipo)})
    return resultado


if __name__ == "__main__":
    comando = sys.argv[1] if len(sys.argv) > 1 else "conta"
    if comando == "conta":
        print(json.dumps(conta(), ensure_ascii=False, indent=2))
    elif comando == "publicar":
        print(publicar(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else ""))
    elif comando == "desempenho":
        print(json.dumps(desempenho(int(sys.argv[2]) if len(sys.argv) > 2 else 30), ensure_ascii=False, indent=2))
    else:
        raise SystemExit(__doc__)
