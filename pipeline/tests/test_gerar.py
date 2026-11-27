"""Testa o programa principal sem internet (fornecedor de mentira)."""
import datetime as dt
import json
from zoneinfo import ZoneInfo

import pandas as pd

from radar import gerar
from radar.fornecedores import ErroFornecedor, Fornecedor

LISBOA = ZoneInfo("Europe/Lisbon")


class Falso(Fornecedor):
    nome = "falso"

    def __init__(self, preco=10.0, falhar=()):
        self.preco = preco
        self.falhar = set(falhar)

    def obter_historico(self, ticker, desde=None):
        if ticker in self.falhar:
            raise ErroFornecedor("Yahoo em baixo")
        idx = pd.bdate_range(desde or "2018-01-02", "2026-11-24")
        df = pd.DataFrame({"high": self.preco, "low": self.preco, "close": self.preco,
                           "adjclose": self.preco}, index=idx)
        datas = pd.date_range("2018-03-15", "2026-09-15", freq="3MS") + pd.Timedelta(days=14)
        div = pd.Series(0.2, index=datas)
        return df, div[div.index >= pd.Timestamp(desde or "1900-01-01")]

    def obter_perfil(self, ticker):
        if ticker in self.falhar:
            raise ErroFornecedor("Yahoo em baixo")
        return {"nome": ticker, "moeda": "USD", "pais": "United States", "preco": self.preco}

    def obter_cambio(self, moeda):
        return 0.9


def _universo(pasta):
    pasta.mkdir()
    (pasta / "sufixos.csv").write_text("sufixo_xtb,sufixo_yahoo\n.US,\n", encoding="utf-8")
    (pasta / "universo_xtb.csv").write_text(
        "ticker_xtb,nome,tipo,ativo,ticker_yahoo\nAAA.US,A,ACAO,sim,\nBBB.US,B,ACAO,sim,\nCCC.US,C,ACAO,sim,\n",
        encoding="utf-8")
    return pasta


def _radar(saida):
    return {a["ticker"]: a for a in json.loads((saida / "radar.json").read_text(encoding="utf-8"))["acoes"]}


def test_atualizacao_parcial_junta_ao_radar_existente(tmp_path):
    uni = _universo(tmp_path / "universo")
    saida, cache = tmp_path / "data", tmp_path / "cache"
    dia1 = dt.datetime(2026, 11, 24, 3, 0, tzinfo=LISBOA)
    dia2 = dt.datetime(2026, 11, 25, 3, 0, tzinfo=LISBOA)

    meta = gerar.executar(saida, fornecedor=Falso(10.0), pasta_cache=cache, pasta_universo=uni, agora=dia1)
    assert meta["total_radar"] == 3 and meta["tipo_atualizacao"] == "completa"
    antes = _radar(saida)

    # atualização parcial só de AAA, com novo preço
    meta = gerar.executar(saida, tickers=["AAA.US"], fornecedor=Falso(8.0), pasta_cache=cache / "2",
                          pasta_universo=uni, agora=dia2)
    depois = _radar(saida)
    assert meta["tipo_atualizacao"] == "parcial"
    assert meta["total_radar"] == 3 and set(depois) == {"AAA.US", "BBB.US", "CCC.US"}
    assert meta["atualizados_nesta_execucao"] == 1
    assert depois["AAA.US"]["preco"] == 8.0
    assert depois["BBB.US"] == {**antes["BBB.US"], "posicao_ranking": depois["BBB.US"]["posicao_ranking"]}
    assert meta["ultima_atualizacao_completa"] == dia1.isoformat(timespec="seconds")
    assert sorted(r["posicao_ranking"] for r in depois.values()) == [1, 2, 3]
    assert (saida / "acoes" / "BBB.US.json").exists()


def test_acao_com_erro_mantem_versao_anterior(tmp_path):
    uni = _universo(tmp_path / "universo")
    saida = tmp_path / "data"
    dia1 = dt.datetime(2026, 11, 24, 3, 0, tzinfo=LISBOA)
    dia2 = dt.datetime(2026, 11, 25, 3, 0, tzinfo=LISBOA)
    gerar.executar(saida, fornecedor=Falso(), pasta_cache=tmp_path / "c1", pasta_universo=uni, agora=dia1)
    meta = gerar.executar(saida, fornecedor=Falso(falhar={"BBB"}), pasta_cache=tmp_path / "c2",
                          pasta_universo=uni, agora=dia2)
    r = _radar(saida)
    assert meta["total_radar"] == 3 and [e["ticker"] for e in meta["erros"]] == ["BBB.US"]
    assert r["BBB.US"]["desatualizado"] is True and r["AAA.US"]["desatualizado"] is False


class ComETF(Falso):
    """AAA e BBB são ETF; o Yahoo só tem a composição de AAA."""

    def __init__(self):
        super().__init__()
        self.pedidos = []

    def obter_perfil(self, ticker):
        return {**super().obter_perfil(ticker), "tipo_yahoo": "ETF" if ticker in ("AAA", "BBB") else "EQUITY"}

    def obter_composicao(self, ticker):
        self.pedidos.append(ticker)
        if ticker != "AAA":
            return {"disponivel": False, "posicoes": [], "setores": [], "ter": None}
        return {"disponivel": True, "posicoes": [{"simbolo": "MSFT", "nome": "Microsoft", "peso": 0.07}],
                "setores": [{"setor": "Technology", "peso": 0.3}, {"setor": "Real Estate", "peso": 0.1}], "ter": 0.0007}


def test_composicao_dos_etf(tmp_path, monkeypatch):
    uni = _universo(tmp_path / "universo")
    saida, cache = tmp_path / "data", tmp_path / "cache"
    f = ComETF()
    dia1 = dt.datetime(2026, 11, 24, 3, 0, tzinfo=LISBOA)
    gerar.executar(saida, fornecedor=f, pasta_cache=cache, pasta_universo=uni, agora=dia1)
    a = json.loads((saida / "acoes" / "AAA.US.json").read_text(encoding="utf-8"))["composicao"]
    assert a["disponivel"] and a["ter"] == 0.0007 and a["posicoes"][0]["nome"] == "Microsoft"
    assert [x["setor"] for x in a["setores"]] == ["Tecnologia", "Imobiliário"]  # em português
    b = json.loads((saida / "acoes" / "BBB.US.json").read_text(encoding="utf-8"))["composicao"]
    assert b["disponivel"] is False
    assert "composicao" not in json.loads((saida / "acoes" / "CCC.US.json").read_text(encoding="utf-8"))  # não é ETF
    assert sorted(f.pedidos) == ["AAA", "BBB"]

    # dentro de 30 dias usa a cópia guardada; depois pede outra vez
    f.pedidos.clear()
    gerar.executar(saida, fornecedor=f, pasta_cache=cache, pasta_universo=uni, agora=dia1 + dt.timedelta(days=10))
    assert f.pedidos == []
    gerar.executar(saida, fornecedor=f, pasta_cache=cache, pasta_universo=uni, agora=dia1 + dt.timedelta(days=31))
    assert sorted(f.pedidos) == ["AAA", "BBB"]

    # limite de pedidos novos por noite
    monkeypatch.setattr(gerar, "LIMITE_COMPOSICOES", 1)
    f.pedidos.clear()
    gerar.executar(saida, fornecedor=f, pasta_cache=tmp_path / "cache2", pasta_universo=uni, agora=dia1)
    assert len(f.pedidos) == 1
