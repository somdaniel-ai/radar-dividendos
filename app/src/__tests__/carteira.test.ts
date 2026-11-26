// Leitura do extrato e cálculos da carteira, com dados inventados (no formato da XTB).
import { describe, expect, it } from 'vitest'
import { calcularCarteira, diversificacao, juntar, pagamentos, porMes, resumo, verificar } from '../lib/carteira'
import type { AcaoCalculada } from '../lib/calculos'
import { lerExtrato, type Folha } from '../lib/extrato'

const d = (s: string) => new Date(`${s}Z`)
const CABECALHO = ['Type', 'Instrument', 'Ticker', 'Category', 'Time', 'Amount', 'ID', 'Comment', 'Product', 'Position ID']
const cash: Folha = [
  ['Account number', '12345678'],
  ['Cash Operations', ''],
  ['Date from (UTC)', d('2006-01-01T00:00:00')],
  ['Date to (UTC)', d('2026-11-24T11:53:35')],
  CABECALHO,
  ['Deposit', '', '', '', d('2026-01-02T10:00:00'), 1000, '1', 'BANCO deposit, provider transaction id=TXN-1', 'My Trades', ''],
  ['Stock purchase', 'Runway Growth', 'RWAY.US', 'STOCK', d('2026-02-06T14:00:00'), -51.55, '2', 'OPEN BUY RWAY.US 10/10 @ 6.00', 'My Trades', '900'],
  ['Stock purchase', 'Runway Growth', 'RWAY.US', 'STOCK', d('2026-03-06T14:00:00'), -26.10, '3', 'OPEN BUY RWAY.US 0.7009/5 @ 6.03', 'My Trades', '901'],
  ['Stock purchase', 'Telus', 'TU.US', 'STOCK', d('2026-03-10T14:00:00'), -70.00, '4', 'OPEN BUY 5 @ 16.00', 'My Trades', '902'],
  // dividendo da Telus em CAD, depois corrigido (anulado) e pago outra vez em USD
  ['Dividend', 'Telus', 'TU.US', 'STOCK', d('2026-04-01T09:58:00'), 8.01, '10', 'TU.US CAD 0.4184/ SHR', 'My Trades', '902'],
  ['Withholding tax', 'Telus', 'TU.US', 'STOCK', d('2026-04-01T09:58:00'), -2.00, '11', 'TU.US CAD WHT 25%', 'My Trades', '902'],
  ['Dividend', 'Telus', 'TU.US', 'STOCK', d('2026-04-03T09:54:00'), 8.05, '12', 'TU.US USD 0.3013/ SHR', 'My Trades', '902'],
  ['Withholding tax', 'Telus', 'TU.US', 'STOCK', d('2026-04-03T09:54:00'), -2.01, '13', 'TU.US USD WHT 25%', 'My Trades', '902'],
  ['Dividend', 'Telus', 'TU.US', 'STOCK', d('2026-04-08T10:45:00'), -8.01, '14', 'corr TU.US CAD 0.4184/ SHR from 2026-04-01', 'My Trades', '902'],
  ['Withholding tax', '', 'TU.US', 'STOCK', d('2026-04-08T10:45:00'), 2.00, '15', 'corr TU.US CAD WHT 25% from 2026-04-01', 'My Trades', '902'],
  ['Dividend', 'Runway Growth', 'RWAY.US', 'STOCK', d('2026-05-01T09:58:00'), 3.00, '16', 'RWAY.US USD 0.33/ SHR', 'My Trades', ''],
  ['Withholding tax', 'Runway Growth', 'RWAY.US', 'STOCK', d('2026-05-01T09:58:00'), -0.90, '17', 'RWAY.US USD WHT 30%', 'My Trades', ''],
  ['Withholding tax', 'Runway Growth', 'RWAY.US', 'STOCK', d('2026-05-20T18:20:00'), 0.10, '18', 'US Dividends Reclassification 2025', 'My Trades', ''],
  ['Free funds interest', '', '', '', d('2026-06-01T00:00:00'), 0.50, '19', 'Free-funds Interest 2026-05', 'My Trades', ''],
  ['Free funds interest tax', '', '', '', d('2026-06-01T00:00:00'), -0.10, '20', 'Free-funds Interest Tax 2026-05', 'My Trades', ''],
  ['Stock purchase', 'Runway Growth', 'RWAY.US', 'STOCK', d('2026-02-06T14:00:00'), -51.55, '2', 'OPEN BUY RWAY.US 10/10 @ 6.00', 'My Trades', '900'], // repetida
  ['Total', '', '', '', null, 870, '', '', '', ''],
]
const abertas: Folha = [
  ['Account number', '12345678'],
  ['Open Positions', ''],
  ['Data as of report generated', d('2026-11-24T11:53:40')],
  ['Product', 'Metric', 'Amount', 'Currency'],
  ['My Trades', 'Open position value', 150, 'EUR'],
  [],
  ['Note', 'Summary values…'],
  ['Product', 'Instrument/Position', 'Ticker', 'Category', 'Type', 'Volume', 'Value', 'Current price', 'Open price', 'Open time (UTC)'],
  ['My Trades', 'Runway Growth Finance', 'RWAY.US', 'STOCK', '', 10.7009, 60, '', 6.0, ''],
  ['My Trades', '900', 'RWAY.US', '', 'BUY', 10, 55, 6.1, 6.0, d('2026-02-06T14:00:00')],
  ['My Trades', '901', 'RWAY.US', '', 'BUY', 0.7009, 5, 6.1, 6.03, d('2026-03-06T14:00:00')],
  ['My Trades', 'Telus', 'TU.US', 'STOCK', '', 5, 70, '', 16.0, ''],
  ['My Trades', '902', 'TU.US', '', 'BUY', 5, 70, 16.5, 16.0, d('2026-03-10T14:00:00')],
]
const extrato = lerExtrato({ 'Closed Positions': [], 'Cash Operations': cash, 'Open Positions': abertas })

