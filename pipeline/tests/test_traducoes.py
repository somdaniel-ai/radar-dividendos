from radar.traducoes import CacheTraducoes, Termos, Tradutor


def test_termos_fixos_e_em_falta():
    t = Termos()
    assert t.setor("Real Estate") == "Imobiliário"
    assert t.setor("Financial Services") == "Serviços Financeiros"
    assert t.industria("REIT - Mortgage") == "REIT - Hipotecário"
    assert t.pais("United States") == "Estados Unidos"
    assert t.tipo("EQUITY") == "Ação"
    assert t.industria("Space Mining") == "Space Mining"  # desconhecido: fica em inglês…
    assert t.relatorio() == {"industria": ["Space Mining"]}  # …e é registado
    assert t.pais(None) is None


class Falso(Tradutor):
    nome = "falso"
    disponivel = True

    def __init__(self, falhar=False):
        self.falhar = falhar
        self.pedidos = 0

    def traduzir(self, texto):
        self.pedidos += 1
        if self.falhar:
            raise RuntimeError("serviço em baixo")
        return "PT: " + texto


def test_traduz_uma_vez_e_usa_cache(tmp_path):
    f = Falso()
    c = CacheTraducoes(tmp_path, f)
    assert c.descricao("KO.US", "Coca-Cola makes drinks.")["texto"] == "PT: Coca-Cola makes drinks."
    c.guardar()
    c2 = CacheTraducoes(tmp_path, f)
    r = c2.descricao("KO.US", "Coca-Cola makes drinks.")
    assert r["estado"] == "traduzida" and f.pedidos == 1  # não voltou a pedir
    # o original mudou → traduz de novo
    assert c2.descricao("KO.US", "Coca-Cola makes beverages.")["texto"] == "PT: Coca-Cola makes beverages."
    assert f.pedidos == 2


def test_falha_mostra_original_e_tenta_de_novo(tmp_path):
    c = CacheTraducoes(tmp_path, Falso(falhar=True))
    r = c.descricao("X.US", "Some text.")
    assert r == {"texto": "Some text.", "original": "Some text.", "estado": "indisponivel", "servico": None}
    c.guardar()
    ok = CacheTraducoes(tmp_path, Falso())
    assert ok.descricao("X.US", "Some text.")["estado"] == "traduzida"


def test_sem_servico_e_limite_de_caracteres(tmp_path):
    assert CacheTraducoes(tmp_path, None).descricao("X.US", "Text")["estado"] == "indisponivel"
    c = CacheTraducoes(tmp_path, Falso(), max_caracteres=10)
    assert c.descricao("A.US", "12345")["estado"] == "traduzida"
    assert c.descricao("B.US", "123456789")["estado"] == "indisponivel"  # passaria o limite: fica para depois
    assert c.descricao("C.US", None)["estado"] == "vazia"


# ---------- limites, quota e Azure ----------
import datetime as dt  # noqa: E402
import json  # noqa: E402
from zoneinfo import ZoneInfo  # noqa: E402

import pytest  # noqa: E402

from radar import tradutores  # noqa: E402
from radar.traducoes import LIMITE_MENSAL_MAXIMO, QuotaEsgotada  # noqa: E402


def test_limite_mensal_e_contagem(tmp_path):
    c = CacheTraducoes(tmp_path, Falso(), max_caracteres=10_000, limite_mensal=12, mes="2026-11")
    assert c.descricao("A.US", "1234567890")["estado"] == "traduzida"
    assert c.descricao("B.US", "12345")["estado"] == "indisponivel"  # 10 + 5 > 12 no mês
    c.guardar()
    c2 = CacheTraducoes(tmp_path, Falso(), limite_mensal=12, mes="2026-11")
    assert c2.usado_no_mes == 10  # a contagem do mês fica guardada
    c3 = CacheTraducoes(tmp_path, Falso(), limite_mensal=12, mes="2026-12")
    assert c3.descricao("B.US", "12345")["estado"] == "traduzida"  # mês novo, contagem nova


def test_limite_nunca_acima_do_maximo(tmp_path):
    assert CacheTraducoes(tmp_path, None, limite_mensal=5_000_000).limite_mensal == LIMITE_MENSAL_MAXIMO < 2_000_000


def test_quota_esgotada_para_de_pedir(tmp_path):
    class SemQuota(Falso):
        def traduzir(self, texto):
            self.pedidos += 1
            raise QuotaEsgotada("403001")
    f = SemQuota()
    c = CacheTraducoes(tmp_path, f)
    c.descricao("A.US", "abc")
    c.descricao("B.US", "def")
    assert f.pedidos == 1 and c.parado and c.resumo()["quota_esgotada"]


