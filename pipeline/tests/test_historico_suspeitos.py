"""Preço justo histórico (yield médio da própria ação) e possíveis extraordinários."""
import datetime as dt

import pandas as pd
import pytest

from radar.analisar import analisar
from radar.calculos import frequencia, precos
from radar.parametros import parametros

P = parametros()
HOJE = dt.date(2026, 11, 24)


def _precos(valor_por_data):
    idx = pd.bdate_range("2014-01-02", "2026-11-24")
    close = pd.Series([valor_por_data(d) for d in idx], index=idx, dtype=float)
    return pd.DataFrame({"high": close, "low": close, "close": close, "adjclose": close})


def _trimestral(ini, fim, valor):
    datas = pd.date_range(f"{ini}-03-15", f"{fim}-12-31", freq="3MS") + pd.Timedelta(days=14)
    return pd.Series(valor, index=datas[datas <= pd.Timestamp(HOJE)], dtype=float)


def test_yield_medio_constante():
    # preço sempre 20, dividendo trimestral 0,25 → yield 5% em todos os meses
    df = _precos(lambda d: 20.0)
    div = _trimestral(2014, 2026, 0.25)
    yh = precos.yields_historicos(df, div, P["frequencia"], HOJE)
    assert yh["anos_disponiveis"] == 10
    assert yh["ultimo"]["5"] == pytest.approx(0.05)
    assert yh["ttm"]["5"] == pytest.approx(0.05, rel=1e-3)
    assert precos.yield_medio(yh, "ultimo", 4, 5) == (pytest.approx(0.05), 5)


def test_yield_medio_com_preco_a_subir():
    # preço 20 até 2024, depois 40 → nos últimos 5 anos o yield médio fica entre 2,5% e 5%
    df = _precos(lambda d: 20.0 if d.year < 2024 else 40.0)
    div = _trimestral(2014, 2026, 0.25)
    y, n = precos.yield_medio(precos.yields_historicos(df, div, P["frequencia"], HOJE), "ultimo", 4, 5)
    assert n == 5 and 0.025 <= y < 0.05  # mediana dos meses


def test_pouco_historico_usa_o_que_ha_e_minimo_2_anos():
    df = _precos(lambda d: 20.0)
    div3 = _trimestral(2022, 2026, 0.25)  # ~4,9 anos de dividendos → ~3 anos de yields válidos
    y, n = precos.yield_medio(precos.yields_historicos(df, div3, P["frequencia"], HOJE), "ultimo", 4, 5)
    assert n == 3 and y == pytest.approx(0.05)
    div1 = _trimestral(2025, 2026, 0.25)  # menos de 2 anos de yields → vazio
    assert precos.yield_medio(precos.yields_historicos(df, div1, P["frequencia"], HOJE), "ultimo", 4, 5) == (None, 0)


def test_preco_justo_historico_e_pontuacao():
    df = _precos(lambda d: 20.0 if d.year < 2026 else 16.0)  # caiu para 16 este ano
    div = _trimestral(2014, 2026, 0.25)
    perfil = {"nome": "X", "moeda": "USD", "pais": "United States", "preco": 16.0}
    base = {"ticker_xtb": "X.US", "ticker_yahoo": "X", "tipo": "ACAO"}
    r = analisar(base, df, div, perfil, 1.0, HOJE, P)["resumo"]
    # dividendo anual 1,00; yield médio 5 anos ≈ 5% (um pouco mais em 2026) → justo histórico ≈ 19–20
    assert 0.05 <= r["yield_medio_historico"] < 0.055
    assert r["preco_justo_historico"] == pytest.approx(1.0 / r["yield_medio_historico"], rel=1e-4)
    assert r["abaixo_preco_justo_historico"] is True
    assert r["preco_justo"] == pytest.approx(1.0 / 0.06)  # o preço justo "alvo" mantém-se
    assert r["anos_media_usados"] == 5 and r["preco_justo_pontuacao"] == "historico"
    alvo = analisar(base, df, div, perfil, 1.0, HOJE, parametros({"preco": {"preco_justo_pontuacao": "alvo"}}))["resumo"]
    assert alvo["preco_justo_pontuacao"] == "alvo"
    assert alvo["pontuacao"]["preco"] != r["pontuacao"]["preco"]