const acao = (ticker: string, extra: Partial<AcaoCalculada> & Record<string, unknown>) => ({
  ticker, nome: ticker, setor: 'Financeiro', pais: 'Estados Unidos', moeda: 'USD', preco_eur: 5.5,
  cotacao_xtb: { simbolo: ticker, preco: 6, moeda: 'USD', variacao_dia: 0, cambio_eur: 0.92, preco_eur: 5.5 },
  dividendo: { anual_eur: 1.2 }, imposto: { taxa: 0.3, retencao: 0.15, conhecida: true }, ...extra,
}) as unknown as AcaoCalculada

describe('leitura do extrato', () => {
  it('lê todos os tipos, sem duplicados, sem a linha Total e sem o número de conta', () => {
    expect(extrato.avisos).toEqual([])
    expect(extrato.transacoes).toHaveLength(15)
    expect(extrato.gerado_em).toBe('2026-11-24T11:53:35.000Z')
    expect(JSON.stringify(extrato)).not.toContain('12345678')
    expect(extrato.transacoes.find(t => t.tipo === 'deposito')?.comentario).toBeUndefined() // sem referências bancárias
  })
  it('quantidade e preço vêm do comentário (também sem o ticker)', () => {
    const c = extrato.transacoes.filter(t => t.tipo === 'compra')
    expect(c.map(t => [t.ticker, t.quantidade, t.preco])).toEqual([['RWAY.US', 10, 6], ['RWAY.US', 0.7009, 6.03], ['TU.US', 5, 16]])
  })
  it('dividendos e retenções: valor por ação, taxa e correções', () => {
    const div = extrato.transacoes.find(t => t.id === '12')!
    expect([div.moeda, div.por_acao]).toEqual(['USD', 0.3013])
    expect(extrato.transacoes.find(t => t.id === '13')!.taxa).toBe(0.25)
    expect(extrato.transacoes.find(t => t.id === '14')!.corrige).toBe('2026-04-01')
  })
  it('posições abertas da XTB', () => {
    expect(extrato.posicoes.map(p => [p.ticker, p.volume, p.preco_medio, p.lotes.length])).toEqual([['RWAY.US', 10.7009, 6, 2], ['TU.US', 5, 16, 1]])
  })
  it('ficheiro que não é da XTB', () => {
    expect(() => lerExtrato({ Folha1: [['a']] })).toThrow(/Cash Operations/)
  })
})

