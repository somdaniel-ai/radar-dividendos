import datetime as dt

import pandas as pd
import pytest

from radar.analisar import analisar
from radar.calculos import consistencia, frequencia, pagamentos, pontuacao, precos, rendimento
from radar.parametros import parametros

P = parametros()


def serie(datas_valores):
    return pd.Series([v for _, v in datas_valores], index=pd.to_datetime([d for d, _ in datas_valores]))


def trimestral(ano_ini, ano_fim, valor_ano):
    """Dividendos trimestrais; valor_ano(ano) = valor de cada pagamento nesse ano."""
    out = []
    for a in range(ano_ini, ano_fim + 1):
        for m in (3, 6, 9, 12):
            out.append((f"{a}-{m:02d}-15", valor_ano(a)))
    return serie(out)


# ---------- 6.1 Frequência ----------

@pytest.mark.parametrize("passo,esperado", [(30, "Mensal"), (91, "Trimestral"), (182, "Semestral"),
                                            (365, "Anual"), (130, "Irregular")])
def test_frequencia(passo, esperado):
    datas = pd.date_range("2020-01-01", periods=10, freq=f"{passo}D")
    f = frequencia.detetar_frequencia(pd.Series(1.0, index=datas), P["frequencia"])
    assert f["nome"] == esperado


def test_frequencia_usa_mediana_e_ignora_um_intervalo_estranho():
    datas = list(pd.date_range("2020-01-01", periods=8, freq="91D"))
    datas.insert(5, datas[4] + pd.Timedelta(days=20))  # um pagamento extra fora do ritmo
    f = frequencia.detetar_frequencia(pd.Series(1.0, index=pd.DatetimeIndex(datas)), P["frequencia"])
    assert f["pagamentos_ano"] == 4


def test_extraordinario_detetado():
    s = serie([("2020-03-01", 1), ("2020-06-01", 1), ("2020-09-01", 5), ("2020-12-01", 1), ("2021-03-01", 1)])
    marcas = frequencia.marcar_extraordinarios(s, 2.0, 8)
    assert list(marcas) == [False, False, True, False, False]


def test_pagamentos_no_mesmo_dia_sao_somados():
    s = pd.Series([1.0, 0.5], index=pd.to_datetime(["2020-01-01", "2020-01-01"]))
    assert frequencia.limpar_dividendos(s).tolist() == [1.5]


# ---------- 6.2 Rendimento e impostos ----------

def test_dividendo_anual_ultimo_e_ttm():
    s = trimestral(2024, 2025, lambda a: 0.5 if a == 2025 else 0.4)
    da = rendimento.dividendo_anual(s, s, 4, dt.date(2026, 1, 10), "ultimo")
    assert da["anual"] == pytest.approx(2.0)
    assert da["ttm"] == pytest.approx(2.0)
    da = rendimento.dividendo_anual(s, s, 4, dt.date(2025, 7, 1), "ttm")
    assert da["anual"] == pytest.approx(0.4 * 2 + 0.5 * 2)


def test_irregular_usa_ttm():
    s = serie([("2025-02-01", 1.0), ("2025-09-01", 0.3)])
    da = rendimento.dividendo_anual(s, s, 0, dt.date(2025, 12, 1), "ultimo")
    assert da["anual"] == pytest.approx(1.3) and da["metodo_usado"] == "ttm"


def test_imposto_avancado():
    imp = parametros({"impostos": {"modo": "avancado"}})["impostos"]
    # EUA com W-8BEN: 15% retido + 13% em Portugal = 28%
    assert rendimento.taxa_imposto("United States", imp)["taxa"] == pytest.approx(0.28)
    # EUA sem W-8BEN: 30% retido, Portugal só desconta 15% → 30% + 13% = 43%
    imp["w8ben_ativo"] = False
    assert rendimento.taxa_imposto("United States", imp)["taxa"] == pytest.approx(0.43)
    assert rendimento.taxa_imposto("Portugal", imp)["taxa"] == pytest.approx(0.28)
    desconhecido = rendimento.taxa_imposto("Narnia", imp)
    assert desconhecido["taxa"] == pytest.approx(0.28) and not desconhecido["conhecida"]


def test_yields():
    y = rendimento.yields(6.0, 100.0, 0.30)
    assert y["bruto"] == pytest.approx(0.06)
    assert y["mensal"] == pytest.approx(0.005)
    assert y["liquido"] == pytest.approx(0.042)


# ---------- 6.3 Preços ----------

def test_extremos_ajustados():
    idx = pd.to_datetime(["2025-01-02", "2025-06-02", "2025-12-01"])
    df = pd.DataFrame({"high": [10, 20, 15], "low": [8, 18, 14], "close": [9, 19, 15],
                       "adjclose": [4.5, 19, 15]}, index=idx)
    e = precos.extremos(df, dt.date(2025, 12, 2))
    assert e["52s"]["max"] == 20 and e["52s"]["min"] == 8
    assert e["sempre"]["min_aj"] == pytest.approx(8 * 0.5)
    assert precos.posicao(15, 8, 20) == pytest.approx(7 / 12)


# ---------- 6.4 Pagamentos ----------

def test_somar_meses_fim_do_mes():
    assert pagamentos.somar_meses(dt.date(2025, 11, 30), 3) == dt.date(2026, 2, 28)


def test_atraso_e_anuncio():
    pp = P["pagamentos"]
    assert not pagamentos.esta_atrasado(-20, 91, pp)
    assert pagamentos.esta_atrasado(-31, 91, pp)
    hoje = dt.date(2026, 1, 1)
    assert not pagamentos.esta_atrasado(-60, 91, pp, dt.date(2026, 1, 15), hoje)
    pct = {**pp, "modo_atraso": "percentagem"}
    assert pagamentos.esta_atrasado(-50, 91, pct)


