// @vitest-environment happy-dom
// Desenha as páginas como no browser: primeiro "a carregar", depois com os dados.
// Foi assim que apareceu o ecrã em branco no Radar (hooks depois de um "return"),
// que os testes de desenho único (paginas.test.tsx) não conseguiam ver.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Layout } from '../componentes/Layout'
import { RedeSeguranca } from '../componentes/RedeSeguranca'
import { recalcular } from '../lib/calculos'
import { ContextoApp, type Contexto } from '../lib/contexto'
import { Definicoes } from '../paginas/Definicoes'
import { Radar } from '../paginas/Radar'
import { Sobre } from '../paginas/Sobre'
import type { Parametros } from '../tipos'
import amostra from './amostra.json'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const padrao = (amostra as any).padrao as Parametros
const hoje = (amostra as any).hoje as string
const acoes = (amostra as any).casos.map((c: any) => recalcular(c.base, padrao, hoje))

const base: Contexto = {
  aCarregar: false, erro: null, padrao, params: padrao, acoes, hoje,
  meta: { gerado_em: `${hoje}T03:00:00+00:00`, data_referencia: hoje, tipo_atualizacao: 'completa',
    ultima_atualizacao_completa: null, total_universo: 166, total_radar: acoes.length,
    sem_dividendos_recentes: [], erros: [], aviso: '' },
  alterar: () => {}, repor: () => {}, personalizado: false,
  favoritos: new Set(['KO.US']), alternarFavorito: () => {}, notas: {}, gravarNota: () => {},
  tema: 'auto', setTema: () => {},
}
const aCarregar: Contexto = { ...base, aCarregar: true, params: null, padrao: null, acoes: [], meta: null }

let raiz: Root
let caixa: HTMLDivElement
let erros: unknown[]

beforeEach(() => {
  caixa = document.createElement('div')
  document.body.appendChild(caixa)
  raiz = createRoot(caixa)
  erros = []
  vi.spyOn(console, 'error').mockImplementation((...a) => { erros.push(a) })
})
afterEach(() => {
  act(() => raiz.unmount())
  caixa.remove()
  vi.restoreAllMocks()
})

function desenhar(ctx: Contexto, el: React.ReactNode, rota = '/') {
  act(() => raiz.render(
    <ContextoApp.Provider value={ctx}>
      <MemoryRouter initialEntries={[rota]}>
        <Routes><Route element={<Layout />}><Route path="*" element={el} /></Route></Routes>
      </MemoryRouter>
    </ContextoApp.Provider>,
  ))
}

describe('páginas: antes e depois de os dados carregarem', () => {
  const paginas: [string, React.ReactNode, string][] = [
    ['Radar', <Radar />, 'WU.US'],
    ['Favoritos', <Radar soFavoritos />, 'KO.US'],
    ['Definições', <Definicoes />, 'Yield alvo'],
    ['Sobre', <Sobre />, 'aconselhamento financeiro'],
  ]
  for (const [nome, el, esperado] of paginas) {
    it(nome, () => {
      desenhar(aCarregar, el)
      desenhar(base, el) // aqui o Radar rebentava
      expect(caixa.textContent).toContain(esperado)
      expect(caixa.textContent).not.toContain('teve um problema')
      expect(erros).toEqual([])
    })
  }
})

describe('rede de segurança', () => {
  function Rebenta(): React.ReactNode { throw new Error('falha de teste') }

  it('uma página que falha mostra mensagem em português e o menu continua lá', () => {
    desenhar(base, <Rebenta />)
    expect(caixa.querySelector('[role="alert"]')?.textContent).toContain('esta página teve um problema')
    expect(caixa.textContent).toContain('Tentar outra vez')
    expect(caixa.textContent).toContain('Definições') // menu
  })

  it('apanha também falhas fora das páginas', () => {
    act(() => raiz.render(<RedeSeguranca><Rebenta /></RedeSeguranca>))
    expect(caixa.textContent).toContain('esta página teve um problema')
  })
})
