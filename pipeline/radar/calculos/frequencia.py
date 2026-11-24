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


def marcar_excesso_no_ano(div: pd.Series, pagamentos_ano: int, mediana_intervalo: float | None,
                          fracao: float = 0.6) -> pd.Series:
    """Num ano com mais pagamentos do que a frequência normal, marca os pagamentos a mais.

    Os "a mais" são os que chegam fora do ritmo: dois pagamentos com um intervalo menor
    do que `fracao` × intervalo normal. Desse par, marca-se o que tem o valor mais
    diferente do habitual (o extra pode vir antes ou depois do normal). Um pagamento
    que só escorregou de dezembro para janeiro (intervalo normal) não é marcado.
    """
    marcas = pd.Series(False, index=div.index, dtype=bool)
    if pagamentos_ano <= 0 or not mediana_intervalo or len(div) < 2:
        return marcas
    valores = list(div.values)
    habitual = statistics.median(valores)
    curtos = [i for i in range(1, len(valores))
              if (div.index[i] - div.index[i - 1]).days < fracao * mediana_intervalo]
    contagem = div.groupby(div.index.year).size().to_dict()
    curtos.sort(key=lambda i: (div.index[i] - div.index[i - 1]).days)
    for i in curtos:
        ano = div.index[i].year
        ja = int(marcas[div.index.year == ano].sum())
        if contagem[ano] - pagamentos_ano - ja <= 0:
            continue
        a, b = i - 1, i
        alvo = a if abs(valores[a] - habitual) > abs(valores[b] - habitual) else b
        if div.index[alvo].year != ano or marcas.iloc[alvo]:
            alvo = b
        marcas.iloc[alvo] = True
    return marcas


def suspeitos_extraordinarios(div: pd.Series, hoje_ano: int, p_freq: dict, pagamentos_ano: int = 1) -> list[dict]:
    """Pagamentos que PODEM ser extraordinários (para o utilizador confirmar ou rejeitar).

    `div` = pagamentos já considerados normais. Dois padrões:
      1) muito acima dos outros pagamentos do mesmo ano (> fator × mediana dos outros) e
         isolado (também muito acima dos vizinhos);
      2) salto grande seguido de descida (ex.: 0,278 → 0,43 → 0,35), comparando com o MESMO
         pagamento do ano anterior e do ano seguinte (o final com o final, o intercalar com o
         intercalar), para não confundir o ritmo "intercalar pequeno + final grande" de muitas
         empresas europeias com extraordinários.
    Devolve [{"data", "valor", "extra_estimado", "motivo"}], só dos últimos N anos.
    """
    if not p_freq.get("suspeitos_ativos", True) or len(div) < 3:
        return []
    desde = hoje_ano - int(p_freq["suspeito_anos"])
    out: dict[pd.Timestamp, dict] = {}
    # 1) muito acima dos outros desse ano — e isolado (também acima dos 2 vizinhos de cada
    #    lado), para não confundir com um aumento verdadeiro que se mantém nos meses seguintes
    posicao = {d: i for i, d in enumerate(div.index)}
    vals_todos = list(div.values)
    for ano, grupo in div.groupby(div.index.year):
        if ano < desde or len(grupo) < 3:
            continue
        for d, v in grupo.items():
            outros = grupo.drop(d)
            med = statistics.median(outros.values)
            i = posicao[d]
            vizinhos = vals_todos[max(0, i - 2): i] + vals_todos[i + 1: i + 3]
            isolado = bool(vizinhos) and v > p_freq["suspeito_fator_no_ano"] * statistics.median(vizinhos)
            if med > 0 and isolado and v > p_freq["suspeito_fator_no_ano"] * med:
                out[d] = {"valor": float(v), "extra_estimado": float(v - med),
                          "motivo": f"Muito acima dos outros pagamentos de {ano} ({v / med:.1f}× a mediana)."}
    # 2) salto seguido de descida, face ao mesmo pagamento do ano anterior/seguinte
    k = max(1, int(pagamentos_ano or 1))
    vals, datas = list(div.values), list(div.index)
    for i in range(k, len(vals) - k):
        d, v = datas[i], vals[i]
        if d.year < desde or d in out:
            continue
        ant, seg = vals[i - k], vals[i + k]
        if ant > 0 and v >= ant * (1 + p_freq["suspeito_salto"]) and seg <= v * (1 - p_freq["suspeito_descida"]):
            ref = statistics.median([ant, seg])
            qual = "no pagamento seguinte" if k == 1 else "no mesmo pagamento do ano seguinte"
            face = "" if k == 1 else " face ao mesmo pagamento do ano anterior"
            out[d] = {"valor": float(v), "extra_estimado": float(max(0.0, v - ref)),
                      "motivo": f"Subiu {v / ant - 1:.0%}{face} e {qual} desceu {1 - seg / v:.0%}."}
    return [{"data": d.date().isoformat(), **x} for d, x in sorted(out.items())]


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