describe('carteira', () => {
  const acoes = [acao('RWAY.US', {}), acao('TU.US', { cotacao_xtb: { preco_eur: 15 } as never, imposto: { taxa: 0.28, retencao: 0.15, conhecida: true } })]
  const pos = calcularCarteira(extrato.transacoes, acoes)
  const rway = pos.find(p => p.ticker === 'RWAY.US')!

  it('posições, lotes, preço médio e custo em EUR', () => {
    expect(rway.quantidade).toBeCloseTo(10.7009)
    expect(rway.lotes).toHaveLength(2)
    expect(rway.preco_medio).toBeCloseTo((10 * 6 + 0.7009 * 6.03) / 10.7009, 6)
    expect(rway.custo_eur).toBeCloseTo(77.65)
    expect(rway.valor_eur).toBeCloseTo(10.7009 * 5.5)
    expect(rway.lucro_eur).toBeCloseTo(10.7009 * 5.5 - 77.65)
  })
  it('a correção da Telus anula o pagamento em CAD', () => {
    const tu = pagamentos(extrato.transacoes).filter(p => p.ticker === 'TU.US')
    expect(tu).toHaveLength(1)
    expect(tu[0]).toMatchObject({ data: '2026-04-03', bruto: 8.05, retido: 2.01, taxa: 0.25 })
  })
  it('dividendos reais (com a devolução da retenção) e previstos, yield on cost', () => {
    expect(rway.dividendos.bruto).toBeCloseTo(3)
    expect(rway.dividendos.retido).toBeCloseTo(0.8)
    expect(rway.previsto.anual_bruto).toBeCloseTo(10.7009 * 1.2)
    expect(rway.previsto.anual_liquido).toBeCloseTo(10.7009 * 1.2 * 0.7)
    expect(rway.yield_on_cost.liquido).toBeCloseTo((10.7009 * 1.2 * 0.7) / 77.65)
  })
  it('aviso de retenção: a XTB reteve 30% e o esperado era 15%', () => {
    expect(rway.retencao).toEqual({ real: 0.3, esperada: 0.15, aviso: true })
  })
  it('aviso de retenção também no modo de impostos "simples" (usa a tabela de países)', () => {
    const impostos = { modo: 'simples', taxa_simples: 0.3, taxa_portugal: 0.28, w8ben_ativo: true,
      por_pais: { 'Estados Unidos': { retencao: 0.3, retencao_w8ben: 0.15, credito_max: 0.15 } } } as never
    const semRet = [acao('RWAY.US', { imposto: { taxa: 0.3, retencao: null, conhecida: true } })]
    expect(calcularCarteira(extrato.transacoes, semRet, impostos).find(p => p.ticker === 'RWAY.US')!.retencao).toEqual({ real: 0.3, esperada: 0.15, aviso: true })
    const semW8 = { ...(impostos as object), w8ben_ativo: false } as never
    expect(calcularCarteira(extrato.transacoes, semRet, semW8).find(p => p.ticker === 'RWAY.US')!.retencao.aviso).toBe(false)
  })
  it('resumo, meses e diversificação', () => {
    const r = resumo(pos, extrato.transacoes, new Date('2026-11-24'))
    expect(r.depositos_eur).toBe(1000)
    expect(r.juros_liquidos_eur).toBeCloseTo(0.4)
    expect(r.dividendos.liquido).toBeCloseTo(8.05 - 2.01 + 3 - 0.8)
    expect(porMes(extrato.transacoes).map(m => m.mes)).toEqual(['2026-04', '2026-05'])
    const div = diversificacao(pos, 'empresa')
    expect(div.reduce((s, x) => s + x.peso, 0)).toBeCloseTo(1)
  })
  it('bate certo com Open Positions; e deteta diferenças', () => {
    expect(verificar(pos, extrato.posicoes)).toEqual([])
    const errado = extrato.posicoes.map(p => p.ticker === 'TU.US' ? { ...p, volume: 6 } : p)
    expect(verificar(pos, errado)).toEqual([{ ticker: 'TU.US', campo: 'quantidade', nosso: 5, xtb: 6 }])
  })
  it('vendas saem dos lotes mais antigos', () => {
    const venda = { id: 'v', tipo: 'venda' as const, ticker: 'RWAY.US', nome: null, data: '2026-10-01T00:00:00Z', valor_eur: 60, quantidade: 10.5, preco: 6.2, origem: 'xtb' as const }
    const p = calcularCarteira([...extrato.transacoes, venda], acoes).find(x => x.ticker === 'RWAY.US')!
    expect(p.quantidade).toBeCloseTo(0.2009)
    expect(p.lotes).toHaveLength(1)
    expect(p.custo_eur).toBeCloseTo(26.10 * 0.2009 / 0.7009)
  })
  it('reimportar não cria duplicados', () => {
    const r = juntar(extrato.transacoes, extrato.transacoes)
    expect([r.todas.length, r.novas, r.repetidas]).toEqual([15, 0, 15])
    expect(r.substituidas).toEqual([])
  })
  it('compra escrita à mão igual a uma do extrato (ação, dia, quantidade) é substituída pela do extrato', () => {
    const xtb = extrato.transacoes.find(t => t.tipo === 'compra' && t.origem === 'xtb')!
    const dia = new Date(xtb.data).toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
    const manual = (id: string, extra: Partial<typeof xtb> = {}) => ({
      ...xtb, id, origem: 'manual' as const, data: `${dia}T12:00:00.000Z`, comentario: undefined, ...extra })
    const igual = manual('manual-1')
    const outroDia = manual('manual-2', { data: '2001-01-01T12:00:00.000Z' })
    const outraQtd = manual('manual-3', { quantidade: (xtb.quantidade ?? 0) + 1 })
    const r = juntar([igual, outroDia, outraQtd], extrato.transacoes)
    expect(r.substituidas.map(t => t.id)).toEqual(['manual-1'])
    expect(r.todas.some(t => t.id === 'manual-1')).toBe(false)
    expect(r.todas.filter(t => t.id === 'manual-2' || t.id === 'manual-3')).toHaveLength(2)
    expect(r.todas.filter(t => t.id === xtb.id)).toHaveLength(1)
    // duas compras à mão iguais: a compra do extrato só substitui uma
    expect(juntar([igual, manual('manual-4')], extrato.transacoes).substituidas).toHaveLength(1)
    // também funciona se o extrato já tinha sido importado antes (compra à mão acrescentada depois)
    expect(juntar([...extrato.transacoes, igual], extrato.transacoes).substituidas.map(t => t.id)).toEqual(['manual-1'])
  })
})
