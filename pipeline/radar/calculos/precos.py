"""6.3 Preço justo, máximos/mínimos e posição no intervalo."""
from __future__ import annotations

import datetime as dt
import statistics

import pandas as pd

from .frequencia import detetar_frequencia

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


MAX_ANOS_HISTORICO = 10


def yields_historicos(precos: pd.DataFrame, div_normais: pd.Series, p_freq: dict,
                      hoje: dt.date, max_anos: int = MAX_ANOS_HISTORICO) -> dict:
    """Yield bruto habitual (mediana mensal) da própria ação nos últimos 1…max_anos anos.

    Em cada fim de mês: yield = dividendo anual nessa altura ÷ preço de fecho desse mês, com
    o dividendo anual calculado pelos dois métodos (sem extraordinários):
      - "ultimo": último dividendo normal × pagamentos por ano QUE A AÇÃO TINHA NESSA ALTURA
        (ex.: a GGT passou de trimestral a mensal em 2025) — irregular → TTM;
      - "ttm": soma dos dividendos normais dos 12 meses anteriores.
    Só contam os meses com pelo menos 12 meses de histórico de dividendos antes.
    Devolve {"anos_disponiveis": k, "ultimo": {"2": y, …}, "ttm": {…}} (anos completos).
    """
    vazio = {"anos_disponiveis": 0, "ultimo": {}, "ttm": {}}
    if precos is None or len(precos) == 0 or len(div_normais) == 0:
        return vazio
    fim = pd.Timestamp(hoje)
    inicio = fim - pd.DateOffset(years=max_anos)
    fecho = precos["close"].dropna()
    mensal = fecho[(fecho.index > inicio - pd.Timedelta(days=40)) & (fecho.index <= fim)].resample("ME").last().dropna()
    mensal = mensal[mensal.index > inicio]
    primeiro = div_normais.index[0] + pd.Timedelta(days=365)
    datas = div_normais.index.values
    valores = div_normais.values
    acum = valores.cumsum()
    pontos = []  # (data, yield_ultimo, yield_ttm)
    freq_em: dict[int, int] = {}  # frequência na altura de cada pagamento
    for d, preco in mensal.items():
        d = min(d, fim)
        if d < primeiro or preco <= 0:
            continue
        i = datas.searchsorted(d.to_datetime64(), side="right") - 1  # último pagamento ≤ d
        if i < 0:
            continue
        j = datas.searchsorted((d - pd.Timedelta(days=365)).to_datetime64(), side="right") - 1
        ttm = acum[i] - (acum[j] if j >= 0 else 0.0)
        if i not in freq_em:
            freq_em[i] = detetar_frequencia(div_normais.iloc[max(0, i - 6): i + 1], p_freq)["pagamentos_ano"]
        pag = freq_em[i]
        ult = valores[i] * pag if pag > 0 else ttm
        # se o último pagamento é muito antigo (suspensão), o "último × freq." já não vale
        if pag > 0 and (d - pd.Timestamp(datas[i])).days > 2 * 365 / pag + 30:
            ult = ttm
        pontos.append((d, ult / preco, ttm / preco))
    if not pontos:
        return vazio
    anos = min(max_anos, len(pontos) // 12)
    out = {"anos_disponiveis": anos, "ultimo": {}, "ttm": {}}
    # mediana dos meses (e não média simples): um pagamento muito alto ou um mês de pânico
    # na bolsa não distorcem o "yield habitual" da ação
    for n in range(1, anos + 1):
        limite = fim - pd.DateOffset(years=n)
        janela = [p for p in pontos if p[0] > limite]
        if janela:
            out["ultimo"][str(n)] = round(statistics.median(p[1] for p in janela), 6)
            out["ttm"][str(n)] = round(statistics.median(p[2] for p in janela), 6)
    return out


def yield_medio(yh: dict, metodo: str, pagamentos_ano: int, anos: int) -> tuple[float | None, int]:
    """Escolhe o yield médio para `anos` (ou os que houver, mínimo 2). Devolve (yield, anos_usados)."""
    m = "ttm" if (metodo != "ultimo" or pagamentos_ano <= 0) else "ultimo"
    pedidos = max(2, min(MAX_ANOS_HISTORICO, int(anos)))
    n = min(pedidos, int(yh.get("anos_disponiveis") or 0))
    if n < 2:
        return None, 0
    y = (yh.get(m) or {}).get(str(n))
    if not y or y <= 0:
        return None, 0
    return y, n


def variacao_12m(precos: pd.DataFrame, hoje: dt.date) -> float | None:
    """Variação do preço (fecho) face a há ~12 meses."""
    if precos is None or len(precos) < 2:
        return None
    alvo = pd.Timestamp(hoje) - pd.Timedelta(days=365)
    antes = precos["close"][precos.index <= alvo].dropna()
    if len(antes) == 0:
        return None
    return float(precos["close"].dropna().iloc[-1] / antes.iloc[-1] - 1)
