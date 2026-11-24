import datetime as dt

import pandas as pd

from radar import universo as uni
from radar.cache import Cache
from radar.fornecedores import ErroFornecedor, Fornecedor

SUF = {".US": "", ".UK": ".L", ".PT": ".LS", ".DE": ".DE", ".FR": ".PA"}


def test_converter_simbolos():
    assert uni.converter("CABO.US", SUF) == "CABO"
    assert uni.converter("ABDN.UK", SUF) == "ABDN.L"
    assert uni.converter("NOS.PT", SUF) == "NOS.LS"
    assert uni.converter("XYZ.ZZ", SUF) is None
    assert uni.converter("TU.US", SUF, {"TU.US": "T.TO"}) == "T.TO"


def test_sufixos_do_projeto():
    s = uni.ler_sufixos()
    assert s[".US"] == "" and s[".UK"] == ".L" and s[".PT"] == ".LS" and s[".CZ"] == ".PR"


class Falso(Fornecedor):
    """Fornecedor de mentira para testar a cache sem internet."""

    def __init__(self):
        self.pedidos = []
        self.dividendos = [("2025-03-01", 1.0)]

    def obter_historico(self, ticker, desde=None):
        self.pedidos.append(desde)
        if ticker == "NADA":
            raise ErroFornecedor("sem dados")
        idx = pd.bdate_range(desde or "2025-01-01", "2025-06-30")
        df = pd.DataFrame({"high": 1.0, "low": 1.0, "close": 1.0, "adjclose": 1.0}, index=idx)
        d = pd.Series([v for _, v in self.dividendos], index=pd.to_datetime([x for x, _ in self.dividendos]))
        return df, d[d.index >= pd.Timestamp(desde or "1900-01-01")]

    def obter_perfil(self, ticker):
        return {"nome": ticker}

    def obter_cambio(self, moeda):
        return 1.0


def test_cache_incremental(tmp_path):
    f = Falso()
    c = Cache(tmp_path, f)
    c.historico("X", dt.date(2025, 7, 1))
    assert f.pedidos == [None]  # 1.ª vez: tudo
    c.historico("X", dt.date(2025, 7, 1))
    assert len(f.pedidos) == 1  # mesmo dia: usa a cache
    c.historico("X", dt.date(2025, 7, 2))
    assert f.pedidos[-1] is not None  # dia seguinte: só os últimos dias
    f.dividendos.append(("2025-06-27", 1.0))
    _, div = c.historico("X", dt.date(2025, 7, 3))
    assert f.pedidos[-1] is None and len(div) == 2  # dividendo novo → recarga total
