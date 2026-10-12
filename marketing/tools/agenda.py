"""Ranking dos melhores horários de postagem para os próximos dias.

Junta três fontes, da mais confiável para a menos:
  1. desempenho real dos nossos posts (data/desempenho.json, gerado por `instagram.py desempenho`)
  2. engajamento do nicho em SP por hora (data/pesquisa_publico.json, gerado pelo Apify)
  3. hipótese inicial de config/estrategia.json (rotina de entregador/motorista de app)

e reserva uma fração (estrategia["exploracao"]) para testar horários novos.
O agente usa este ranking para decidir quantos posts fazer e quando.

Uso: python agenda.py [dias=1]  -> imprime JSON com os horários sugeridos por tipo
"""
import json
import random
import sys
from collections import defaultdict
from datetime import datetime, timedelta

from comum import DADOS, SP, agora_sp, ler_estrategia, ler_json

DIAS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]
HORAS_ATIVAS = range(7, 24)


def _pontos_proprios(desempenho: list[dict], tipo: str) -> dict[int, float]:
    """Alcance médio por hora dos nossos posts, normalizado para 0..1."""
    por_hora = defaultdict(list)
    for item in desempenho:
        e_story = item.get("tipo") == "STORY"
        if (tipo == "stories") != e_story:
            continue
        m = item.get("metricas") or {}
        valor = (m.get("reach") or 0) + 2 * (m.get("shares") or 0) + 2 * (m.get("saved") or 0) + (m.get("comments") or 0)
        hora = datetime.strptime(item["timestamp"], "%Y-%m-%dT%H:%M:%S%z").astimezone(SP).hour
        por_hora[hora].append(valor)
    medias = {h: sum(v) / len(v) for h, v in por_hora.items() if v}
    topo = max(medias.values(), default=0) or 1
    return {h: v / topo for h, v in medias.items()}


def _pontos_nicho(pesquisa: dict) -> dict[int, float]:
    dados = pesquisa.get("engajamento_medio_por_hora_sp", {})
    medias = {int(h): d["media"] for h, d in dados.items() if d.get("posts", 0) >= 3}
    topo = max(medias.values(), default=0) or 1
    return {h: v / topo for h, v in medias.items()}


def _pontos_hipotese(horarios: list[str]) -> dict[int, float]:
    pontos = {}
    for hhmm in horarios:
        h = int(hhmm.split(":")[0])
        for vizinho, peso in ((h - 1, 0.4), (h, 1.0), (h + 1, 0.4)):
            pontos[vizinho] = max(pontos.get(vizinho, 0), peso)
    return pontos


def ranking(tipo: str, estrategia: dict, desempenho: list, pesquisa: dict) -> list[tuple[int, float]]:
    proprio = _pontos_proprios(desempenho, tipo)
    nicho = _pontos_nicho(pesquisa)
    hipotese = _pontos_hipotese(estrategia["horarios_hipotese_inicial"][tipo if tipo != "feed_imagem" else "reels"])
    # Quanto mais posts próprios medidos, mais peso para eles.
    n_proprios = sum(1 for d in desempenho if (d.get("tipo") == "STORY") == (tipo == "stories"))
    w_proprio = min(0.7, n_proprios / 40)
    w_nicho = 0.3 if nicho else 0.0
    w_hip = max(0.0, 1 - w_proprio - w_nicho)
    notas = {h: w_proprio * proprio.get(h, 0) + w_nicho * nicho.get(h, 0) + w_hip * hipotese.get(h, 0) for h in HORAS_ATIVAS}
    return sorted(notas.items(), key=lambda kv: -kv[1])


def sugerir(dias: int = 1) -> dict:
    estrategia = ler_estrategia()
    desempenho = ler_json(DADOS / "desempenho.json", [])
    pesquisa = ler_json(DADOS / "pesquisa_publico.json", {})
    hoje = agora_sp()
    saida = {"gerado_em": hoje.isoformat(timespec="minutes"), "dias": []}
    for i in range(dias):
        dia = (hoje + timedelta(days=i)).date()
        peso_dia = estrategia["horarios_hipotese_inicial"]["peso_dia_semana"][DIAS[dia.weekday()]]
        info = {"data": dia.isoformat(), "dia_semana": DIAS[dia.weekday()], "peso_dia": peso_dia, "tipos": {}}
        for tipo, lim in estrategia["limites_por_dia"].items():
            rank = ranking(tipo, estrategia, desempenho, pesquisa)
            # Exploração: com probabilidade `exploracao`, troca o último horário por um aleatório fora do topo.
            topo = [h for h, _ in rank[: lim["max"]]]
            if topo and random.random() < estrategia["exploracao"]:
                fora = [h for h, _ in rank[lim["max"]:]]
                if fora:
                    topo[-1] = random.choice(fora)
            info["tipos"][tipo] = {
                "limite": lim,
                "horas_sugeridas_em_ordem": topo,
                "notas": {h: round(n, 2) for h, n in rank[:8]},
            }
        saida["dias"].append(info)
    saida["fontes"] = {
        "posts_proprios_medidos": len(desempenho),
        "pesquisa_nicho_em": pesquisa.get("atualizado_em"),
    }
    return saida


if __name__ == "__main__":
    print(json.dumps(sugerir(int(sys.argv[1]) if len(sys.argv) > 1 else 1), ensure_ascii=False, indent=2))
