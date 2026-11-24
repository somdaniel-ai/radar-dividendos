"""Fornecedor Yahoo Finance (através da biblioteca `yfinance`).

Não é uma API oficial: usamos pausas entre pedidos e repetições com espera crescente.
"""
from __future__ import annotations

import datetime as dt
import logging
import time

import pandas as pd
import yfinance as yf

from .base import ErroFornecedor, Fornecedor

log = logging.getLogger(__name__)

# Moedas "pequenas" em que o Yahoo dá os preços (pence, agorot, cêntimos sul-africanos)
MOEDAS_CENTIMOS = {"GBp": "GBP", "GBX": "GBP", "ILA": "ILS", "ZAc": "ZAR"}


def _repetir(func, tentativas: int = 3, espera: float = 2.0):
    ultimo_erro = None
    for i in range(tentativas):
        try:
            return func()
        except Exception as e:  # noqa: BLE001 — qualquer erro de rede/servidor
            ultimo_erro = e
            log.warning("Tentativa %s falhou: %s", i + 1, e)
            time.sleep(espera * (2 ** i))
    raise ErroFornecedor(str(ultimo_erro))


def _data(epoch) -> dt.date | None:
    try:
        return dt.datetime.fromtimestamp(int(epoch), dt.UTC).date() if epoch else None
    except (TypeError, ValueError, OSError):
        return None


class Yahoo(Fornecedor):
    nome = "yahoo"

    def __init__(self, pausa: float = 0.4):
        self.pausa = pausa
        self._cambios: dict[str, float | None] = {}

    def _esperar(self):
        time.sleep(self.pausa)

    def obter_historico(self, ticker, desde=None):
        def pedir():
            t = yf.Ticker(ticker)
            if desde:
                return t.history(start=desde.isoformat(), interval="1d", auto_adjust=False, actions=True)
            return t.history(period="max", interval="1d", auto_adjust=False, actions=True)

        self._esperar()
        h = _repetir(pedir)
        if h is None or len(h) == 0:
            raise ErroFornecedor(f"Sem dados de preço para {ticker}")
        idx = pd.to_datetime(h.index)
        if idx.tz is not None:
            idx = idx.tz_localize(None)
        idx = idx.normalize()
        df = pd.DataFrame({
            "high": h["High"].values, "low": h["Low"].values,
            "close": h["Close"].values, "adjclose": h["Adj Close"].values,
        }, index=idx)
        df = df[~df.index.duplicated(keep="last")]
        div = pd.Series(h["Dividends"].values, index=idx)
        div = div[div > 0]
        splits = pd.Series(h["Stock Splits"].values, index=idx)
        df.attrs["tem_split"] = bool((splits > 0).any())
        return df, div

    def obter_perfil(self, ticker):
        self._esperar()
        info = _repetir(lambda: yf.Ticker(ticker).info) or {}
        var = info.get("regularMarketChangePercent")
        return {
            "nome": info.get("longName") or info.get("shortName"),
            "tipo_yahoo": info.get("quoteType"),
            "setor": info.get("sector"),
            "industria": info.get("industry"),
            "pais": info.get("country"),
            "bolsa": info.get("fullExchangeName") or info.get("exchange"),
            "moeda": info.get("currency"),
            "capitalizacao": info.get("marketCap") or info.get("totalAssets"),
            "preco": info.get("regularMarketPrice") or info.get("currentPrice"),
            "variacao_dia": var / 100 if var is not None else None,
            "payout": info.get("payoutRatio"),
            "proxima_ex": _data(info.get("exDividendDate")),
            "data_pagamento": _data(info.get("dividendDate")),
            "descricao": (info.get("longBusinessSummary") or "")[:1200] or None,
        }

    def obter_cambio(self, moeda):
        if not moeda:
            return None
        if moeda == "EUR":
            return 1.0
        if moeda in MOEDAS_CENTIMOS:
            base = self.obter_cambio(MOEDAS_CENTIMOS[moeda])
            return base / 100 if base else None
        if moeda not in self._cambios:
            try:
                self._esperar()
                h = _repetir(lambda: yf.Ticker(f"EUR{moeda}=X").history(period="10d"))
                ultimo = float(h["Close"].dropna().iloc[-1])
                self._cambios[moeda] = 1 / ultimo if ultimo else None
            except Exception as e:  # noqa: BLE001
                log.error("Câmbio %s indisponível: %s", moeda, e)
                self._cambios[moeda] = None
        return self._cambios[moeda]

    def procurar(self, texto):
        try:
            self._esperar()
            r = _repetir(lambda: yf.Search(texto, max_results=8, news_count=0).quotes, tentativas=2)
        except ErroFornecedor:
            return []
        return [{"simbolo": q.get("symbol"), "nome": q.get("longname") or q.get("shortname"),
                 "bolsa": q.get("exchange"), "tipo": q.get("quoteType")} for q in r or []]
