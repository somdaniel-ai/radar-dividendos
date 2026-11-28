// Teste de paridade: as fórmulas da app (TypeScript) têm de dar os mesmos resultados que
// o pipeline (Python), para ações reais e para vários conjuntos de Definições.
// A amostra é gerada por pipeline/ferramentas/gerar_amostra_app.py.
import { describe, expect, it } from 'vitest'
import amostra from './amostra.json'
import { recalcular } from '../lib/calculos'
import { euros, pct } from '../lib/formato'
import type { Acao, Parametros } from '../tipos'

function fundir(base: any, extra: any): any {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return extra ?? base
  const out = { ...base }
  for (const [k, v] of Object.entries(extra ?? {})) out[k] = k in out ? fundir(out[k], v) : v
  return out
}

const perto = (a: number | null | undefined, b: number | null | undefined, rel = 1e-4, abs = 1e-6) => {
  if (a == null || b == null) return expect(a ?? null).toBe(b ?? null)
  expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.max(abs, Math.abs(b) * rel))
}

const casos = (amostra as any).casos as { ticker: string; base: Acao; esperado: Record<string, any> }[]
const variantes = (amostra as any).variantes as Record<string, object>
const padrao = (amostra as any).padrao as Parametros

describe('paridade com o pipeline (Python)', () => {
  it('a amostra tem casos', () => expect(casos.length).toBeGreaterThan(20))

  for (const [nome, alt] of Object.entries(variantes)) {
    const p = fundir(padrao, alt) as Parametros
    describe(`variante "${nome}"`, () => {
      for (const c of casos) {
        it(c.ticker, () => {
          const r = recalcular(c.base, p, (amostra as any).hoje)
          const e = c.esperado[nome]
          perto(r.dividendo.anual, e.dividendo.anual)
          perto(r.imposto.taxa, e.imposto.taxa)
          perto(r.yield.bruto, e.yield.bruto)
          perto(r.yield.liquido, e.yield.liquido)
          perto(r.preco_justo_eur, e.preco_justo_eur)
          expect(r.abaixo_preco_justo).toBe(e.abaixo_preco_justo)
          perto(r.yield_medio_historico, e.yield_medio_historico)
          expect(r.anos_media_usados).toBe(e.anos_media_usados)
          perto(r.preco_justo_historico_eur, e.preco_justo_historico_eur, 1e-3, 1e-4)
          expect(r.abaixo_preco_justo_historico).toBe(e.abaixo_preco_justo_historico)
          expect(r.preco_justo_pontuacao).toBe(e.preco_justo_pontuacao)
          for (const k of ['52s', '5a', 'sempre'] as const) perto(r.posicao[k], e.posicao[k], 1e-3, 1e-3)
          expect(r.pagamento.atrasado).toBe(e.pagamento.atrasado)
          for (const k of ['anos_a_pagar', 'anos_sem_corte', 'anos_seguidos_aumento', 'aumentos_ultimos_10',
            'cortes_ultimos_10', 'cortes_ultimos_5', 'anos_com_historico'] as const)
            expect(r.consistencia[k], k).toBe(e.consistencia[k])
          perto(r.consistencia.cagr_5, e.consistencia.cagr_5, 1e-3, 1e-4)
          expect(r.nivel.nivel).toBe(e.nivel.nivel)
          expect(r.nivel.motivos).toEqual(e.nivel.motivos)
          expect(r.armadilhas.map(x => x.codigo)).toEqual(e.armadilhas.map((x: any) => x.codigo))
          expect(r.fora_batentes).toBe(e.fora_batentes)
          expect(Math.abs(r.pontuacao.total - e.pontuacao.total)).toBeLessThanOrEqual(0.15)
          expect(r.avisos.map(x => x.codigo).sort()).toEqual(e.avisos.map((x: any) => x.codigo).sort())
        })
      }
    })
  }
})

describe('formato português', () => {
  it('euros com ponto nos milhares e vírgula nas décimas', () => {
    expect(euros(1234.56)).toBe('1.234,56 €')
    expect(euros(0.5)).toBe('0,50 €')
    expect(pct(0.0625)).toBe('6,3%')
  })
})

describe('possíveis extraordinários já decididos na app', async () => {
  const { semDecididos } = await import('../lib/calculos')
  const a = {
    ticker: 'KO',
    extraordinarios_suspeitos: [{ data: '2025-03-01', valor: 1, extra_estimado: 0.5, motivo: 'x' }, { data: '2025-09-01', valor: 1, extra_estimado: 0.5, motivo: 'x' }],
    avisos: [{ codigo: 'possivel_extra', texto: '2 possíveis…' }, { codigo: 'outro', texto: 'y' }],
  }
  it('esconde os decididos e acerta o aviso', () => {
    const r = semDecididos(a as never, { 'KO|2025-03-01': { decisao: 'rejeitar' } }) as typeof a
    expect(r.extraordinarios_suspeitos.map(s => s.data)).toEqual(['2025-09-01'])
    expect(r.avisos.find(x => x.codigo === 'possivel_extra')?.texto).toMatch(/^1 possível/)
  })
  it('sem nenhum por decidir, o aviso desaparece', () => {
    const r = semDecididos(a as never, { 'KO|2025-03-01': {}, 'KO|2025-09-01': {} }) as typeof a
    expect(r.extraordinarios_suspeitos).toEqual([])
    expect(r.avisos.map(x => x.codigo)).toEqual(['outro'])
  })
  it('sem decisões fica igual', () => expect(semDecididos(a as never, {})).toBe(a))
})
