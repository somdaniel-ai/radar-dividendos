"""Lista de instrumentos a analisar e conversão de símbolos XTB → Yahoo."""
from __future__ import annotations

import csv
import datetime as dt
import logging
from pathlib import Path

log = logging.getLogger(__name__)

PASTA = Path(__file__).resolve().parent.parent / "universo"
COLUNAS_UNIVERSO = ["ticker_xtb", "nome", "tipo", "ativo", "ticker_yahoo"]


def ler_csv(caminho: Path) -> list[dict]:
    if not caminho.exists():
        return []
    with open(caminho, encoding="utf-8-sig", newline="") as f:
        return [{k.strip(): (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]


def escrever_csv(caminho: Path, linhas: list[dict], colunas: list[str]) -> None:
    with open(caminho, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=colunas, extrasaction="ignore")
        w.writeheader()
        w.writerows(linhas)


def ler_sufixos(pasta: Path = PASTA) -> dict[str, str]:
    """{'.US': '', '.UK': '.L', …}"""
    return {r["sufixo_xtb"].upper(): r["sufixo_yahoo"] for r in ler_csv(pasta / "sufixos.csv")}


def ler_descobertos(pasta: Path = PASTA) -> dict[str, str]:
    return {r["ticker_xtb"]: r["ticker_yahoo"] for r in ler_csv(pasta / "descobertos.csv")}


def guardar_descoberto(ticker_xtb: str, ticker_yahoo: str, pasta: Path = PASTA) -> None:
    linhas = ler_csv(pasta / "descobertos.csv")
    linhas = [r for r in linhas if r["ticker_xtb"] != ticker_xtb]
    linhas.append({"ticker_xtb": ticker_xtb, "ticker_yahoo": ticker_yahoo, "data": dt.date.today().isoformat()})
    escrever_csv(pasta / "descobertos.csv", sorted(linhas, key=lambda r: r["ticker_xtb"]),
                 ["ticker_xtb", "ticker_yahoo", "data"])


def converter(ticker_xtb: str, sufixos: dict[str, str], descobertos: dict[str, str] | None = None) -> str | None:
    """CABO.US → CABO; ABDN.UK → ABDN.L; NOS.PT → NOS.LS. None se o sufixo for desconhecido."""
    if descobertos and ticker_xtb in descobertos:
        return descobertos[ticker_xtb]
    if "." not in ticker_xtb:
        return ticker_xtb
    base, suf = ticker_xtb.rsplit(".", 1)
    suf = "." + suf.upper()
    if suf not in sufixos:
        return None
    return base + sufixos[suf]


def ler_universo(pasta: Path = PASTA, so_ativos: bool = True) -> list[dict]:
    """Lê `universo_xtb.csv` e resolve o ticker Yahoo de cada linha.

    A coluna opcional `ticker_yahoo` permite forçar um símbolo (ex.: ações canadianas
    que na XTB estão em Nova Iorque mas cujo dividendo é declarado em CAD).
    """
    sufixos, descobertos = ler_sufixos(pasta), ler_descobertos(pasta)
    out, vistos = [], set()
    for r in ler_csv(pasta / "universo_xtb.csv"):
        t = r["ticker_xtb"].upper()
        if not t or t in vistos:
            continue
        vistos.add(t)
        if so_ativos and r.get("ativo", "sim").lower() not in ("sim", "s", "1", "true", ""):
            continue
        yahoo = r.get("ticker_yahoo") or converter(t, sufixos, descobertos)
        out.append({"ticker_xtb": t, "nome": r.get("nome", ""), "tipo": (r.get("tipo") or "ACAO").upper(),
                    "ticker_yahoo": yahoo})
    return out
