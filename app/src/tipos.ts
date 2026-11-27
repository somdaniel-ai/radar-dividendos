// Tipos dos ficheiros JSON gerados pelo pipeline (pasta data/).

export type Categoria = 'EMPRESA' | 'REIT' | 'BDC' | 'CEF' | 'ETF'

export interface Sinal {
  codigo: string
  texto: string
}

export interface Extremo {
  max: number
  min: number
  max_aj: number
  min_aj: number
}

export interface Nivel {
  nivel: number
  cor: string
  nome: string
  texto: string
  motivos: string[]
}

export interface Pontuacao {
  total: number
  rendimento: number
  consistencia: number
  preco: number
  penalizacao: number
}

export interface Consistencia {
  anos_a_pagar: number
  anos_sem_corte: number
  anos_seguidos_aumento: number
  aumentos_ultimos_10: number
  cortes_ultimos_10: number
  cortes_ultimos_5: number
  cagr_5: number | null
  cagr_10: number | null
  regularidade: number | null
  anos_com_historico: number
  num_pagamentos: number
}

export interface Acao {
  ticker: string
  ticker_yahoo: string
  nome: string
  tipo: string
  tipo_yahoo: string | null
  categoria: Categoria
  categoria_nome: string
  avisos: Sinal[]
  setor: string | null
  industria: string | null
  pais: string | null
  bolsa: string | null
  moeda: string | null
  capitalizacao: number | null
  cambio_eur: number | null
  preco: number | null
  preco_eur: number | null
  variacao_dia: number | null
  variacao_12m: number | null
  cotacao_xtb: {
    simbolo: string
    preco: number | null
    moeda: string | null
    variacao_dia: number | null
    cambio_eur: number | null
    preco_eur: number | null
  }
  dividendo: {
    ultimo: number | null
    ultimo_data: string | null
    anual: number
    anual_eur: number | null
    ttm: number
    ttm_eur: number | null
    ttm_total: number
    metodo: string
    num_extraordinarios: number
    ultimo_extraordinario: string | null
  }
  frequencia: string
  pagamentos_ano: number
  intervalo_mediano_dias: number | null
  imposto: { taxa: number; retencao: number | null; conhecida: boolean }
  yield: { bruto: number | null; mensal: number | null; liquido: number | null }
  preco_justo: number | null
  preco_justo_eur: number | null
  abaixo_preco_justo: boolean
  /** yield bruto habitual (mediana mensal) da própria ação, para 1…10 anos */
  yields_historicos: { anos_disponiveis: number; ultimo: Record<string, number>; ttm: Record<string, number> }
  yield_medio_historico: number | null
  anos_media_usados: number
  preco_justo_historico: number | null
  preco_justo_historico_eur: number | null
  abaixo_preco_justo_historico: boolean
  preco_justo_pontuacao: 'historico' | 'alvo'
  extraordinarios_suspeitos: Suspeito[]
  tipo_instrumento: string | null
  setor_original: string | null
  industria_original: string | null
  pais_original: string | null
  extremos: Record<'52s' | '5a' | 'sempre', Extremo | null>
  posicao: Record<'52s' | '5a' | 'sempre', number | null>
  payout: number | null
  pagamento: {
    ultimo_ex: string | null
    esperado: string | null
    dias_para_pagamento: number | null
    atrasado: boolean
    proxima_ex_anunciada: string | null
    data_pagamento: string | null
  }
  tendencia: 'aumento' | 'igual' | 'corte' | null
  consistencia: Consistencia
  valores_anuais: Record<string, number>
  ano_referencia: number
  nivel: Nivel
  armadilhas: Sinal[]
  fora_batentes: 'abaixo' | 'acima' | null
  pontuacao: Pontuacao
  pagou_recentemente: boolean
  atualizado_em?: string
  /** hora a que o preço foi atualizado com o botão "Atualizar preços" (só neste aparelho) */
  preco_agora_em?: string
  desatualizado?: boolean
  posicao_ranking?: number
}

export interface Suspeito {
  data: string
  valor: number
  extra_estimado: number
  motivo: string
}

export interface SuspeitoLista extends Suspeito {
  ticker: string
  nome: string
  moeda: string | null
}

