// Desenha as páginas com dados reais (sem browser) para apanhar erros escondidos.
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { recalcular } from '../lib/calculos'
import { ContextoApp, type Contexto } from '../lib/contexto'
import { VistaAcao } from '../paginas/Acao'
import { Definicoes } from '../paginas/Definicoes'
import { Radar } from '../paginas/Radar'
import { Simular } from '../paginas/Simular'
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
  tema: 'auto', setTema: () => {}, carteira: [], gravarCarteira: () => {}, naCarteira: new Set(['WU.US']),
  colunas: {}, gravarColunas: () => {}, decisoes: {}, gravarDecisoes: () => {}, cenarios: {}, gravarCenario: () => {},
  sessao: null, sync: { estado: 'local', pendentes: 0 }, entrar: async () => {}, sair: async () => {}, sincronizarAgora: () => {}, precosAgora: null, atualizarPrecos: async () => ({ atualizadas: 0, pedidas: 0, falhados: [] }), dadosPessoais: () => ({ definicoes: null, favoritos: [], notas: {}, carteira: [], decisoes: {}, cenarios: {} }), importarDados: () => {},
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
  it('Radar (PC): títulos fixos no topo e ação fixa à esquerda, ordenação mantém-se', () => {
    const html = desenhar(<Radar />)
    const titulos = html.match(/<th [^>]*>/g) ?? []
    expect(titulos.length).toBeGreaterThan(5)
    // presos debaixo da barra do topo, com o scroll normal da página (sem caixa de scroll própria)
    expect(titulos.every(t => /sticky top-\(--altura-topo/.test(t))).toBe(true)
    expect(html).not.toMatch(/data-tabela-radar[^>]*overflow-auto/)
    expect(titulos.filter(t => /left-/.test(t)).length).toBe(2) // estrela + ação
    expect(html).toMatch(/<td class="[^"]*sticky[^"]*left-9/)
    expect(html).toContain('aria-sort="descending"') // continua ordenado por pontos
    // nomes por extenso (podem passar a 2 linhas, nunca cortados)
    expect(html).not.toMatch(/<table[\s\S]*truncate[\s\S]*<\/table>/)
  })
  it('Radar (PC): colunas secundárias escondidas por defeito, botão Colunas', () => {
    const html = desenhar(<Radar />)
    const tabela = html.slice(html.indexOf('<table'), html.indexOf('</thead>'))
    expect(tabela).toContain('Yield líq.')
    expect(tabela).not.toContain('Yield bruto')
    expect(tabela).not.toContain('Pos. 52s')
    expect(html).toContain('>Colunas</button>')
  })
  it('Radar: separador 💼 Carteira só com as ações que tem (e aviso das que não estão no Radar)', () => {
    expect(desenhar(<Radar />)).toMatch(/💼 Carteira<!-- --> · 1/)
    const guardado: Record<string, string> = { 'radar.filtros': JSON.stringify({ categoria: 'CARTEIRA' }) }
    const antes = globalThis.localStorage
    globalThis.localStorage = { getItem: (k: string) => guardado[k] ?? null, setItem: () => {} } as unknown as Storage
    const original = ctx.naCarteira
    try {
      ctx.naCarteira = new Set(['WU.US', 'XYZ.US'])
      const html = desenhar(<Radar />)
      const tabela = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'))
      expect(tabela).toContain('WU.US')
      expect(tabela).not.toContain('KO.US')
      expect(html).toContain('data-carteira-fora-radar')
      expect(html).toMatch(/1 ação da sua carteira não aparece/)
    } finally {
      ctx.naCarteira = original
      globalThis.localStorage = antes
    }
  })
  it('Simular: cada ação (100 € por defeito) e distribuição com cenário', () => {
    const html = desenhar(<Simular />)
    expect(html).toContain('data-simulador-cada')
    expect(html).toContain('WU.US')
    expect(html).toContain('+ Distribuição')
    expect(html).toMatch(/⭐ Favoritos<!-- --> · 1/)
    expect(html).toMatch(/💼 Carteira<!-- --> · 1/)
    const meta = renderToString(<ContextoApp.Provider value={ctx}><MemoryRouter initialEntries={['/simular?ver=meta']}><Simular /></MemoryRouter></ContextoApp.Provider>)
    expect(meta).toContain('data-meta-rendimento')
    expect(meta).toContain('Não é aconselhamento financeiro')
    const guardado: Record<string, string> = {
      'radar.simulador.rascunho': JSON.stringify({ id: null, nome: 'Teste', valor: 1000, linhas: [{ ticker: 'WU.US', pct: 60 }, { ticker: 'KO.US', pct: 30 }] }),
    }
    const antes = globalThis.localStorage
    globalThis.localStorage = { getItem: (k: string) => guardado[k] ?? null, setItem: () => {} } as unknown as Storage
    try {
      const d = renderToString(<ContextoApp.Provider value={ctx}><MemoryRouter initialEntries={['/simular?modo=distribuicao']}><Simular /></MemoryRouter></ContextoApp.Provider>)
      expect(d).toContain('data-simulador-distribuicao')
      expect(d).toMatch(/Soma: <!-- -->90(,00)?<!-- -->%.*faltam 10(,00)?%/)
      expect(d).toContain('Só pode guardar quando as percentagens somarem 100%')
      expect(d).toMatch(/⭐ Favoritos · <!-- -->1/)
      expect(d).toContain('Adicionar todos os favoritos')
      // detalhes de cada linha (nível, yield, pontos, setor…) e resumo em %
      expect((d.match(/data-detalhes-acao/g) ?? []).length).toBe(2)
      expect(d).toContain('yield líq.')
      expect(d).toContain('data-resumo-distribuicao')
      expect(d).toContain('Resumo da distribuição')
    } finally {
      globalThis.localStorage = antes
    }
  })
  it('Favoritos', () =>expect(desenhar(<Radar soFavoritos />)).toContain('KO.US'))
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

  // o texto em inglês fica marcado como inglês, para o browser poder oferecer a sua tradução
  const umaAcao = Object.values(ficheiros)[0]
  it('descrição por traduzir está marcada como inglês', () => {
    const html = desenhar(<VistaAcao dados={{ ...umaAcao, descricao: 'Makes drinks.', descricao_original: 'Makes drinks.', descricao_estado: 'indisponivel' }} />)
    expect(html).toMatch(/lang="en"[^>]*>Makes drinks\./)
  })
  it('versões da mesma empresa na XTB, com a versão em EUR assinalada', () => {
    const limpo = (h: string) => h.replace(/<!-- -->/g, '')
    const html = limpo(desenhar(<VistaAcao dados={{ ...umaAcao, versoes_xtb: [
      { ticker: 'KOF.DE', moeda: 'EUR', nome: 'Coca-Cola' }, { ticker: 'KO.US', moeda: 'USD', nome: 'Coca-Cola' }] }} />))
    expect(html).toContain('Versões na XTB (2, a mesma empresa')
    expect(html).toMatch(/KOF\.DE<\/b>.*Alemanha · EUR.*em euros/)
    expect(html).toContain('KO.US</b>')
    const semEur = desenhar(<VistaAcao dados={{ ...umaAcao, versoes_xtb: [
      { ticker: 'X.US', moeda: 'USD', nome: 'X' }, { ticker: 'X.UK', moeda: 'GBP', nome: 'X' }] }} />)
    expect(semEur).toContain('Não há versão em euros')
    expect(desenhar(<VistaAcao dados={{ ...umaAcao, versoes_xtb: undefined }} />)).not.toContain('Versões na XTB')
  })
  it('descrição traduzida está marcada como pt-PT', () => {
    const html = desenhar(<VistaAcao dados={{ ...umaAcao, descricao: 'Faz bebidas.', descricao_original: 'Makes drinks.', descricao_estado: 'traduzida' }} />)
    expect(html).toMatch(/lang="pt-PT"[^>]*>Faz bebidas\./)
    expect(html).toContain('ver original')
  })
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
