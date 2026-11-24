"""6.6 Batentes, armadilhas de rendimento e pontuação final (0–100)."""
from __future__ import annotations


def _limitar(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def fora_batentes(yield_liquido: float | None, p_pont: dict) -> str | None:
    """'abaixo' / 'acima' dos limites de yield líquido, ou None se dentro (ou desligado)."""
    if not p_pont["batentes_ativos"] or yield_liquido is None:
        return None
    if yield_liquido < p_pont["yield_minimo"]:
        return "abaixo"
    if yield_liquido > p_pont["yield_maximo"]:
        return "acima"
    return None


def armadilhas(yield_liquido: float | None, payout: float | None, variacao_12m: float | None,
               atrasado: bool, p_pont: dict) -> list[dict]:
    """Sinais de "armadilha de rendimento" (yield alto que pode não ser sustentável)."""
    if not p_pont["armadilhas_ativas"]:
        return []
    out = []
    if p_pont["armadilha_yield_acima_maximo"] and yield_liquido is not None and yield_liquido > p_pont["yield_maximo"]:
        out.append({"codigo": "yield_alto", "texto": f"Yield líquido acima de {p_pont['yield_maximo']:.0%}."})
    if p_pont["armadilha_payout"] and payout is not None and payout > p_pont["armadilha_payout_limite"]:
        out.append({"codigo": "payout", "texto": f"Paga mais do que lucra (payout de {payout:.0%})."})
    if p_pont["armadilha_queda_preco"] and variacao_12m is not None and variacao_12m < -p_pont["armadilha_queda_limite"]:
        out.append({"codigo": "queda_preco", "texto": f"Preço caiu {-variacao_12m:.0%} em 12 meses."})
    if p_pont["armadilha_atraso"] and atrasado:
        out.append({"codigo": "atraso", "texto": "Dividendo atrasado (possivelmente suspenso)."})
    return out


def pontuacao(yield_liquido: float | None, nivel: int, met: dict, preco_eur: float | None,
              justo_eur: float | None, posicao_52s: float | None, lista_armadilhas: list,
              p_pont: dict) -> dict:
    """Pontuação 0–100 = pesos × (rendimento, consistência, preço) − penalização."""
    lo, hi = p_pont["yield_minimo"], p_pont["yield_maximo"]
    rend = _limitar((yield_liquido - lo) / (hi - lo)) if yield_liquido is not None and hi > lo else 0.0

    if nivel == 0:
        # dividendo possivelmente suspenso ou sem dados: o yield não é real
        rend = 0.0
        cons = 0.0
    else:
        reg = met.get("regularidade") or 0.0
        cons = 0.6 * nivel / 6 + 0.2 * min(met.get("anos_sem_corte", 0), 20) / 20 + 0.2 * reg

    if preco_eur and justo_eur:
        desconto = (justo_eur - preco_eur) / justo_eur
        d = _limitar(desconto / p_pont["desconto_para_nota_maxima"])
    else:
        d = 0.0
    m = 1 - posicao_52s if posicao_52s is not None else 0.5
    preco = 0.5 * d + 0.5 * _limitar(m)

    wr, wc, wp = p_pont["peso_rendimento"], p_pont["peso_consistencia"], p_pont["peso_preco"]
    soma = (wr + wc + wp) or 1.0
    base = 100 * (wr * rend + wc * cons + wp * preco) / soma
    penal = p_pont["penalizacao_por_armadilha"] * len(lista_armadilhas)
    return {
        "total": round(_limitar(base - penal, 0, 100), 1),
        "rendimento": round(rend * 100, 1),
        "consistencia": round(cons * 100, 1),
        "preco": round(preco * 100, 1),
        "penalizacao": penal,
    }
