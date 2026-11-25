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


def ler_extraordinarios(pasta: Path = PASTA) -> dict[str, dict[str, float]]:
    """Extras declarados à mão (`extraordinarios.csv`): {ticker_xtb: {data: valor_extra}}.

    Serve para os casos em que a empresa paga o dividendo normal e um extra no mesmo
    dia e o Yahoo junta os dois num só valor (ex.: NOS em 2023)."""
    out: dict[str, dict[str, float]] = {}
    for r in ler_csv(pasta / "extraordinarios.csv"):
        try:
            out.setdefault(r["ticker_xtb"].upper(), {})[r["data"]] = float(r["valor_extraordinario"].replace(",", "."))
        except (KeyError, ValueError):
            log.warning("Linha inválida em extraordinarios.csv: %s", r)
    return out


def ler_rejeitados(pasta: Path = PASTA) -> dict[str, list[str]]:
    """Possíveis extraordinários que o utilizador rejeitou (`extraordinarios_rejeitados.csv`):
    {ticker_xtb: [data, …]} — deixam de ser assinalados."""
    out: dict[str, list[str]] = {}
    for r in ler_csv(pasta / "extraordinarios_rejeitados.csv"):
        if r.get("ticker_xtb") and r.get("data"):
            out.setdefault(r["ticker_xtb"].upper(), []).append(r["data"])
    return out


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
                    "ticker_yahoo": yahoo, "ticker_yahoo_forcado": bool(r.get("ticker_yahoo")),
                    # símbolo Yahoo da linha que existe na XTB (ex.: TU.US → TU); só é diferente
                    # de ticker_yahoo quando os dados vêm de outra bolsa (ex.: T.TO)
                    "ticker_yahoo_xtb": converter(t, sufixos) if r.get("ticker_yahoo") else yahoo})
    return out


# --------------------------------------------------------------------------------------
# Universo completo = lista manual (universo_xtb.csv) + lista oficial da XTB (radar/xtb.py)
# --------------------------------------------------------------------------------------

# Bolsa "de casa" para cada país do ISIN: quando a mesma empresa está em várias bolsas na XTB,
# usamos a de casa (dados mais completos no Yahoo). As canadianas estão na XTB em Nova Iorque.
CASA = {"US": ".US", "CA": ".US", "GB": ".UK", "DE": ".DE", "FR": ".FR", "ES": ".ES", "IT": ".IT",
        "NL": ".NL", "BE": ".BE", "PT": ".PT", "PL": ".PL", "CH": ".CH", "DK": ".DK", "SE": ".SE",
        "NO": ".NO", "FI": ".FI", "CZ": ".CZ", "IL": ".IL", "AT": ".DE", "IE": ".UK", "LU": ".DE"}
# ETF: preferimos a linha em euros (a conta é em euros: evita a comissão de conversão de moeda)
ORDEM_ETF = [".DE", ".NL", ".FR", ".IT", ".ES", ".UK", ".US"]


def _preferencia(d: dict) -> tuple:
    suf = "." + d["ticker_xtb"].rsplit(".", 1)[-1]
    if d["tipo"] == "ETF":
        return (0 if d.get("moeda") == "EUR" else 1,
                ORDEM_ETF.index(suf) if suf in ORDEM_ETF else 99, d["ticker_xtb"])
    casa = CASA.get(d["isin"][:2])
    return (0 if suf == casa else 1, 0 if suf == ".US" else 1, d["ticker_xtb"])


