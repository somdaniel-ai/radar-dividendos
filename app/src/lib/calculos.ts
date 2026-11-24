// Recalcula, no browser, tudo o que depende das Definições do utilizador.
// É uma cópia fiel de pipeline/radar/calculos/*.py — o teste calculos.test.ts confirma
// que, com os valores por defeito, os resultados são iguais aos do pipeline.
import type { Acao, Categoria, Consistencia, Nivel, Parametros, Pontuacao, Sinal } from '../tipos'

export const NIVEIS: Record<number, { cor: string; nome: string; texto: string }> = {
  6: { cor: 'dourado_escuro', nome: 'Dourado escuro', texto: 'Muitos anos sempre a pagar e sempre a aumentar' },
  5: { cor: 'dourado_claro', nome: 'Dourado claro', texto: 'Muitos anos sempre com coerência' },
  4: { cor: 'verde_escuro', nome: 'Verde escuro', texto: 'Bastante coerente' },
  3: { cor: 'verde_medio', nome: 'Verde médio', texto: 'Coerente' },
  2: { cor: 'verde_claro', nome: 'Verde claro', texto: 'Pouco coerente' },
  1: { cor: 'verde_muito_claro', nome: 'Verde muito claro', texto: 'O menos interessante' },
  0: { cor: 'alerta', nome: 'Alerta', texto: 'Possivelmente suspenso ou dados em falta' },
}

const limitar = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x))
const pct0 = (x: number) => `${Math.round(x * 100)}%`

// ---------- 6.2 Impostos e yield ----------

export function taxaImposto(pais: string | null, p: Parametros['impostos']) {
  if (p.modo !== 'avancado') return { taxa: p.taxa_simples, retencao: null as number | null, conhecida: true }
  if (pais === 'Portugal') return { taxa: p.taxa_portugal, retencao: p.taxa_portugal, conhecida: true }
  const cfg = p.por_pais[pais ?? '']
  if (!cfg) return { taxa: p.taxa_portugal, retencao: null, conhecida: false }
  let ret = cfg.retencao
  if (p.w8ben_ativo && cfg.retencao_w8ben !== undefined) ret = cfg.retencao_w8ben
  const credito = Math.min(ret, cfg.credito_max ?? ret)
  return { taxa: ret + Math.max(0, p.taxa_portugal - credito), retencao: ret, conhecida: true }
}

export function yields(anualEur: number, precoEur: number | null, taxa: number) {
  if (!precoEur || precoEur <= 0) return { bruto: null, mensal: null, liquido: null }
  const bruto = anualEur / precoEur
  return { bruto, mensal: bruto / 12, liquido: bruto * (1 - taxa) }
}

// ---------- 6.3 Preços ----------

export function posicao(preco: number | null, min: number | null | undefined, max: number | null | undefined) {
  if (preco == null || min == null || max == null || max <= min) return null
  return (preco - min) / (max - min)
}

/** Yield habitual da própria ação nos últimos `anos` (ou os que houver, mínimo 2). */
export function yieldMedio(yh: Acao['yields_historicos'] | undefined, metodo: string, pagamentosAno: number, anos: number) {
  const m = metodo !== 'ultimo' || pagamentosAno <= 0 ? 'ttm' : 'ultimo'
  const pedidos = Math.max(2, Math.min(10, Math.trunc(anos)))
  const n = Math.min(pedidos, Math.trunc(yh?.anos_disponiveis ?? 0))
  if (n < 2) return { y: null as number | null, anos: 0 }
  const y = yh?.[m]?.[String(n)]
  if (!y || y <= 0) return { y: null, anos: 0 }
  return { y, anos: n }
}

// ---------- 6.4 Pagamentos ----------

export function estaAtrasado(
  dias: number | null, intervalo: number | null, p: Parametros['pagamentos'],
  proximaEx: string | null, hoje: string,
) {
  if (dias == null) return false
  if (proximaEx && proximaEx >= hoje) return false
  const tolerancia = p.modo_atraso === 'percentagem' && intervalo ? p.percentagem_atraso * intervalo : p.dias_atraso
  return -dias > tolerancia
}

