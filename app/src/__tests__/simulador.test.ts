import { describe, expect, it } from 'vitest'
import type { AcaoCalculada } from '../lib/calculos'
import { distribuir, lerNumero, partesIguais, simular } from '../lib/simulador'

const acao = (ticker: string, preco: number | null, anualEur: number | null, taxa: number) =>
  ({ ticker, preco_eur: preco, dividendo: { anual_eur: anualEur }, imposto: { taxa } }) as unknown as AcaoCalculada

describe('simulador', () => {
  it('100 € numa ação de 10 € com 1 € de dividendo por ano e 30% de imposto', () => {
    const s = simular(acao('A', 10, 1, 0.3), 100)!
    expect(s.acoes).toBeCloseTo(10)
    expect(s.anual_bruto).toBeCloseTo(10)
    expect(s.anual_liquido).toBeCloseTo(7)
    expect(s.mensal_bruto).toBeCloseTo(10 / 12)
    expect(s.mensal_liquido).toBeCloseTo(7 / 12)
  })
  it('frações de ações permitidas', () => expect(simular(acao('A', 300, 6, 0), 100)!.acoes).toBeCloseTo(1 / 3))
  it('sem preço ou sem dividendo em EUR: sem resultado', () => {
    expect(simular(acao('A', null, 1, 0), 100)).toBeNull()
    expect(simular(acao('A', 10, null, 0), 100)).toBeNull()
  })

  it('distribuição: por ação e total, com yield sobre o investido', () => {
    const acoes = [acao('A', 10, 1, 0.3), acao('B', 20, 1, 0)]
    const d = distribuir([{ ticker: 'A', pct: 50 }, { ticker: 'B', pct: 50 }], 1000, acoes)
    expect(d.valida).toBe(true)
    expect(d.linhas[0].valor).toBe(500)
    expect(d.linhas[0].sim!.anual_liquido).toBeCloseTo(35) // 50 ações × 1 € × 70%
    expect(d.linhas[1].sim!.anual_liquido).toBeCloseTo(25) // 25 ações × 1 €
    expect(d.total.anual_liquido).toBeCloseTo(60)
    expect(d.total.mensal_liquido).toBeCloseTo(5)
    expect(d.total.yield_liquido).toBeCloseTo(0.06)
  })
  it('distribuição: tem de somar 100% e assinala ações sem dados', () => {
    const acoes = [acao('A', 10, 1, 0)]
    expect(distribuir([{ ticker: 'A', pct: 60 }], 100, acoes).valida).toBe(false)
    expect(distribuir([{ ticker: 'A', pct: 33.33 }, { ticker: 'A2', pct: 66.67 }], 100, acoes).valida).toBe(true)
    expect(distribuir([{ ticker: 'A', pct: 100 }, { ticker: 'X', pct: 0 }], 100, acoes).valida).toBe(false) // 0% não conta
    expect(distribuir([{ ticker: 'A', pct: 50 }, { ticker: 'X', pct: 50 }], 100, acoes).sem_dados).toEqual(['X'])
    expect(distribuir([], 100, acoes).valida).toBe(false)
  })
  it('partes iguais somam sempre 100', () => {
    for (const n of [1, 2, 3, 6, 7, 9]) expect(partesIguais(n).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6)
    expect(partesIguais(3)).toEqual([33.34, 33.33, 33.33])
  })
  it('lê números à portuguesa', () => {
    expect(lerNumero('1 000,50')).toBe(1000.5)
    expect(lerNumero('250 €')).toBe(250)
    expect(lerNumero('12,5%')).toBe(12.5)
    expect(lerNumero('')).toBeNaN()
    expect(lerNumero('abc')).toBeNaN()
  })
})
