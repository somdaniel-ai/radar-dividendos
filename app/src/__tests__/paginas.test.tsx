// Desenha as páginas com dados reais (sem browser) para apanhar erros escondidos.
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { recalcular } from '../lib/calculos'
import { ContextoApp, type Contexto } from '../lib/contexto'
import { VistaAcao } from '../paginas/Acao'
import { Definicoes } from '../paginas/Definicoes'
import { Radar } from '../paginas/Radar'
import { Sobre } from '../paginas/Sobre'
import type { AcaoDetalhe, Parametros } from '../tipos'
import amostra from './amostra.json'

const padrao = (amostra as any).padrao as Parametros
const hoje = (amostra as any).hoje as string
const acoes = (amostra as any).casos.map((c: any) => recalcular(c.base, padrao, hoje))

const ctx: Contexto = {
  aCarregar: false, erro: null, padrao, params: padrao, acoes, hoje,
  meta: { gerado_em: `${hoje}T03:00:00+00:00`, data_referencia: hoje, tipo_atualizacao: 'completa',
    ultima_atualizacao_completa: null, total_universo: 166, total_radar: acoes.length,
    sem_dividendos_recentes: ['MDV.US'], erros: [], aviso: '' },
  alterar: () => {}, repor: () => {}, personalizado: false,
  favoritos: new Set(['KO.US']), alternarFavorito: () => {}, notas: { 'KO.US': 'nota' }, gravarNota: () => {},
  tema: 'auto', setTema: () => {},
}

const desenhar = (el: React.ReactNode) =>
  renderToString(<ContextoApp.Provider value={ctx}><MemoryRouter>{el}</MemoryRouter></ContextoApp.Provider>)

describe('páginas', () => {
  it('Radar mostra as ações e a pontuação', () => {
    const html = desenhar(<Radar />)
    expect(html).toContain('Radar')
    expect(html).toContain('WU.US')
    expect(html).toContain('Fundos fechados')
  })
  it('Favoritos', () => expect(desenhar(<Radar soFavoritos />)).toContain('KO.US'))
  it('Definições', () => {
    const html = desenhar(<Definicoes />)
    expect(html).toContain('Repor valores por defeito')
    expect(html).toContain('Yield alvo')
  })
  it('Sobre tem o aviso legal', () => expect(desenhar(<Sobre />)).toContain('Não constitui aconselhamento financeiro'))

  // ficheiros de detalhe (existem depois de correr o pipeline + "npm run dados")
  const ficheiros = import.meta.glob<AcaoDetalhe>(
    '../../public/data/acoes/{NOS.PT,TU.US,CABO.US,GGT.US,ABDN.UK}.json', { eager: true, import: 'default' })
  it('há ficheiros de detalhe para testar', () => expect(Object.keys(ficheiros).length).toBe(5))
  for (const [caminho, dados] of Object.entries(ficheiros)) {
    const t = caminho.split('/').pop()!.replace('.json', '')
    it(`página da ação ${t}`, () => {
      const html = desenhar(<VistaAcao dados={dados} />)
      expect(html).toContain(t)
      expect(html).toContain('Porque recebeu este nível')
    })
  }
})

describe('decisões sobre extraordinários', () => {
  it('gera as linhas para os ficheiros do pipeline', async () => {
    const { textoDecisoes } = await import('../componentes/Suspeitos')
    const t = textoDecisoes({
      'NOS.PT|2023-04-19': { decisao: 'confirmar', valor_extra: 0.152, em: '2026-11-24' },
      'ORA.FR|2025-06-03': { decisao: 'rejeitar', valor_extra: 0, em: '2026-11-24' },
    })
    expect(t).toContain('NOS.PT,2023-04-19,0.152,"Confirmado na app em 2026-11-24"')
    expect(t).toContain('ORA.FR,2025-06-03,"Rejeitado na app em 2026-11-24"')
  })
})
