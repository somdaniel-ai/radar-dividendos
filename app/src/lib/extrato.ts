// Leitura do extrato da XTB (.xlsx), feita no próprio browser: o ficheiro nunca sai do aparelho.
// Recebe as folhas já lidas (linhas × colunas) e devolve as operações e as posições abertas.
// O número de conta NUNCA é lido nem guardado.

export type TipoTransacao =
  | 'compra' | 'venda' | 'dividendo' | 'retencao' | 'deposito' | 'levantamento' | 'juro' | 'imposto_juro' | 'outro'

export interface Transacao {
  /** ID da XTB (evita duplicados ao reimportar) ou "manual-…" */
  id: string
  tipo: TipoTransacao
  ticker: string | null
  nome: string | null
  /** data/hora ISO (UTC) */
  data: string
  /** montante em EUR, como no extrato (compras e retenções negativas) */
  valor_eur: number
  quantidade?: number | null
  /** preço por ação na moeda da bolsa */
  preco?: number | null
  moeda?: string | null
  /** dividendo por ação (moeda em `moeda`) */
  por_acao?: number | null
  /** taxa de retenção indicada pela XTB (0,30 = 30%) */
  taxa?: number | null
  /** correção de um pagamento anterior ("corr … from 2026-04-01"): data do original */
  corrige?: string | null
  comentario?: string | null
  tipo_original?: string
  origem: 'xtb' | 'manual'
}

export interface PosicaoAbertaXtb {
  ticker: string
  nome: string
  volume: number
  preco_medio: number | null
  valor_eur: number | null
  lotes: { id: string; volume: number; preco: number | null; data: string | null }[]
}

export interface Extrato {
  transacoes: Transacao[]
  posicoes: PosicaoAbertaXtb[]
  /** data em que a XTB gerou o relatório */
  gerado_em: string | null
  /** linhas que não foram percebidas (para mostrar ao utilizador) */
  avisos: string[]
}

export type Celula = string | number | boolean | Date | null | undefined
export type Folha = Celula[][]

