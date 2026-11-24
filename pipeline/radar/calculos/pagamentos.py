"""6.4 Próximo pagamento esperado, atrasos e alterações do dividendo."""
from __future__ import annotations

import calendar
import datetime as dt

import pandas as pd


def somar_meses(d: dt.date, meses: int) -> dt.date:
    """Como o DATE(ANO; MÊS+n; DIA) do Excel, mas sem saltar para o mês seguinte
    quando o dia não existe (ex.: 31 + 3 meses → 30)."""
    total = d.month - 1 + meses
    ano, mes = d.year + total // 12, total % 12 + 1
    return dt.date(ano, mes, min(d.day, calendar.monthrange(ano, mes)[1]))


def proximo_pagamento(ultima: dt.date | None, pagamentos_ano: int, mediana_intervalo: float | None,
                      hoje: dt.date) -> dict:
    """próximo_esperado = último + (12 / frequência) meses; dias = esperado − hoje."""
    if ultima is None:
        return {"esperado": None, "dias_para_pagamento": None}
    if pagamentos_ano > 0:
        esperado = somar_meses(ultima, 12 // pagamentos_ano)
    elif mediana_intervalo:
        esperado = ultima + dt.timedelta(days=round(mediana_intervalo))
    else:
        esperado = somar_meses(ultima, 12)
    return {"esperado": esperado, "dias_para_pagamento": (esperado - hoje).days}


def esta_atrasado(dias_para_pagamento: int | None, intervalo_dias: float | None, p_pag: dict,
                  proxima_ex_anunciada: dt.date | None = None, hoje: dt.date | None = None) -> bool:
    """Atrasado = a data esperada já passou há mais do que a tolerância.

    Se a empresa já anunciou uma próxima data ex-dividendo (no futuro), não está atrasado.
    """
    if dias_para_pagamento is None:
        return False
    if proxima_ex_anunciada and hoje and proxima_ex_anunciada >= hoje:
        return False
    if p_pag["modo_atraso"] == "percentagem" and intervalo_dias:
        tolerancia = p_pag["percentagem_atraso"] * intervalo_dias
    else:
        tolerancia = p_pag["dias_atraso"]
    return -dias_para_pagamento > tolerancia


def tendencia(div_normais: pd.Series, tolerancia: float = 0.01) -> str | None:
    """Compara o último dividendo com a média dos 2 anteriores: aumento / igual / corte."""
    if len(div_normais) < 3:
        return None
    ultimo = float(div_normais.iloc[-1])
    media = float(div_normais.iloc[-3:-1].mean())
    if media <= 0:
        return None
    var = ultimo / media - 1
    if var > tolerancia:
        return "aumento"
    if var < -tolerancia:
        return "corte"
    return "igual"
