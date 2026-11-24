"""Interface única para fontes de dados de mercado.

Para juntar outra fonte (EODHD, FMP, Alpha Vantage…), basta criar uma classe nova
com estes métodos — o resto do código não precisa de mudar.
"""
from __future__ import annotations

import datetime as dt
from abc import ABC, abstractmethod

import pandas as pd


class Fornecedor(ABC):
    nome = "base"

    @abstractmethod
    def obter_historico(self, ticker: str, desde: dt.date | None = None) -> tuple[pd.DataFrame, pd.Series]:
        """Preços diários (high, low, close, adjclose) e dividendos (data ex → valor).

        `desde=None` = histórico completo.
        """

    def obter_precos(self, ticker: str, desde: dt.date | None = None) -> pd.DataFrame:
        return self.obter_historico(ticker, desde)[0]

    def obter_dividendos(self, ticker: str) -> pd.Series:
        return self.obter_historico(ticker)[1]

    @abstractmethod
    def obter_perfil(self, ticker: str) -> dict:
        """Nome, setor, país, moeda, preço atual, payout, próxima data ex-dividendo…"""

    @abstractmethod
    def obter_cambio(self, moeda: str) -> float | None:
        """Quantos EUR vale 1 unidade de `moeda` (ex.: USD → 0,91)."""

    def procurar(self, texto: str) -> list[dict]:
        """Pesquisa por nome/ticker. Devolve [{'simbolo', 'nome', 'bolsa', 'tipo'}]."""
        return []


class ErroFornecedor(Exception):
    """Erro ao obter dados (a ação é registada e o pipeline continua)."""
