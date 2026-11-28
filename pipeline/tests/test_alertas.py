import copy
import datetime as dt
import io
import json
import urllib.error

import pytest

from radar import alertas as al
from radar import telegram as tg

HOJE = dt.date(2026, 11, 27)  # sexta-feira


def acao(**over):
    a = {
        "ticker": "DX.US", "nome": "Dynex Capital", "moeda": "USD", "cambio_eur": 0.9, "preco": 10.0,
        "dividendo": {"ultimo": 0.17, "ultimo_data": "2026-10-23", "anual": 2.04},
        "imposto": {"taxa": 0.3}, "yield": {"liquido": 0.08}, "armadilhas": [],
        "preco_justo": 12.0, "preco_justo_historico": 11.0, "preco_justo_pontuacao": "historico",
        "abaixo_preco_justo": True, "abaixo_preco_justo_historico": False,
        "pagamento": {"atrasado": False, "esperado": "2026-11-23", "proxima_ex_anunciada": None, "data_pagamento": None},
    }
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            a[k] = {**a[k], **v}
        else:
            a[k] = v
    return a


def ctx(carteira=None, favoritos=(), **escolhas):
    return {"carteira": carteira if carteira is not None else {"DX.US": 10.0}, "favoritos": list(favoritos),
            "escolhas": al.escolhas(escolhas), "ultimo_envio": None}


def tipos(itens):
    return sorted(i["tipo"] for i in itens)


def test_formatacao_pt_e_euros():
    assert al.numero(1234.5) == "1.234,50"
    assert al.valor(0.17, "USD", 0.9, True, 4) == "0,1530 € (0,1700 USD)"
    assert al.valor(0.17, "USD", 0.9, False, 4) == "0,1700 USD"
    assert al.valor(5, "EUR", 1, True) == "5,00 €"
    assert al.dia_util_anterior(dt.date(2026, 11, 30)) == dt.date(2026, 11, 27)  # segunda → sexta


def test_sem_mudancas_nao_ha_alertas():
    a = acao()
    assert al.calcular({"DX.US": a}, {"DX.US": copy.deepcopy(a)}, ctx(), HOJE) == []


def test_abaixo_do_preco_justo_so_ao_passar():
    antes = acao()
    agora = acao(abaixo_preco_justo_historico=True, preco=10.5)
    r = al.calcular({"DX.US": agora}, {"DX.US": antes}, ctx(), HOJE)
    assert tipos(r) == ["abaixo_justo"]
    assert r[0]["chave"] == "justo|DX.US|2026-S48"
    assert "11,00 € (11,00 USD)" not in r[0]["texto"] and "9,90 € (11,00 USD)" in r[0]["texto"]
    # sem dados da noite anterior: não há alerta (não se sabe se "passou" agora)
    assert al.calcular({"DX.US": agora}, {}, ctx(), HOJE) == []


def test_corte_e_aumento_do_dividendo_com_valor_a_receber():
    antes = acao()
    corte = acao(dividendo={"ultimo": 0.15, "ultimo_data": "2026-11-23"})
    r = al.calcular({"DX.US": corte}, {"DX.US": antes}, ctx(), HOJE)
    assert tipos(r) == ["dividendo_corte"]
    assert r[0]["chave"] == "div|DX.US|2026-11-23"
    assert "Com as tuas 10 ações: ≈ 0,94 € líquidos." in r[0]["texto"]  # 0,15 × 0,9 × 10 × 0,7
    aumento = acao(dividendo={"ultimo": 0.18, "ultimo_data": "2026-11-23"})
    assert tipos(al.calcular({"DX.US": aumento}, {"DX.US": antes}, ctx(), HOJE)) == ["dividendo_aumento"]
    igual = acao(dividendo={"ultimo": 0.1705, "ultimo_data": "2026-11-23"})  # dentro de ±1%
    assert al.calcular({"DX.US": igual}, {"DX.US": antes}, ctx(), HOJE) == []


