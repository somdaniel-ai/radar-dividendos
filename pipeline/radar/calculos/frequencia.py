"""6.1 Frequência dos pagamentos e dividendos extraordinários."""
from __future__ import annotations

import statistics

import pandas as pd

NOMES_FREQUENCIA = {12: "Mensal", 4: "Trimestral", 2: "Semestral", 1: "Anual", 0: "Irregular"}
_CHAVES = {"mensal": 12, "trimestral": 4, "semestral": 2, "anual": 1}


def limpar_dividendos(div: pd.Series) -> pd.Series:
    """Ordena, remove valores nulos/negativos e junta pagamentos no mesmo dia."""
    if div is None or len(div) == 0:
        return pd.Series(dtype=float, index=pd.DatetimeIndex([]))
    s = div[div > 0].copy()
    s.index = pd.to_datetime(s.index).normalize()
    if getattr(s.index, "tz", None) is not None:
        s.index = s.index.tz_localize(None)
    return s.groupby(level=0).sum().sort_index()


def marcar_extraordinarios(div: pd.Series, fator: float = 2.0, janela: int = 8) -> pd.Series:
    """True para cada pagamento maior do que `fator` × mediana dos vizinhos.

    Os vizinhos são até `janela/2` pagamentos antes e `janela/2` depois (sem contar o próprio).
    """
    valores = list(div.values)
    metade = max(1, janela // 2)
    marcas = []
    for i, v in enumerate(valores):
        vizinhos = valores[max(0, i - metade): i] + valores[i + 1: i + 1 + metade]
        if len(vizinhos) >= 2:
            marcas.append(bool(v > fator * statistics.median(vizinhos)))
        else:
            marcas.append(False)
    return pd.Series(marcas, index=div.index, dtype=bool)


def intervalos_dias(div: pd.Series) -> list[int]:
    datas = list(div.index)
    return [(b - a).days for a, b in zip(datas, datas[1:]) if (b - a).days > 0]


def detetar_frequencia(div_normais: pd.Series, p_freq: dict) -> dict:
    """Devolve {'pagamentos_ano', 'nome', 'mediana_intervalo'}.

    Usa a mediana dos últimos N intervalos entre pagamentos (não só os 3 últimos).
    """
    ints = intervalos_dias(div_normais)
    if not ints:
        return {"pagamentos_ano": 0, "nome": "Irregular", "mediana_intervalo": None}
    ultimos = ints[-int(p_freq["num_intervalos_mediana"]):]
    mediana = float(statistics.median(ultimos))
    pag = 0
    for chave, (lo, hi) in p_freq["limites_dias"].items():
        if lo <= mediana <= hi:
            pag = _CHAVES[chave]
            break
    return {"pagamentos_ano": pag, "nome": NOMES_FREQUENCIA[pag], "mediana_intervalo": mediana}
