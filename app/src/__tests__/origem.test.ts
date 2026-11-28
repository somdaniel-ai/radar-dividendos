import { describe, expect, it } from 'vitest'
import { textoOrigem } from '../lib/posicao'

describe('"← Voltar a…" da página da ação', () => {
  it('diz a página de onde se veio', () => {
    expect(textoOrigem({ caminho: '/simular' })).toBe('ao Simulador')
    expect(textoOrigem({ caminho: '/simular', ver: 'meta' })).toBe('à Meta de rendimento')
    expect(textoOrigem({ caminho: '/simular', ver: 'projecao' })).toBe('à Projeção')
    expect(textoOrigem({ caminho: '/carteira' })).toBe('à Carteira')
    expect(textoOrigem({ caminho: '/calendario' })).toBe('ao Calendário')
    expect(textoOrigem({ caminho: '/favoritos' })).toBe('aos Favoritos')
    expect(textoOrigem({ caminho: '/acao/KO' })).toBe('à ação KO')
  })
  it('sem página anterior na app, volta ao radar', () => {
    expect(textoOrigem(null)).toBe('ao radar')
    expect(textoOrigem({ caminho: '/' })).toBe('ao radar')
  })
})
