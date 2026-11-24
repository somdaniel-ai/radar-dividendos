"""6.3 Preço justo, máximos/mínimos e posição no intervalo."""
from __future__ import annotations

import datetime as dt

import pandas as pd

JANELAS = {"52s": 365, "5a": 5 * 365, "sempre": None}


def extremos(precos: pd.DataFrame, hoje: dt.date) -> dict:
    """Máximos e mínimos (normais e ajustados) para 52 semanas, 5 anos e de sempre.

    Ajuste como no Excel: fator = adjclose / close; máx_ajustado = high × fator.
    """
    res: dict = {}
    if precos is None or len(precos) == 0:
        return {k: None for k in JANELAS}
    df = precos.dropna(subset=["high", "low", "close"])
    fator = (df["adjclose"] / df["close"]).fillna(1.0)
    alto_aj, baixo_aj = df["high"] * fator, df["low"] * fator
    fim = pd.Timestamp(hoje)
    for nome, dias in JANELAS.items():
        m = df.index > (fim - pd.Timedelta(days=dias)) if dias else slice(None)
        if dias and not m.any():
            res[nome] = None
            continue
        res[nome] = {
            "max": float(df["high"][m].max()),
            "min": float(df["low"][m].min()),
            "max_aj": float(alto_aj[m].max()),
            "min_aj": float(baixo_aj[m].min()),
        }
    return res


def posicao(preco: float | None, minimo: float | None, maximo: float | None) -> float | None:
    """0 = no mínimo, 1 = no máximo."""
    if preco is None or minimo is None or maximo is None or maximo <= minimo:
        return None
    return (preco - minimo) / (maximo - minimo)


def posicoes(preco: float | None, ext: dict, usar_ajustados: bool) -> dict:
    out = {}
    for nome, e in ext.items():
        if not e:
            out[nome] = None
        elif usar_ajustados:
            out[nome] = posicao(preco, e["min_aj"], e["max_aj"])
        else:
            out[nome] = posicao(preco, e["min"], e["max"])
    return out


def preco_justo(dividendo_anual: float, yield_alvo: float) -> float | None:
    if not dividendo_anual or yield_alvo <= 0:
        return None
    return dividendo_anual / yield_alvo


def variacao_12m(precos: pd.DataFrame, hoje: dt.date) -> float | None:
    """Variação do preço (fecho) face a há ~12 meses."""
    if precos is None or len(precos) < 2:
        return None
    alvo = pd.Timestamp(hoje) - pd.Timedelta(days=365)
    antes = precos["close"][precos.index <= alvo].dropna()
    if len(antes) == 0:
        return None
    return float(precos["close"].dropna().iloc[-1] / antes.iloc[-1] - 1)