const texto = (c: Celula) => (c == null ? '' : c instanceof Date ? c.toISOString() : String(c)).trim()
const numeroCel = (c: Celula): number | null => {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null
  const t = texto(c).replace(/\s/g, '')
  if (!t) return null
  const n = Number(t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
const dataCel = (c: Celula): string | null => {
  if (c instanceof Date) return c.toISOString()
  if (typeof c === 'number' && c > 20000 && c < 80000) {
    // número de série do Excel (dias desde 1899-12-30)
    return new Date(Math.round((c - 25569) * 86400000)).toISOString()
  }
  const t = texto(c)
  if (!t) return null
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function cabecalho(folha: Folha, obrigatorias: string[]): { linha: number; col: Record<string, number> } | null {
  for (let i = 0; i < Math.min(folha.length, 40); i++) {
    const nomes = (folha[i] ?? []).map(texto)
    if (obrigatorias.every(o => nomes.includes(o))) {
      const col: Record<string, number> = {}
      nomes.forEach((n, j) => { if (n && !(n in col)) col[n] = j })
      return { linha: i, col }
    }
  }
  return null
}

const TICKER = String.raw`[A-Z0-9][A-Z0-9._-]*\.[A-Z]{2,3}`
const RE_COMPRA = new RegExp(String.raw`(?:OPEN\s+)?BUY\s+(?:(${TICKER})\s+)?([\d.]+)(?:\s*/\s*[\d.]+)?\s*@\s*([\d.]+)`, 'i')
const RE_VENDA = new RegExp(String.raw`(?:CLOSE\s+)?SELL\s+(?:(${TICKER})\s+)?([\d.]+)(?:\s*/\s*[\d.]+)?\s*@\s*([\d.]+)`, 'i')
const RE_DIVIDENDO = new RegExp(String.raw`^(corr\s+)?(${TICKER})\s+([A-Z]{3})\s+([\d.]+)\s*/\s*SHR(?:\s+from\s+(\d{4}-\d{2}-\d{2}))?`, 'i')
const RE_RETENCAO = new RegExp(String.raw`^(corr\s+)?(${TICKER})\s+([A-Z]{3})\s+WHT\s+([\d.]+)\s*%(?:\s+from\s+(\d{4}-\d{2}-\d{2}))?`, 'i')

const TIPOS: Record<string, TipoTransacao> = {
  'stock purchase': 'compra', 'stock sale': 'venda', 'stock sell': 'venda', dividend: 'dividendo',
  'withholding tax': 'retencao', deposit: 'deposito', withdrawal: 'levantamento',
  'free funds interest': 'juro', 'free funds interest tax': 'imposto_juro',
}

export function lerOperacoes(folha: Folha, avisos: string[] = []): Transacao[] {
  const c = cabecalho(folha, ['Type', 'Time', 'Amount', 'Comment'])
  if (!c) throw new Error('Não encontrei a folha "Cash Operations" com as colunas Type, Time, Amount e Comment.')
  const v = (linha: Celula[], nome: string) => (nome in c.col ? linha[c.col[nome]] : null)
  const out: Transacao[] = []
  const vistos = new Set<string>()
  for (const linha of folha.slice(c.linha + 1)) {
    const tipoXtb = texto(v(linha, 'Type'))
    if (!tipoXtb || tipoXtb.toLowerCase() === 'total') continue
    const data = dataCel(v(linha, 'Time'))
    const valor = numeroCel(v(linha, 'Amount'))
    if (!data || valor == null) {
      avisos.push(`Linha ignorada (sem data ou montante): ${tipoXtb}`)
      continue
    }
    const comentario = texto(v(linha, 'Comment'))
    const tipo = TIPOS[tipoXtb.toLowerCase()] ?? 'outro'
    let ticker = texto(v(linha, 'Ticker')).toUpperCase() || null
    const t: Transacao = {
      id: texto(v(linha, 'ID')), tipo, ticker, nome: texto(v(linha, 'Instrument')) || null,
      data, valor_eur: valor, origem: 'xtb',
    }
    if (tipo === 'compra' || tipo === 'venda') {
      const m = (tipo === 'compra' ? RE_COMPRA : RE_VENDA).exec(comentario)
      if (m) {
        ticker = ticker ?? m[1]?.toUpperCase() ?? null
        t.quantidade = Number(m[2])
        t.preco = Number(m[3])
      } else avisos.push(`Não percebi a quantidade/preço de: "${comentario}"`)
      t.comentario = comentario
    } else if (tipo === 'dividendo') {
      const m = RE_DIVIDENDO.exec(comentario)
      if (m) {
        ticker = ticker ?? m[2].toUpperCase()
        t.moeda = m[3].toUpperCase()
        t.por_acao = Number(m[4])
        t.corrige = m[1] ? (m[5] ?? '') : null
      } else avisos.push(`Dividendo com descrição desconhecida: "${comentario}"`)
      t.comentario = comentario
    } else if (tipo === 'retencao') {
      const m = RE_RETENCAO.exec(comentario)
      if (m) {
        ticker = ticker ?? m[2].toUpperCase()
        t.moeda = m[3].toUpperCase()
        t.taxa = Number(m[4]) / 100
        t.corrige = m[1] ? (m[5] ?? '') : null
      }
      // ex.: "US Dividends Reclassification 2025" (acerto da retenção, sem taxa)
      t.comentario = comentario
    } else if (tipo === 'outro') {
      t.tipo_original = tipoXtb
      t.comentario = comentario
      avisos.push(`Tipo de operação novo, guardado como "outro": ${tipoXtb}`)
    }
    // depósitos e juros: o comentário tem referências bancárias — não se guarda
    t.ticker = ticker
    if (!t.id) t.id = `sem-id-${tipo}-${data}-${valor}-${ticker ?? ''}-${comentario}`
    if (vistos.has(t.id)) continue
    vistos.add(t.id)
    out.push(t)
  }
  return out
}

export function lerPosicoes(folha: Folha): PosicaoAbertaXtb[] {
  const c = cabecalho(folha, ['Instrument/Position', 'Ticker', 'Volume'])
  if (!c) return []
  const v = (linha: Celula[], nome: string) => (nome in c.col ? linha[c.col[nome]] : null)
  const por: Record<string, PosicaoAbertaXtb> = {}
  for (const linha of folha.slice(c.linha + 1)) {
    const ticker = texto(v(linha, 'Ticker')).toUpperCase()
    if (!ticker) continue
    const tipo = texto(v(linha, 'Type')).toUpperCase()
    const p = (por[ticker] ??= { ticker, nome: '', volume: 0, preco_medio: null, valor_eur: null, lotes: [] })
    if (tipo === 'BUY' || tipo === 'SELL') {
      p.lotes.push({
        id: texto(v(linha, 'Instrument/Position')), volume: numeroCel(v(linha, 'Volume')) ?? 0,
        preco: numeroCel(v(linha, 'Open price')), data: dataCel(v(linha, 'Open time (UTC)')),
      })
    } else {
      // linha de resumo da empresa (Category = STOCK/ETF)
      p.nome = texto(v(linha, 'Instrument/Position'))
      p.volume = numeroCel(v(linha, 'Volume')) ?? 0
      p.preco_medio = numeroCel(v(linha, 'Open price'))
      p.valor_eur = numeroCel(v(linha, 'Value'))
    }
  }
  for (const p of Object.values(por)) {
    if (!p.volume && p.lotes.length) p.volume = p.lotes.reduce((s, l) => s + l.volume, 0)
  }
  return Object.values(por)
}

/** Data do relatório ("Data as of report generated" / "Date to (UTC)"). */
function dataRelatorio(folhas: Record<string, Folha>): string | null {
  for (const folha of Object.values(folhas)) {
    for (const linha of folha.slice(0, 6)) {
      const r = texto(linha?.[0])
      if (/report generated|date to/i.test(r)) return dataCel(linha[1])
    }
  }
  return null
}

export function lerExtrato(folhas: Record<string, Folha>): Extrato {
  const nome = (alvo: string) => Object.keys(folhas).find(n => n.trim().toLowerCase() === alvo)
  const cash = nome('cash operations')
  if (!cash) throw new Error('Este ficheiro não parece um extrato da XTB: falta a folha "Cash Operations".')
  const avisos: string[] = []
  const transacoes = lerOperacoes(folhas[cash], avisos)
  const abertas = nome('open positions')
  return { transacoes, posicoes: abertas ? lerPosicoes(folhas[abertas]) : [], gerado_em: dataRelatorio(folhas), avisos }
}

/** Lê um ficheiro .xlsx no browser (a biblioteca só é carregada quando é precisa). */
export async function lerFicheiroExtrato(ficheiro: File | Blob): Promise<Extrato> {
  const { default: lerXlsx } = await import('read-excel-file/browser')
  const folhas: Record<string, Folha> = {}
  for (const f of await lerXlsx(ficheiro)) folhas[f.sheet] = f.data
  return lerExtrato(folhas)
}
