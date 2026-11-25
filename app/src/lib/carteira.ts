// Cálculos da carteira a partir das operações (extrato da XTB + compras manuais).
import { retencaoEsperada, type AcaoCalculada } from './calculos'
import type { Parametros } from '../tipos'
import type { PosicaoAbertaXtb, Transacao } from './extrato'

export interface Lote {
  id: string
  data: string
  quantidade: number
  /** preço na moeda da bolsa (quando conhecido) */
  preco: number | null
  /** custo em EUR (o que saiu da conta) */
  custo_eur: number
  origem: 'xtb' | 'manual'
}

export interface Pagamento {
  /** data do pagamento original (as correções juntam-se a ele) */
  data: string
  ticker: string
  bruto: number
  retido: number
  liquido: number
  por_acao: number | null
  moeda: string | null
  /** taxa de retenção indicada pela XTB */
  taxa: number | null
}

export interface Posicao {
  ticker: string
  nome: string
  quantidade: number
  lotes: Lote[]
  /** preço médio na moeda da bolsa (só lotes com preço) */
  preco_medio: number | null
  custo_eur: number
  acao: AcaoCalculada | null
  preco_atual_eur: number | null
  valor_eur: number | null
  lucro_eur: number | null
  lucro_pct: number | null
  dividendos: { bruto: number; retido: number; liquido: number }
  previsto: { anual_bruto: number | null; anual_liquido: number | null; mensal_liquido: number | null }
  yield_on_cost: { bruto: number | null; liquido: number | null }
  retencao: { real: number | null; esperada: number | null; aviso: boolean }
}

const dia = (iso: string) => iso.slice(0, 10)
const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const arred = (x: number, casas = 8) => Math.round(x * 10 ** casas) / 10 ** casas

/** Pagamentos de dividendos (bruto, retido, líquido em EUR), com as correções da XTB já aplicadas. */
export function pagamentos(transacoes: Transacao[]): Pagamento[] {
  const por: Record<string, Pagamento> = {}
  // uma correção ("corr … from 2026-04-01") pertence ao pagamento dessa data
  const chave = (t: Transacao) => `${t.ticker}|${t.corrige || dia(t.data)}`
  for (const t of transacoes) {
    if (!t.ticker || (t.tipo !== 'dividendo' && t.tipo !== 'retencao')) continue
    const k = chave(t)
    const p = (por[k] ??= {
      data: t.corrige || dia(t.data), ticker: t.ticker, bruto: 0, retido: 0, liquido: 0,
      por_acao: null, moeda: null, taxa: null,
    })
    if (t.tipo === 'dividendo') {
      p.bruto += t.valor_eur
      if (!t.corrige && t.por_acao != null) { p.por_acao = t.por_acao; p.moeda = t.moeda ?? null }
    } else {
      p.retido += -t.valor_eur
      if (!t.corrige && t.taxa != null) p.taxa = t.taxa
    }
  }
  // acertos de retenção sem data própria (ex.: "US Dividends Reclassification 2025") ficam como
  // um "pagamento" só com retenção (normalmente negativa = devolução)
  return Object.values(por)
    .map(p => ({ ...p, bruto: arred(p.bruto, 6), retido: arred(p.retido, 6), liquido: arred(p.bruto - p.retido, 6) }))
    .filter(p => Math.abs(p.bruto) > 1e-9 || Math.abs(p.retido) > 1e-9)
    .sort((a, b) => a.data.localeCompare(b.data))
}

/** Lotes de compra que ainda estão na carteira (as vendas saem dos lotes mais antigos primeiro). */
export function lotesAbertos(transacoes: Transacao[]): Record<string, Lote[]> {
  const ordenadas = [...transacoes].sort((a, b) => a.data.localeCompare(b.data))
  const por: Record<string, Lote[]> = {}
  for (const t of ordenadas) {
    if (!t.ticker || t.quantidade == null) continue
    if (t.tipo === 'compra') {
      ;(por[t.ticker] ??= []).push({
        id: t.id, data: t.data, quantidade: t.quantidade, preco: t.preco ?? null,
        custo_eur: -t.valor_eur, origem: t.origem,
      })
    } else if (t.tipo === 'venda') {
      let falta = t.quantidade
      const lotes = por[t.ticker] ?? []
      while (falta > 1e-9 && lotes.length) {
        const l = lotes[0]
        const sai = Math.min(l.quantidade, falta)
        const fracao = sai / l.quantidade
        l.custo_eur -= l.custo_eur * fracao
        l.quantidade = arred(l.quantidade - sai)
        falta = arred(falta - sai)
        if (l.quantidade <= 1e-9) lotes.shift()
      }
    }
  }
  return por
}

