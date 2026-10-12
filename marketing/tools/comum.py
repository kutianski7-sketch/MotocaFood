"""Utilitários compartilhados pelas ferramentas de marketing (só biblioteca padrão)."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "data"
CONFIG = RAIZ / "config"

# São Paulo não tem horário de verão desde 2019: UTC-3 fixo.
SP = timezone(timedelta(hours=-3), "America/Sao_Paulo")


def agora_sp() -> datetime:
    return datetime.now(SP)


def env(nome: str) -> str:
    valor = os.environ.get(nome, "").strip()
    if not valor:
        raise SystemExit(f"Variável de ambiente {nome} não definida (veja marketing/README.md).")
    return valor


def http(metodo: str, url: str, params: dict | None = None, corpo: dict | None = None, timeout: int = 300):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    dados = None
    cabecalhos = {"User-Agent": "motocafood-marketing/1.0"}
    if corpo is not None:
        dados = json.dumps(corpo).encode()
        cabecalhos["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=dados, method=metodo, headers=cabecalhos)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            texto = resp.read().decode()
    except urllib.error.HTTPError as e:
        detalhe = e.read().decode(errors="replace")
        raise RuntimeError(f"{metodo} {url.split('?')[0]} -> HTTP {e.code}: {detalhe}") from None
    return json.loads(texto) if texto else {}


def ler_json(caminho: Path, padrao):
    if caminho.exists():
        return json.loads(caminho.read_text(encoding="utf-8"))
    return padrao


def gravar_json(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def ler_estrategia() -> dict:
    return json.loads((CONFIG / "estrategia.json").read_text(encoding="utf-8"))