def test_so_cache_e_formato_antigo(tmp_path):
    (tmp_path / "traducoes.json").write_text(json.dumps({"KO.US": {"hash": "x", "pt": "velho"}}), encoding="utf-8")
    f = Falso()
    c = CacheTraducoes(tmp_path, f)
    assert "KO.US" in c.dados["descricoes"]  # formato antigo convertido
    assert c.descricao("X.US", "texto", so_cache=True)["estado"] == "indisponivel" and f.pedidos == 0


class Resposta:
    def __init__(self, status, corpo):
        self.status_code = status
        self._corpo = corpo
        self.text = json.dumps(corpo)

    def json(self):
        return self._corpo


def test_azure_pedido_e_respostas(monkeypatch):
    pedidos = []

    def post(url, params, headers, json, timeout):
        pedidos.append((url, params, headers, json))
        return Resposta(200, [{"translations": [{"text": "A Coca-Cola faz bebidas.", "to": "pt-pt"}]}])
    monkeypatch.setattr(tradutores.requests, "post", post)
    az = tradutores.Azure("CHAVE", "westeurope", pausa=0)
    assert az.traduzir("Coca-Cola makes drinks.") == "A Coca-Cola faz bebidas."
    url, params, headers, corpo = pedidos[0]
    assert params["to"] == "pt-pt" and params["from"] == "en"
    assert headers["Ocp-Apim-Subscription-Key"] == "CHAVE" and headers["Ocp-Apim-Subscription-Region"] == "westeurope"
    assert corpo == [{"Text": "Coca-Cola makes drinks."}]
    monkeypatch.setattr(tradutores.requests, "post",
                        lambda *a, **k: Resposta(403, {"error": {"code": 403001, "message": "Out of call volume quota"}}))
    with pytest.raises(QuotaEsgotada):
        az.traduzir("x")


def test_criar_tradutor_sem_chave_nao_traduz(monkeypatch):
    monkeypatch.setenv("RADAR_TRADUTOR", "azure")
    monkeypatch.delenv("AZURE_TRANSLATOR_KEY", raising=False)
    assert tradutores.criar_tradutor() is None
    monkeypatch.setenv("AZURE_TRANSLATOR_KEY", "k")
    assert isinstance(tradutores.criar_tradutor(), tradutores.Azure)
    monkeypatch.setenv("RADAR_TRADUCAO_LIMITE_MES", "9999999")
    assert tradutores.limite_mensal() == LIMITE_MENSAL_MAXIMO


def test_prioridade_pela_pontuacao(tmp_path):
    """Com quota só para uma descrição, traduz a da ação com melhor pontuação."""
    from radar import gerar
    from tests.test_gerar import Falso as FornecedorFalso, _universo

    class FornecedorComDescricao(FornecedorFalso):
        def __init__(self):
            super().__init__()
            self.precos = {"AAA": 10.0, "BBB": 4.0, "CCC": 20.0}  # BBB tem o maior yield

        def obter_historico(self, ticker, desde=None):
            self.preco = self.precos[ticker]
            return super().obter_historico(ticker, desde)

        def obter_perfil(self, ticker):
            return {**super().obter_perfil(ticker), "preco": self.precos[ticker],
                    "descricao": f"{ticker} company description."}

    class QuotaParaUma(Falso):
        def traduzir(self, texto):
            if self.pedidos >= 1:
                raise QuotaEsgotada("acabou")
            return super().traduzir(texto)

    uni = _universo(tmp_path / "universo")
    trad = QuotaParaUma()
    meta = gerar.executar(tmp_path / "data", fornecedor=FornecedorComDescricao(), pasta_cache=tmp_path / "c",
                          pasta_universo=uni, agora=dt.datetime(2026, 11, 24, 3, tzinfo=ZoneInfo("Europe/Lisbon")),
                          tradutor=trad)
    radar = json.loads((tmp_path / "data" / "radar.json").read_text(encoding="utf-8"))["acoes"]
    assert meta["traducoes"]["traduzidas_nesta_execucao"] == 1 and meta["traducoes"]["quota_esgotada"]
    estados = [json.loads((tmp_path / "data" / "acoes" / f"{a['ticker']}.json").read_text(encoding="utf-8"))["descricao_estado"]
               for a in radar]
    assert estados == ["traduzida", "indisponivel", "indisponivel"]  # só a 1.ª do ranking
    assert meta["traducoes"]["por_traduzir"] == 2
    assert (tmp_path / "data" / "traducoes.json").exists()