export function calcularCarteira(transacoes: Transacao[], acoes: AcaoCalculada[], impostos?: Parametros['impostos']): Posicao[] {
  const porTicker = new Map(acoes.map(a => [a.ticker, a]))
  const lotes = lotesAbertos(transacoes)
  const pags = pagamentos(transacoes)
  const nomes: Record<string, string> = {}
  for (const t of transacoes) if (t.ticker && t.nome && !/^\d+$/.test(t.nome)) nomes[t.ticker] ??= t.nome
  const tickers = new Set([...Object.keys(lotes).filter(t => lotes[t].length)])
  const out: Posicao[] = []
  for (const ticker of tickers) {
    const ls = lotes[ticker]
    const quantidade = arred(soma(ls.map(l => l.quantidade)))
    if (quantidade <= 1e-9) continue
    const comPreco = ls.filter(l => l.preco != null)
    const qp = soma(comPreco.map(l => l.quantidade))
    const preco_medio = qp > 0 ? soma(comPreco.map(l => l.quantidade * (l.preco as number))) / qp : null
    const custo_eur = soma(ls.map(l => l.custo_eur))
    const a = porTicker.get(ticker) ?? null
    const preco_atual_eur = a ? (a.cotacao_xtb?.preco_eur ?? a.preco_eur) : null
    const valor_eur = preco_atual_eur != null ? quantidade * preco_atual_eur : null
    const lucro_eur = valor_eur != null ? valor_eur - custo_eur : null
    const meus = pags.filter(p => p.ticker === ticker)
    const dividendos = {
      bruto: soma(meus.map(p => p.bruto)), retido: soma(meus.map(p => p.retido)), liquido: soma(meus.map(p => p.liquido)),
    }
    const anualBruto = a?.dividendo.anual_eur != null ? quantidade * a.dividendo.anual_eur : null
    const anualLiquido = anualBruto != null && a ? anualBruto * (1 - a.imposto.taxa) : null
    // retenção real: a da XTB nos pagamentos mais recentes
    const ultimoComTaxa = [...meus].reverse().find(p => p.taxa != null)
    const real = ultimoComTaxa?.taxa ?? null
    const esperada = a ? (impostos ? retencaoEsperada(a.pais, impostos) : a.imposto.retencao) : null
    out.push({
      ticker, nome: a?.nome ?? nomes[ticker] ?? ticker, quantidade, lotes: ls, preco_medio, custo_eur, acao: a,
      preco_atual_eur, valor_eur, lucro_eur, lucro_pct: lucro_eur != null && custo_eur > 0 ? lucro_eur / custo_eur : null,
      dividendos,
      previsto: { anual_bruto: anualBruto, anual_liquido: anualLiquido, mensal_liquido: anualLiquido != null ? anualLiquido / 12 : null },
      yield_on_cost: {
        bruto: anualBruto != null && custo_eur > 0 ? anualBruto / custo_eur : null,
        liquido: anualLiquido != null && custo_eur > 0 ? anualLiquido / custo_eur : null,
      },
      retencao: { real, esperada, aviso: real != null && esperada != null && real > esperada + 0.005 },
    })
  }
  return out.sort((x, y) => (y.valor_eur ?? y.custo_eur) - (x.valor_eur ?? x.custo_eur))
}

export interface Resumo {
  investido_eur: number
  valor_eur: number
  sem_cotacao: string[]
  lucro_eur: number
  depositos_eur: number
  levantamentos_eur: number
  juros_liquidos_eur: number
  dividendos: { bruto: number; retido: number; liquido: number }
  ultimos12m_liquido: number
  previsto_anual_liquido: number
  previsto_mensal_liquido: number
  yield_on_cost_liquido: number | null
}

