import datetime as dt

from radar import universo as uni
from radar import xtb

LINHAS = [
    "Símbolo Nome da empresa ISIN Moeda Valor mínimo da transação Horário de funcionamento Dias de negociação",
    "01C.PL* MODO FECHO APENAS / 01Cyberaton SA PLVCAOC00015 PLN 1 PLN 09:00 - 16:50 2ª feira a 6ª feira",
    "KO.US Coca-Cola Co US1912161007 USD 1 USD 15:30 - 22:00 2ª feira a 6ª feira",
    "KO.US Coca-Cola Co US1912161007 USD 1 USD 0.0001 15:30 - 22:00 2ª feira a 6ª feira",  # repetido
    "KOF.DE Coca-Cola Co US1912161007 EUR 1 EUR 09:00 - 17:30 2ª feira a 6ª feira",  # outra bolsa
    "ENB.US Enbridge Inc CA29250N1050 USD 1 USD 15:30 - 22:00 2ª feira a 6ª feira",
    "VHYL.UK Vanguard FTSE All-World High Div (Dist, GBP) IE00B8GKDB10 GBP ETF 1 GBP 09:00 - 17:30 2ª feira a 6ª feira",
    "VHYD.DE Vanguard FTSE All-World High Div (Dist, EUR) IE00B8GKDB10 EUR ETF 1 EUR 09:00 - 17:30 2ª feira a 6ª feira",
    "SXR8.DE iShares Core S&P 500 (Acc, EUR) IE00B5BMR087 EUR ETF 1 EUR 09:00 - 17:30 2ª feira a 6ª feira",
    "CSW.DE Amundi MSCI Switzerland UCITS ETF - EUR (C) LU1681044993 EUR ETF 1 EUR 09:00 - 17:30 2ª feira a 6ª feira",
    "GOLD.UK Gold ETC GB00B00FHZ82 USD ETC 1 USD 09:00 - 17:30 2ª feira a 6ª feira",
    "MTRX.IL Matrix IT Ltd IL0004450156 1 2ª feira a 6ª feira",  # sem moeda: ignorado
]


def test_ler_linhas():
    l = {d["ticker_xtb"]: d for d in xtb.ler_linhas(LINHAS)}
    assert set(l) == {"01C.PL", "KO.US", "KOF.DE", "ENB.US", "VHYL.UK", "VHYD.DE", "SXR8.DE", "CSW.DE", "GOLD.UK"}
    assert l["01C.PL"]["nome"] == "01Cyberaton SA" and l["01C.PL"]["so_fecho"] == "sim"
    assert l["KO.US"] == {"ticker_xtb": "KO.US", "nome": "Coca-Cola Co", "isin": "US1912161007", "moeda": "USD",
                          "tipo": "ACAO", "distribuicao": "", "so_fecho": ""}
    assert l["VHYL.UK"]["tipo"] == "ETF" and l["VHYL.UK"]["distribuicao"] == "Dist"
    assert l["SXR8.DE"]["distribuicao"] == "Acc" and l["CSW.DE"]["distribuicao"] == "Acc"
    assert l["GOLD.UK"]["tipo"] == "ETC"


def test_distribuicao():
    assert xtb.tipo_distribuicao("iShares Global Aggregate Bd ESG UCITS ETF USD D") == "Dist"
    assert xtb.tipo_distribuicao("VanEck Defense UCITS ETF USD A") == "Acc"
    assert xtb.tipo_distribuicao("iShares eb.rexx Gov Germany 0-1yr UCITS") == ""


