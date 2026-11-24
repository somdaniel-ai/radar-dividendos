"""6.2 Dividendo anual, yield e impostos."""
from __future__ import annotations

import datetime as dt

import pandas as pd


def dividendo_anual(div_normais: pd.Series, div_todos: pd.Series, pagamentos_ano: int,
                    hoje: dt.date, metodo: str = "ultimo") -> dict:
    """Dividendo anual na moeda do instrumento.

    - `ultimo`: último dividendo normal × pagamentos por ano (método do Excel).
    - `ttm`: soma dos dividendos normais dos últimos 12 meses.
    Para frequência irregular usa-se sempre o TTM (não há "pagamentos por ano" fixo).
    """
    if len(div_normais) == 0:
        return {"ultimo": None, "ttm": 0.0, "ttm_total": 0.0, "anual": 0.0, "metodo_usado": metodo}
    fim = pd.Timestamp(hoje)
    inicio = fim - pd.Timedelta(days=365)
    ttm = float(div_normais[(div_normais.index > inicio) & (div_normais.index <= fim)].sum())
    ttm_total = float(div_todos[(div_todos.index > inicio) & (div_todos.index <= fim)].sum())
    ultimo = float(div_normais.iloc[-1])
    if metodo == "ultimo" and pagamentos_ano > 0:
        anual, usado = ultimo * pagamentos_ano, "ultimo"
    else:
        anual, usado = ttm, "ttm"
    return {"ultimo": ultimo, "ttm": ttm, "ttm_total": ttm_total, "anual": anual, "metodo_usado": usado}


def taxa_imposto(pais: str | None, p_impostos: dict) -> dict:
    """Taxa total de imposto sobre os dividendos e explicação.

    Modo simples: taxa única (30% por defeito, como no Excel).
    Modo avançado: retenção na fonte do país + imposto em Portugal, descontando
    (crédito) a retenção até ao limite da convenção:
        total = retenção + max(0, taxa_PT − min(retenção, crédito_máx))
    """
    if p_impostos["modo"] != "avancado":
        return {"taxa": p_impostos["taxa_simples"], "retencao": None, "conhecida": True}
    taxa_pt = p_impostos["taxa_portugal"]
    if pais == "Portugal":
        return {"taxa": taxa_pt, "retencao": taxa_pt, "conhecida": True}
    cfg = p_impostos["por_pais"].get(pais or "")
    if not cfg:
        # País sem taxa definida: assume só o imposto português (avisar o utilizador)
        return {"taxa": taxa_pt, "retencao": None, "conhecida": False}
    ret = cfg["retencao"]
    if p_impostos.get("w8ben_ativo") and "retencao_w8ben" in cfg:
        ret = cfg["retencao_w8ben"]
    credito = min(ret, cfg.get("credito_max", ret))
    return {"taxa": ret + max(0.0, taxa_pt - credito), "retencao": ret, "conhecida": True}


def yields(dividendo_anual_eur: float, preco_eur: float | None, taxa: float) -> dict:
    if not preco_eur or preco_eur <= 0:
        return {"bruto": None, "mensal": None, "liquido": None}
    bruto = dividendo_anual_eur / preco_eur
    return {"bruto": bruto, "mensal": bruto / 12, "liquido": bruto * (1 - taxa)}
