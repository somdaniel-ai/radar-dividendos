"""Se a cache do GitHub Actions se perder: recuperar do site publicado."""
import datetime as dt
import json

from ferramentas.recuperar_publicado import recuperar
from radar.agenda import Triagem


def test_triagem_reconstruida_do_universo_publicado(tmp_path):
    t = Triagem(tmp_path)
    n = t.recuperar({"gerado_em": "2026-11-20T03:00:00+00:00", "instrumentos": {
        "KO.US": {"n": "Coca-Cola", "o": "xtb", "e": "radar"},
        "TSLA.US": {"n": "Tesla", "o": "xtb", "e": "sem_dividendos"},
        "XX.US": {"n": "X", "o": "xtb", "e": "sem_simbolo"},
        "NOVO.US": {"n": "Novo", "o": "xtb", "e": "por_verificar"},
        "ERR.US": {"n": "Err", "o": "xtb", "e": "erro"},
    }})
    assert n == 3
    assert t.no_radar("KO.US")
    assert t.estado("TSLA.US") == "sem_dividendos" and t.estado("NOVO.US") is None
    itens = [{"ticker_xtb": x, "origem": "xtb"} for x in ["KO.US", "TSLA.US", "XX.US", "NOVO.US", "ERR.US"]]
    # 5 dias depois: o radar primeiro, depois os nunca vistos; a Tesla só volta aos 60 dias
    ordem = [i["ticker_xtb"] for i in t.ordem(itens, dt.date(2026, 11, 25))]
    assert ordem == ["KO.US", "NOVO.US", "ERR.US"]
    assert t.recuperar({"gerado_em": "lixo"}) == 0


class Resposta:
    def __init__(self, conteudo):
        self.ok = conteudo is not None
        self.content = (conteudo or "").encode()


class SessaoFalsa:
    def __init__(self, site):
        self.site, self.pedidos = site, []

    def get(self, url, timeout=None):
        self.pedidos.append(url)
        return Resposta(self.site.get(url.split("/data/")[1]))


def test_recuperar_publicado(tmp_path):
    site = {"radar.json": json.dumps({"acoes": [{"ticker": "KO.US"}, {"ticker": "NOS.PT"}]}),
            "meta.json": "{}", "universo.json": "{}", "acoes/KO.US.json": '{"ticker": "KO.US"}'}
    res = recuperar("https://exemplo.github.io/radar-dividendos/", tmp_path, SessaoFalsa(site))
    assert res["acoes"] == 1 and res["acoes_no_radar"] == 2
    assert set(res["ficheiros"]) == {"radar.json", "meta.json", "universo.json"}
    assert (tmp_path / "acoes" / "KO.US.json").exists()


def test_nada_publicado(tmp_path):
    assert recuperar("https://x/", tmp_path, SessaoFalsa({}))["acoes"] == 0
