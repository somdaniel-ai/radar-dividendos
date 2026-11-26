// "Atualizar agora": preços do momento (Edge Function "precos") e atualização completa a pedido
// (Edge Function "atualizar", que lança o "Publicar app" no GitHub). Ver supabase/funcoes/.
// Os preços novos só ficam NESTE aparelho; a próxima atualização dos dados substitui-os.
import type { Acao } from '../tipos'
import { obterCliente } from './supabase'

export interface Cotacao { preco: number; moeda: string | null; anterior: number | null; hora: string | null }
export interface PrecosAgora { em: string; precos: Record<string, Cotacao> }

export const CHAVE_PRECOS = 'radar.precos'
/** no máximo de ações por pedido (a função aceita 80 símbolos, contando com os câmbios) */
export const MAXIMO_ACOES = 60

const CENTIMOS: Record<string, string> = { GBp: 'GBP', GBX: 'GBP', ILA: 'ILS', ZAc: 'ZAR' }
const simboloCambio = (moeda: string) => `EUR${CENTIMOS[moeda] ?? moeda}=X`

/** Símbolos a pedir: as ações (e a linha da XTB, quando é outra) + os câmbios das moedas delas. */
export function simbolosPara(acoes: Acao[]): string[] {
  const s = new Set<string>()
  const moedas = new Set<string>()
  for (const a of acoes.slice(0, MAXIMO_ACOES)) {
    s.add(a.ticker_yahoo)
    if (a.moeda) moedas.add(a.moeda)
    const x = a.cotacao_xtb
    if (x?.simbolo && x.simbolo !== a.ticker_yahoo) {
      s.add(x.simbolo)
      if (x.moeda) moedas.add(x.moeda)
    }
  }
  for (const m of moedas) if (m !== 'EUR') s.add(simboloCambio(m))
  return [...s]
}

/** Quantos EUR vale 1 unidade da moeda, com os câmbios acabados de chegar (null = não veio). */
export function cambioAgora(moeda: string | null, p: PrecosAgora): number | null {
  if (!moeda) return null
  if (moeda === 'EUR') return 1
  const c = p.precos[simboloCambio(moeda)]?.preco
  if (!c) return null
  return (1 / c) / (CENTIMOS[moeda] ? 100 : 1)
}

const variacao = (c: Cotacao, antes: number | null) => (c.anterior ? c.preco / c.anterior - 1 : antes)

/** Devolve as ações com os preços novos (só as que vieram, e só se a moeda for a mesma). */
export function aplicarPrecos(acoes: Acao[], p: PrecosAgora | null): Acao[] {
  if (!p) return acoes
  return acoes.map(a => {
    const c = p.precos[a.ticker_yahoo]
    const x = a.cotacao_xtb
    const cx = x?.simbolo ? p.precos[x.simbolo] : undefined
    const usar = c && c.moeda === a.moeda
    const usarX = cx && x && cx.moeda === x.moeda
    if (!usar && !usarX) return a
    const novo: Acao = { ...a, preco_agora_em: p.em }
    if (usar) {
      const fx = cambioAgora(a.moeda, p) ?? a.cambio_eur
      novo.preco = c.preco
      novo.cambio_eur = fx
      novo.preco_eur = fx ? c.preco * fx : null
      novo.variacao_dia = variacao(c, a.variacao_dia)
    }
    if (usarX) {
      const fx = cambioAgora(x.moeda, p) ?? x.cambio_eur
      novo.cotacao_xtb = { ...x, preco: cx.preco, cambio_eur: fx, preco_eur: fx ? cx.preco * fx : null, variacao_dia: variacao(cx, x.variacao_dia) }
    }
    return novo
  })
}

/** Os preços guardados só valem enquanto forem mais recentes do que os dados publicados. */
export const precosValidos = (p: PrecosAgora | null, geradoEm: string | undefined) =>
  !!p && (!geradoEm || new Date(p.em) > new Date(geradoEm))

async function chamar<T>(nome: string, corpo: Record<string, unknown>): Promise<T> {
  const c = await obterCliente()
  const { data, error } = await c.functions.invoke(nome, { body: corpo })
  if (error) {
    // a função devolve {"erro": "..."} com a explicação
    let msg = error.message
    try {
      const ctx = (error as { context?: Response }).context
      const j = ctx ? await ctx.json() : null
      if (j?.erro) msg = j.erro
    } catch { /* fica a mensagem genérica */ }
    throw new Error(msg)
  }
  return data as T
}

export const pedirPrecos = (simbolos: string[]) =>
  chamar<{ precos: Record<string, Cotacao>; falhados: string[]; em: string }>('precos', { simbolos })

export interface Execucao {
  id: number
  estado: 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending'
  resultado: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | null
  origem: 'schedule' | 'push' | 'workflow_dispatch' | string
  criada_em: string
  iniciada_em: string
  atualizada_em: string
}
export interface EstadoAtualizacao {
  ultima?: Execucao
  a_correr?: boolean
  lancada?: boolean
  motivo?: string
  validade_token: string | null
}

export const estadoAtualizacao = () => chamar<EstadoAtualizacao>('atualizar', { acao: 'estado' })
export const lancarAtualizacao = () => chamar<EstadoAtualizacao>('atualizar', { acao: 'lancar' })

/** Dias até o token do GitHub expirar (o GitHub manda "2027-11-26 10:00:00 UTC" ou "… +0000"). */
export function diasValidade(v: string | null, agora = new Date()): number | null {
  const m = v?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*(UTC|Z|[+-]\d{2}:?\d{2})?$/)
  if (!m) return null
  const fuso = !m[3] || m[3] === 'UTC' || m[3] === 'Z' ? 'Z' : m[3].replace(/^([+-]\d{2}):?(\d{2})$/, '$1:$2')
  const d = new Date(`${m[1]}T${m[2]}${fuso}`)
  return Number.isNaN(d.getTime()) ? null : Math.floor((d.getTime() - agora.getTime()) / 86_400_000)
}
