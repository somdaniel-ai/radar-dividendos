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