def test_obter_lista_semanal_e_falha(tmp_path):
    pedidos = []

    def descarregar(url):
        pedidos.append(url)
        raise OSError("sem rede")
    assert xtb.obter_lista(tmp_path, dt.date(2026, 11, 24), descarregar=descarregar) == []  # nunca houve lista
    # com lista guardada há 3 dias: não descarrega; há 8 dias: tenta e, se falhar, usa a guardada
    import csv
    with open(tmp_path / "instrumentos.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=xtb.COLUNAS)
        w.writeheader()
        w.writerows(xtb.ler_linhas(LINHAS))
    (tmp_path / "descarregado_em.txt").write_text("2026-11-21")
    n = len(pedidos)
    assert len(xtb.obter_lista(tmp_path, dt.date(2026, 11, 24), descarregar=descarregar)) == 9 and len(pedidos) == n
    assert len(xtb.obter_lista(tmp_path, dt.date(2026, 11, 30), descarregar=descarregar)) == 9 and len(pedidos) == n + 1


def test_juntar_universo(tmp_path):
    (tmp_path / "sufixos.csv").write_text(
        "sufixo_xtb,sufixo_yahoo,pais\n.US,,EUA\n.UK,.L,RU\n.DE,.DE,DE\n.PL,.WA,PL\n", encoding="utf-8")
    (tmp_path / "universo_xtb.csv").write_text(
        "ticker_xtb,nome,tipo,ativo,ticker_yahoo\nKO.US,Coca-Cola,ACAO,sim,\n01C.PL,Cyber,ACAO,nao,\n", encoding="utf-8")
    itens, resumo = uni.universo_completo(tmp_path, xtb.ler_linhas(LINHAS))
    por = {i["ticker_xtb"]: i for i in itens}
    # KO vem da lista manual (e a KOF.DE, mesma empresa, não entra); 01C.PL foi desligada à mão
    assert por["KO.US"]["origem"] == "manual" and "KOF.DE" not in por and "01C.PL" not in por
    # canadiana em Nova Iorque: dividendos de Toronto, cotação da linha da XTB
    assert por["ENB.US"]["ticker_yahoo"] == "ENB.TO" and por["ENB.US"]["ticker_yahoo_xtb"] == "ENB"
    # ETF: uma linha por ISIN, de preferência em euros; acumulação, ETC e ETN ficam de fora
    assert "VHYD.DE" in por and "VHYL.UK" not in por and por["VHYD.DE"]["tipo"] == "ETF"
    assert "SXR8.DE" not in por and "CSW.DE" not in por and "GOLD.UK" not in por
    assert resumo["excluidos"]["etf_acumulacao"] == 2 and resumo["excluidos"]["etc_etn"] == 1
    assert resumo["excluidos"]["outra_bolsa"] == 1  # VHYL.UK (a VHYD.DE está em euros)
    assert resumo["excluidos"]["na_lista_manual"] == 3  # KO.US, KOF.DE (mesmo ISIN) e 01C.PL (desligada)
    assert resumo["total"] == len(itens) == 3


def test_versoes_da_mesma_empresa(tmp_path):
    (tmp_path / "sufixos.csv").write_text(
        "sufixo_xtb,sufixo_yahoo,pais\n.US,,EUA\n.UK,.L,RU\n.DE,.DE,DE\n.PL,.WA,PL\n", encoding="utf-8")
    (tmp_path / "universo_xtb.csv").write_text(
        "ticker_xtb,nome,tipo,ativo,ticker_yahoo\nKO.US,Coca-Cola,ACAO,sim,\n", encoding="utf-8")
    itens, _ = uni.universo_completo(tmp_path, xtb.ler_linhas(LINHAS))
    por = {i["ticker_xtb"]: i for i in itens}
    # KO.US (lista manual, sem ISIN) encontra a KOF.DE pelo ISIN da lista da XTB; EUR primeiro, sem repetidos
    assert [(v["ticker"], v["moeda"]) for v in por["KO.US"]["versoes_xtb"]] == [("KOF.DE", "EUR"), ("KO.US", "USD")]
    assert [v["ticker"] for v in por["VHYD.DE"]["versoes_xtb"]] == ["VHYD.DE", "VHYL.UK"]
    assert "versoes_xtb" not in por["ENB.US"]  # só existe uma versão
