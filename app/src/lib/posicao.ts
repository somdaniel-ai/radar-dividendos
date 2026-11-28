// Posição na página: ao abrir uma página nova começa no topo; ao voltar para trás (botão do
// browser / gesto do iPhone) volta exatamente à posição onde estava.
// Também tem ajuda para guardar filtros/pesquisas no endereço (assim o "voltar" repõe-nos).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

const CHAVE = 'radar.posicoes'

function lerPosicoes(): Record<string, number> {
  try { return JSON.parse(sessionStorage.getItem(CHAVE) ?? '{}') } catch { return {} }
}
function gravarPosicao(chave: string, y: number) {
  try {
    const p = lerPosicoes()
    p[chave] = y
    // só as últimas 50 páginas
    const ks = Object.keys(p)
    for (const k of ks.slice(0, Math.max(0, ks.length - 50))) delete p[k]
    sessionStorage.setItem(CHAVE, JSON.stringify(p))
  } catch { /* modo privado: ignora */ }
}

// ——— Origem: de que página da app se chegou a cada entrada do histórico ———
const CHAVE_ORIGENS = 'radar.origens'
export type Origem = { caminho: string; ver?: string }

function lerOrigens(): Record<string, Origem> {
  try { return JSON.parse(sessionStorage.getItem(CHAVE_ORIGENS) ?? '{}') } catch { return {} }
}
function gravarOrigem(chave: string, o: Origem) {
  try {
    const t = lerOrigens()
    t[chave] = o
    const ks = Object.keys(t)
    for (const k of ks.slice(0, Math.max(0, ks.length - 50))) delete t[k]
    sessionStorage.setItem(CHAVE_ORIGENS, JSON.stringify(t))
  } catch { /* modo privado: ignora */ }
}

/** O texto do link "← Voltar …" conforme a página de onde se veio. */
export function textoOrigem(o: Origem | null | undefined): string {
  if (!o) return 'ao radar'
  const c = o.caminho
  if (c === '/') return 'ao radar'
  if (c === '/favoritos') return 'aos Favoritos'
  if (c === '/carteira') return 'à Carteira'
  if (c === '/simular') return o.ver === 'meta' ? 'à Meta de rendimento' : o.ver === 'projecao' ? 'à Projeção' : 'ao Simulador'
  if (c === '/calendario') return 'ao Calendário'
  if (c === '/alertas') return 'aos Alertas'
  if (c === '/definicoes') return 'às Definições'
  if (c === '/sobre') return 'à página Sobre'
  if (c.startsWith('/acao/')) return `à ação ${decodeURIComponent(c.slice(6))}`
  return 'à página anterior'
}

/** Página da app de onde se chegou aqui (null se a página foi aberta diretamente por um link). */
export function useOrigem(): { texto: string; voltar: (() => void) | null } {
  const { key } = useLocation()
  const navegar = useNavigate()
  const o = lerOrigens()[key]
  // voltar com o histórico (como o botão do browser): repõe separador, filtros e posição
  return { texto: textoOrigem(o), voltar: o ? () => navegar(-1) : null }
}

export function usePosicaoPagina() {
  const local = useLocation()
  const tipo = useNavigationType()
  const atual = useRef(local.key)
  const anterior = useRef<{ key: string; pathname: string; search: string } | null>(null)

  // o browser não deve tentar sozinho (com páginas que carregam aos poucos, falha)
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])

  // guarda a posição da página atual enquanto se anda nela
  useEffect(() => {
    atual.current = local.key
    // um filtro mudado (replace) dá uma "entrada" nova ao histórico: leva a posição consigo
    if (tipo === 'REPLACE') gravarPosicao(local.key, window.scrollY)
    let pendente = 0
    const aoMexer = () => {
      // a página e a posição são as do momento do scroll (não as do momento da gravação)
      const k = atual.current, y = window.scrollY
      cancelAnimationFrame(pendente)
      pendente = requestAnimationFrame(() => gravarPosicao(k, y))
    }
    window.addEventListener('scroll', aoMexer, { passive: true })
    return () => { window.removeEventListener('scroll', aoMexer); cancelAnimationFrame(pendente) }
  }, [local.key]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    // já é a página nova: o scroll que vem a seguir (topo, reposição) é desta página
    atual.current = local.key
    // de que página se veio (para o "← Voltar a…" da página da ação)
    const ant = anterior.current
    if (ant && tipo === 'PUSH') gravarOrigem(local.key, { caminho: ant.pathname, ver: new URLSearchParams(ant.search).get('ver') ?? undefined })
    else if (ant && tipo === 'REPLACE') { const o = lerOrigens()[ant.key]; if (o) gravarOrigem(local.key, o) }
    anterior.current = { key: local.key, pathname: local.pathname, search: local.search }
    // mudanças só de filtros (replace) não mexem na posição
    if (tipo === 'REPLACE') return
    if (tipo === 'PUSH') { window.scrollTo(0, 0); return }
    // POP: repor; a página pode ainda estar a desenhar a lista → tenta durante ~2 s
    const y = lerPosicoes()[local.key]
    if (!y) return
    let tentativas = 0, t = 0
    const repor = () => {
      const cabe = document.documentElement.scrollHeight - window.innerHeight >= y - 2
      window.scrollTo(0, y)
      if (!cabe && ++tentativas < 40) t = window.setTimeout(repor, 50)
    }
    repor()
    return () => clearTimeout(t)
  }, [local.key]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Os parâmetros que estão agora no endereço (depois do "#/página?"). */
export function paramsAtuais(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams()
  const h = window.location.hash
  const i = h.indexOf('?')
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : '')
}

/** Escreve os parâmetros no endereço SEM avisar o router: a página não é redesenhada (com
 *  milhares de ações isso atrasava a pesquisa), mas o "voltar" do browser encontra-os lá. */
function escreverParams(n: URLSearchParams) {
  const base = window.location.hash.split('?')[0] || '#/'
  const q = n.toString()
  const novo = `${window.location.pathname}${window.location.search}${base}${q ? `?${q}` : ''}`
  if (novo !== `${window.location.pathname}${window.location.search}${window.location.hash}`)
    window.history.replaceState(window.history.state, '', novo)
}

/** Um valor guardado no endereço (ex.: ?q=reit), para o "voltar" o repor. Muda logo no ecrã;
 *  o endereço é atualizado por trás, sem criar passos no histórico. */
export function useParametroUrl(nome: string, padrao = ''): [string, (v: string) => void] {
  const [valor, setValor] = useState(() => paramsAtuais().get(nome) ?? padrao)
  useEffect(() => {
    const n = paramsAtuais()
    if (valor === padrao || valor === '') n.delete(nome)
    else n.set(nome, valor)
    escreverParams(n)
  }, [valor, nome, padrao])
  return [valor, setValor]
}
