"""Testes dos ajustes pedidos antes da Fase 2: categorias (CEF/REIT/BDC), payout,
extraordinários por contagem e manuais, cotação XTB das canadianas."""
import datetime as dt

import pandas as pd
import pytest

from radar.analisar import analisar
from radar.calculos import categoria, frequencia, pontuacao
from radar.parametros import parametros

P = parametros()


@pytest.mark.parametrize("tipo,qt,ind,desc,nome,esperado", [
    ("ACAO", "EQUITY", "Asset Management", "The Gabelli Multimedia Trust is a closed-ended equity mutual fund",
     "Gabelli", "CEF"),
    ("ACAO", "EQUITY", "Asset Management", "Oxford Lane Capital Corp. is a close ended fund", "OXLC", "CEF"),
    ("ACAO", "EQUITY", "Asset Management", "Ares Capital is a business development company, a closed-end fund",
     "Ares", "BDC"),
    ("ACAO", "EQUITY", "REIT - Retail", "Realty Income ...", "Realty Income", "REIT"),
    ("ACAO", "EQUITY", "Beverages", "The Coca-Cola Company manufactures...", "Coca-Cola", "EMPRESA"),
    ("ACAO", "EQUITY", None, None, "abrdn Global Dynamic Dividend Fund", "CEF"),
    ("FUNDO", "EQUITY", "Asset Management", "", "Carlyle Credit Income Fund", "CEF"),
    ("ACAO", "ETF", None, "", "Vanguard High Dividend", "ETF"),
    # IEP estava nos "Fundos" do Excel, mas é uma holding de energia/indústria
    ("FUNDO", "EQUITY", "Oil & Gas Refining & Marketing", "Icahn Enterprises L.P., through its subsidiaries...",
     "Icahn Enterprises", "EMPRESA"),
    ("REIT", "EQUITY", "Diversified", "", "Manual", "REIT"),  # escolha manual no universo
])
def test_categoria(tipo, qt, ind, desc, nome, esperado):
    assert categoria.detetar_categoria(tipo, qt, ind, desc, nome) == esperado


def test_payout_ignorado_em_reit_bdc_fundos_mas_nao_em_empresas():
    pt = P["pontuacao"]
    for cat in ("REIT", "BDC", "CEF", "ETF"):
        assert pontuacao.armadilhas(0.08, 1.8, 0.0, False, pt, cat) == []
    assert [a["codigo"] for a in pontuacao.armadilhas(0.08, 1.8, 0.0, False, pt, "EMPRESA")] == ["payout"]
    # opção nas Definições: lista vazia = o payout conta para todos
    pt2 = {**pt, "armadilha_payout_ignorar_categorias": []}
    assert [a["codigo"] for a in pontuacao.armadilhas(0.08, 1.8, 0.0, False, pt2, "REIT")] == ["payout"]


def _trimestral(anos, valor=1.0, dia=15):
    return [(f"{a}-{m:02d}-{dia}", valor) for a in anos for m in (3, 6, 9, 12)]


def test_pagamento_a_mais_no_ano_e_extraordinario():
    # trimestral + um especial de 0,5 em 25/06/2022 (10 dias depois do normal)
    dados = _trimestral(range(2018, 2026)) + [("2022-06-25", 0.5)]
    s = pd.Series([v for _, v in dados], index=pd.to_datetime([d for d, _ in dados])).sort_index()
    m = frequencia.marcar_excesso_no_ano(s, 4, 91, 0.6)
    assert list(s[m].index.strftime("%Y-%m-%d")) == ["2022-06-25"]


def test_especial_antes_do_normal_tambem_e_detetado():
    dados = _trimestral(range(2018, 2026)) + [("2022-06-05", 0.4)]
    s = pd.Series([v for _, v in dados], index=pd.to_datetime([d for d, _ in dados])).sort_index()
    m = frequencia.marcar_excesso_no_ano(s, 4, 91, 0.6)
    assert list(s[m].index.strftime("%Y-%m-%d")) == ["2022-06-05"]


def test_pagamento_que_escorrega_nao_e_extraordinario():
    dados = [d for d in _trimestral(range(2018, 2026), dia=28) if d[0] != "2020-12-28"] + [("2021-01-02", 1.0)]
    s = pd.Series([v for _, v in dados], index=pd.to_datetime([d for d, _ in dados])).sort_index()
    assert not frequencia.marcar_excesso_no_ano(s, 4, 91, 0.6).any()


def _precos(ate="2026-11-24"):
    idx = pd.bdate_range("2015-01-02", ate)
    return pd.DataFrame({"high": 5.7, "low": 5.5, "close": 5.6, "adjclose": 5.6}, index=idx)


