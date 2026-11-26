// Projeção a longo prazo: capital inicial + entradas mensais, com ou sem reinvestir os
// dividendos, com o dividendo e o preço a crescer a uma taxa anual constante.
// Contas mês a mês (preço inicial = 1, por isso "ações" = euros investidos ao preço inicial).
import type { AcaoCalculada } from './calculos'

export interface EntradaProjecao {
  capital: number
  /** entrada mensal (€) */
  mensal: number
  anos: number
  reinvestir: boolean
  /** yield líquido inicial (dividendos líquidos por ano ÷ valor) */
  yield_liquido: number
  /** crescimento anual do dividendo por ação */
  cresc_dividendo: number
  /** crescimento anual do preço */
  cresc_preco: number
}

export interface AnoProjecao {
  ano: number
  /** valor das ações no fim do ano */
  valor: number
  /** capital inicial + entradas até aqui */
  investido: number
  /** dividendos líquidos recebidos nesse ano */
  dividendos_ano: number
  dividendos_acumulados: number
  /** rendimento líquido por mês ao ritmo do fim do ano */
  rendimento_mensal: number
  /** rendimento anual ÷ total investido */
  yield_on_cost: number | null
}

export function projetar(e: EntradaProjecao): AnoProjecao[] {
  const anos = Math.max(0, Math.min(60, Math.round(e.anos)))
  let acoes = Math.max(0, e.capital) // preço inicial = 1
  let investido = Math.max(0, e.capital)
  let acumulados = 0
  const fp = (m: number) => (1 + e.cresc_preco) ** (m / 12)
  const fd = (m: number) => e.yield_liquido * (1 + e.cresc_dividendo) ** (m / 12)
  const linhas: AnoProjecao[] = [{
    ano: 0, valor: acoes, investido, dividendos_ano: 0, dividendos_acumulados: 0,
    rendimento_mensal: (acoes * fd(0)) / 12, yield_on_cost: investido > 0 ? (acoes * fd(0)) / investido : null,
  }]
  let doAno = 0
  for (let m = 1; m <= anos * 12; m++) {
    const preco = fp(m)
    const div = (acoes * fd(m)) / 12 // dividendos líquidos deste mês
    doAno += div
    acumulados += div
    if (e.reinvestir) acoes += div / preco
    if (e.mensal > 0) { acoes += e.mensal / preco; investido += e.mensal }
    if (m % 12 === 0) {
      const anual = acoes * fd(m)
      linhas.push({
        ano: m / 12, valor: acoes * preco, investido, dividendos_ano: doAno, dividendos_acumulados: acumulados,
        rendimento_mensal: anual / 12, yield_on_cost: investido > 0 ? anual / investido : null,
      })
      doAno = 0
    }
  }
  return linhas
}

/** Limites para o crescimento "histórico" (evita extrapolar casos extremos por décadas). */
export const LIMITE_CRESCIMENTO = 0.15

/**
 * Crescimento histórico do dividendo de um conjunto de ações: média dos últimos 5 anos
 * (ou 10, se não houver 5) de cada ação, pesada pelo valor de cada uma.
 * `cobertura` = parte do valor com dados de crescimento.
 */
export function crescimentoHistorico(itens: { acao: AcaoCalculada | null; valor: number }[]) {
  let soma = 0, pesoComDados = 0, total = 0
  for (const { acao, valor } of itens) {
    if (!(valor > 0)) continue
    total += valor
    const c = acao?.consistencia.cagr_5 ?? acao?.consistencia.cagr_10
    if (c == null || !Number.isFinite(c)) continue
    soma += Math.max(-LIMITE_CRESCIMENTO, Math.min(LIMITE_CRESCIMENTO, c)) * valor
    pesoComDados += valor
  }
  return { valor: pesoComDados > 0 ? soma / pesoComDados : null, cobertura: total > 0 ? pesoComDados / total : 0 }
}