export function resumo(posicoes: Posicao[], transacoes: Transacao[], hoje = new Date()): Resumo {
  const pags = pagamentos(transacoes)
  const limite = new Date(hoje.getTime() - 365 * 86400000).toISOString().slice(0, 10)
  const somaTipo = (tipo: string) => soma(transacoes.filter(t => t.tipo === tipo).map(t => t.valor_eur))
  const investido = soma(posicoes.map(p => p.custo_eur))
  const comValor = posicoes.filter(p => p.valor_eur != null)
  const previsto = soma(posicoes.map(p => p.previsto.anual_liquido ?? 0))
  return {
    investido_eur: investido,
    valor_eur: soma(comValor.map(p => p.valor_eur as number)),
    sem_cotacao: posicoes.filter(p => p.valor_eur == null).map(p => p.ticker),
    lucro_eur: soma(comValor.map(p => p.lucro_eur as number)),
    depositos_eur: somaTipo('deposito'),
    levantamentos_eur: -somaTipo('levantamento'),
    juros_liquidos_eur: somaTipo('juro') + somaTipo('imposto_juro'),
    dividendos: { bruto: soma(pags.map(p => p.bruto)), retido: soma(pags.map(p => p.retido)), liquido: soma(pags.map(p => p.liquido)) },
    ultimos12m_liquido: soma(pags.filter(p => p.data >= limite).map(p => p.liquido)),
    previsto_anual_liquido: previsto,
    previsto_mensal_liquido: previsto / 12,
    yield_on_cost_liquido: investido > 0 ? previsto / investido : null,
  }
}

/** Dividendos recebidos por mês (AAAA-MM), para o gráfico e a tabela. */
export function porMes(transacoes: Transacao[]) {
  const por: Record<string, { mes: string; bruto: number; retido: number; liquido: number }> = {}
  for (const p of pagamentos(transacoes)) {
    const m = p.data.slice(0, 7)
    const x = (por[m] ??= { mes: m, bruto: 0, retido: 0, liquido: 0 })
    x.bruto += p.bruto; x.retido += p.retido; x.liquido += p.liquido
  }
  return Object.values(por).sort((a, b) => a.mes.localeCompare(b.mes))
}

/** Peso de cada grupo (empresa, setor, país, moeda) no valor da carteira. */
export function diversificacao(posicoes: Posicao[], por: 'empresa' | 'setor' | 'pais' | 'moeda') {
  const grupos: Record<string, number> = {}
  for (const p of posicoes) {
    const v = p.valor_eur ?? p.custo_eur
    const a = p.acao
    const k = por === 'empresa' ? p.ticker
      : por === 'setor' ? (a?.setor ?? 'Desconhecido')
        : por === 'pais' ? (a?.pais ?? 'Desconhecido')
          : (a?.cotacao_xtb?.moeda ?? a?.moeda ?? 'Desconhecida')
    grupos[k] = (grupos[k] ?? 0) + v
  }
  const total = soma(Object.values(grupos))
  return Object.entries(grupos).map(([nome, valor]) => ({ nome, valor, peso: total > 0 ? valor / total : 0 }))
    .sort((a, b) => b.valor - a.valor)
}

export interface Diferenca { ticker: string; campo: 'quantidade' | 'preço médio' | 'só no extrato' | 'só na XTB'; nosso: number | null; xtb: number | null }

/** Confirma as posições calculadas contra a folha "Open Positions" do extrato. */
export function verificar(posicoes: Posicao[], abertas: PosicaoAbertaXtb[]): Diferenca[] {
  const dif: Diferenca[] = []
  const nossas = new Map(posicoes.map(p => [p.ticker, p]))
  for (const x of abertas) {
    const p = nossas.get(x.ticker)
    if (!p) { dif.push({ ticker: x.ticker, campo: 'só na XTB', nosso: null, xtb: x.volume }); continue }
    if (Math.abs(p.quantidade - x.volume) > 1e-4) dif.push({ ticker: x.ticker, campo: 'quantidade', nosso: p.quantidade, xtb: x.volume })
    // a XTB mostra o preço médio arredondado: tolerância de 0,5% (ou 1 cêntimo)
    if (p.preco_medio != null && x.preco_medio != null &&
      Math.abs(p.preco_medio - x.preco_medio) > Math.max(0.01, x.preco_medio * 0.005)) {
      dif.push({ ticker: x.ticker, campo: 'preço médio', nosso: p.preco_medio, xtb: x.preco_medio })
    }
  }
  for (const p of posicoes) {
    if (!abertas.some(x => x.ticker === p.ticker) && abertas.length) dif.push({ ticker: p.ticker, campo: 'só no extrato', nosso: p.quantidade, xtb: null })
  }
  return dif
}

/** Junta operações novas às guardadas, sem duplicados (pelo ID da XTB). */
export function juntar(guardadas: Transacao[], novas: Transacao[]): { todas: Transacao[]; novas: number; repetidas: number } {
  const ids = new Set(guardadas.map(t => t.id))
  const realmenteNovas = novas.filter(t => !ids.has(t.id))
  return { todas: [...guardadas, ...realmenteNovas], novas: realmenteNovas.length, repetidas: novas.length - realmenteNovas.length }
}