def test_tendencia():
    assert pagamentos.tendencia(pd.Series([1, 1, 1.1])) == "aumento"
    assert pagamentos.tendencia(pd.Series([1, 1, 1])) == "igual"
    assert pagamentos.tendencia(pd.Series([1, 1, 0.8])) == "corte"


# ---------- 6.5 Consistência ----------

def test_aristocrata_nivel_6():
    s = trimestral(2010, 2026, lambda a: 0.5 * 1.05 ** (a - 2010))
    m = consistencia.metricas(s, 2026, P["consistencia"])
    assert m["anos_a_pagar"] == 16 and m["anos_sem_corte"] == 16
    assert m["anos_seguidos_aumento"] == 15
    assert m["cagr_5"] == pytest.approx(0.05, rel=1e-6)
    assert consistencia.nivel(m, 4, False, False, P["consistencia"])["nivel"] == 6


def test_constante_nivel_5_e_com_corte():
    s = trimestral(2010, 2026, lambda a: 0.5)
    m = consistencia.metricas(s, 2026, P["consistencia"])
    assert consistencia.nivel(m, 4, False, False, P["consistencia"])["nivel"] == 5
    s = trimestral(2010, 2026, lambda a: 0.5 if a != 2022 else 0.3)
    m = consistencia.metricas(s, 2026, P["consistencia"])
    assert m["anos_sem_corte"] == 3  # 2023 (subida), 2024 e 2025; 2022 foi corte
    # 3 anos sem cortes, mas 1 corte nos últimos 5 anos → verde claro (2), não verde médio
    assert m["cortes_ultimos_5"] == 1
    assert consistencia.nivel(m, 4, False, False, P["consistencia"])["nivel"] == 2


def test_pagamento_que_escorrega_de_ano_nao_e_corte():
    datas = []
    for a in range(2015, 2026):
        for m in (3, 6, 9, 12):
            datas.append((f"{a}-{m:02d}-28", 1.0))
    # em 2020 o pagamento de dezembro passou para 2 de janeiro de 2021
    datas = [d if d[0] != "2020-12-28" else ("2021-01-02", 1.0) for d in datas]
    m = consistencia.metricas(serie(datas), 2026, P["consistencia"])
    assert m["cortes_ultimos_10"] == 0
    assert m["anos_sem_corte"] == 11


def test_suspenso_e_pouco_historico():
    s = trimestral(2015, 2025, lambda a: 1)
    m = consistencia.metricas(s, 2026, P["consistencia"])
    assert consistencia.nivel(m, 4, True, False, P["consistencia"])["nivel"] == 0
    pouco = serie([("2025-03-01", 1), ("2025-06-01", 1)])
    m = consistencia.metricas(pouco, 2026, P["consistencia"])
    assert consistencia.nivel(m, 4, False, False, P["consistencia"])["nivel"] == 1


# ---------- 6.6 Pontuação ----------

def test_pontuacao_e_armadilhas():
    pt = P["pontuacao"]
    met = {"anos_sem_corte": 20, "regularidade": 1.0}
    alta = pontuacao.pontuacao(0.20, 6, met, 50, 100, 0.0, [], pt)
    assert alta["total"] == 100
    arm = pontuacao.armadilhas(0.25, 1.5, -0.4, True, pt)
    assert {a["codigo"] for a in arm} == {"yield_alto", "payout", "queda_preco", "atraso"}
    suspensa = pontuacao.pontuacao(5.0, 0, met, 2, 179, 0.0, arm, pt)
    assert suspensa["rendimento"] == 0 and suspensa["consistencia"] == 0
    assert suspensa["penalizacao"] == 4 * 15 and suspensa["total"] == 0
    assert pontuacao.fora_batentes(0.02, pt) == "abaixo"
    assert pontuacao.fora_batentes(0.25, pt) == "acima"
    assert pontuacao.fora_batentes(0.05, pt) is None
    assert pontuacao.armadilhas(0.25, 1.5, -0.4, True, {**pt, "armadilhas_ativas": False}) == []


# ---------- Tudo junto (sem internet) ----------

def test_analisar_completo():
    hoje = dt.date(2026, 11, 24)
    div = trimestral(2012, 2026, lambda a: 0.25 * 1.04 ** (a - 2012))
    div = div[div.index <= pd.Timestamp(hoje)]
    idx = pd.bdate_range("2012-01-02", "2026-11-24")
    df = pd.DataFrame({"high": 21.0, "low": 19.0, "close": 20.0, "adjclose": 20.0}, index=idx)
    perfil = {"nome": "Exemplo", "moeda": "USD", "pais": "United States", "preco": 20.0, "payout": 0.6}
    base = {"ticker_xtb": "EX.US", "ticker_yahoo": "EX", "tipo": "ACAO"}
    r = analisar(base, df, div, perfil, 0.9, hoje, P)["resumo"]
    assert r["frequencia"] == "Trimestral"
    assert r["dividendo"]["anual"] == pytest.approx(0.25 * 1.04 ** 14 * 4, rel=1e-5)
    assert r["yield"]["bruto"] == pytest.approx(r["dividendo"]["anual"] / 20, rel=1e-5)
    assert r["nivel"]["nivel"] == 6
    assert not r["pagamento"]["atrasado"]
    assert r["pagou_recentemente"]
    assert 0 <= r["pontuacao"]["total"] <= 100