def universo_completo(pasta: Path = PASTA, lista_xtb: list[dict] | None = None) -> tuple[list[dict], dict]:
    """Junta a lista manual com a lista oficial da XTB.

    - A lista manual manda: as suas linhas (e os símbolos forçados) ficam como estão, e uma
      linha com `ativo=nao` tira esse instrumento do radar mesmo que esteja na lista da XTB.
    - Da lista da XTB entram ações e ETF de distribuição (ou sem indicação); ficam de fora
      os ETF de acumulação e os ETC/ETN (não pagam dividendos).
    - Cada empresa/fundo (ISIN) entra uma só vez, na bolsa preferida.
    - Ações canadianas em Nova Iorque: dividendos de Toronto (.TO), cotação da linha da XTB.
    """
    manuais = ler_universo(pasta)
    todos_csv = {r["ticker_xtb"].upper() for r in ler_csv(pasta / "universo_xtb.csv")}
    sufixos = ler_sufixos(pasta)
    itens = [{**m, "origem": "manual"} for m in manuais]
    resumo = {"manual": len(itens), "lista_xtb": len(lista_xtb or []),
              "excluidos": {"etf_acumulacao": 0, "etc_etn": 0, "outra_bolsa": 0, "na_lista_manual": 0,
                            "bolsa_desconhecida": 0}}
    candidatos = []
    for d in lista_xtb or []:
        if d["tipo"] in ("ETC", "ETN"):
            resumo["excluidos"]["etc_etn"] += 1
        elif d["tipo"] == "ETF" and d.get("distribuicao") == "Acc":
            resumo["excluidos"]["etf_acumulacao"] += 1
        else:
            candidatos.append(d)
    por_isin: dict[str, list[dict]] = {}
    for d in candidatos:
        por_isin.setdefault(d["isin"], []).append(d)
    for isin, grupo in por_isin.items():
        if any(d["ticker_xtb"] in todos_csv for d in grupo):
            resumo["excluidos"]["na_lista_manual"] += len(grupo)  # já está (ou foi desligada) na lista manual
            continue
        grupo.sort(key=_preferencia)
        d = grupo[0]
        resumo["excluidos"]["outra_bolsa"] += len(grupo) - 1
        yahoo = converter(d["ticker_xtb"], sufixos)
        if yahoo is None:
            resumo["excluidos"]["bolsa_desconhecida"] += 1
            continue
        item = {"ticker_xtb": d["ticker_xtb"], "nome": d["nome"], "tipo": "ETF" if d["tipo"] == "ETF" else "ACAO",
                "ticker_yahoo": yahoo, "ticker_yahoo_xtb": yahoo, "origem": "xtb", "isin": isin,
                "moeda_xtb": d.get("moeda")}
        if isin.startswith("CA") and d["ticker_xtb"].endswith(".US"):
            item["ticker_yahoo"] = d["ticker_xtb"].rsplit(".", 1)[0] + ".TO"
            item["alternativa_yahoo"] = yahoo  # se não existir em Toronto, usa-se a de Nova Iorque
        itens.append(item)
    _juntar_versoes(itens, lista_xtb or [])
    resumo["total"] = len(itens)
    return itens, resumo


def _juntar_versoes(itens: list[dict], lista_xtb: list[dict]) -> None:
    """Todas as linhas da XTB com o mesmo ISIN (a mesma empresa noutra bolsa/moeda), para a
    página da ação mostrar onde se pode comprar e assinalar a versão em euros (sem comissão de
    conversão de moeda). Só se guarda quando há mais de uma versão."""
    por_isin: dict[str, list[dict]] = {}
    isin_do_ticker = {}
    for d in lista_xtb:
        grupo = por_isin.setdefault(d["isin"], [])
        if all(x["ticker_xtb"] != d["ticker_xtb"] for x in grupo):  # a lista da XTB tem linhas repetidas
            grupo.append(d)
        isin_do_ticker[d["ticker_xtb"].upper()] = d["isin"]
    for i in itens:
        isin = i.get("isin") or isin_do_ticker.get(i["ticker_xtb"].upper())
        grupo = por_isin.get(isin or "", [])
        if len(grupo) < 2:
            continue
        i["isin"] = isin
        i["versoes_xtb"] = sorted(
            ({"ticker": d["ticker_xtb"], "moeda": d.get("moeda") or "", "nome": d.get("nome") or ""} for d in grupo),
            key=lambda v: (v["moeda"] != "EUR", v["ticker"] != i["ticker_xtb"], v["ticker"]))
