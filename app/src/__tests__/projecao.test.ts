import { describe, expect, it } from 'vitest'
import type { AcaoCalculada } from '../lib/calculos'
import { crescimentoHistorico, projetar, type EntradaProjecao } from '../lib/projecao'

const base: EntradaProjecao = { capital: 1000, mensal: 0, anos: 10, reinvestir: false, yield_liquido: 0.06, cresc_dividendo: 0, cresc_preco: 0 }

describe('projeção', () => {
  it('sem crescimento nem reinvestimento: 60 €/ano, valor constante', () => {
    const r = projetar(base)
    expect(r).toHaveLength(11) // ano 0 a 10
    expect(r[10].valor).toBeCloseTo(1000)
    expect(r[1].dividendos_ano).toBeCloseTo(60)
    expect(r[10].dividendos_acumulados).toBeCloseTo(600)
    expect(r[10].rendimento_mensal).toBeCloseTo(5)
  })

  it('reinvestir os dividendos faz crescer o valor (juro composto mensal)', () => {
    const r = projetar({ ...base, reinvestir: true })
    expect(r[1].valor).toBeCloseTo(1000 * (1 + 0.06 / 12) ** 12, 6)
    expect(r[10].valor).toBeCloseTo(1000 * (1 + 0.06 / 12) ** 120, 6)
    expect(r[10].rendimento_mensal).toBeGreaterThan(5)
  })

  it('o preço a subir aumenta o valor mas não o dividendo (sem reinvestir)', () => {
    const r = projetar({ ...base, cresc_preco: 0.1 })
    expect(r[10].valor).toBeCloseTo(1000 * 1.1 ** 10, 6) // o "3.500 € a 10% durante 10 anos" do Excel
    expect(r[10].rendimento_mensal).toBeCloseTo(5)
  })

  it('o dividendo a crescer aumenta o rendimento', () => {
    const r = projetar({ ...base, cresc_dividendo: 0.05 })
    expect(r[10].rendimento_mensal).toBeCloseTo((1000 * 0.06 * 1.05 ** 10) / 12, 6)
  })

  it('cenário prudente (preço e dividendo −3%) fica abaixo do normal no valor E no rendimento', () => {
    const normal = projetar({ ...base, capital: 2725, mensal: 100, yield_liquido: 0.1347, reinvestir: true, cresc_dividendo: 0.016, cresc_preco: 0.03 })
    const prudente = projetar({ ...base, capital: 2725, mensal: 100, yield_liquido: 0.1347, reinvestir: true, cresc_dividendo: -0.03, cresc_preco: -0.03 })
    expect(prudente[10].valor).toBeLessThan(normal[10].valor)
    expect(prudente[10].rendimento_mensal).toBeLessThan(normal[10].rendimento_mensal)
  })
  it('entradas mensais somam ao investido', () => {
    const r = projetar({ ...base, capital: 0, mensal: 100, anos: 2 })
    expect(r[2].investido).toBe(2400)
    expect(r[2].valor).toBeCloseTo(2400)
    expect(r[0].yield_on_cost).toBeNull()
  })

  it('crescimento histórico: média pesada pelo valor, com limites e cobertura', () => {
    const a = (c5: number | null, c10: number | null = null) => ({ consistencia: { cagr_5: c5, cagr_10: c10 } }) as unknown as AcaoCalculada
    const r = crescimentoHistorico([{ acao: a(0.04), valor: 300 }, { acao: a(null, 0.02), valor: 100 }, { acao: a(0.9), valor: 100 }, { acao: null, valor: 500 }])
    expect(r.valor).toBeCloseTo((0.04 * 300 + 0.02 * 100 + 0.15 * 100) / 500) // 90% fica limitado a 15%
    expect(r.cobertura).toBeCloseTo(0.5)
    expect(crescimentoHistorico([]).valor).toBeNull()
  })
})
