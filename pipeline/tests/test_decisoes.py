"""Decisões sobre extraordinários lidas da conta (Supabase), sem internet."""
import datetime as dt

from radar import decisoes as dec
from radar import gerar
from tests.test_agenda import DIA, Fornecedor
from tests.test_gerar import _universo


class Resposta:
    def __init__(self, codigo, dados):
        self.status_code, self._dados = codigo, dados

    def json(self):
        return self._dados


class Sessao:
    def __init__(self, resposta=None, erro=None):
        self.resposta, self.erro, self.pedidos = resposta, erro, []

    def post(self, url, **k):
        self.pedidos.append((url, k))
        if self.erro:
            raise self.erro
        return self.resposta


def test_sem_chave_nao_pede_nada():
    s = Sessao()
    assert dec.ler_da_conta("", sessao=s) is None
    assert s.pedidos == []


def test_le_so_a_funcao_com_a_chave_publicavel():
    s = Sessao(Resposta(200, [{"ticker": "nos.pt", "data": "2026-05-06", "decisao": "confirmar", "valor_extra": "0.1"}]))
    linhas = dec.ler_da_conta("x" * 64, sessao=s)
    assert linhas == [{"ticker": "NOS.PT", "data": "2026-05-06", "decisao": "confirmar", "valor_extra": 0.1}]
    url, k = s.pedidos[0]
    assert url.endswith("/rest/v1/rpc/decisoes_motor")
    assert k["headers"]["apikey"].startswith("sb_publishable_")
    assert k["json"] == {"chave": "x" * 64}


def test_erros_nao_param_o_motor_nem_mostram_a_chave(caplog):
    chave = "segredo" * 9
    assert dec.ler_da_conta(chave, sessao=Sessao(Resposta(401, {"message": "chave inválida"}))) is None
    assert dec.ler_da_conta(chave, sessao=Sessao(erro=ConnectionError(chave))) is None
    assert chave not in caplog.text


def test_juntar_a_conta_ganha():
    extras = {"NOS.PT": {"2023-04-19": 0.152, "2025-04-22": 0.05}}
    rej = {"KO.US": ["2024-01-01"]}
    conta = [
        {"ticker": "NOS.PT", "data": "2025-04-22", "decisao": "rejeitar", "valor_extra": 0},
        {"ticker": "KO.US", "data": "2024-01-01", "decisao": "confirmar", "valor_extra": 0.2},
        {"ticker": "TU.US", "data": "2026-03-01", "decisao": "rejeitar", "valor_extra": 0},
    ]
    e, r = dec.juntar(extras, rej, conta)
    assert e == {"NOS.PT": {"2023-04-19": 0.152}, "KO.US": {"2024-01-01": 0.2}}
    assert r == {"KO.US": [], "NOS.PT": ["2025-04-22"], "TU.US": ["2026-03-01"]}
    assert extras == {"NOS.PT": {"2023-04-19": 0.152, "2025-04-22": 0.05}}  # o original não muda
    assert dec.juntar(extras, rej, None) == (extras, rej)


def test_motor_usa_as_decisoes_e_da_prioridade_as_novas(tmp_path, monkeypatch):
    uni = _universo(tmp_path / "universo")
    saida, cache = tmp_path / "data", tmp_path / "cache"
    conta = [{"ticker": "BBB.US", "data": "2026-06-01", "decisao": "confirmar", "valor_extra": 0.05}]
    monkeypatch.setattr(dec, "ler_da_conta", lambda: conta)
    vistos = {}
    original = gerar.analisar

    def espiar(item, *a, **k):
        vistos[item["ticker_xtb"]] = a[6]  # extras_manuais
        return original(item, *a, **k)
    monkeypatch.setattr(gerar, "analisar", espiar)

    gerar.executar(saida, fornecedor=Fornecedor(), pasta_cache=cache, pasta_universo=uni, agora=DIA)
    assert vistos["BBB.US"] == {"2026-06-01": 0.05}

    # sem tempo para nada: a decisão nova fica por aplicar (volta a ir à frente na próxima noite)
    conta.append({"ticker": "AAA.US", "data": "2026-06-01", "decisao": "rejeitar", "valor_extra": 0})
    meta = gerar.executar(saida, fornecedor=Fornecedor(), pasta_cache=cache, pasta_universo=uni,
                          agora=DIA + dt.timedelta(days=1), minutos=0)
    ass = meta["decisoes_conta"]["assinaturas"]
    assert "BBB.US" in ass and "AAA.US" not in ass
    assert meta["decisoes_conta"] == {**meta["decisoes_conta"], "lidas": True, "total": 2}

    # na noite seguinte o AAA.US é o primeiro a ser processado
    vistos.clear()
    meta = gerar.executar(saida, fornecedor=Fornecedor(), pasta_cache=cache, pasta_universo=uni,
                          agora=DIA + dt.timedelta(days=2))
    assert next(iter(vistos)) == "AAA.US"
    assert "AAA.US" in meta["decisoes_conta"]["assinaturas"]
