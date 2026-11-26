// Sincronização dos dados pessoais com o Supabase.
//
// Regras:
//  - sem sessão: tudo fica no aparelho (localStorage), como antes;
//  - 1.º login NESTE aparelho: junta o que há no aparelho com o que há na conta (nada se perde);
//  - depois disso a conta é a "verdade": cada alteração vai logo para o Supabase e, ao voltar à
//    app, lê-se a versão da conta;
//  - sem rede: as alterações ficam numa fila (guardada no aparelho) e são enviadas depois.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Transacao } from './extrato'

export type Decisao = { decisao: 'confirmar' | 'rejeitar'; valor_extra: number; em: string }

/** Cenário do simulador (modo distribuição), guardado com um nome. */
export interface Cenario {
  nome: string
  /** valor a investir (EUR) */
  valor: number
  /** percentagens de 0 a 100 */
  linhas: { ticker: string; pct: number }[]
  atualizado_em: string
}

export interface DefinicoesPessoais {
  parametros: Record<string, unknown>
  colunas: Record<string, boolean>
  tema: string
}

export interface DadosPessoais {
  /** null = ainda não há definições guardadas na conta */
  definicoes: DefinicoesPessoais | null
  favoritos: string[]
  notas: Record<string, string>
  carteira: Transacao[]
  /** chave "TICKER|AAAA-MM-DD" */
  decisoes: Record<string, Decisao>
  /** cenários do simulador, por id */
  cenarios: Record<string, Cenario>
}

export type Operacao =
  | { t: 'definicoes'; dados: DefinicoesPessoais }
  | { t: 'favorito'; ticker: string; ativo: boolean }
  | { t: 'nota'; ticker: string; texto: string } // texto vazio = apagar
  | { t: 'transacoes'; linhas: Transacao[] }
  | { t: 'transacoes_apagar'; ids: string[] }
  | { t: 'decisao'; chave: string; d: Decisao | null }
  | { t: 'cenario'; id: string; c: Cenario | null }

// ——— lógica (sem rede) ———

/** 1.º login neste aparelho: junta aparelho + conta, sem perder nada (a conta ganha nos conflitos). */
export function juntarDados(local: DadosPessoais, conta: DadosPessoais): DadosPessoais {
  const idsConta = new Set(conta.carteira.map(t => t.id))
  return {
    definicoes: conta.definicoes ?? local.definicoes,
    favoritos: [...new Set([...conta.favoritos, ...local.favoritos])],
    notas: { ...local.notas, ...conta.notas },
    carteira: [...conta.carteira, ...local.carteira.filter(t => !idsConta.has(t.id))],
    decisoes: { ...local.decisoes, ...conta.decisoes },
    cenarios: { ...local.cenarios, ...conta.cenarios },
  }
}

/** O que é preciso enviar para a conta ficar igual a `alvo`. */
export function operacoesPara(conta: DadosPessoais, alvo: DadosPessoais): Operacao[] {
  const ops: Operacao[] = []
  if (alvo.definicoes && JSON.stringify(alvo.definicoes) !== JSON.stringify(conta.definicoes)) {
    ops.push({ t: 'definicoes', dados: alvo.definicoes })
  }
  const favConta = new Set(conta.favoritos)
  for (const f of alvo.favoritos) if (!favConta.has(f)) ops.push({ t: 'favorito', ticker: f, ativo: true })
  for (const [k, v] of Object.entries(alvo.notas)) if (conta.notas[k] !== v) ops.push({ t: 'nota', ticker: k, texto: v })
  const ids = new Set(conta.carteira.map(t => t.id))
  const novas = alvo.carteira.filter(t => !ids.has(t.id))
  if (novas.length) ops.push(...operacoesCarteira([], novas))
  for (const [k, d] of Object.entries(alvo.decisoes)) {
    if (JSON.stringify(conta.decisoes[k]) !== JSON.stringify(d)) ops.push({ t: 'decisao', chave: k, d })
  }
  for (const [k, c] of Object.entries(alvo.cenarios)) {
    if (JSON.stringify(conta.cenarios[k]) !== JSON.stringify(c)) ops.push({ t: 'cenario', id: k, c })
  }
  return ops
}

/** Diferenças na carteira (operações novas e apagadas), em lotes de 500 linhas. */
export function operacoesCarteira(antes: Transacao[], depois: Transacao[]): Operacao[] {
  const idsAntes = new Set(antes.map(t => t.id))
  const idsDepois = new Set(depois.map(t => t.id))
  const novas = depois.filter(t => !idsAntes.has(t.id))
  const apagadas = antes.filter(t => !idsDepois.has(t.id)).map(t => t.id)
  const ops: Operacao[] = []
  for (let i = 0; i < novas.length; i += 500) ops.push({ t: 'transacoes', linhas: novas.slice(i, i + 500) })
  if (apagadas.length) ops.push({ t: 'transacoes_apagar', ids: apagadas })
  return ops
}

export interface Backend {
  ler(): Promise<DadosPessoais>
  aplicar(op: Operacao): Promise<void>
}

/** Envia a fila pela ordem; para no primeiro erro (o resto fica para a próxima vez).
 *  A fila é partilhada: o que for acrescentado entretanto também é enviado. */
export async function processarFila(fila: { current: Operacao[] }, backend: Backend, guardar: (f: Operacao[]) => void): Promise<void> {
  while (fila.current.length) {
    await backend.aplicar(fila.current[0])
    fila.current = fila.current.slice(1)
    guardar(fila.current)
  }
}

