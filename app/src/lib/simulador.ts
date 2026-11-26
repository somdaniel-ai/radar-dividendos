// Simulador: quanto renderia investir X € numa ação (ou numa distribuição de várias).
// Usa as mesmas contas do Radar: dividendo anual em EUR (método das Definições) e o
// imposto total das Definições (retenção na fonte + IRS em Portugal).
import type { AcaoCalculada } from './calculos'

export interface Simulacao {
  /** número de ações (frações permitidas, como na XTB) */
  acoes: number
  anual_bruto: number
  anual_liquido: number
  mensal_bruto: number
  mensal_liquido: number
}

/** null quando não há preço ou dividendo em EUR. */
export function simular(a: Pick<AcaoCalculada, 'preco_eur' | 'dividendo' | 'imposto'>, valor: number): Simulacao | null {
  const preco = a.preco_eur
  const anualEur = a.dividendo.anual_eur
  if (!preco || preco <= 0 || anualEur == null || !(valor >= 0)) return null
  const acoes = valor / preco
  const anual_bruto = acoes * anualEur
  const anual_liquido = anual_bruto * (1 - a.imposto.taxa)
  return { acoes, anual_bruto, anual_liquido, mensal_bruto: anual_bruto / 12, mensal_liquido: anual_liquido / 12 }
}

export interface LinhaDistribuicao {
  ticker: string
  pct: number
  valor: number
  acao: AcaoCalculada | null
  sim: Simulacao | null
}

export interface Distribuicao {
  linhas: LinhaDistribuicao[]
  soma_pct: number
  /** as percentagens somam 100% (com tolerância de 0,01) */
  valida: boolean
  /** ações sem dados (não estão no Radar ou sem preço) */
  sem_dados: string[]
  total: Simulacao & { yield_liquido: number | null; yield_bruto: number | null }
}

export function distribuir(linhas: { ticker: string; pct: number }[], valor: number, acoes: AcaoCalculada[]): Distribuicao {
  const porTicker = new Map(acoes.map(a => [a.ticker, a]))
  const out = linhas.map(l => {
    const acao = porTicker.get(l.ticker) ?? null
    const v = valor * (l.pct / 100)
    return { ticker: l.ticker, pct: l.pct, valor: v, acao, sim: acao ? simular(acao, v) : null }
  })
  const soma = out.reduce((s, l) => s + (Number.isFinite(l.pct) ? l.pct : 0), 0)
  const t = { acoes: 0, anual_bruto: 0, anual_liquido: 0, mensal_bruto: 0, mensal_liquido: 0 }
  for (const l of out) {
    if (!l.sim) continue
    t.acoes += l.sim.acoes
    t.anual_bruto += l.sim.anual_bruto
    t.anual_liquido += l.sim.anual_liquido
    t.mensal_bruto += l.sim.mensal_bruto
    t.mensal_liquido += l.sim.mensal_liquido
  }
  return {
    linhas: out,
    soma_pct: soma,
    valida: out.length > 0 && Math.abs(soma - 100) < 0.01 && out.every(l => l.pct > 0),
    sem_dados: out.filter(l => !l.sim).map(l => l.ticker),
    total: { ...t, yield_liquido: valor > 0 ? t.anual_liquido / valor : null, yield_bruto: valor > 0 ? t.anual_bruto / valor : null },
  }
}

/** Divide 100% em partes iguais (com 2 casas; o resto vai para a primeira). */
export function partesIguais(n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor((100 / n) * 100) / 100
  const resto = Math.round((100 - base * n) * 100) / 100
  return Array.from({ length: n }, (_, i) => (i === 0 ? Math.round((base + resto) * 100) / 100 : base))
}

/** Lê um número escrito à portuguesa ("1 000,50" ou "1000.5"). NaN se não for número. */
export function lerNumero(texto: string): number {
  const t = texto.replace(/\s|€|%/g, '').replace(',', '.')
  return t === '' ? NaN : Number(t)
}

export type AgruparDistribuicao = 'setor' | 'categoria' | 'pais' | 'moeda' | 'nivel'

/** Moeda em que a ação se compra na XTB (ex.: TU.US em USD, mesmo com dados de Toronto). */
export const moedaXtb = (a: AcaoCalculada) => a.cotacao_xtb?.moeda ?? a.moeda ?? 'Desconhecida'

/** Resumo da distribuição em % (só as ações com dados), do maior para o menor.
 *  `nomes` traduz o código do grupo (ex.: categoria "CEF" → "Fundos fechados"). */
export function resumoDistribuicao(d: Distribuicao, por: AgruparDistribuicao,
  nomes: (por: AgruparDistribuicao, chave: string) => string = (_, k) => k) {
  const grupos = new Map<string, { peso: number; valor: number; ordem: number }>()
  const total = d.linhas.reduce((s, l) => s + (l.acao && l.pct > 0 ? l.pct : 0), 0)
  for (const l of d.linhas) {
    if (!l.acao || !(l.pct > 0)) continue
    const a = l.acao
    const k = por === 'setor' ? (a.setor || 'Sem setor')
      : por === 'categoria' ? a.categoria
        : por === 'pais' ? (a.pais || 'Desconhecido')
          : por === 'moeda' ? moedaXtb(a)
            : String(a.nivel.nivel)
    const g = grupos.get(k) ?? { peso: 0, valor: 0, ordem: por === 'nivel' ? -a.nivel.nivel : 0 }
    g.peso += l.pct / total
    g.valor += l.valor
    grupos.set(k, g)
  }
  return [...grupos].map(([k, g]) => ({ nome: nomes(por, k), peso: g.peso, valor: g.valor, ordem: g.ordem }))
    .sort((a, b) => (por === 'nivel' ? a.ordem - b.ordem : b.peso - a.peso))
    .map(({ nome, peso, valor }) => ({ nome, peso, valor }))
}
