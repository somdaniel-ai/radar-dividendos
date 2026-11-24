"""Parâmetros editáveis (⚙️) com os valores por defeito.

Este é o único sítio onde estão os valores por defeito. O pipeline exporta-os para
`data/definicoes_padrao.json`, para a app os mostrar nas Definições e poder
recalcular tudo com os valores escolhidos pelo utilizador.
"""
from __future__ import annotations

import copy

PARAMETROS_PADRAO: dict = {
    # 4. Universo
    "universo": {
        "meses_sem_dividendo_para_excluir": 24,  # só entra quem pagou nos últimos N meses
    },
    # 6.1 Frequência
    "frequencia": {
        "num_intervalos_mediana": 6,  # usa a mediana dos últimos N intervalos
        "limites_dias": {  # intervalo (dias) -> pagamentos por ano
            "mensal": [25, 35],
            "trimestral": [80, 100],
            "semestral": [160, 200],
            "anual": [330, 400],
        },
        "fator_extraordinario": 2.0,  # dividendo > 2x a mediana recente = extraordinário
        "janela_extraordinario": 8,  # nº de pagamentos vizinhos usados na mediana
        "excluir_extraordinarios": True,  # excluir do rendimento normal e da consistência
        # num ano com mais pagamentos do que a frequência normal, os pagamentos a mais
        # (os que chegam "fora do ritmo", antes do tempo) contam como extraordinários
        "extra_por_contagem": True,
        "fracao_intervalo_fora_ritmo": 0.6,  # intervalo < 60% do normal = fora do ritmo
        # possíveis extraordinários (só avisos "a confirmar", não mudam os cálculos)
        "suspeitos_ativos": True,
        "suspeito_fator_no_ano": 1.5,  # pagamento > 1,5× a mediana dos outros desse ano
        "suspeito_salto": 0.25,  # subida > 25% face ao anterior…
        "suspeito_descida": 0.15,  # …seguida de descida > 15% no seguinte
        "suspeito_anos": 10,  # só procurar nos últimos N anos
    },
    # 6.2 Rendimento e impostos
    "rendimento": {
        "metodo_dividendo_anual": "ultimo",  # "ultimo" (como o Excel) ou "ttm" (últimos 12 meses)
    },
    "impostos": {
        "modo": "simples",  # "simples" ou "avancado"
        "taxa_simples": 0.30,
        "taxa_portugal": 0.28,
        "w8ben_ativo": True,
        # retencao = taxa retida na fonte; credito_max = máximo que Portugal desconta
        # (taxa da convenção). Valores de EXEMPLO — confirmar com um contabilista.
        "por_pais": {
            "Estados Unidos": {"retencao": 0.30, "retencao_w8ben": 0.15, "credito_max": 0.15},
            "Canadá": {"retencao": 0.25, "credito_max": 0.15},
        },
    },
    # 6.3 Preço justo e posição no intervalo
    "preco": {
        "yield_alvo": 0.06,
        "limite_perto_minimo": 0.20,
        "limite_perto_maximo": 0.80,
        "usar_precos_ajustados": False,  # posição no intervalo com máx/mín ajustados
        # preço justo histórico = dividendo anual ÷ yield médio da própria ação nos últimos N anos
        "anos_media_yield": 5,  # mínimo 2; se houver menos anos, usa os que houver (≥ 2)
        "preco_justo_pontuacao": "historico",  # "historico" ou "alvo": qual conta para o "preço atrativo"
    },
    # 6.4 Pagamentos e alterações
    "pagamentos": {
        "modo_atraso": "dias",  # "dias" (fixo) ou "percentagem" (do intervalo normal)
        "dias_atraso": 30,
        "percentagem_atraso": 0.50,
        "tolerancia_igual": 0.01,  # variação até ±1% conta como "igual"
    },
    # 6.5 Consistência
    "consistencia": {
        "limite_corte": 0.10,  # descida anual > 10% = corte
        "limite_aumento": 0.01,  # subida anual > 1% = aumento
        "min_pagamentos_historico": 4,  # menos do que isto = "pouco histórico"
        "nivel6_anos_sem_corte": 10,
        "nivel6_aumentos_em_10_anos": 8,
        "nivel6_anos_seguidos_aumento": 5,
        "nivel5_anos_sem_corte": 10,
        "nivel4_anos_sem_corte": 5,
        "nivel3_anos_sem_corte": 3,
        "nivel1_cortes_em_5_anos": 2,  # 2 ou mais cortes em 5 anos = nível 1
    },
    # 6.6 Pontuação
    "pontuacao": {
        "peso_rendimento": 0.50,
        "peso_consistencia": 0.35,
        "peso_preco": 0.15,
        "batentes_ativos": True,
        "yield_minimo": 0.03,  # yield líquido
        "yield_maximo": 0.20,
        "desconto_para_nota_maxima": 0.30,  # 30% abaixo do preço justo = nota máxima
        "armadilhas_ativas": True,
        "armadilha_yield_acima_maximo": True,
        "armadilha_payout": True,
        "armadilha_payout_limite": 1.0,
        # nos REIT, BDC, fundos fechados e ETF o payout sobre o lucro contabilístico
        # passa muitas vezes de 100% sem ser um problema: ignorar nestas categorias
        "armadilha_payout_ignorar_categorias": ["REIT", "BDC", "CEF", "ETF"],
        "armadilha_queda_preco": True,
        "armadilha_queda_limite": 0.30,
        "armadilha_atraso": True,
        "penalizacao_por_armadilha": 15,  # pontos retirados por cada sinal (0–100)
    },
    # 7.4 Simulador
    "simulador": {
        "investimento_padrao": 100.0,
    },
}


def parametros(alteracoes: dict | None = None) -> dict:
    """Devolve uma cópia dos parâmetros por defeito, com eventuais alterações por cima."""
    p = copy.deepcopy(PARAMETROS_PADRAO)
    if alteracoes:
        _fundir(p, alteracoes)
    return p


def _fundir(base: dict, extra: dict) -> None:
    for k, v in extra.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _fundir(base[k], v)
        else:
            base[k] = v
