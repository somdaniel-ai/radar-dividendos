"""Categoria do instrumento: empresa, REIT, BDC, fundo fechado (CEF) ou ETF."""
from __future__ import annotations

import re

CATEGORIAS = {
    "EMPRESA": "Empresa",
    "REIT": "REIT (imobiliário)",
    "BDC": "BDC (crédito a empresas)",
    "CEF": "Fundo fechado (CEF)",
    "ETF": "ETF",
}

AVISO_CEF = ("Fundo fechado: a distribuição pode incluir devolução de capital (\"return of "
             "capital\") — parte do que recebe pode ser o seu próprio dinheiro devolvido, e "
             "não rendimento. Confirme a composição das distribuições no site do fundo.")

_CEF = re.compile(r"clos(?:e|ed)[- ]?end(?:ed)?")
_BDC = re.compile(r"business development compan")
_REIT = re.compile(r"real estate investment trust|\breit\b")
_NOME_FUNDO = re.compile(r"\b(fund|fonds|income trust)\b", re.I)


def detetar_categoria(tipo_universo: str | None, tipo_yahoo: str | None, industria: str | None,
                      descricao: str | None, nome: str | None) -> str:
    """Ordem: escolha manual no universo → ETF → BDC → CEF → REIT → empresa.

    O BDC vem antes do CEF porque os BDC também se descrevem como "closed-end".
    """
    t = (tipo_universo or "").upper()
    if t in CATEGORIAS and t != "EMPRESA":
        return t
    if t == "ETF" or (tipo_yahoo or "").upper() == "ETF":
        return "ETF"
    d = (descricao or "").lower()
    if _BDC.search(d):
        return "BDC"
    # "FUNDO" vem do Excel ("Fundos mais negociados") e nem sempre é um fundo (ex.: IEP é
    # uma holding): só conta se o Yahoo não disser outra coisa
    fundo_excel = t == "FUNDO" and (not d or (industria or "Asset Management") == "Asset Management")
    if _CEF.search(d) or fundo_excel or (tipo_yahoo or "").upper() == "MUTUALFUND":
        return "CEF"
    if (industria or "").upper().startswith("REIT") or _REIT.search(d):
        return "REIT"
    if not d and nome and _NOME_FUNDO.search(nome):
        return "CEF"
    return "EMPRESA"
