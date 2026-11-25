"""Triagem, agenda noturna, limite de tempo e bloqueios do Yahoo (sem internet)."""
import datetime as dt
import json

import pandas as pd

from radar import gerar
from radar.agenda import Triagem
from radar.fornecedores import Bloqueado
from tests.test_gerar import LISBOA, Falso, _radar, _universo

DIA = dt.datetime(2026, 11, 24, 3, 0, tzinfo=LISBOA)


def _xtb(*linhas):
    """Instrumentos como vêm da lista oficial da XTB."""
    return [{"ticker_xtb": t, "nome": n, "isin": isin, "moeda": "USD", "tipo": "ACAO", "distribuicao": "",
             "so_fecho": ""} for t, n, isin in linhas]


class Fornecedor(Falso):
    """AAA/BBB/CCC (lista manual) pagam; XSEM não paga; ENB.TO não existe; conta os pedidos."""

    def __init__(self, sem_div=("XSEM",), inexistentes=("ENB.TO",), bloquear=False):
        super().__init__(10.0, falhar=inexistentes)
        self.sem_div = set(sem_div)
        self.bloquear = bloquear
        self.pedidos = []

    def obter_historico(self, ticker, desde=None):
        self.pedidos.append((ticker, desde))
        if self.bloquear:
            raise Bloqueado("Too Many Requests")
        df, div = super().obter_historico(ticker, desde)
        if ticker in self.sem_div:
            div = pd.Series(0.2, index=pd.DatetimeIndex(["2019-03-01"]))  # o último foi há anos
        return df, div


def test_ordem_da_agenda(tmp_path):
    hoje = dt.date(2026, 11, 24)
    tr = Triagem(tmp_path)
    tr.marcar("R1", "dividendos", hoje)
    tr.marcar("R2", "dividendos", hoje)
    tr.marcar("S_VELHO", "sem_dividendos", hoje - dt.timedelta(days=61))
    tr.marcar("S_NOVO", "sem_dividendos", hoje - dt.timedelta(days=5))
    tr.marcar("E", "erro", hoje - dt.timedelta(days=1), erro="x")
    itens = [{"ticker_xtb": t, "origem": o} for t, o in (
        ("N_XTB", "xtb"), ("S_VELHO", "xtb"), ("S_NOVO", "xtb"), ("R1", "manual"), ("R2", "xtb"),
        ("N_MANUAL", "manual"), ("E", "xtb"))]
    ordem = [i["ticker_xtb"] for i in tr.ordem(itens, hoje, {"R1": "2026-11-23", "R2": "2026-11-20"})]
    # radar (mais antigo primeiro) → novos (manual primeiro) → a rever; S_NOVO ainda não é altura
    assert ordem == ["R2", "R1", "N_MANUAL", "N_XTB", "S_VELHO", "E"]  # a rever: verificação mais antiga primeiro
    tr.guardar()
    assert Triagem(tmp_path).estado("R1") == "dividendos"


def test_triagem_lista_xtb(tmp_path):
    uni = _universo(tmp_path / "universo")
    saida, cache = tmp_path / "data", tmp_path / "cache"
    lista = _xtb(("XSEM.US", "Sem Div", "US0000000001"), ("ENB.US", "Enbridge", "CA29250N1050"))
    f = Fornecedor()
    meta = gerar.executar(saida, fornecedor=f, pasta_cache=cache, pasta_universo=uni, agora=DIA, lista_xtb=lista)
    radar = _radar(saida)
    assert set(radar) == {"AAA.US", "BBB.US", "CCC.US", "ENB.US"}
    # sem dividendos: só um pedido leve (2 anos), nada guardado em cache, fora do radar
    assert [d for t, d in f.pedidos if t == "XSEM"] == [dt.date(2024, 10, 11)]
    assert not (cache / "XSEM").exists()
    # canadiana: tentou Toronto, que não existe → ficou com a linha de Nova Iorque
    assert radar["ENB.US"]["ticker_yahoo"] == "ENB"
    t = json.loads((cache / "triagem.json").read_text(encoding="utf-8"))["instrumentos"]
    assert t["XSEM.US"]["estado"] == "sem_dividendos" and t["ENB.US"]["ticker_yahoo"] == "ENB"
    assert meta["triagem"]["estados"] == {"dividendos": 4, "sem_dividendos": 1}
    assert meta["sem_dividendos_recentes"] == []  # só se listam os da lista manual
    assert meta["universo"]["total"] == 5

    # no dia seguinte, XSEM não é verificado outra vez (só daqui a 60 dias); ENB.TO não é tentado
    f2 = Fornecedor()
    gerar.executar(saida, fornecedor=f2, pasta_cache=cache, pasta_universo=uni,
                   agora=DIA + dt.timedelta(days=1), lista_xtb=lista)
    assert not any(t in ("XSEM", "ENB.TO") for t, _ in f2.pedidos)
    f3 = Fornecedor()
    gerar.executar(saida, fornecedor=f3, pasta_cache=cache, pasta_universo=uni,
                   agora=DIA + dt.timedelta(days=61), lista_xtb=lista)
    assert any(t == "XSEM" for t, _ in f3.pedidos)


