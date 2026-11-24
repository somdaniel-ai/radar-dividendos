"""Gera app/src/__tests__/amostra.json: casos reais para o teste de paridade da app.

Para cada conjunto de Definições (variantes), calcula em Python o resultado de ~30 ações
reais. O teste da app (calculos.test.ts) recalcula em TypeScript, a partir do resumo com
os valores por defeito, e confirma que dá o mesmo que o Python.

Uso (dentro da pasta `pipeline`, depois de correr `python -m radar.gerar`):
    python ferramentas/gerar_amostra_app.py
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline"))

from radar import universo as uni  # noqa: E402
from radar.analisar import analisar  # noqa: E402
from radar.cache import Cache  # noqa: E402
from radar.fornecedores.yahoo import Yahoo  # noqa: E402
from radar.gerar import _em_portugues  # noqa: E402
from radar.traducoes import Termos  # noqa: E402
from radar.parametros import parametros  # noqa: E402

AMOSTRA = ["CABO.US", "KO.US", "JNJ.US", "O.US", "NLY.US", "AGNC.US", "OXSQ.US", "HRZN.US", "ARCC.US",
           "GGT.US", "CCIF.US", "CLM.US", "WU.US", "ALV.DE", "NOS.PT", "ABDN.UK", "TU.US", "ENB.US",
           "ROG.CH", "AAD.DE", "WHR.US", "JFIN.US", "IEP.US", "MO.US", "PFE.US", "VZ.US", "BNP.FR",
           "ENEL.IT", "WDP.BE", "SOLB.BE", "FSK.US", "GAIN.US", "DX.US"]

VARIANTES = {
    "padrao": {},
    "impostos_avancados": {"impostos": {"modo": "avancado"}, "preco": {"preco_justo_pontuacao": "alvo"}},
    "sem_w8ben": {"impostos": {"modo": "avancado", "w8ben_ativo": False}},
    "exigente": {
        "preco": {"yield_alvo": 0.08, "usar_precos_ajustados": True, "limite_perto_minimo": 0.3,
                  "anos_media_yield": 3},
        "consistencia": {"limite_corte": 0.05, "limite_aumento": 0.03, "nivel5_anos_sem_corte": 15,
                         "nivel4_anos_sem_corte": 8, "min_pagamentos_historico": 8},
        "pontuacao": {"peso_rendimento": 0.3, "peso_consistencia": 0.5, "peso_preco": 0.2,
                      "yield_minimo": 0.04, "yield_maximo": 0.12, "penalizacao_por_armadilha": 10,
                      "armadilha_payout_ignorar_categorias": [], "armadilha_queda_limite": 0.15},
    },
    "ttm_e_atraso_percentagem": {
        "rendimento": {"metodo_dividendo_anual": "ttm"},
        "preco": {"anos_media_yield": 10},
        "pagamentos": {"modo_atraso": "percentagem", "percentagem_atraso": 0.25},
        "pontuacao": {"batentes_ativos": False, "armadilhas_ativas": False},
    },
}

CAMPOS = ["dividendo", "imposto", "yield", "preco_justo", "preco_justo_eur", "abaixo_preco_justo", "posicao",
          "yield_medio_historico", "anos_media_usados", "preco_justo_historico_eur", "abaixo_preco_justo_historico",
          "preco_justo_pontuacao",
          "pagamento", "consistencia", "nivel", "armadilhas", "fora_batentes", "pontuacao", "avisos"]


def main():
    meta = json.loads((RAIZ / "data" / "meta.json").read_text(encoding="utf-8"))
    hoje = dt.date.fromisoformat(meta["data_referencia"])
    agora = dt.datetime.fromisoformat(meta["gerado_em"])
    f = Yahoo()
    cache = Cache(RAIZ / "pipeline" / "cache", f, horas_perfil=24 * 365)
    extras = uni.ler_extraordinarios()
    rejeitados = uni.ler_rejeitados()
    itens = {i["ticker_xtb"]: i for i in uni.ler_universo()}
    radar = {a["ticker"]: a for a in json.loads((RAIZ / "data" / "radar.json").read_text(encoding="utf-8"))["acoes"]}

    casos = []
    for t in AMOSTRA:
        if t not in radar:
            print("fora do radar:", t)
            continue
        item = {**itens[t], "ticker_yahoo": radar[t]["ticker_yahoo"]}
        precos, div = cache.historico(item["ticker_yahoo"], hoje)
        perfil = _em_portugues(cache.perfil(item["ticker_yahoo"], agora), Termos())
        fx = radar[t]["cambio_eur"]
        base = None
        esperado = {}
        for nome, alt in VARIANTES.items():
            r = analisar(item, precos, div, perfil, fx, hoje, parametros(alt), extras.get(t),
                         None, rejeitados.get(t))["resumo"]
            if nome == "padrao":
                base = r
            esperado[nome] = {k: r[k] for k in CAMPOS}
        casos.append({"ticker": t, "base": base, "esperado": esperado})

    destino = RAIZ / "app" / "src" / "__tests__" / "amostra.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps({"hoje": hoje.isoformat(), "padrao": parametros(), "variantes": VARIANTES,
                                   "casos": casos},
                                  ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    print(f"{len(casos)} casos × {len(VARIANTES)} variantes gravados em {destino}")


if __name__ == "__main__":
    main()