def test_suspeito_salto_seguido_de_descida_caso_nos():
    pag = {"2019-05-22": 0.35, "2020-07-01": 0.278, "2021-05-04": 0.278, "2022-05-05": 0.278,
           "2023-04-19": 0.43, "2024-04-22": 0.35, "2025-04-22": 0.35, "2026-05-06": 0.35}
    s = pd.Series(list(pag.values()), index=pd.to_datetime(list(pag)))
    sus = frequencia.suspeitos_extraordinarios(s, 2026, P["frequencia"])
    assert [x["data"] for x in sus] == ["2023-04-19"]
    assert sus[0]["extra_estimado"] == pytest.approx(0.43 - (0.278 + 0.35) / 2)


def test_suspeito_muito_acima_no_ano():
    s = _trimestral(2018, 2025, 0.25)
    s[pd.Timestamp("2022-06-29")] = 0.25 * 1.8  # um pagamento 1,8× os outros desse ano
    sus = frequencia.suspeitos_extraordinarios(s.sort_index(), 2026, P["frequencia"])
    assert [x["data"] for x in sus] == ["2022-06-29"]


def test_aumento_normal_nao_e_suspeito():
    s = pd.concat([_trimestral(2018, 2022, 0.25), _trimestral(2023, 2026, 0.30)])
    assert frequencia.suspeitos_extraordinarios(s, 2026, P["frequencia"]) == []


def test_suspeitos_confirmados_ou_rejeitados_deixam_de_aparecer():
    df = _precos(lambda d: 5.6)
    pag = {"2019-05-22": 0.35, "2020-07-01": 0.278, "2021-05-04": 0.278, "2022-05-05": 0.278,
           "2023-04-19": 0.43, "2024-04-22": 0.35, "2025-04-22": 0.35, "2026-05-06": 0.35}
    div = pd.Series(list(pag.values()), index=pd.to_datetime(list(pag)))
    perfil = {"nome": "NOS", "moeda": "EUR", "pais": "Portugal", "preco": 5.6}
    base = {"ticker_xtb": "NOS.PT", "ticker_yahoo": "NOS.LS", "tipo": "ACAO"}
    r = analisar(base, df, div, perfil, 1.0, HOJE, P)["resumo"]
    assert [x["data"] for x in r["extraordinarios_suspeitos"]] == ["2023-04-19"]
    assert any(a["codigo"] == "possivel_extra" for a in r["avisos"])
    rej = analisar(base, df, div, perfil, 1.0, HOJE, P, rejeitados=["2023-04-19"])["resumo"]
    assert rej["extraordinarios_suspeitos"] == []
    conf = analisar(base, df, div, perfil, 1.0, HOJE, P, {"2023-04-19": 0.152})["resumo"]
    assert conf["extraordinarios_suspeitos"] == []


def test_intercalar_pequeno_e_final_grande_nao_e_suspeito():
    # tipo Orange/Aberdeen: intercalar 0,30 em dezembro e final 0,45 em junho, todos os anos
    pag = {}
    for a in range(2014, 2026):
        pag[f"{a}-06-05"] = 0.45
        pag[f"{a}-12-05"] = 0.30
    s = pd.Series(list(pag.values()), index=pd.to_datetime(list(pag))).sort_index()
    assert frequencia.suspeitos_extraordinarios(s, 2026, P["frequencia"], 2) == []
    # mas um final excecional (0,80) num ano, que depois volta a 0,45, é suspeito
    s[pd.Timestamp("2022-06-05")] = 0.80
    sus = frequencia.suspeitos_extraordinarios(s, 2026, P["frequencia"], 2)
    assert [x["data"] for x in sus] == ["2022-06-05"]


def test_mudanca_de_frequencia_nao_inflaciona_o_yield_historico():
    # tipo GGT: trimestral 0,21 até meados de 2025, depois mensal 0,07 (≈ mesmo total anual)
    df = _precos(lambda d: 4.0)
    tri = _trimestral(2014, 2025, 0.21)
    tri = tri[tri.index < pd.Timestamp("2025-06-01")]
    men = pd.Series(0.07, index=pd.date_range("2025-06-15", "2026-11-15", freq="MS") + pd.Timedelta(days=14))
    div = pd.concat([tri, men])
    y, n = precos.yield_medio(precos.yields_historicos(df, div, P["frequencia"], HOJE), "ultimo", 12, 5)
    assert n == 5 and y == pytest.approx(0.84 / 4.0, rel=0.02)  # ≈ 21%, não 63%