// ---------- 6.5 Consistência ----------

export function metricas(valores: Record<string, number>, anoCorrente: number, p: Parametros['consistencia'],
  base: Pick<Consistencia, 'regularidade' | 'num_pagamentos'>): Consistencia {
  const v = new Map(Object.entries(valores).map(([a, x]) => [Number(a), x]))
  const anos = [...v.keys()].sort((a, b) => a - b)
  const corte = (a: number) => v.has(a - 1) && v.get(a - 1)! > 0 && v.get(a)! < v.get(a - 1)! * (1 - p.limite_corte)
  const aumento = (a: number) => v.has(a - 1) && v.get(a - 1)! > 0 && v.get(a)! > v.get(a - 1)! * (1 + p.limite_aumento)
  const inv = [...anos].reverse()
  let aPagar = 0, semCorte = 0, aAumentar = 0
  for (const a of inv) { if (v.get(a)! <= 0) break; aPagar++ }
  for (const a of inv) { if (v.get(a)! <= 0 || corte(a)) break; semCorte++ }
  for (const a of inv) { if (!aumento(a)) break; aAumentar++ }
  const ult10 = anos.filter(a => a >= anoCorrente - 10)
  const ult5 = anos.filter(a => a >= anoCorrente - 5)
  const cagr = (n: number) => {
    if (!anos.length) return null
    const fim = anos[anos.length - 1], ini = fim - n
    if (!v.has(ini) || v.get(ini)! <= 0 || v.get(fim)! <= 0) return null
    return (v.get(fim)! / v.get(ini)!) ** (1 / n) - 1
  }
  return {
    anos_a_pagar: aPagar,
    anos_sem_corte: semCorte,
    anos_seguidos_aumento: aAumentar,
    aumentos_ultimos_10: ult10.filter(aumento).length,
    cortes_ultimos_10: ult10.filter(corte).length,
    cortes_ultimos_5: ult5.filter(corte).length,
    cagr_5: cagr(5),
    cagr_10: cagr(10),
    regularidade: base.regularidade,
    anos_com_historico: anos.filter(a => v.get(a)! > 0).length,
    num_pagamentos: base.num_pagamentos,
  }
}

export function nivel(m: Consistencia, frequencia: number, suspenso: boolean, semDados: boolean,
  p: Parametros['consistencia']): Nivel {
  const motivos: string[] = []
  const sc = m.anos_sem_corte
  let n: number
  if (semDados) { n = 0; motivos.push('Faltam dados de preço ou de dividendos.') }
  else if (suspenso) { n = 0; motivos.push('O último pagamento está muito atrasado: possivelmente suspenso.') }
  else if (m.num_pagamentos < p.min_pagamentos_historico) { n = 1; motivos.push(`Pouco histórico (${m.num_pagamentos} pagamentos).`) }
  else if (frequencia === 0) { n = 1; motivos.push('Pagamentos irregulares (sem frequência definida).') }
  else if (m.cortes_ultimos_5 >= p.nivel1_cortes_em_5_anos) { n = 1; motivos.push(`${m.cortes_ultimos_5} cortes nos últimos 5 anos.`) }
  else if (sc >= p.nivel6_anos_sem_corte && (m.aumentos_ultimos_10 >= p.nivel6_aumentos_em_10_anos
    || m.anos_seguidos_aumento >= p.nivel6_anos_seguidos_aumento)) {
    n = 6
    motivos.push(`${sc} anos a pagar sem cortes.`)
    motivos.push(`Aumentou em ${m.aumentos_ultimos_10} dos últimos 10 anos (${m.anos_seguidos_aumento} anos seguidos).`)
  }
  else if (sc >= p.nivel5_anos_sem_corte) { n = 5; motivos.push(`${sc} anos a pagar sem cortes.`) }
  else if (sc >= p.nivel4_anos_sem_corte) { n = 4; motivos.push(`${sc} anos a pagar sem cortes.`) }
  else if (sc >= p.nivel3_anos_sem_corte && m.cortes_ultimos_5 === 0) { n = 3; motivos.push(`${sc} anos a pagar sem cortes.`) }
  else {
    n = 2
    if (m.cortes_ultimos_5) motivos.push('Houve 1 corte nos últimos 5 anos.')
    motivos.push(`Só ${sc} ano(s) seguido(s) sem cortes.`)
  }
  return { nivel: n, ...NIVEIS[n], motivos }
}

