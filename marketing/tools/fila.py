"""Fila de publicação (data/fila.json).

O agente gera os conteúdos e coloca na fila com horário; o GitHub Actions
(.github/workflows/publicar-instagram.yml) roda `fila.py publicar` a cada 15 minutos e publica
o que estiver vencido.

  modo_publicacao = "aprovacao"  -> só publica itens com status "aprovado" (você aprova antes)
  modo_publicacao = "automatico" -> publica tudo que o agente agendou

Uso:
  python fila.py adicionar REELS <url_midia> "2026-10-13T15:30" "legenda" [--nota "ideia/prompt"]
  python fila.py listar [status]
  python fila.py aprovar <id|todos>
  python fila.py cancelar <id>
  python fila.py publicar            # publica os itens vencidos
"""
import argparse
import json
import uuid
from datetime import datetime, timedelta

from comum import DADOS, SP, agora_sp, gravar_json, ler_estrategia, ler_json

ARQUIVO = DADOS / "fila.json"
TOLERANCIA_ATRASO = timedelta(hours=2)


def _carregar() -> list[dict]:
    return ler_json(ARQUIVO, [])


def _horario(texto: str) -> datetime:
    momento = datetime.fromisoformat(texto)
    return momento if momento.tzinfo else momento.replace(tzinfo=SP)


def adicionar(tipo: str, url: str, quando: str, legenda: str = "", nota: str = "") -> dict:
    estrategia = ler_estrategia()
    fila = _carregar()
    momento = _horario(quando)
    intervalo = timedelta(minutes=estrategia["intervalo_minimo_entre_posts_min"])
    for item in fila:
        mesmo_formato = (item["tipo"] == "STORIES") == (tipo.upper() == "STORIES")
        if item["status"] in ("aguardando_aprovacao", "aprovado") and mesmo_formato \
                and abs(_horario(item["agendado_para"]) - momento) < intervalo:
            raise SystemExit(f"Conflito: {item['id']} já agendado às {item['agendado_para']} (intervalo mínimo {intervalo}).")
    item = {
        "id": uuid.uuid4().hex[:8],
        "tipo": tipo.upper(),
        "url_midia": url,
        "legenda": legenda,
        "agendado_para": momento.isoformat(timespec="minutes"),
        "status": "aprovado" if estrategia["modo_publicacao"] == "automatico" else "aguardando_aprovacao",
        "nota": nota,
        "criado_em": agora_sp().isoformat(timespec="minutes"),
    }
    fila.append(item)
    fila.sort(key=lambda i: i["agendado_para"])
    gravar_json(ARQUIVO, fila)
    return item


def mudar_status(alvo: str, de: tuple, para: str) -> int:
    fila = _carregar()
    n = 0
    for item in fila:
        if (alvo == "todos" or item["id"] == alvo) and item["status"] in de:
            item["status"] = para
            n += 1
    gravar_json(ARQUIVO, fila)
    return n


def publicar_vencidos() -> list[dict]:
    from instagram import publicar  # importa só aqui: listar/adicionar não precisam do token

    fila = _carregar()
    agora = agora_sp()
    feitos = []
    for item in fila:
        if item["status"] != "aprovado" or _horario(item["agendado_para"]) > agora:
            continue
        if agora - _horario(item["agendado_para"]) > TOLERANCIA_ATRASO:
            item["status"] = "atrasado"  # o agente reagenda no próximo ciclo
            continue
        try:
            item["media_id"] = publicar(item["tipo"], item["url_midia"], item["legenda"])
            item["status"] = "publicado"
            item["publicado_em"] = agora_sp().isoformat(timespec="minutes")
        except Exception as erro:  # registra e segue para o próximo item
            item["status"] = "erro"
            item["erro"] = str(erro)[:500]
        feitos.append(item)
        gravar_json(ARQUIVO, fila)  # grava a cada item para não perder estado
    gravar_json(ARQUIVO, fila)
    return feitos


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("adicionar")
    a.add_argument("tipo", choices=["REELS", "STORIES", "IMAGE", "reels", "stories", "image"])
    a.add_argument("url")
    a.add_argument("quando")
    a.add_argument("legenda", nargs="?", default="")
    a.add_argument("--nota", default="")
    lst = sub.add_parser("listar")
    lst.add_argument("status", nargs="?")
    ap = sub.add_parser("aprovar")
    ap.add_argument("alvo")
    c = sub.add_parser("cancelar")
    c.add_argument("alvo")
    sub.add_parser("publicar")
    args = p.parse_args()

    if args.cmd == "adicionar":
        print(json.dumps(adicionar(args.tipo, args.url, args.quando, args.legenda, args.nota), ensure_ascii=False, indent=2))
    elif args.cmd == "listar":
        itens = [i for i in _carregar() if not args.status or i["status"] == args.status]
        print(json.dumps(itens, ensure_ascii=False, indent=2))
    elif args.cmd == "aprovar":
        print(f"{mudar_status(args.alvo, ('aguardando_aprovacao',), 'aprovado')} item(ns) aprovado(s)")
    elif args.cmd == "cancelar":
        print(f"{mudar_status(args.alvo, ('aguardando_aprovacao', 'aprovado', 'atrasado'), 'cancelado')} item(ns) cancelado(s)")
    elif args.cmd == "publicar":
        for item in publicar_vencidos():
            print(f"{item['id']} {item['tipo']} -> {item['status']} {item.get('media_id', item.get('erro', ''))}")
