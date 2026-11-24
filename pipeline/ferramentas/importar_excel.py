"""Cria a lista inicial `universo/universo_xtb.csv` a partir do Excel antigo
(folha "Lista Ações") + as ações da carteira no extrato da XTB.

Uso (dentro da pasta `pipeline`):
    python ferramentas/importar_excel.py

Lê os ficheiros da pasta `privado/` (que nunca vai para o GitHub). O resultado só
contém tickers e nomes de empresas (dados públicos), não quantidades nem valores.
"""
from __future__ import annotations

import sys
from pathlib import Path

import openpyxl

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline"))

from radar import universo as uni  # noqa: E402

EXCEL = RAIZ / "privado" / "Calculo_Acoes_Dividendos.xlsm"

# sufixo Yahoo → sufixo XTB (inverso de sufixos.csv; .TO = ações canadianas, que na XTB
# estão em Nova Iorque, ex.: TU.US — mas no Yahoo usamos Toronto porque o dividendo é em CAD)
YAHOO_PARA_XTB = {"": ".US", ".L": ".UK", ".DE": ".DE", ".PA": ".FR", ".MC": ".ES", ".MI": ".IT",
                  ".AS": ".NL", ".BR": ".BE", ".LS": ".PT", ".WA": ".PL", ".SW": ".CH", ".CO": ".DK",
                  ".ST": ".SE", ".OL": ".NO", ".HE": ".FI", ".PR": ".CZ", ".TO": ".US"}
# bolsa (nome no Excel) → sufixo Yahoo, para as linhas em que o Excel não tinha sufixo
BOLSA_PARA_YAHOO = {"Euronext Brussels": ".BR", "Euronext Amsterdam": ".AS", "Euronext Lisbon": ".LS",
                    "Euronext Paris": ".PA", "Bolsas y Mercados Espanoles": ".MC",
                    "Deutsche Boerse AG": ".DE", "Oslo Bors Asa": ".OL", "Borsa Italiana": ".MI",
                    "London Stock Exchange": ".L", "SIX Swiss Exchange": ".SW",
                    "Toronto Stock Exchange": ".TO"}
# símbolos errados no Excel
CORRECOES = {"FIX0": "FIX", "LIGHTA.XC": "LIGHT.AS"}
# símbolos que mudaram no Yahoo (o ticker XTB mantém-se). Roche: ROG.SW passou a ROP.SW
RENOMEADOS_YAHOO = {"ROG.SW": "ROP.SW"}


def ler_lista_acoes(caminho: Path) -> list[dict]:
    wb = openpyxl.load_workbook(caminho, data_only=True, read_only=True)
    ws = wb["Lista Ações"]
    linhas = list(ws.iter_rows(min_row=7, values_only=True))
    cab = [str(c).strip() if c else "" for c in linhas[0]]
    out = []
    for r in linhas[1:]:
        d = dict(zip(cab, r))
        if d.get("Símbolo do ticker"):
            out.append(d)
    return out


def para_universo(d: dict) -> dict:
    base_excel = str(d["Símbolo do ticker"]).strip().upper()
    yahoo = str(d.get("Simbolo e Sufixo") or base_excel).strip().upper()
    yahoo = CORRECOES.get(yahoo, yahoo)
    moeda, bolsa = d.get("Moeda"), d.get("Bolsa") or ""
    if "." not in yahoo and moeda not in ("USD", None) and bolsa in BOLSA_PARA_YAHOO:
        yahoo += BOLSA_PARA_YAHOO[bolsa]
    base_y, suf_y = (yahoo.rsplit(".", 1)[0], "." + yahoo.rsplit(".", 1)[1]) if "." in yahoo else (yahoo, "")
    suf_x = YAHOO_PARA_XTB.get(suf_y, ".US")
    # nas canadianas a XTB usa o símbolo de Nova Iorque (ex.: Telus = TU.US, Yahoo T.TO)
    ticker_xtb = (base_excel if suf_y == ".TO" else base_y) + suf_x
    tipo = "FUNDO" if "Fundos" in str(d.get("Tipo de instrumento") or "") else "ACAO"
    return {"ticker_xtb": ticker_xtb, "nome": str(d.get("Nome oficial") or "").strip(), "tipo": tipo,
            "ativo": "sim", "ticker_yahoo_calculado": RENOMEADOS_YAHOO.get(yahoo, yahoo)}


def tickers_carteira() -> list[tuple[str, str]]:
    """(ticker, nome) das ações no extrato da XTB (Open Positions + Cash Operations)."""
    out = {}
    for f in sorted((RAIZ / "privado").glob("*.xlsx")):
        wb = openpyxl.load_workbook(f, data_only=True, read_only=True)
        for folha, col_nome, col_tick in (("Open Positions", 1, 2), ("Cash Operations", 1, 2)):
            if folha not in wb.sheetnames:
                continue
            for r in wb[folha].iter_rows(values_only=True):
                t = r[col_tick] if len(r) > col_tick else None
                if isinstance(t, str) and "." in t and t.isupper() and " " not in t:
                    out.setdefault(t, str(r[col_nome] or ""))
    return sorted(out.items())


def main():
    sufixos = uni.ler_sufixos()
    linhas, vistos = [], set()
    for d in ler_lista_acoes(EXCEL):
        u = para_universo(d)
        if u["ticker_xtb"] in vistos:
            continue
        vistos.add(u["ticker_xtb"])
        # só guardamos ticker_yahoo quando é diferente da conversão automática
        auto = uni.converter(u["ticker_xtb"], sufixos)
        u["ticker_yahoo"] = "" if auto == u["ticker_yahoo_calculado"] else u["ticker_yahoo_calculado"]
        linhas.append(u)
    n_excel = len(linhas)
    novos = []
    for t, nome in tickers_carteira():
        if t not in vistos:
            vistos.add(t)
            linhas.append({"ticker_xtb": t, "nome": nome, "tipo": "ACAO", "ativo": "sim", "ticker_yahoo": ""})
            novos.append(t)
    uni.escrever_csv(uni.PASTA / "universo_xtb.csv", sorted(linhas, key=lambda r: r["ticker_xtb"]),
                     uni.COLUNAS_UNIVERSO)
    print(f"{n_excel} ações do Excel + {len(novos)} da carteira que não estavam no Excel {novos}")
    print(f"Gravado em {uni.PASTA / 'universo_xtb.csv'} ({len(linhas)} linhas)")


if __name__ == "__main__":
    main()