// ——— Supabase ———

const COLUNAS_TRANSACAO = ['id', 'tipo', 'ticker', 'nome', 'data', 'valor_eur', 'quantidade', 'preco', 'moeda',
  'por_acao', 'taxa', 'corrige', 'comentario', 'tipo_original', 'origem'] as const

function paraLinha(t: Transacao): Record<string, unknown> {
  const l: Record<string, unknown> = {}
  for (const c of COLUNAS_TRANSACAO) l[c] = (t as unknown as Record<string, unknown>)[c] ?? null
  return l
}

function deLinha(l: Record<string, unknown>): Transacao {
  const t: Record<string, unknown> = {}
  for (const c of COLUNAS_TRANSACAO) if (l[c] != null) t[c] = l[c]
  // números grandes podem vir como texto: garantir números
  for (const c of ['valor_eur', 'quantidade', 'preco', 'por_acao', 'taxa']) if (typeof t[c] === 'string') t[c] = Number(t[c])
  t.data = new Date(String(t.data)).toISOString()
  if (!('ticker' in t)) t.ticker = null
  if (!('nome' in t)) t.nome = null
  return t as unknown as Transacao
}

function verificar<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data
}

/** A tabela ainda não foi criada no Supabase (migração por correr)? Então não bloqueia o resto. */
const semTabela = (e: { code?: string; message: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(e.message))

export function backendSupabase(cliente: SupabaseClient): Backend {
  return {
    async ler() {
      const [defs, favs, notas, decs, cens] = await Promise.all([
        cliente.from('definicoes').select('dados').maybeSingle(),
        cliente.from('favoritos').select('ticker'),
        cliente.from('notas').select('ticker, texto'),
        cliente.from('extraordinarios_decisoes').select('ticker, data, decisao, valor_extra, decidido_em'),
        cliente.from('cenarios').select('id, nome, dados, atualizado_em'),
      ])
      // a carteira pode ter mais de 1000 linhas: ler às páginas
      const carteira: Transacao[] = []
      for (let i = 0; ; i += 1000) {
        const p = verificar(await cliente.from('transacoes').select(COLUNAS_TRANSACAO.join(',')).order('id').range(i, i + 999)) as unknown as Record<string, unknown>[]
        carteira.push(...p.map(deLinha))
        if (p.length < 1000) break
      }
      const d = verificar(defs) as { dados: DefinicoesPessoais } | null
      return {
        definicoes: d ? d.dados : null,
        favoritos: (verificar(favs) as { ticker: string }[]).map(f => f.ticker),
        notas: Object.fromEntries((verificar(notas) as { ticker: string; texto: string }[]).map(n => [n.ticker, n.texto])),
        carteira,
        decisoes: Object.fromEntries((verificar(decs) as { ticker: string; data: string; decisao: Decisao['decisao']; valor_extra: number; decidido_em: string }[])
          .map(x => [`${x.ticker}|${x.data}`, { decisao: x.decisao, valor_extra: Number(x.valor_extra), em: x.decidido_em.slice(0, 10) }])),
        cenarios: semTabela(cens.error) ? {} : Object.fromEntries(
          (verificar(cens) as { id: string; nome: string; dados: Pick<Cenario, 'valor' | 'linhas'>; atualizado_em: string }[])
            .map(x => [x.id, { nome: x.nome, valor: Number(x.dados.valor), linhas: x.dados.linhas, atualizado_em: new Date(x.atualizado_em).toISOString() }])),
      }
    },
    async aplicar(op) {
      switch (op.t) {
        case 'definicoes':
          verificar(await cliente.from('definicoes').upsert({ dados: op.dados, atualizado_em: new Date().toISOString() }))
          break
        case 'favorito':
          verificar(op.ativo
            ? await cliente.from('favoritos').upsert({ ticker: op.ticker }, { ignoreDuplicates: true })
            : await cliente.from('favoritos').delete().eq('ticker', op.ticker))
          break
        case 'nota':
          verificar(op.texto.trim()
            ? await cliente.from('notas').upsert({ ticker: op.ticker, texto: op.texto, atualizado_em: new Date().toISOString() })
            : await cliente.from('notas').delete().eq('ticker', op.ticker))
          break
        case 'transacoes':
          verificar(await cliente.from('transacoes').upsert(op.linhas.map(paraLinha), { onConflict: 'user_id,id' }))
          break
        case 'transacoes_apagar':
          verificar(await cliente.from('transacoes').delete().in('id', op.ids))
          break
        case 'decisao': {
          const [ticker, data] = op.chave.split('|')
          verificar(op.d
            ? await cliente.from('extraordinarios_decisoes').upsert({ ticker, data, decisao: op.d.decisao, valor_extra: op.d.valor_extra, decidido_em: new Date(op.d.em).toISOString() })
            : await cliente.from('extraordinarios_decisoes').delete().eq('ticker', ticker).eq('data', data))
          break
        }
        case 'cenario': {
          const r = op.c
            ? await cliente.from('cenarios').upsert({ id: op.id, nome: op.c.nome, dados: { valor: op.c.valor, linhas: op.c.linhas }, atualizado_em: op.c.atualizado_em }, { onConflict: 'user_id,id' })
            : await cliente.from('cenarios').delete().eq('id', op.id)
          if (!semTabela(r.error)) verificar(r) // sem a tabela, fica só no aparelho
          break
        }
      }
    },
  }
}