def test_sem_valores_em_euros_nao_diz_quanto_recebe():
    antes = acao()
    corte = acao(dividendo={"ultimo": 0.15, "ultimo_data": "2026-11-23"})
    r = al.calcular({"DX.US": corte}, {"DX.US": antes}, ctx(valores_em_euros=False), HOJE)
    assert "€" not in r[0]["texto"] and "0,1500 USD" in r[0]["texto"]


def test_atrasado_e_yield_alto_com_armadilha():
    antes = acao()
    agora = acao(pagamento={"atrasado": True}, **{"yield": {"liquido": 0.12}},
                 armadilhas=[{"codigo": "payout", "texto": "Paga mais do que lucra"}])
    r = al.calcular({"DX.US": agora}, {"DX.US": antes}, ctx(), HOJE)
    assert tipos(r) == ["atrasado", "yield_alto"]
    y = next(i for i in r if i["tipo"] == "yield_alto")
    assert "⚠️" in y["texto"] and "Paga mais do que lucra" in y["texto"]
    # limite escolhido pelo utilizador (15%): 12% já não dispara
    assert tipos(al.calcular({"DX.US": agora}, {"DX.US": antes}, ctx(yield_limite=0.15), HOJE)) == ["atrasado"]


def test_nova_data_ex_e_vespera():
    # data ex na segunda 30/11 → o último dia para comprar é sexta 27/11 (hoje)
    a = acao(pagamento={"proxima_ex_anunciada": "2026-11-30", "data_pagamento": "2026-12-15"})
    r = al.calcular({"WU.US": {**a, "ticker": "WU.US"}}, {}, ctx(carteira={}, favoritos=["WU.US"]), HOJE)
    assert tipos(r) == ["nova_ex", "vespera_ex"]
    ex = next(i for i in r if i["tipo"] == "nova_ex")
    assert ex["chave"] == "ex|WU.US|2026-11-30"
    assert "compra até 27/11" in ex["texto"] and "Pagamento a 15/12" in ex["texto"]
    v = next(i for i in r if i["tipo"] == "vespera_ex")
    assert "próximo dia útil" in v["titulo"] and "último dia para comprar" in v["texto"]
    # na carteira: diz quanto vai receber
    r2 = al.calcular({"DX.US": a}, {}, ctx(), HOJE)
    assert all("Com as tuas 10 ações" in i["texto"] for i in r2)
    # data ex já passada: nada
    passada = acao(pagamento={"proxima_ex_anunciada": "2026-11-20"})
    assert al.calcular({"DX.US": passada}, {}, ctx(), HOJE) == []


def test_tipos_desligados_e_acoes_fora_da_lista():
    a = acao(pagamento={"proxima_ex_anunciada": "2026-12-10"})
    desligado = ctx(nova_ex={"carteira": False, "favoritos": True})
    assert al.calcular({"DX.US": a}, {}, desligado, HOJE) == []
    # só favoritos ligados: uma ação da carteira não conta
    assert al.calcular({"XX.US": {**a, "ticker": "XX.US"}}, {}, ctx(), HOJE) == []  # nem carteira nem favorito


def test_ler_contexto_e_registar_sem_mostrar_a_chave(caplog):
    class Resp:
        def __init__(self, codigo, corpo):
            self.status_code, self._c = codigo, corpo

        def json(self):
            return self._c

    class Sessao:
        def __init__(self, respostas):
            self.r, self.pedidos = list(respostas), []

        def post(self, url, json=None, timeout=None, headers=None):
            self.pedidos.append((url, json))
            return self.r.pop(0)

    s = Sessao([Resp(200, {"carteira": {"dx.us": 12}, "favoritos": ["agnc.us"], "alertas": {"yield_limite": 0.12}, "ultimo_envio": None})])
    c = al.ler_contexto("k" * 64, s)
    assert c["carteira"] == {"DX.US": 12.0} and c["favoritos"] == ["AGNC.US"]
    assert c["escolhas"]["yield_limite"] == 0.12 and c["escolhas"]["hora_envio"] == "08:30"
    assert al.ler_contexto("k" * 64, Sessao([Resp(401, {})])) is None
    assert "k" * 64 not in caplog.text
    s2 = Sessao([Resp(200, 2)])
    assert al.registar([{"chave": "a"}, {"chave": "b"}], "k" * 64, s2) == 2
    assert s2.pedidos[0][0].endswith("/rpc/registar_alertas")
    assert al.ler_contexto("") is None


