import { describe, expect, it } from 'vitest'
import { classificar, lerListaColada, linhasCsv, type Universo } from '../lib/universo'

const u: Universo = {
  gerado_em: '2026-11-24T03:00:00+00:00',
  instrumentos: {
    'KO.US': { n: 'Coca-Cola', o: 'manual', e: 'radar' },
    'TSLA.US': { n: 'Tesla', o: 'xtb', e: 'sem_dividendos' },
    'VHYD.DE': { n: 'Vanguard High Div', o: 'xtb', e: 'por_verificar' },
  },
}

describe('lista colada', () => {
  it('apanha os símbolos e ignora o resto', () => {
    const texto = 'Símbolo;Quantidade;Preço\nko.us;10;62.50\nNOS.PT_9; 100 ; 3.9\nKO.US, VHYD.DE TSLA.US\n12.50'
    expect(lerListaColada(texto)).toEqual(['KO.US', 'NOS.PT', 'VHYD.DE', 'TSLA.US'])
  })
  it('classifica e gera as linhas que faltam', () => {
    const l = classificar(['KO.US', 'NOS.PT', 'TSLA.US', 'VHYD.DE'], u)
    expect(l.map(x => x.estado)).toEqual(['radar', 'fora', 'sem_dividendos', 'por_verificar'])
    expect(linhasCsv(l)).toBe('NOS.PT,,ACAO,sim,')
  })
})