// ---------- 6.6 Batentes, armadilhas e pontuação ----------

export function foraBatentes(y: number | null, p: Parametros['pontuacao']) {
  if (!p.batentes_ativos || y == null) return null
  if (y < p.yield_minimo) return 'abaixo' as const
  if (y > p.yield_maximo) return 'acima' as const
  return null
}

export function armadilhas(y: number | null, payout: number | null, var12: number | null, atrasado: boolean,
  p: Parametros['pontuacao'], categoria?: Categoria | null): Sinal[] {
  if (!p.armadilhas_ativas) return []
  const out: Sinal[] = []
  const payoutConta = !(p.armadilha_payout_ignorar_categorias ?? []).includes(categoria ?? '')
  if (p.armadilha_yield_acima_maximo && y != null && y > p.yield_maximo)
    out.push({ codigo: 'yield_alto', texto: `Yield líquido acima de ${pct0(p.yield_maximo)}.` })
  if (p.armadilha_payout && payoutConta && payout != null && payout > p.armadilha_payout_limite)
    out.push({ codigo: 'payout', texto: `Paga mais do que lucra (payout de ${pct0(payout)}).` })
  if (p.armadilha_queda_preco && var12 != null && var12 < -p.armadilha_queda_limite)
    out.push({ codigo: 'queda_preco', texto: `Preço caiu ${pct0(-var12)} em 12 meses.` })
  if (p.armadilha_atraso && atrasado)
    out.push({ codigo: 'atraso', texto: 'Dividendo atrasado (possivelmente suspenso).' })
  return out
}

const arred1 = (x: number) => Math.round(x * 10) / 10

export function pontuacao(y: number | null, niv: number, m: Pick<Consistencia, 'anos_sem_corte' | 'regularidade'>,
  precoEur: number | null, justoEur: number | null, pos52: number | null, sinais: Sinal[],
  p: Parametros['pontuacao']): Pontuacao {
  const lo = p.yield_minimo, hi = p.yield_maximo
  let rend = y != null && hi > lo ? limitar((y - lo) / (hi - lo)) : 0
  let cons: number
  if (niv === 0) { rend = 0; cons = 0 }
  else cons = 0.6 * niv / 6 + 0.2 * Math.min(m.anos_sem_corte ?? 0, 20) / 20 + 0.2 * (m.regularidade ?? 0)
  const d = precoEur && justoEur ? limitar(((justoEur - precoEur) / justoEur) / p.desconto_para_nota_maxima) : 0
  const mm = pos52 != null ? 1 - pos52 : 0.5
  const preco = 0.5 * d + 0.5 * limitar(mm)
  const soma = (p.peso_rendimento + p.peso_consistencia + p.peso_preco) || 1
  const base = 100 * (p.peso_rendimento * rend + p.peso_consistencia * cons + p.peso_preco * preco) / soma
  const penal = p.penalizacao_por_armadilha * sinais.length
  return {
    total: arred1(limitar(base - penal, 0, 100)),
    rendimento: arred1(rend * 100),
    consistencia: arred1(cons * 100),
    preco: arred1(preco * 100),
    penalizacao: penal,
  }
}

// ---------- Tudo junto ----------

export type AcaoCalculada = Acao & {
  /** sinais visuais: perto do mínimo/máximo, abaixo do preço justo… */
  perto_minimo_52s: boolean
  perto_maximo_52s: boolean
}