# ——— envio pelo Telegram ———

LIS = tg.LISBOA


def test_hora_de_envio_em_lisboa():
    h = tg.hora_envio("08:30")
    assert h == dt.time(8, 30) and tg.hora_envio("lixo") == dt.time(8, 30)
    # inverno (UTC+0) e verão (UTC+1)
    assert tg.deve_enviar(dt.datetime(2026, 12, 1, 8, 31, tzinfo=dt.timezone.utc), h, None)
    assert not tg.deve_enviar(dt.datetime(2026, 7, 1, 7, 0, tzinfo=dt.timezone.utc), h, None)  # 08:00 em Lisboa
    assert tg.deve_enviar(dt.datetime(2026, 7, 1, 7, 35, tzinfo=dt.timezone.utc), h, None)  # 08:35 em Lisboa
    # já enviado hoje / muito depois da hora (alertas do dia esperam pelo dia seguinte)
    assert not tg.deve_enviar(dt.datetime(2026, 12, 1, 9, 30, tzinfo=LIS), h, "2026-12-01T08:31:00+00:00")
    assert tg.deve_enviar(dt.datetime(2026, 12, 2, 8, 30, tzinfo=LIS), h, "2026-12-01T08:31:00+00:00")
    assert not tg.deve_enviar(dt.datetime(2026, 12, 1, 15, 30, tzinfo=LIS), h, None)


def test_mensagem_ordenada_escapada_e_dividida():
    agora = dt.datetime(2026, 11, 27, 8, 30, tzinfo=LIS)
    itens = [{"tipo": "abaixo_justo", "ticker": "A<B", "titulo": "A<B — x & y", "texto": "t"},
             {"tipo": "falha", "ticker": None, "titulo": "Falhou", "texto": "f"}]
    m = tg.mensagens(itens, agora)
    assert len(m) == 1 and "27/11 · 2 alertas" in m[0]
    assert m[0].index("Falhou") < m[0].index("A&lt;B — x &amp; y")
    assert "#/acao/A&lt;B" in m[0]
    muitos = [{"tipo": "nova_ex", "ticker": f"T{i}.US", "titulo": f"T{i}.US — data ex", "texto": "x" * 300} for i in range(40)]
    partes = tg.mensagens(muitos, agora)
    assert len(partes) > 1 and all(len(p) < 4096 for p in partes)
    assert sum(p.count("Abrir na app") for p in partes) == 40


class Rede:
    """Simula o Supabase e o Telegram."""

    def __init__(self, ctx, pendentes, telegram_erro=None):
        self.ctx, self.pendentes, self.erro = ctx, pendentes, telegram_erro
        self.enviadas, self.marcados, self.registados = [], None, []

    def __call__(self, pedido, timeout=None):
        url, corpo = pedido.full_url, json.loads(pedido.data)
        if "api.telegram.org" in url:
            if self.erro:
                raise urllib.error.HTTPError(url, 400, "Bad Request", {}, io.BytesIO(json.dumps({"description": self.erro}).encode()))
            self.enviadas.append(corpo["text"])
            return io.BytesIO(b'{"ok": true}')
        nome = url.rsplit("/", 1)[1]
        r = {"alertas_motor": self.ctx, "alertas_por_enviar": self.pendentes}.get(nome)
        if nome == "marcar_enviados":
            self.marcados, r = corpo["chaves"], len(corpo["chaves"])
        if nome == "registar_alertas":
            self.registados += corpo["itens"]
            r = 1
        return io.BytesIO(json.dumps(r).encode())


@pytest.fixture
def segredos(monkeypatch):
    monkeypatch.setenv("SUPABASE_CHAVE_MOTOR", "k" * 64)
    monkeypatch.setenv("TELEGRAM_TOKEN", "123:SEGREDO")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "999")


