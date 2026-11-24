"""6.5 Consistência dos dividendos (por anos civis completos) e níveis de cor."""
from __future__ import annotations

import statistics

import pandas as pd

NIVEIS = {
    6: {"cor": "dourado_escuro", "nome": "Dourado escuro", "texto": "Muitos anos sempre a pagar e sempre a aumentar"},
    5: {"cor": "dourado_claro", "nome": "Dourado claro", "texto": "Muitos anos sempre com coerência"},
    4: {"cor": "verde_escuro", "nome": "Verde escuro", "texto": "Bastante coerente"},
    3: {"cor": "verde_medio", "nome": "Verde médio", "texto": "Coerente"},
    2: {"cor": "verde_claro", "nome": "Verde claro", "texto": "Pouco coerente"},
    1: {"cor": "verde_muito_claro", "nome": "Verde muito claro", "texto": "O menos interessante"},
    0: {"cor": "alerta", "nome": "Alerta", "texto": "Possivelmente suspenso ou dados em falta"},
}


def valores_anuais(div_normais: pd.Series, ano_corrente: int) -> dict[int, float]:
    """Valor anual comparável de cada ano civil completo (ignora o ano corrente).

    Para não confundir um pagamento que "escorregou" de dezembro para janeiro com um
    corte, quando um ano tem um nº de pagamentos diferente do habitual (mediana dos
    anos vizinhos), usa-se a média por pagamento × nº habitual de pagamentos.
    Anos sem pagamentos (entre o primeiro e o último ano completo) valem 0.
    """
    s = div_normais[div_normais.index.year < ano_corrente]
    if len(s) == 0:
        return {}
    por_ano = s.groupby(s.index.year)
    totais = por_ano.sum().to_dict()
    contagens = por_ano.count().to_dict()
    anos = list(range(min(totais), ano_corrente))
    res = {}
    for a in anos:
        if a not in totais:
            res[a] = 0.0
            continue
        viz = [contagens[x] for x in (a - 1, a, a + 1) if contagens.get(x)]
        habitual = statistics.median(viz)
        if contagens[a] == habitual:
            res[a] = float(totais[a])
        else:
            res[a] = float(totais[a]) / contagens[a] * habitual
    return res


def metricas(div_normais: pd.Series, ano_corrente: int, p_cons: dict) -> dict:
    v = valores_anuais(div_normais, ano_corrente)
    anos = sorted(v)
    corte, aumento = p_cons["limite_corte"], p_cons["limite_aumento"]

    def houve_corte(a):
        return a - 1 in v and v[a - 1] > 0 and v[a] < v[a - 1] * (1 - corte)

    def houve_aumento(a):
        return a - 1 in v and v[a - 1] > 0 and v[a] > v[a - 1] * (1 + aumento)

    a_pagar = sem_corte = a_aumentar = 0
    for a in reversed(anos):
        if v[a] <= 0:
            break
        a_pagar += 1
    for a in reversed(anos):
        if v[a] <= 0 or houve_corte(a):
            break
        sem_corte += 1
    for a in reversed(anos):
        if not houve_aumento(a):
            break
        a_aumentar += 1

    ult10 = [a for a in anos if a >= ano_corrente - 10]
    ult5 = [a for a in anos if a >= ano_corrente - 5]

    def cagr(n):
        if not anos:
            return None
        fim, ini = anos[-1], anos[-1] - n
        if ini not in v or v[ini] <= 0 or v[fim] <= 0:
            return None
        return (v[fim] / v[ini]) ** (1 / n) - 1

    ints = [(b - a).days for a, b in zip(div_normais.index, div_normais.index[1:])][-12:]
    regularidade = None
    if len(ints) >= 3 and statistics.mean(ints) > 0:
        cv = statistics.pstdev(ints) / statistics.mean(ints)
        regularidade = max(0.0, min(1.0, 1 - cv))

    return {
        "anos_a_pagar": a_pagar,
        "anos_sem_corte": sem_corte,
        "anos_seguidos_aumento": a_aumentar,
        "aumentos_ultimos_10": sum(1 for a in ult10 if houve_aumento(a)),
        "cortes_ultimos_10": sum(1 for a in ult10 if houve_corte(a)),
        "cortes_ultimos_5": sum(1 for a in ult5 if houve_corte(a)),
        "cagr_5": cagr(5),
        "cagr_10": cagr(10),
        "regularidade": regularidade,
        "anos_com_historico": sum(1 for a in anos if v[a] > 0),
        "num_pagamentos": int(len(div_normais)),
        "valores_anuais": {str(a): round(v[a], 6) for a in anos},
    }


def nivel(m: dict, frequencia: int, suspenso: bool, sem_dados: bool, p_cons: dict) -> dict:
    """Classifica em níveis 0–6 e explica porquê (texto em português)."""
    motivos: list[str] = []
    sc = m["anos_sem_corte"]
    if sem_dados:
        n = 0
        motivos.append("Faltam dados de preço ou de dividendos.")
    elif suspenso:
        n = 0
        motivos.append("O último pagamento está muito atrasado: possivelmente suspenso.")
    elif m["num_pagamentos"] < p_cons["min_pagamentos_historico"]:
        n = 1
        motivos.append(f"Pouco histórico ({m['num_pagamentos']} pagamentos).")
    elif frequencia == 0:
        n = 1
        motivos.append("Pagamentos irregulares (sem frequência definida).")
    elif m["cortes_ultimos_5"] >= p_cons["nivel1_cortes_em_5_anos"]:
        n = 1
        motivos.append(f"{m['cortes_ultimos_5']} cortes nos últimos 5 anos.")
    elif sc >= p_cons["nivel6_anos_sem_corte"] and (
        m["aumentos_ultimos_10"] >= p_cons["nivel6_aumentos_em_10_anos"]
        or m["anos_seguidos_aumento"] >= p_cons["nivel6_anos_seguidos_aumento"]
    ):
        n = 6
        motivos.append(f"{sc} anos a pagar sem cortes.")
        motivos.append(f"Aumentou em {m['aumentos_ultimos_10']} dos últimos 10 anos "
                       f"({m['anos_seguidos_aumento']} anos seguidos).")
    elif sc >= p_cons["nivel5_anos_sem_corte"]:
        n = 5
        motivos.append(f"{sc} anos a pagar sem cortes.")
    elif sc >= p_cons["nivel4_anos_sem_corte"]:
        n = 4
        motivos.append(f"{sc} anos a pagar sem cortes.")
    elif sc >= p_cons["nivel3_anos_sem_corte"] and m["cortes_ultimos_5"] == 0:
        n = 3
        motivos.append(f"{sc} anos a pagar sem cortes.")
    else:
        n = 2
        if m["cortes_ultimos_5"]:
            motivos.append("Houve 1 corte nos últimos 5 anos.")
        motivos.append(f"Só {sc} ano(s) seguido(s) sem cortes.")
    return {"nivel": n, **NIVEIS[n], "motivos": motivos}
