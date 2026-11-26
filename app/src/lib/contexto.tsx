import type { SupabaseClient } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Acao, Meta, Parametros } from '../tipos'
import { apagar, gravar, ler } from './armazenamento'
import { recalcular, type AcaoCalculada } from './calculos'
import { CHAVE_COLUNAS, lerColunas } from './colunas'
import { lerMeta, lerPadrao, lerRadar } from './dados'
import type { Transacao } from './extrato'
import {
  backendSupabase, juntarDados, operacoesCarteira, operacoesPara, processarFila,
  type Cenario, type DadosPessoais, type Decisao, type Operacao,
} from './sincronizar'
import { enderecoRegresso, haSessaoGuardada, obterCliente } from './supabase'

export type Tema = 'auto' | 'claro' | 'escuro'

export interface Sessao { id: string; nome: string; email: string | null; avatar: string | null }
export interface EstadoSync {
  estado: 'local' | 'a_sincronizar' | 'sincronizado' | 'erro'
  mensagem?: string
  em?: string
  /** alterações à espera de serem enviadas para a conta */
  pendentes: number
}

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
  /** colunas visíveis na tabela do Radar */
  colunas: Record<string, boolean>
  gravarColunas: (c: Record<string, boolean>) => void
  /** decisões sobre possíveis dividendos extraordinários ("TICKER|data") */
  decisoes: Record<string, Decisao>
  gravarDecisoes: (d: Record<string, Decisao>) => void
  /** cenários do simulador (por id); null apaga */
  cenarios: Record<string, Cenario>
  gravarCenario: (id: string, c: Cenario | null) => void
  /** conta (Supabase, login com GitHub) */
  sessao: Sessao | null
  sync: EstadoSync
  entrar: () => Promise<void>
  sair: () => Promise<void>
  sincronizarAgora: () => void
}

export const ContextoApp = createContext<Contexto | null>(null)
const Ctx = ContextoApp

const K_DEF = 'radar.definicoes'
const K_FAV = 'radar.favoritos'
const K_NOT = 'radar.notas'
const K_TEMA = 'radar.tema'
const K_CART = 'radar.carteira'
const K_DEC = 'radar.extraordinarios.decisoes'
const K_CEN = 'radar.cenarios'
const K_FILA = 'radar.sync.fila'
const K_UTIL = 'radar.sync.utilizador' // conta cujos dados já foram juntados neste aparelho

/** Dados pessoais (os que vão para a conta quando há sessão). */
interface Pessoal {
  alteracoes: Record<string, unknown>
  favoritos: string[]
  notas: Record<string, string>
  tema: Tema
  carteira: Transacao[]
  colunas: Record<string, boolean>
  decisoes: Record<string, Decisao>
  cenarios: Record<string, Cenario>
}
const CHAVES: Record<keyof Pessoal, string> = {
  alteracoes: K_DEF, favoritos: K_FAV, notas: K_NOT, tema: K_TEMA, carteira: K_CART, colunas: CHAVE_COLUNAS, decisoes: K_DEC, cenarios: K_CEN,
}
const lerPessoal = (): Pessoal => ({
  alteracoes: ler(K_DEF, {}), favoritos: ler<string[]>(K_FAV, []), notas: ler(K_NOT, {}), tema: ler<Tema>(K_TEMA, 'auto'),
  carteira: ler<Transacao[]>(K_CART, []), colunas: lerColunas(), decisoes: ler(K_DEC, {}), cenarios: ler(K_CEN, {}),
})
const paraDados = (p: Pessoal): DadosPessoais => ({
  definicoes: { parametros: p.alteracoes, colunas: p.colunas, tema: p.tema },
  favoritos: p.favoritos, notas: p.notas, carteira: p.carteira, decisoes: p.decisoes, cenarios: p.cenarios,
})
const deDados = (d: DadosPessoais, atual: Pessoal): Pessoal => ({
  alteracoes: d.definicoes?.parametros ?? atual.alteracoes,
  colunas: { ...atual.colunas, ...(d.definicoes?.colunas ?? {}) },
  tema: (d.definicoes?.tema as Tema | undefined) ?? atual.tema,
  favoritos: d.favoritos, notas: d.notas, carteira: d.carteira, decisoes: d.decisoes, cenarios: d.cenarios,
})
const opDefinicoes = (p: Pessoal): Operacao => ({ t: 'definicoes', dados: { parametros: p.alteracoes, colunas: p.colunas, tema: p.tema } })

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

