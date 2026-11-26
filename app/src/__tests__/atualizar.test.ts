import { describe, expect, it } from 'vitest'
import { aplicarPrecos, cambioAgora, diasValidade, precosValidos, simbolosPara, type PrecosAgora } from '../lib/atualizar'
import type { Acao } from '../tipos'

// como nos dados reais: a linha da XTB tem o mesmo símbolo, salvo quando é de outra bolsa
const acao = (over: Partial<Acao>): Acao => ({
  ticker: 'X.US', ticker_yahoo: 'X', moeda: 'USD', preco: 10, preco_eur: 9, cambio_eur: 0.9, variacao_dia: 0,
  ...over,
  cotacao_xtb: over.cotacao_xtb ?? { simbolo: over.ticker_yahoo ?? 'X', preco: 10, moeda: over.moeda ?? 'USD', variacao_dia: 0, cambio_eur: 0.9, preco_eur: 9 },
} as Acao)

const p: PrecosAgora = {
  em: '2026-11-26T15:00:00Z',
  precos: {
    KO: { preco: 100, moeda: 'USD', anterior: 80, hora: null },
    'VOD.L': { preco: 200, moeda: 'GBp', anterior: 200, hora: null },
    'TU': { preco: 15, moeda: 'USD', anterior: null, hora: null },
    'EURUSD=X': { preco: 1.25, moeda: 'USD', anterior: null, hora: null },
    'EURGBP=X': { preco: 0.8, moeda: 'GBP', anterior: null, hora: null },
  },
}

describe('Atualizar preços', () => {
  it('pede as ações, a linha da XTB quando é outra e os câmbios (sem EUR)', () => {
    const s = simbolosPara([
      acao({ ticker_yahoo: 'KO', moeda: 'USD' }),
      acao({ ticker_yahoo: 'T.TO', moeda: 'CAD', cotacao_xtb: { simbolo: 'TU', moeda: 'USD', preco: 1, variacao_dia: 0, cambio_eur: 1, preco_eur: 1 } }),
      acao({ ticker_yahoo: 'VOD.L', moeda: 'GBp', cotacao_xtb: { simbolo: 'VOD.L', moeda: 'GBp', preco: 1, variacao_dia: 0, cambio_eur: 1, preco_eur: 1 } }),
      acao({ ticker_yahoo: 'SAP.DE', moeda: 'EUR' }),
    ])
    expect(s.sort()).toEqual(['EURCAD=X', 'EURGBP=X', 'EURUSD=X', 'KO', 'SAP.DE', 'T.TO', 'TU', 'VOD.L'])
  })

  it('câmbio: EUR = 1, pence divididos por 100, sem câmbio = null', () => {
    expect(cambioAgora('EUR', p)).toBe(1)
    expect(cambioAgora('USD', p)).toBeCloseTo(0.8)
    expect(cambioAgora('GBp', p)).toBeCloseTo(0.0125)
    expect(cambioAgora('CHF', p)).toBeNull()
  })

  it('aplica preço, câmbio, preço em € e variação do dia; ignora moedas diferentes', () => {
    const [ko, vod, outra, cad] = aplicarPrecos([
      acao({ ticker_yahoo: 'KO', cotacao_xtb: { simbolo: 'KO', preco: 90, moeda: 'USD', variacao_dia: 0, cambio_eur: 0.9, preco_eur: 81 } }),
      acao({ ticker_yahoo: 'VOD.L', moeda: 'GBp', }),
      acao({ ticker_yahoo: 'KO', moeda: 'EUR', }),
      acao({ ticker_yahoo: 'T.TO', moeda: 'CAD', cambio_eur: 0.7, cotacao_xtb: { simbolo: 'TU', moeda: 'USD', preco: 14, variacao_dia: 0, cambio_eur: 0.9, preco_eur: 12.6 } }),
    ], p)
    expect(ko.preco).toBe(100)
    expect(ko.preco_eur).toBeCloseTo(80)
    expect(ko.variacao_dia).toBeCloseTo(0.25)
    expect(ko.cotacao_xtb.preco_eur).toBeCloseTo(80)
    expect(ko.preco_agora_em).toBe(p.em)
    expect(vod.preco_eur).toBeCloseTo(2.5)
    expect(outra.preco).toBe(10) // moeda diferente: fica como estava
    expect(outra.preco_agora_em).toBeUndefined()
    expect(cad.preco).toBe(10) // T.TO não veio
    expect(cad.cotacao_xtb.preco).toBe(15) // mas a linha da XTB sim
    expect(cad.cotacao_xtb.preco_eur).toBeCloseTo(12)
  })

  it('os preços só valem se forem mais recentes do que os dados publicados', () => {
    expect(precosValidos(p, '2026-11-26T03:00:00Z')).toBe(true)
    expect(precosValidos(p, '2026-11-26T15:40:00Z')).toBe(false)
    expect(precosValidos(null, '2026-11-26T03:00:00Z')).toBe(false)
  })

  it('dias até o token expirar', () => {
    const agora = new Date('2026-11-26T10:00:00Z')
    expect(diasValidade('2027-11-26 10:00:00 UTC', agora)).toBe(365)
    expect(diasValidade('2026-12-06 10:00:00 +0000', agora)).toBe(10)
    expect(diasValidade(null, agora)).toBeNull()
    expect(diasValidade('lixo', agora)).toBeNull()
  })
})