def test_envio_diario_marca_como_enviados(segredos, capsys):
    rede = Rede({"alertas": {}, "ultimo_envio": None, "carteira": {}, "favoritos": []},
                [{"id": "ex|DX.US|2026-12-23", "tipo": "nova_ex", "ticker": "DX.US", "titulo": "DX.US — data ex", "texto": "x"}])
    assert tg.diario(dt.datetime(2026, 11, 27, 8, 31, tzinfo=LIS), abrir=rede) == 1
    assert len(rede.enviadas) == 1 and rede.marcados == ["ex|DX.US|2026-12-23"]
    saida = capsys.readouterr().out
    assert "SEGREDO" not in saida and "DX.US" not in saida and "999" not in saida
    # antes da hora: nada
    rede2 = Rede(rede.ctx, rede.pendentes)
    assert tg.diario(dt.datetime(2026, 11, 27, 7, 30, tzinfo=LIS), abrir=rede2) == 0 and not rede2.enviadas
    # Telegram desligado nas Definições
    rede3 = Rede({**rede.ctx, "alertas": {"telegram": False}}, rede.pendentes)
    assert tg.diario(dt.datetime(2026, 11, 27, 8, 31, tzinfo=LIS), abrir=rede3) == 0 and not rede3.enviadas


def test_erro_do_telegram_nao_marca_e_nao_mostra_o_token(segredos):
    rede = Rede({"alertas": {}, "ultimo_envio": None}, [{"id": "a", "tipo": "teste", "ticker": None, "titulo": "t", "texto": ""}],
                telegram_erro="Bad Request: chat not found")
    with pytest.raises(RuntimeError) as e:
        tg.diario(dt.datetime(2026, 11, 27, 8, 31, tzinfo=LIS), abrir=rede)
    assert "chat not found" in str(e.value) and "SEGREDO" not in str(e.value)
    assert rede.marcados is None


def test_teste_e_falha(segredos):
    rede = Rede({"alertas": {"hora_envio": "09:00"}, "ultimo_envio": None, "carteira": {"A": 1, "B": 2}, "favoritos": ["C"]}, [])
    tg.teste(abrir=rede)
    assert "mensagem de teste" in rede.enviadas[0] and "<b>2</b> ações da carteira" in rede.enviadas[0] and "09:00" in rede.enviadas[0]
    assert rede.marcados is None
    tg.falha("https://github.com/x/actions/runs/1", hoje=HOJE, abrir=rede)
    assert rede.registados[0]["chave"] == "falha|2026-11-27" and "runs/1" in rede.registados[0]["texto"]
    rede2 = Rede({"alertas": {"falha_atualizacao": False}}, [])
    tg.falha(abrir=rede2)
    assert rede2.registados == []


def test_sem_segredos(monkeypatch):
    for k in ("SUPABASE_CHAVE_MOTOR", "TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"):
        monkeypatch.delenv(k, raising=False)
    with pytest.raises(SystemExit, match="SUPABASE_CHAVE_MOTOR"):
        tg.teste()


def test_filtro_do_registo_esconde_os_simbolos():
    import logging
    from radar.gerar import OcultarNoRegisto
    f = OcultarNoRegisto({"DX.US", "DX", "O"})
    r = logging.LogRecord("x", logging.INFO, "", 0, "[%s/%s] %s (%s) ok; DX.DE e O.US ficam; O tempo; fim DX.", (1, 9, "DX.US", "DX"), None)
    f.filter(r)
    assert r.getMessage() == "[1/9] ••• (•••) ok; DX.DE e O.US ficam; ••• tempo; fim •••."


def test_frente_camuflada_mistura_iscos():
    import random as _r
    from radar.gerar import frente_camuflada
    itens = [{"ticker_xtb": f"T{i}"} for i in range(1000)]
    pessoais = {"T500", "T900", "T7"}
    r = frente_camuflada(itens, pessoais, _r.Random(1))
    assert sorted(i["ticker_xtb"] for i in r) == sorted(i["ticker_xtb"] for i in itens)  # nada perdido nem repetido
    frente = {i["ticker_xtb"] for i in r[:103]}
    assert pessoais <= frente  # as pessoais vão todas à frente…
    assert len(frente - pessoais) == 100  # …misturadas com 100 ao acaso
    assert [i["ticker_xtb"] for i in r[:3]] != ["T7", "T500", "T900"]  # e não ficam juntas no início