/** Devolve a ação com todos os campos que dependem das Definições recalculados. */
export function recalcular(a: Acao, p: Parametros, hoje: string): AcaoCalculada {
  const fx = a.cambio_eur
  const d = a.dividendo
  const anual = p.rendimento.metodo_dividendo_anual === 'ultimo' && a.pagamentos_ano > 0 && d.ultimo != null
    ? d.ultimo * a.pagamentos_ano : d.ttm
  const anualEur = fx ? anual * fx : null
  const imposto = taxaImposto(a.pais, p.impostos)
  const y = yields(anualEur ?? 0, a.preco_eur, imposto.taxa)
  const justo = anual && p.preco.yield_alvo > 0 ? anual / p.preco.yield_alvo : null
  const justoEur = justo && fx ? justo * fx : null
  const ym = yieldMedio(a.yields_historicos, p.rendimento.metodo_dividendo_anual, a.pagamentos_ano, p.preco.anos_media_yield ?? 5)
  const justoH = ym.y && anual ? anual / ym.y : null
  const justoHEur = justoH && fx ? justoH * fx : null
  const usarHist = (p.preco.preco_justo_pontuacao ?? 'historico') === 'historico' && justoHEur != null
  const justoPont = usarHist ? justoHEur : justoEur
  const pos = {} as Acao['posicao']
  for (const k of ['52s', '5a', 'sempre'] as const) {
    const e = a.extremos[k]
    pos[k] = !e ? null : p.preco.usar_precos_ajustados ? posicao(a.preco, e.min_aj, e.max_aj) : posicao(a.preco, e.min, e.max)
  }
  const atrasado = estaAtrasado(a.pagamento.dias_para_pagamento, a.intervalo_mediano_dias, p.pagamentos,
    a.pagamento.proxima_ex_anunciada, hoje)
  const met = metricas(a.valores_anuais ?? {}, a.ano_referencia, p.consistencia, a.consistencia)
  const semDados = a.preco == null || !fx || a.consistencia.num_pagamentos === 0
  const niv = nivel(met, a.pagamentos_ano, atrasado, semDados, p.consistencia)
  const sinais = armadilhas(y.liquido, a.payout, a.variacao_12m, atrasado, p.pontuacao, a.categoria)
  const avisos = a.avisos.filter(x => x.codigo !== 'imposto_pais')
  if (!imposto.conhecida)
    avisos.push({ codigo: 'imposto_pais', texto: `Sem taxa de retenção definida para ${a.pais ?? 'este país'}: foi usado só o imposto português.` })
  return {
    ...a,
    avisos,
    dividendo: { ...d, anual, anual_eur: anualEur, metodo: anual === d.ttm && p.rendimento.metodo_dividendo_anual !== 'ultimo' ? 'ttm' : d.metodo },
    imposto,
    yield: y,
    preco_justo: justo,
    preco_justo_eur: justoEur,
    abaixo_preco_justo: Boolean(a.preco != null && justo && a.preco < justo),
    yield_medio_historico: ym.y,
    anos_media_usados: ym.anos,
    preco_justo_historico: justoH,
    preco_justo_historico_eur: justoHEur,
    abaixo_preco_justo_historico: Boolean(a.preco != null && justoH && a.preco < justoH),
    preco_justo_pontuacao: usarHist ? 'historico' : 'alvo',
    posicao: pos,
    pagamento: { ...a.pagamento, atrasado },
    consistencia: met,
    nivel: niv,
    armadilhas: sinais,
    fora_batentes: foraBatentes(y.liquido, p.pontuacao),
    pontuacao: pontuacao(y.liquido, niv.nivel, met, a.preco_eur, justoPont, pos['52s'], sinais, p.pontuacao),
    perto_minimo_52s: pos['52s'] != null && pos['52s'] <= p.preco.limite_perto_minimo,
    perto_maximo_52s: pos['52s'] != null && pos['52s'] >= p.preco.limite_perto_maximo,
  }
}