def test_nos_com_extras_manuais_sem_corte():
    hoje = dt.date(2026, 11, 24)
    pag = {"2017-05-24": 0.2, "2018-05-23": 0.3, "2019-05-22": 0.35, "2020-07-01": 0.278,
           "2021-05-04": 0.278, "2022-05-05": 0.278, "2023-04-19": 0.43, "2024-04-22": 0.35,
           "2025-04-22": 0.4, "2026-05-06": 0.45}
    div = pd.Series(list(pag.values()), index=pd.to_datetime(list(pag)))
    extras = {"2023-04-19": 0.152, "2025-04-22": 0.05, "2026-05-06": 0.10}
    perfil = {"nome": "NOS", "moeda": "EUR", "pais": "Portugal", "preco": 5.6}
    base = {"ticker_xtb": "NOS.PT", "ticker_yahoo": "NOS.LS", "tipo": "ACAO"}
    sem = analisar(base, _precos(), div, perfil, 1.0, hoje, P)["resumo"]
    com = analisar(base, _precos(), div, perfil, 1.0, hoje, P, extras)
    r = com["resumo"]
    assert sem["consistencia"]["cortes_ultimos_5"] == 1  # sem a correção: "corte" em 2024
    assert r["consistencia"]["cortes_ultimos_5"] == 0
    assert r["dividendo"]["ultimo"] == pytest.approx(0.35)  # só a parte normal
    assert r["dividendo"]["ttm_total"] == pytest.approx(0.45)  # o total recebido inclui o extra
    assert r["yield"]["bruto"] == pytest.approx(0.35 / 5.6)
    assert r["dividendo"]["num_extraordinarios"] == 3
    h = {x["data"]: x for x in com["detalhe"]["historico_dividendos"]}
    assert h["2023-04-19"]["valor"] == pytest.approx(0.43)
    assert h["2023-04-19"]["parte_extraordinaria"] == pytest.approx(0.152)


def test_cef_tem_aviso_e_categoria():
    hoje = dt.date(2026, 11, 24)
    div = pd.Series(0.1, index=pd.date_range("2018-01-15", "2026-11-15", freq="MS") + pd.Timedelta(days=14))
    perfil = {"nome": "Exemplo Fund", "moeda": "USD", "pais": "United States", "preco": 10.0,
              "descricao": "Exemplo is a closed-end fund", "payout": 2.0}
    base = {"ticker_xtb": "EXF.US", "ticker_yahoo": "EXF", "tipo": "ACAO"}
    r = analisar(base, _precos(), div, perfil, 0.9, hoje, P)["resumo"]
    assert r["categoria"] == "CEF"
    assert any(a["codigo"] == "devolucao_capital" for a in r["avisos"])
    assert not any(a["codigo"] == "payout" for a in r["armadilhas"])


def test_canadiana_avaliada_pela_cotacao_da_xtb():
    hoje = dt.date(2026, 11, 24)
    div = pd.Series(0.188, index=pd.date_range("2015-03-10", "2026-09-10", freq="QS-MAR") + pd.Timedelta(days=9))
    perfil = {"nome": "Telus", "moeda": "CAD", "pais": "Canada", "preco": 15.09}
    base = {"ticker_xtb": "TU.US", "ticker_yahoo": "T.TO", "tipo": "ACAO"}
    cot = {"simbolo": "TU", "preco": 10.50, "moeda": "USD", "variacao_dia": 0.01, "cambio_eur": 0.91}
    r = analisar(base, _precos(), div, perfil, 0.637, hoje, P, None, cot)["resumo"]
    # rendimento com os dados de Toronto (CAD/CAD)
    assert r["moeda"] == "CAD"
    assert r["yield"]["bruto"] == pytest.approx(0.188 * 4 / 15.09, rel=1e-4)  # JSON guarda 6 casas
    # valor da posição na carteira com a cotação da XTB (TU.US em USD)
    assert r["cotacao_xtb"]["simbolo"] == "TU" and r["cotacao_xtb"]["moeda"] == "USD"
    assert r["cotacao_xtb"]["preco_eur"] == pytest.approx(10.50 * 0.91)
    # sem cotação própria, a cotação XTB é a principal
    r2 = analisar({**base, "ticker_yahoo": "TU"}, _precos(), div, {**perfil, "moeda": "USD", "preco": 10.5},
                  0.91, hoje, P)["resumo"]
    assert r2["cotacao_xtb"]["simbolo"] == "TU" and r2["cotacao_xtb"]["preco_eur"] == pytest.approx(10.5 * 0.91)
