"""Casos reais copiados do Excel (folha "Lista Ações", dados de 24/11/2026).

Confirma que as fórmulas novas dão os mesmos números que o Excel quando recebem
os mesmos dados de entrada.
"""
import datetime as dt

import pandas as pd
import pytest

from radar.calculos import pagamentos, precos, rendimento


def excel_data(n: int) -> dt.date:
    return dt.date(1899, 12, 30) + dt.timedelta(days=n)


HOJE = excel_data(46350)  # "Data atual" no Excel = 24/11/2026
USD_EUR = 0.9136  # folha "Valor Moedas"

# ticker, preço USD, último dividendo, pagamentos/ano, data último (série Excel),
# mín 52s, máx 52s, % Ano DY (Excel), Preço Justo EUR (Excel), 52 Semanas % (Excel), Dias p/ pagamento (Excel)
CASOS = [
    ("CABO", 2.01, 2.95, 4, 45706, 1.95, 137.995, 587.06467661691556, 179.6746666666667, 4.4103054136498824e-4, 555),
    ("OXSQ", 0.6005, 0.035, 12, 46281, 0.4859, 1.98, 69.941715237302262, 6.3952000000000009, 7.6701693327086568e-2, 39),
    ("NHTC", 0.6455, 0.1, 4, 46154, 0.6225, 4, 61.967467079783113, 6.0906666666666665, 6.8097705403404622e-3, 104),
    ("CCIF", 1.45, 0.06, 12, 46283, 1.27, 5.33, 49.65517241379311, 10.963199999999999, 4.4334975369458109e-2, 37),
]


@pytest.mark.parametrize("t,preco,div,freq,ult,mn,mx,dy,justo,pos52,dias", CASOS)
def test_igual_ao_excel(t, preco, div, freq, ult, mn, mx, dy, justo, pos52, dias):
    datas = pd.to_datetime([excel_data(ult)])
    serie = pd.Series([div], index=datas)
    da = rendimento.dividendo_anual(serie, serie, freq, HOJE, "ultimo")
    anual_eur = da["anual"] * USD_EUR
    y = rendimento.yields(anual_eur, preco * USD_EUR, 0.30)
    assert y["bruto"] * 100 == pytest.approx(dy, rel=1e-9)  # % Ano DY
    assert precos.preco_justo(anual_eur, 0.06) == pytest.approx(justo, rel=1e-9)
    assert precos.posicao(preco, mn, mx) == pytest.approx(pos52, rel=1e-9)
    # O Excel calcula HOJE − esperado (positivo = atrasado); nós esperado − HOJE.
    prox = pagamentos.proximo_pagamento(excel_data(ult), freq, None, HOJE)
    assert prox["dias_para_pagamento"] == -dias


def test_cabo_marcada_como_suspensa():
    # CABO: último dividendo em 18/02/2025, trimestral → esperado em 05/2025: 555 dias de atraso
    p = {"modo_atraso": "dias", "dias_atraso": 30, "percentagem_atraso": 0.5}
    assert pagamentos.esta_atrasado(-555, 91, p)


def test_imposto_simples_como_excel():
    # "Imposto por Ano" do Excel = 30% do valor por ano
    assert rendimento.taxa_imposto("United States", {"modo": "simples", "taxa_simples": 0.30})["taxa"] == 0.30
