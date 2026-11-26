import { describe, expect, it } from 'vitest'
import type { AcaoCalculada } from '../lib/calculos'
import { datasAcao, eventos, grelhaMes, proximasDatas, somarMeses, totalPorMes } from '../lib/calendario'
import type { Posicao } from '../lib/carteira'
import { linhasTabela, totais } from '../componentes/TabelaPosicoes'

const acao = (over: Partial<AcaoCalculada['pagamento']> & { freq?: number; ticker?: string } = {}) => {
  const { freq = 4, ticker = 'AAA.US', ...pag } = over
  return {
    ticker, nome: `Empresa ${ticker}`, moeda: 'USD', cambio_eur: 0.9, pagamentos_ano: freq,
    dividendo: { ultimo: 0.5 }, imposto: { taxa: 0.3 },
    pagamento: { ultimo_ex: '2026-11-10', esperado: null, dias_para_pagamento: null, atrasado: false,
      proxima_ex_anunciada: null, data_pagamento: null, ...pag },
  } as unknown as AcaoCalculada
}

describe('calendário', () => {
  it('somar meses limita o dia ao fim do mês', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29')
    expect(somarMeses('2026-11-10', 3)).toBe('2027-02-10')
    expect(somarMeses('2026-12-15', -1)).toBe('2026-11-15')
  })

  it('trimestral sem datas anunciadas: 4 datas ex estimadas num ano, sem pagamentos', () => {
    const d = datasAcao(acao(), '2026-11-26', '2027-11-26')
    expect(d.map(x => x.data)).toEqual(['2027-02-10', '2027-05-10', '2027-08-10', '2027-11-10'])
    expect(d.every(x => x.tipo === 'ex' && !x.confirmada)).toBe(true)
  })

  it('datas anunciadas são confirmadas e o atraso ex→pagamento é usado nas estimadas', () => {
    const d = datasAcao(acao({ ultimo_ex: '2026-08-10', proxima_ex_anunciada: '2026-12-01', data_pagamento: '2026-12-20' }),
      '2026-11-26', '2027-06-30')
    expect(d.filter(x => x.confirmada)).toEqual([
      { data: '2026-12-01', tipo: 'ex', confirmada: true }, { data: '2026-12-20', tipo: 'pagamento', confirmada: true },
    ])
    // estimadas partem da data anunciada (não há duplicado em dezembro)
    expect(d.filter(x => !x.confirmada).map(x => `${x.tipo} ${x.data}`)).toEqual([
      'ex 2027-03-01', 'pagamento 2027-03-20', 'ex 2027-06-01', 'pagamento 2027-06-20',
    ])
  })

  it('pagamento anunciado ainda por vir conta mesmo que a data ex já tenha passado', () => {
    const d = datasAcao(acao({ freq: 12, ultimo_ex: '2026-11-23', proxima_ex_anunciada: '2026-11-23', data_pagamento: '2026-12-01' }),
      '2026-11-26', '2027-01-31')
    expect(d).toContainEqual({ data: '2026-12-01', tipo: 'pagamento', confirmada: true })
    expect(d).toContainEqual({ data: '2026-12-23', tipo: 'ex', confirmada: false })
    expect(d).toContainEqual({ data: '2026-12-31', tipo: 'pagamento', confirmada: false }) // 23/12 + 8 dias
  })

  it('pagamento anunciado antigo ou incoerente é ignorado; irregular não tem estimadas', () => {
    expect(datasAcao(acao({ proxima_ex_anunciada: '2026-12-01', data_pagamento: '2026-06-01' }), '2026-11-26', '2027-01-31')
      .some(x => x.tipo === 'pagamento')).toBe(false)
    expect(datasAcao(acao({ freq: 0 }), '2026-11-26', '2027-11-26')).toEqual([])
  })

  it('eventos: valores da carteira em EUR (bruto e líquido), favoritos só por ação, recebidos', () => {
    const evs = eventos({
      acoes: [acao(), acao({ ticker: 'BBB.US' })], quantidades: { 'AAA.US': 10 }, favoritos: new Set(['BBB.US']),
      recebidos: [{ data: '2026-11-15', ticker: 'AAA.US', bruto: 4.5, retido: 1.35, liquido: 3.15, por_acao: 0.5, moeda: 'USD', taxa: 0.3 }],
      hoje: '2026-11-26', meses: 4,
    })
    const a = evs.find(e => e.ticker === 'AAA.US' && e.tipo === 'ex')!
    expect(a.na_carteira).toBe(true)
    expect(a.bruto_eur).toBeCloseTo(0.5 * 0.9 * 10)
    expect(a.liquido_eur).toBeCloseTo(0.5 * 0.9 * 10 * 0.7)
    const b = evs.find(e => e.ticker === 'BBB.US')!
    expect(b.favorito).toBe(true)
    expect(b.liquido_eur).toBeNull()
    expect(b.por_acao).toBe(0.5)
    expect(evs[0]).toMatchObject({ tipo: 'recebido', data: '2026-11-15', liquido_eur: 3.15 })
    expect(totalPorMes(evs)['2026-11']).toEqual({ previsto: 0, recebido: 3.15 })
  })

  it('grelha do mês começa à segunda-feira', () => {
    const g = grelhaMes('2026-12') // 1 de dezembro de 2026 é terça
    expect(g[0]).toEqual([null, '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'])
    expect(g.flat().filter(Boolean)).toHaveLength(31)
    expect(g.every(s => s.length === 7)).toBe(true)
  })

  it('próximas datas: pagamento confirmado antes da próxima data ex (estimada)', () => {
    const r = proximasDatas(acao({ freq: 12, ultimo_ex: '2026-11-23', proxima_ex_anunciada: '2026-11-23', data_pagamento: '2026-12-01' }), '2026-11-26')
    expect(r.pagamento).toEqual({ data: '2026-12-01', confirmada: true, dias: 5 })
    expect(r.ex).toEqual({ data: '2026-12-23', confirmada: false, dias: 27 })
    expect(proximasDatas(acao({ freq: 0 }), '2026-11-26')).toEqual({ ex: null, pagamento: null })
  })

  it('tabela da carteira: peso pelo valor (ou custo sem cotação) e totais', () => {
    const pos = (ticker: string, custo: number, valor: number | null, anual: number | null, recebido: number) => ({
      ticker, custo_eur: custo, valor_eur: valor, acao: null, previsto: { anual_liquido: anual, mensal_liquido: anual != null ? anual / 12 : null },
      dividendos: { liquido: recebido },
    }) as unknown as Posicao
    const ls = linhasTabela([pos('A', 100, 150, 12, 3), pos('B', 50, null, null, 1)], '2026-11-26')
    expect(ls[0].peso).toBeCloseTo(150 / 200)
    expect(ls[1].peso).toBeCloseTo(50 / 200)
    const t = totais(ls)
    expect(t).toMatchObject({ investido: 150, valor: 200, ganho: 50, mensal: 1, recebidos: 4 })
    expect(t.yoc).toBeCloseTo(12 / 150)
  })
})
