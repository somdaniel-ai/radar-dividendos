import { describe, expect, it } from 'vitest'
import type { AcaoCalculada } from '../lib/calculos'
import { candidatas, emPercentagens, META_PADRAO, proporMeta } from '../lib/meta'

let n = 0
const acao = (o: { pontos: number; setor?: string | null; y?: number; nivel?: number; armadilhas?: number; fora?: boolean }) => {
  const y = o.y ?? 0.05
  return {
    ticker: `T${++n}`, setor: o.setor === undefined ? 'Energia' : o.setor, preco_eur: 10,
    dividendo: { anual_eur: (10 * y) / 0.7 }, imposto: { taxa: 0.3 }, yield: { liquido: y },
    nivel: { nivel: o.nivel ?? 4 }, armadilhas: Array(o.armadilhas ?? 0).fill({}), fora_batentes: o.fora ? 'acima' : null,
    pontuacao: { total: o.pontos },
  } as unknown as AcaoCalculada
}
const setores = ['A', 'B', 'C', 'D', 'E']

describe('meta de rendimento', () => {
  it('filtra pelos critérios e ordena pela pontuação', () => {
    const lista = [acao({ pontos: 50 }), acao({ pontos: 90, nivel: 2 }), acao({ pontos: 80, armadilhas: 1 }),
      acao({ pontos: 70, fora: true }), acao({ pontos: 60 })]
    expect(candidatas(lista, META_PADRAO).map(a => a.pontuacao.total)).toEqual([60, 50])
    expect(candidatas(lista, { ...META_PADRAO, excluir_armadilhas: false, nivel_minimo: 0 }).map(a => a.pontuacao.total)).toEqual([90, 80, 60, 50])
  })

  it('10% por empresa → 10 empresas, e calcula o capital necessário', () => {
    const lista = Array.from({ length: 15 }, (_, i) => acao({ pontos: 100 - i, setor: setores[i % 5], y: 0.06 }))
    const r = proporMeta(lista, 100, META_PADRAO)
    expect(r.possivel).toBe(true)
    expect(r.linhas).toHaveLength(10)
    expect(r.linhas.every(l => Math.abs(l.peso - 0.1) < 1e-9)).toBe(true)
    expect(r.linhas.map(l => l.acao.pontuacao.total)).toEqual([100, 99, 98, 97, 96, 95, 94, 93, 92, 91])
    expect(r.yield_liquido).toBeCloseTo(0.06)
    expect(r.capital).toBeCloseTo(20000) // 100 €/mês × 12 ÷ 6%
    expect(r.linhas.reduce((s, l) => s + l.sim.mensal_liquido, 0)).toBeCloseTo(100)
  })

  it('respeita o máximo por setor (25%): o 3.º do mesmo setor só leva 5%', () => {
    const lista = [...Array.from({ length: 4 }, (_, i) => acao({ pontos: 100 - i, setor: 'Energia' })),
      ...Array.from({ length: 10 }, (_, i) => acao({ pontos: 50 - i, setor: setores[i % 5] }))]
    const r = proporMeta(lista, 100, META_PADRAO)
    const energia = r.linhas.filter(l => l.acao.setor === 'Energia')
    expect(energia.map(l => Math.round(l.peso * 100))).toEqual([10, 10, 5])
    expect(r.setores.every(s => s.peso <= 0.25 + 1e-9)).toBe(true)
    expect(r.possivel).toBe(true)
  })

  it('ações sem setor contam juntas como "Sem setor"', () => {
    const lista = Array.from({ length: 5 }, (_, i) => acao({ pontos: 100 - i, setor: null }))
    const r = proporMeta(lista, 100, { ...META_PADRAO, max_empresa: 0.5, max_setor: 1 })
    expect(r.setores).toEqual([{ setor: 'Sem setor', peso: 1 }])
  })

  it('sem ações suficientes: diz até onde chegou, sem capital', () => {
    const lista = Array.from({ length: 6 }, (_, i) => acao({ pontos: 100 - i, setor: setores[i % 5] }))
    const r = proporMeta(lista, 100, META_PADRAO)
    expect(r.possivel).toBe(false)
    expect(r.distribuido).toBeCloseTo(0.6)
    expect(r.capital).toBeNull()
  })

  it('percentagens para o Simulador somam exatamente 100', () => {
    const p = emPercentagens([1 / 3, 1 / 3, 1 / 3])
    expect(p.reduce((s, x) => s + x, 0)).toBeCloseTo(100, 9)
    expect(p).toEqual([33.34, 33.33, 33.33])
  })
})
