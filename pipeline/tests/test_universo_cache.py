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


def test_cache_compacta_precos_sem_mudar_extremos(tmp_path):
    import datetime as dt

    import numpy as np
    import pandas as pd

    from radar.cache import Cache
    from radar.calculos.precos import extremos

    dias = pd.bdate_range("2000-01-03", "2026-11-20")
    rng = np.random.default_rng(1)
    close = pd.Series(50 * np.exp(np.cumsum(rng.normal(0, 0.01, len(dias)))), index=dias)
    df = pd.DataFrame({"high": close * 1.01, "low": close * 0.99, "close": close,
                       "adjclose": close * np.linspace(0.5, 1, len(dias))}, index=dias)
    c = Cache(tmp_path, None)
    hoje = dt.date(2026, 11, 24)
    comp = c._compactar(df, hoje)
    assert len(comp) < len(df) / 2
    a, b = extremos(df, hoje), extremos(comp, hoje)
    for janela in a:
        for k in a[janela]:
            assert abs(a[janela][k] - b[janela][k]) <= 1e-5 * abs(a[janela][k]), (janela, k)
    # os últimos 12 anos ficam com todos os dias
    assert (comp.index >= pd.Timestamp("2015-01-01")).sum() == (df.index >= pd.Timestamp("2015-01-01")).sum()


def test_cache_converte_formato_antigo(tmp_path):
    import datetime as dt

    import pandas as pd

    from radar.cache import Cache
    d = tmp_path / "KO"
    d.mkdir()
    idx = pd.bdate_range("2026-01-01", "2026-11-20")
    pd.DataFrame({"high": 1.0, "low": 1.0, "close": 1.0, "adjclose": 1.0}, index=idx).to_csv(d / "precos.csv", index_label="data")
    (d / "meta.json").write_text('{"ultima_atualizacao": "2026-11-24", "ultima_recarga_total": "2026-11-20"}')
    precos, _ = Cache(tmp_path, None).historico("KO", dt.date(2026, 11, 24))
    assert len(precos) == len(idx) and (d / "precos.csv.gz").exists() and not (d / "precos.csv").exists()
    Cache(tmp_path, None).apagar("KO")
    assert not d.exists()