def test_tempo_esgotado_mantem_radar(tmp_path):
    uni = _universo(tmp_path / "universo")
    saida, cache = tmp_path / "data", tmp_path / "cache"
    gerar.executar(saida, fornecedor=Fornecedor(), pasta_cache=cache, pasta_universo=uni, agora=DIA)
    antes = _radar(saida)
    meta = gerar.executar(saida, fornecedor=Fornecedor(), pasta_cache=cache, pasta_universo=uni,
                          agora=DIA + dt.timedelta(days=3), minutos=0)
    depois = _radar(saida)
    assert meta["triagem"]["interrompido"] == "tempo" and meta["tipo_atualizacao"] == "parcial"
    assert meta["triagem"]["por_processar"] == 3
    assert set(depois) == set(antes) and all(a["desatualizado"] for a in depois.values())  # 3 dias sem atualizar
    assert (saida / "acoes" / "AAA.US.json").exists()


def test_bloqueio_do_yahoo_para_sem_estragar(tmp_path):
    uni = _universo(tmp_path / "universo")
    saida, cache = tmp_path / "data", tmp_path / "cache"
    gerar.executar(saida, fornecedor=Fornecedor(), pasta_cache=cache, pasta_universo=uni, agora=DIA)
    f = Fornecedor(bloquear=True)
    meta = gerar.executar(saida, fornecedor=f, pasta_cache=cache, pasta_universo=uni,
                          agora=DIA + dt.timedelta(days=1), pausa_bloqueio=0)
    assert meta["triagem"]["interrompido"] == "bloqueio"
    assert len(f.pedidos) == 3  # 3 tentativas e parou
    assert set(_radar(saida)) == {"AAA.US", "BBB.US", "CCC.US"}  # o radar fica como estava
    t = json.loads((cache / "triagem.json").read_text(encoding="utf-8"))["instrumentos"]
    assert all(v["estado"] == "dividendos" for v in t.values())  # o bloqueio não muda a triagem


def test_saude_da_atualizacao_noturna(tmp_path, monkeypatch):
    uni = _universo(tmp_path / "universo")
    saida, cache = tmp_path / "data", tmp_path / "cache"
    corre = lambda dias, **k: gerar.executar(saida, pasta_cache=cache, pasta_universo=uni,  # noqa: E731
                                             agora=DIA + dt.timedelta(days=dias), pausa_bloqueio=0, **k)
    monkeypatch.setenv("RADAR_EXECUCAO", "noturna")
    meta = corre(0, fornecedor=Fornecedor())
    assert meta["noites_com_problemas"] == 0 and meta["ultima_noite_ok"].startswith(DIA.date().isoformat())
    # duas noites seguidas bloqueadas pelo Yahoo: conta 2 e a última noite boa não avança
    meta = corre(1, fornecedor=Fornecedor(bloquear=True))
    meta = corre(2, fornecedor=Fornecedor(bloquear=True))
    assert meta["noites_com_problemas"] == 2 and meta["ultima_noite_ok"].startswith(DIA.date().isoformat())
    # uma atualização curta (depois de alterar o código) não conta como noite
    monkeypatch.setenv("RADAR_EXECUCAO", "curta")
    assert corre(2, fornecedor=Fornecedor())["noites_com_problemas"] == 2
    # a noite seguinte corre bem: volta a zero
    monkeypatch.setenv("RADAR_EXECUCAO", "noturna")
    meta = corre(3, fornecedor=Fornecedor())
    assert meta["noites_com_problemas"] == 0 and meta["ultima_noite_ok"].startswith((DIA + dt.timedelta(days=3)).date().isoformat())
