"""Junta todos os cálculos para um instrumento (sem acesso à internet)."""
from __future__ import annotations

import datetime as dt
import math

import pandas as pd

from .calculos import categoria, consistencia, frequencia, pagamentos, pontuacao, precos, rendimento


def _r(x, n=6):
    """Arredonda para o JSON (e troca NaN por None)."""
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return round(float(x), n)


def _data(d) -> str | None:
    if d is None or (isinstance(d, float) and math.isnan(d)):
        return None
    return pd.Timestamp(d).date().isoformat()


def _extras_manuais(div: pd.Series, extras: dict[str, float] | None) -> pd.Series:
    """Parte extraordinária declarada à mão de cada pagamento (aceita ±5 dias de diferença)."""
    parte = pd.Series(0.0, index=div.index)
    for d, v in (extras or {}).items():
        if len(div) == 0:
            break
        ts = pd.Timestamp(d)
        perto = div.index[abs((div.index - ts).days) <= 5]
        if len(perto):
            alvo = perto[abs((perto - ts).days).argmin()]
            parte[alvo] = min(v, float(div[alvo]))
    return parte


def analisar(base: dict, df_precos: pd.DataFrame, dividendos: pd.Series, perfil: dict,
             cambio_eur: float | None, hoje: dt.date, p: dict,
             extras_manuais: dict[str, float] | None = None, cotacao_xtb: dict | None = None) -> dict:
    """Calcula todas as métricas de um instrumento.

    `base` tem a identificação vinda do universo (ticker_xtb, ticker_yahoo, nome, tipo).
    `cambio_eur` = quantos EUR vale 1 unidade da moeda do instrumento (GBp já dividido por 100).
    `extras_manuais` = {data: valor} da parte extraordinária de pagamentos (extraordinarios.csv).
    `cotacao_xtb` = cotação da linha que existe na XTB quando os dados de rendimento vêm de
    outra bolsa (ex.: TU.US em USD, com dados de T.TO): {'simbolo','preco','moeda','variacao_dia','cambio_eur'}.
    Devolve {'resumo': {...}, 'detalhe': {...}}.
    """
    pf, pp, pc, pt = p["frequencia"], p["preco"], p["consistencia"], p["pontuacao"]

    div = frequencia.limpar_dividendos(dividendos)
    # 1) extras declarados à mão: separa a parte extra do pagamento
    parte_manual = _extras_manuais(div, extras_manuais)
    base_div = (div - parte_manual)
    base_div = base_div[base_div > 1e-9]
    # 2) extras pelo valor (> 2× a mediana dos vizinhos)
    extra = frequencia.marcar_extraordinarios(base_div, pf["fator_extraordinario"], pf["janela_extraordinario"])
    # 3) extras pela contagem (pagamentos a mais num ano, fora do ritmo)
    if pf.get("extra_por_contagem", True):
        cand = base_div[~extra]
        f0 = frequencia.detetar_frequencia(cand, pf)
        por_contagem = frequencia.marcar_excesso_no_ano(cand, f0["pagamentos_ano"], f0["mediana_intervalo"],
                                                        pf["fracao_intervalo_fora_ritmo"])
        extra = extra | por_contagem.reindex(extra.index, fill_value=False)
    normais = base_div[~extra] if pf["excluir_extraordinarios"] else div
    freq = frequencia.detetar_frequencia(normais, pf)
    # parte extraordinária de cada pagamento (para o histórico e para o TTM)
    parte_extra = parte_manual.add(base_div[extra], fill_value=0.0).reindex(div.index, fill_value=0.0)
    tem_extra = parte_extra > 1e-9

    cat = categoria.detetar_categoria(base.get("tipo"), perfil.get("tipo_yahoo"), perfil.get("industria"),
                                      perfil.get("descricao"), perfil.get("nome") or base.get("nome"))
    avisos = []
    if cat == "CEF":
        avisos.append({"codigo": "devolucao_capital", "texto": categoria.AVISO_CEF})

    preco = perfil.get("preco")
    if preco is None and df_precos is not None and len(df_precos):
        preco = float(df_precos["close"].dropna().iloc[-1])
    fx = cambio_eur
    preco_eur = preco * fx if (preco is not None and fx) else None

    da = rendimento.dividendo_anual(normais, div, freq["pagamentos_ano"], hoje,
                                    p["rendimento"]["metodo_dividendo_anual"])
    anual_eur = da["anual"] * fx if fx else None
    imposto = rendimento.taxa_imposto(perfil.get("pais"), p["impostos"])
    y = rendimento.yields(anual_eur or 0.0, preco_eur, imposto["taxa"])
    if not imposto["conhecida"]:
        avisos.append({"codigo": "imposto_pais", "texto": f"Sem taxa de retenção definida para "
                       f"{perfil.get('pais') or 'este país'}: foi usado só o imposto português."})

    # cotação na XTB (para a carteira): igual à principal, exceto quando os dados vêm de outra bolsa
    if cotacao_xtb and cotacao_xtb.get("preco") is not None:
        cx = dict(cotacao_xtb)
    else:
        cx = {"simbolo": base["ticker_yahoo"], "preco": preco, "moeda": perfil.get("moeda"),
              "variacao_dia": perfil.get("variacao_dia"), "cambio_eur": fx}
    cx["preco_eur"] = cx["preco"] * cx["cambio_eur"] if (cx.get("preco") is not None and cx.get("cambio_eur")) else None

    justo = precos.preco_justo(da["anual"], pp["yield_alvo"])
    justo_eur = justo * fx if (justo and fx) else None
    ext = precos.extremos(df_precos, hoje)
    pos = precos.posicoes(preco, ext, pp["usar_precos_ajustados"])
    var12 = precos.variacao_12m(df_precos, hoje)

    ultima = normais.index[-1].date() if len(normais) else None
    prox = pagamentos.proximo_pagamento(ultima, freq["pagamentos_ano"], freq["mediana_intervalo"], hoje)
    prox_ex = perfil.get("proxima_ex")
    atrasado = pagamentos.esta_atrasado(prox["dias_para_pagamento"], freq["mediana_intervalo"],
                                        p["pagamentos"], prox_ex, hoje)
    tend = pagamentos.tendencia(normais, p["pagamentos"]["tolerancia_igual"])

    met = consistencia.metricas(normais, hoje.year, pc)
    sem_dados = preco is None or not fx or len(div) == 0
    niv = consistencia.nivel(met, freq["pagamentos_ano"], atrasado, sem_dados, pc)

    arm = pontuacao.armadilhas(y["liquido"], perfil.get("payout"), var12, atrasado, pt, cat)
    bat = pontuacao.fora_batentes(y["liquido"], pt)
    pont = pontuacao.pontuacao(y["liquido"], niv["nivel"], met, preco_eur, justo_eur, pos.get("52s"), arm, pt)

    limite = pd.Timestamp(hoje) - pd.DateOffset(months=p["universo"]["meses_sem_dividendo_para_excluir"])
    pagou_recente = bool(len(div) and div.index[-1] > limite)

    resumo = {
        "ticker": base["ticker_xtb"],
        "ticker_yahoo": base["ticker_yahoo"],
        "nome": perfil.get("nome") or base.get("nome"),
        "tipo": base.get("tipo"),
        "tipo_yahoo": perfil.get("tipo_yahoo"),
        "categoria": cat,
        "categoria_nome": categoria.CATEGORIAS[cat],
        "avisos": avisos,
        "setor": perfil.get("setor"),
        "industria": perfil.get("industria"),
        "pais": perfil.get("pais"),
        "bolsa": perfil.get("bolsa"),
        "moeda": perfil.get("moeda"),
        "capitalizacao": perfil.get("capitalizacao"),
        "cambio_eur": _r(fx, 8),
        "preco": _r(preco),
        "preco_eur": _r(preco_eur),
        "variacao_dia": _r(perfil.get("variacao_dia")),
        "variacao_12m": _r(var12),
        "cotacao_xtb": {"simbolo": cx.get("simbolo"), "preco": _r(cx.get("preco")), "moeda": cx.get("moeda"),
                        "variacao_dia": _r(cx.get("variacao_dia")), "cambio_eur": _r(cx.get("cambio_eur"), 8),
                        "preco_eur": _r(cx.get("preco_eur"))},
        "dividendo": {
            "ultimo": _r(da["ultimo"]),
            "ultimo_data": _data(ultima),
            "anual": _r(da["anual"]),
            "anual_eur": _r(anual_eur),
            "ttm": _r(da["ttm"]),
            "ttm_eur": _r(da["ttm"] * fx) if fx else None,
            "ttm_total": _r(da["ttm_total"]),
            "metodo": da["metodo_usado"],
            "num_extraordinarios": int(tem_extra.sum()),
            "ultimo_extraordinario": _data(div[tem_extra].index[-1]) if tem_extra.any() else None,
        },
        "frequencia": freq["nome"],
        "pagamentos_ano": freq["pagamentos_ano"],
        "intervalo_mediano_dias": _r(freq["mediana_intervalo"], 1),
        "imposto": {"taxa": _r(imposto["taxa"], 4), "retencao": _r(imposto["retencao"], 4),
                    "conhecida": imposto["conhecida"]},
        "yield": {"bruto": _r(y["bruto"]), "mensal": _r(y["mensal"]), "liquido": _r(y["liquido"])},
        "preco_justo": _r(justo),
        "preco_justo_eur": _r(justo_eur),
        "abaixo_preco_justo": bool(preco is not None and justo and preco < justo),
        "extremos": {k: ({kk: _r(vv) for kk, vv in v.items()} if v else None) for k, v in ext.items()},
        "posicao": {k: _r(v, 4) for k, v in pos.items()},
        "payout": _r(perfil.get("payout"), 4),
        "pagamento": {
            "ultimo_ex": _data(ultima),
            "esperado": _data(prox["esperado"]),
            "dias_para_pagamento": prox["dias_para_pagamento"],
            "atrasado": atrasado,
            "proxima_ex_anunciada": _data(prox_ex),
            "data_pagamento": _data(perfil.get("data_pagamento")),
        },
        "tendencia": tend,
        "consistencia": {k: (_r(v, 4) if isinstance(v, float) else v)
                         for k, v in met.items() if k != "valores_anuais"},
        # valores anuais comparáveis (para a app recalcular a consistência com outros limites)
        "valores_anuais": met["valores_anuais"],
        "ano_referencia": hoje.year,
        "nivel": niv,
        "armadilhas": arm,
        "fora_batentes": bat,
        "pontuacao": pont,
        "pagou_recentemente": pagou_recente,
    }

    detalhe = {
        **resumo,
        "descricao": (perfil.get("descricao") or None),
        "historico_dividendos": [
            {"data": _data(d), "valor": _r(v), "extraordinario": bool(parte_extra[d] > 1e-9),
             "parte_extraordinaria": _r(parte_extra[d])}
            for d, v in div.items()
        ],
        "valores_anuais": met["valores_anuais"],
        "precos": _serie_precos(df_precos, hoje),
    }
    return {"resumo": resumo, "detalhe": detalhe}


def _serie_precos(df: pd.DataFrame, hoje: dt.date) -> dict:
    """Preços resumidos para gráficos: semanais (5 anos) e mensais (desde sempre)."""
    if df is None or len(df) == 0:
        return {"semanal": [], "mensal": []}
    c = df["close"].dropna()
    sem = c[c.index > pd.Timestamp(hoje) - pd.Timedelta(days=5 * 365)].resample("W-FRI").last().dropna()
    mes = c.resample("ME").last().dropna()
    return {
        "semanal": [[_data(d), _r(v, 4)] for d, v in sem.items()],
        "mensal": [[_data(d), _r(v, 4)] for d, v in mes.items()],
    }