const mensagemErro = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function ProvedorApp({ children }: { children: ReactNode }) {
  const [radar, setRadar] = useState<Acao[] | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [padrao, setPadrao] = useState<Parametros | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pessoal, setPessoal] = useState<Pessoal>(lerPessoal)
  const atual = useRef(pessoal)
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const sessaoRef = useRef<Sessao | null>(null)
  const cliente = useRef<SupabaseClient | null>(null)
  const fila = useRef<Operacao[]>(ler<Operacao[]>(K_FILA, []))
  const aEnviar = useRef(false)
  const ultimaLeitura = useRef(0)
  const [sync, setSync] = useState<EstadoSync>({ estado: 'local', pendentes: fila.current.length })

  useEffect(() => {
    Promise.all([lerRadar(), lerMeta(), lerPadrao()])
      .then(([r, m, p]) => { setRadar(r.acoes); setMeta(m); setPadrao(p) })
      .catch(e => setErro(String(e.message ?? e)))
  }, [])

  // tema claro/escuro
  const tema = pessoal.tema
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

  // ——— guardar no aparelho e (com sessão) enviar para a conta ———
  const substituir = useCallback((novo: Pessoal) => {
    for (const k of Object.keys(CHAVES) as (keyof Pessoal)[]) {
      if (novo[k] !== atual.current[k]) gravar(CHAVES[k], novo[k])
    }
    atual.current = novo
    setPessoal(novo)
  }, [])

  const guardarFila = useCallback((f: Operacao[]) => {
    gravar(K_FILA, f)
    setSync(s => ({ ...s, pendentes: f.length }))
  }, [])

  const enviar = useCallback(async () => {
    if (aEnviar.current || !cliente.current || !sessaoRef.current) return
    aEnviar.current = true
    setSync(s => ({ ...s, estado: 'a_sincronizar', pendentes: fila.current.length }))
    try {
      await processarFila(fila, backendSupabase(cliente.current), guardarFila)
      setSync({ estado: 'sincronizado', em: new Date().toISOString(), pendentes: 0 })
    } catch (e) {
      setSync({ estado: 'erro', mensagem: mensagemErro(e), pendentes: fila.current.length })
    } finally {
      aEnviar.current = false
    }
  }, [guardarFila])

  const mudar = useCallback((parcial: Partial<Pessoal>, ops: Operacao[]) => {
    substituir({ ...atual.current, ...parcial })
    if (sessaoRef.current && ops.length) {
      fila.current = [...fila.current, ...ops]
      guardarFila(fila.current)
      void enviar()
    }
  }, [substituir, enviar, guardarFila])

  const mudarDefinicoes = useCallback((parcial: Partial<Pessoal>) => {
    mudar(parcial, [opDefinicoes({ ...atual.current, ...parcial })])
  }, [mudar])

  // ——— ler da conta ———
  const atualizarDaConta = useCallback(async () => {
    const c = cliente.current, s = sessaoRef.current
    if (!c || !s || aEnviar.current) return
    aEnviar.current = true
    try {
      setSync(x => ({ ...x, estado: 'a_sincronizar' }))
      const backend = backendSupabase(c)
      // primeiro o que está por enviar (para não ser desfeito pela versão da conta)
      await processarFila(fila, backend, guardarFila)
      const conta = await backend.ler()
      ultimaLeitura.current = Date.now()
      if (ler<string | null>(K_UTIL, null) !== s.id) {
        // 1.ª vez com esta conta neste aparelho: juntar, sem perder nada
        const alvo = juntarDados(paraDados(atual.current), conta)
        fila.current = [...fila.current, ...operacoesPara(conta, alvo)]
        guardarFila(fila.current)
        substituir(deDados(alvo, atual.current))
        await processarFila(fila, backend, guardarFila)
        gravar(K_UTIL, s.id)
      } else {
        // a conta é a "verdade"
        substituir(deDados(conta, atual.current))
        if (!conta.definicoes) {
          fila.current = [...fila.current, opDefinicoes(atual.current)]
          await processarFila(fila, backend, guardarFila)
        }
      }
      setSync({ estado: 'sincronizado', em: new Date().toISOString(), pendentes: fila.current.length })
    } catch (e) {
      setSync({ estado: 'erro', mensagem: mensagemErro(e), pendentes: fila.current.length })
    } finally {
      aEnviar.current = false
    }
  }, [substituir, guardarFila])

  const ligarCliente = useCallback(async () => {
    const c = await obterCliente()
    if (cliente.current) return c
    cliente.current = c
    const aplicarSessao = (u: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null) => {
      const nova: Sessao | null = u ? {
        id: u.id, email: u.email ?? null,
        nome: String(u.user_metadata?.user_name ?? u.user_metadata?.full_name ?? u.email ?? 'utilizador'),
        avatar: (u.user_metadata?.avatar_url as string | undefined) ?? null,
      } : null
      const mudou = nova?.id !== sessaoRef.current?.id
      sessaoRef.current = nova
      setSessao(nova)
      if (!nova) setSync({ estado: 'local', pendentes: fila.current.length })
      else if (mudou) void atualizarDaConta()
    }
    // (o setTimeout evita chamar o Supabase de dentro do seu próprio aviso de sessão)
    c.auth.onAuthStateChange((_ev, s) => { setTimeout(() => aplicarSessao(s?.user ?? null), 0) })
    const { data } = await c.auth.getSession()
    aplicarSessao(data.session?.user ?? null)
    // tirar o "?code=…" do endereço depois do regresso do login
    if (/[?&]code=/.test(window.location.search)) {
      window.history.replaceState(null, '', `${import.meta.env.BASE_URL}${window.location.hash || '#/'}`)
    }
    return c
  }, [atualizarDaConta])

  // ao abrir a app: se já houver sessão (ou se voltámos do login), liga-se logo
  useEffect(() => {
    if (haSessaoGuardada()) ligarCliente().catch(e => setSync({ estado: 'erro', mensagem: mensagemErro(e), pendentes: fila.current.length }))
  }, [ligarCliente])

  // ao voltar à app (ex.: no iPhone) ou quando a rede volta: buscar o que mudou noutro aparelho
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && sessaoRef.current && Date.now() - ultimaLeitura.current > 30000) void atualizarDaConta()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('online', aoVoltar)
    return () => { document.removeEventListener('visibilitychange', aoVoltar); window.removeEventListener('online', aoVoltar) }
  }, [atualizarDaConta])

  const entrar = useCallback(async () => {
    const c = await ligarCliente()
    const { error } = await c.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: enderecoRegresso() } })
    if (error) throw new Error(error.message)
  }, [ligarCliente])

  const sair = useCallback(async () => {
    await cliente.current?.auth.signOut()
    // os dados ficam na conta; neste aparelho apaga-se a cópia (pode ser um aparelho partilhado)
    for (const k of [...Object.values(CHAVES), K_FILA, K_UTIL]) apagar(k)
    fila.current = []
    sessaoRef.current = null
    setSessao(null)
    substituir(lerPessoal())
    setSync({ estado: 'local', pendentes: 0 })
  }, [substituir])

  // ——— valores derivados e alterações ———
  const params = useMemo(() => (padrao ? fundir(padrao, pessoal.alteracoes) : null), [padrao, pessoal.alteracoes])
  const hoje = meta?.data_referencia ?? new Date().toISOString().slice(0, 10)
  const acoes = useMemo(() => {
    if (!radar || !params) return []
    return radar.map(a => recalcular(a, params, hoje))
  }, [radar, params, hoje])

  const alterar = useCallback((caminho: string, valor: unknown) => {
    mudarDefinicoes({ alteracoes: definirEm(atual.current.alteracoes, caminho, valor) })
  }, [mudarDefinicoes])
  const repor = useCallback(() => mudarDefinicoes({ alteracoes: {} }), [mudarDefinicoes])
  const setTema = useCallback((t: Tema) => mudarDefinicoes({ tema: t }), [mudarDefinicoes])
  const gravarColunas = useCallback((c: Record<string, boolean>) => mudarDefinicoes({ colunas: c }), [mudarDefinicoes])
  const alternarFavorito = useCallback((t: string) => {
    const tem = atual.current.favoritos.includes(t)
    mudar({ favoritos: tem ? atual.current.favoritos.filter(x => x !== t) : [...atual.current.favoritos, t] },
      [{ t: 'favorito', ticker: t, ativo: !tem }])
  }, [mudar])
  const gravarNota = useCallback((t: string, texto: string) => {
    const n = { ...atual.current.notas }
    if (texto.trim()) n[t] = texto
    else delete n[t]
    mudar({ notas: n }, [{ t: 'nota', ticker: t, texto: texto.trim() ? texto : '' }])
  }, [mudar])
  const gravarCarteira = useCallback((t: Transacao[]) => {
    mudar({ carteira: t }, operacoesCarteira(atual.current.carteira, t))
  }, [mudar])
  const gravarDecisoes = useCallback((d: Record<string, Decisao>) => {
    const antes = atual.current.decisoes
    const ops: Operacao[] = []
    for (const k of new Set([...Object.keys(antes), ...Object.keys(d)])) {
      if (JSON.stringify(antes[k]) !== JSON.stringify(d[k])) ops.push({ t: 'decisao', chave: k, d: d[k] ?? null })
    }
    mudar({ decisoes: d }, ops)
  }, [mudar])
  const gravarCenario = useCallback((id: string, c: Cenario | null) => {
    const n = { ...atual.current.cenarios }
    if (c) n[id] = c
    else delete n[id]
    mudar({ cenarios: n }, [{ t: 'cenario', id, c }])
  }, [mudar])
  const sincronizarAgora = useCallback(() => { void atualizarDaConta() }, [atualizarDaConta])

  const favoritos = useMemo(() => new Set(pessoal.favoritos), [pessoal.favoritos])
  const naCarteira = useMemo(() => {
    const q: Record<string, number> = {}
    for (const t of pessoal.carteira) {
      if (!t.ticker || t.quantidade == null) continue
      if (t.tipo === 'compra') q[t.ticker] = (q[t.ticker] ?? 0) + t.quantidade
      if (t.tipo === 'venda') q[t.ticker] = (q[t.ticker] ?? 0) - t.quantidade
    }
    return new Set(Object.keys(q).filter(k => q[k] > 1e-9))
  }, [pessoal.carteira])

  const valor: Contexto = {
    aCarregar: !erro && (!radar || !params),
    erro, meta, padrao, params, acoes, hoje,
    alterar, repor, personalizado: Object.keys(pessoal.alteracoes).length > 0,
    favoritos, alternarFavorito, notas: pessoal.notas, gravarNota, tema, setTema,
    carteira: pessoal.carteira, gravarCarteira, naCarteira,
    colunas: pessoal.colunas, gravarColunas, decisoes: pessoal.decisoes, gravarDecisoes,
    cenarios: pessoal.cenarios, gravarCenario,
    sessao, sync, entrar, sair, sincronizarAgora,
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useApp(): Contexto {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp fora do ProvedorApp')
  return c
}
