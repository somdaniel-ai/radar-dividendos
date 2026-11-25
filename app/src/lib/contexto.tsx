import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Acao, Meta, Parametros } from '../tipos'
import { apagar, gravar, ler } from './armazenamento'
import { recalcular, type AcaoCalculada } from './calculos'
import { lerMeta, lerPadrao, lerRadar } from './dados'
import type { Transacao } from './extrato'

export type Tema = 'auto' | 'claro' | 'escuro'

export interface Contexto {
  aCarregar: boolean
  erro: string | null
  meta: Meta | null
  padrao: Parametros | null
  params: Parametros | null
  acoes: AcaoCalculada[]
  hoje: string
  alterar: (caminho: string, valor: unknown) => void
  repor: () => void
  personalizado: boolean
  favoritos: Set<string>
  alternarFavorito: (t: string) => void
  notas: Record<string, string>
  gravarNota: (t: string, texto: string) => void
  tema: Tema
  setTema: (t: Tema) => void
  /** operações da carteira (extrato da XTB + compras manuais) */
  carteira: Transacao[]
  gravarCarteira: (t: Transacao[]) => void
  /** ações que estão na carteira (para a marca 💼 no Radar) */
  naCarteira: Set<string>
}

export const ContextoApp = createContext<Contexto | null>(null)
const Ctx = ContextoApp

const K_DEF = 'radar.definicoes'
const K_FAV = 'radar.favoritos'
const K_NOT = 'radar.notas'
const K_TEMA = 'radar.tema'
const K_CART = 'radar.carteira'

function fundir<T>(base: T, extra: unknown): T {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return (extra ?? base) as T
  if (typeof extra !== 'object' || extra === null || Array.isArray(extra)) return base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
    // "por_pais" é uma tabela livre: o utilizador pode acrescentar/apagar países
    if (k === 'por_pais') out[k] = v
    else out[k] = k in out ? fundir(out[k], v) : v
  }
  return out as T
}

function definirEm(obj: Record<string, unknown>, caminho: string, valor: unknown) {
  const partes = caminho.split('.')
  const copia = structuredClone(obj)
  let c: Record<string, unknown> = copia
  for (const p of partes.slice(0, -1)) {
    c[p] = { ...((c[p] as Record<string, unknown>) ?? {}) }
    c = c[p] as Record<string, unknown>
  }
  c[partes[partes.length - 1]] = valor
  return copia
}

export function ProvedorApp({ children }: { children: ReactNode }) {
  const [radar, setRadar] = useState<Acao[] | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [padrao, setPadrao] = useState<Parametros | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [alteracoes, setAlteracoes] = useState<Record<string, unknown>>(() => ler(K_DEF, {}))
  const [favoritos, setFavoritos] = useState<Set<string>>(() => new Set(ler<string[]>(K_FAV, [])))
  const [notas, setNotas] = useState<Record<string, string>>(() => ler(K_NOT, {}))
  const [tema, setTemaEstado] = useState<Tema>(() => ler<Tema>(K_TEMA, 'auto'))
  const [carteira, setCarteira] = useState<Transacao[]>(() => ler<Transacao[]>(K_CART, []))

  useEffect(() => {
    Promise.all([lerRadar(), lerMeta(), lerPadrao()])
      .then(([r, m, p]) => { setRadar(r.acoes); setMeta(m); setPadrao(p) })
      .catch(e => setErro(String(e.message ?? e)))
  }, [])

  // tema claro/escuro
  useEffect(() => {
    const raiz = document.documentElement
    const aplicar = () => {
      const escuro = tema === 'escuro' || (tema === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      raiz.classList.toggle('dark', escuro)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? '#0b1220' : '#ffffff')
    }
    aplicar()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', aplicar)
    return () => mq.removeEventListener('change', aplicar)
  }, [tema])

  const params = useMemo(() => (padrao ? fundir(padrao, alteracoes) : null), [padrao, alteracoes])
  const hoje = meta?.data_referencia ?? new Date().toISOString().slice(0, 10)
  const acoes = useMemo(() => {
    if (!radar || !params) return []
    return radar.map(a => recalcular(a, params, hoje))
  }, [radar, params, hoje])

  const alterar = useCallback((caminho: string, valor: unknown) => {
    setAlteracoes(a => { const n = definirEm(a, caminho, valor); gravar(K_DEF, n); return n })
  }, [])
  const repor = useCallback(() => { setAlteracoes({}); apagar(K_DEF) }, [])
  const alternarFavorito = useCallback((t: string) => {
    setFavoritos(f => {
      const n = new Set(f)
      if (n.has(t)) n.delete(t)
      else n.add(t)
      gravar(K_FAV, [...n])
      return n
    })
  }, [])
  const gravarNota = useCallback((t: string, texto: string) => {
    setNotas(n => {
      const c = { ...n }
      if (texto.trim()) c[t] = texto
      else delete c[t]
      gravar(K_NOT, c)
      return c
    })
  }, [])
  const setTema = useCallback((t: Tema) => { setTemaEstado(t); gravar(K_TEMA, t) }, [])
  const gravarCarteira = useCallback((t: Transacao[]) => { setCarteira(t); gravar(K_CART, t) }, [])
  const naCarteira = useMemo(() => {
    const q: Record<string, number> = {}
    for (const t of carteira) {
      if (!t.ticker || t.quantidade == null) continue
      if (t.tipo === 'compra') q[t.ticker] = (q[t.ticker] ?? 0) + t.quantidade
      if (t.tipo === 'venda') q[t.ticker] = (q[t.ticker] ?? 0) - t.quantidade
    }
    return new Set(Object.keys(q).filter(k => q[k] > 1e-9))
  }, [carteira])

  const valor: Contexto = {
    aCarregar: !erro && (!radar || !params),
    erro, meta, padrao, params, acoes, hoje,
    alterar, repor, personalizado: Object.keys(alteracoes).length > 0,
    favoritos, alternarFavorito, notas, gravarNota, tema, setTema, carteira, gravarCarteira, naCarteira,
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useApp(): Contexto {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp fora do ProvedorApp')
  return c
}