export interface AcaoDetalhe extends Acao {
  descricao: string | null
  descricao_original: string | null
  descricao_estado: 'traduzida' | 'indisponivel' | 'vazia'
  descricao_servico: string | null
  historico_dividendos: { data: string; valor: number; extraordinario: boolean; parte_extraordinaria: number }[]
  precos: { semanal: [string, number][]; mensal: [string, number][] }
  /** a mesma empresa/fundo noutras bolsas ou moedas da XTB (mesmo ISIN); EUR primeiro */
  versoes_xtb?: { ticker: string; moeda: string; nome: string }[]
}

export interface Meta {
  gerado_em: string
  /** última atualização noturna sem problemas (para o aviso de 3 noites falhadas) */
  ultima_noite_ok?: string | null
  noites_com_problemas?: number
  data_referencia: string
  tipo_atualizacao: 'completa' | 'parcial'
  ultima_atualizacao_completa: string | null
  total_universo: number
  total_radar: number
  sem_dividendos_recentes: string[]
  erros: { ticker: string; erro: string }[]
  aviso: string
  universo?: { manual: number; lista_xtb: number; total: number; excluidos: Record<string, number> }
  triagem?: {
    agendados: number; processados: number; por_processar: number
    interrompido: 'tempo' | 'bloqueio' | null
    sem_dividendos_nesta_execucao: number
    estados: Record<string, number>
  }
}

// Parâmetros (⚙️) — mesma estrutura que pipeline/radar/parametros.py
export interface ImpostoPais {
  retencao: number
  retencao_w8ben?: number
  credito_max?: number
}

export interface Parametros {
  universo: { meses_sem_dividendo_para_excluir: number }
  frequencia: {
    num_intervalos_mediana: number
    limites_dias: Record<string, [number, number]>
    fator_extraordinario: number
    janela_extraordinario: number
    excluir_extraordinarios: boolean
    extra_por_contagem: boolean
    fracao_intervalo_fora_ritmo: number
    suspeitos_ativos: boolean
    suspeito_fator_no_ano: number
    suspeito_salto: number
    suspeito_descida: number
    suspeito_anos: number
  }
  rendimento: { metodo_dividendo_anual: 'ultimo' | 'ttm' }
  impostos: {
    modo: 'simples' | 'avancado'
    taxa_simples: number
    taxa_portugal: number
    w8ben_ativo: boolean
    por_pais: Record<string, ImpostoPais>
  }
  preco: {
    yield_alvo: number
    limite_perto_minimo: number
    limite_perto_maximo: number
    usar_precos_ajustados: boolean
    anos_media_yield: number
    preco_justo_pontuacao: 'historico' | 'alvo'
  }
  pagamentos: {
    modo_atraso: 'dias' | 'percentagem'
    dias_atraso: number
    percentagem_atraso: number
    tolerancia_igual: number
  }
  consistencia: {
    limite_corte: number
    limite_aumento: number
    min_pagamentos_historico: number
    nivel6_anos_sem_corte: number
    nivel6_aumentos_em_10_anos: number
    nivel6_anos_seguidos_aumento: number
    nivel5_anos_sem_corte: number
    nivel4_anos_sem_corte: number
    nivel3_anos_sem_corte: number
    nivel1_cortes_em_5_anos: number
  }
  pontuacao: {
    peso_rendimento: number
    peso_consistencia: number
    peso_preco: number
    batentes_ativos: boolean
    yield_minimo: number
    yield_maximo: number
    desconto_para_nota_maxima: number
    armadilhas_ativas: boolean
    armadilha_yield_acima_maximo: boolean
    armadilha_payout: boolean
    armadilha_payout_limite: number
    armadilha_payout_ignorar_categorias: string[]
    armadilha_queda_preco: boolean
    armadilha_queda_limite: number
    armadilha_atraso: boolean
    penalizacao_por_armadilha: number
  }
  simulador: { investimento_padrao: number }
  meta: { rendimento_mensal_padrao: number; max_empresa: number; max_setor: number; max_pais: number; nivel_minimo: number; excluir_armadilhas: boolean; so_favoritos: boolean }
  alertas: import('./lib/alertas').EscolhasAlertas
}
