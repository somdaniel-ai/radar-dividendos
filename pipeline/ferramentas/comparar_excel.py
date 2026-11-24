"""Compara os resultados do pipeline (data/radar.json) com o Excel antigo.

Uso (dentro da pasta `pipeline`, depois de correr `python -m radar.gerar`):
    python ferramentas/comparar_excel.py                      # 10 ações por defeito
    python ferramentas/comparar_excel.py KO.US NOS.PT ...

Grava a tabela em `privado/comparacao_excel.md` (não vai para o GitHub).
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "ferramentas"))
sys.path.insert(0, str(RAIZ / "pipeline"))

from importar_excel import EXCEL, ler_lista_acoes, para_universo  # noqa: E402

PADRAO = ["CABO.US", "NLY.US", "AGNC.US", "OXSQ.US", "KO.US", "JNJ.US", "O.US", "ALV.DE",
          "NOS.PT", "ABDN.UK", "TU.US"]


def _num(x, casas=2, pct=False):
    if x is None or x == "" or isinstance(x, str):
        return "—" if x in (None, "") else str(x)
    v = x * 100 if pct else x
    return f"{v:,.{casas}f}".replace(",", " ").replace(".", ",") + ("%" if pct else "")


def _data(x):
    if isinstance(x, dt.datetime):
        return x.date().isoformat()
    if isinstance(x, (int, float)):
        return (dt.date(1899, 12, 30) + dt.timedelta(days=int(x))).isoformat()
    return str(x or "—")


def main(tickers):
    excel = {}
    for d in ler_lista_acoes(EXCEL):
        excel[para_universo(d)["ticker_xtb"]] = d
    radar = {a["ticker"]: a for a in json.loads((RAIZ / "data" / "radar.json").read_text(encoding="utf-8"))["acoes"]}

    linhas = ["| Ação | Fonte | Últ. dividendo | Data | Freq. | Preço (moeda) | Preço € | Yield bruto | "
              "Preço justo € | Posição 52s | Dias p/ pag. | Nível | Pontos |",
              "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for t in tickers:
        e, r = excel.get(t), radar.get(t)
        if e:
            dy = e.get("% Ano DY")
            dias = e.get("Dias para Pagamento")
            linhas.append(
                f"| **{t}** | Excel | {_num(e.get('Valor Ultimo Div.'), 4)} | {_data(e.get('Data Ultimo Div.'))} | "
                f"{e.get('Ferquencia')} | {_num(e.get('Preço atual na Moeda'))} {e.get('Moeda') or ''} | "
                f"{_num(e.get('Preço atual da Ação em EUR'))} | {_num(dy / 100 if isinstance(dy, (int, float)) else dy, pct=True)} | "
                f"{_num(e.get('Preço Justo por Ação'))} | {_num(e.get('53 Semanas %'), pct=True)} | "
                f"{-dias if isinstance(dias, (int, float)) else '—'} | — | — |")
        if r:
            linhas.append(
                f"| {t} | Novo | {_num(r['dividendo']['ultimo'], 4)} | {r['dividendo']['ultimo_data']} | "
                f"{r['frequencia']} | {_num(r['preco'])} {r['moeda']} | {_num(r['preco_eur'])} | "
                f"{_num(r['yield']['bruto'], pct=True)} | {_num(r['preco_justo_eur'])} | "
                f"{_num(r['posicao']['52s'], pct=True)} | {r['pagamento']['dias_para_pagamento']} | "
                f"{r['nivel']['nivel']} {r['nivel']['nome']} | {r['pontuacao']['total']} |")
        elif not e:
            linhas.append(f"| {t} | — | não encontrado | | | | | | | | | | |")
    texto = "\n".join(linhas)
    (RAIZ / "privado" / "comparacao_excel.md").write_text(texto + "\n", encoding="utf-8")
    print(texto)


if __name__ == "__main__":
    main(sys.argv[1:] or PADRAO)
