// Sincronização com a conta (sem rede: um "Supabase" falso em memória).
import { describe, expect, it } from 'vitest'
import type { Transacao } from '../lib/extrato'
import {
  juntarDados, operacoesCarteira, operacoesPara, processarFila,
  type Backend, type DadosPessoais, type Operacao,
} from '../lib/sincronizar'

const tx = (id: string, extra: Partial<Transacao> = {}): Transacao =>
  ({ id, tipo: 'compra', ticker: 'KO.US', nome: null, data: '2026-01-01T00:00:00.000Z', valor_eur: -10, quantidade: 1, preco: 10, origem: 'xtb', ...extra })

const vazio = (): DadosPessoais => ({ definicoes: null, favoritos: [], notas: {}, carteira: [], decisoes: {}, cenarios: {} })

/** "Conta" falsa: aplica as operações como o Supabase faria. */
function contaFalsa(inicial: DadosPessoais = vazio(), falharEm = -1): Backend & { dados: DadosPessoais; n: number } {
  const c = { dados: structuredClone(inicial), n: 0 } as Backend & { dados: DadosPessoais; n: number }
  c.ler = async () => structuredClone(c.dados)
  c.aplicar = async (op: Operacao) => {
    if (c.n++ === falharEm) throw new Error('sem rede')
    const d = c.dados
    if (op.t === 'definicoes') d.definicoes = op.dados
    if (op.t === 'favorito') d.favoritos = op.ativo ? [...new Set([...d.favoritos, op.ticker])] : d.favoritos.filter(f => f !== op.ticker)
    if (op.t === 'nota') { if (op.texto) d.notas[op.ticker] = op.texto; else delete d.notas[op.ticker] }
    if (op.t === 'transacoes') { const ids = new Set(op.linhas.map(l => l.id)); d.carteira = [...d.carteira.filter(t => !ids.has(t.id)), ...op.linhas] }
    if (op.t === 'transacoes_apagar') d.carteira = d.carteira.filter(t => !op.ids.includes(t.id))
    if (op.t === 'decisao') { if (op.d) d.decisoes[op.chave] = op.d; else delete d.decisoes[op.chave] }
    if (op.t === 'cenario') { if (op.c) d.cenarios[op.id] = op.c; else delete d.cenarios[op.id] }
  }
  return c
}

describe('sincronização', () => {
  const pc: DadosPessoais = {
    definicoes: { parametros: { preco: { yield_alvo: 0.07 } }, colunas: { pos52: true }, tema: 'escuro' },
    favoritos: ['KO.US', 'NOS.PT'], notas: { 'KO.US': 'nota do PC' },
    carteira: [tx('1'), tx('2')], decisoes: { 'NOS.PT|2023-05-01': { decisao: 'confirmar', valor_extra: 0.15, em: '2026-11-01' } },
    cenarios: { c1: { nome: 'Reformado', valor: 1000, linhas: [{ ticker: 'KO.US', pct: 100 }], atualizado_em: '2026-11-26T10:00:00.000Z' } },
  }

  it('1.º login: junta aparelho + conta sem perder nada (a conta ganha nos conflitos)', () => {
    const conta: DadosPessoais = { ...vazio(), favoritos: ['TU.US'], notas: { 'KO.US': 'nota do iPhone' }, carteira: [tx('2'), tx('3')] }
    const j = juntarDados(pc, conta)
    expect(j.favoritos.sort()).toEqual(['KO.US', 'NOS.PT', 'TU.US'])
    expect(j.notas['KO.US']).toBe('nota do iPhone')
    expect(j.carteira.map(t => t.id).sort()).toEqual(['1', '2', '3'])
    expect(j.definicoes).toEqual(pc.definicoes) // a conta ainda não tinha definições
    expect(j.decisoes).toEqual(pc.decisoes)
    expect(j.cenarios).toEqual(pc.cenarios)
  })

  it('depois de enviar as diferenças, a conta fica igual ao resultado', async () => {
    const conta = contaFalsa({ ...vazio(), favoritos: ['TU.US'], carteira: [tx('3')] })
    const alvo = juntarDados(pc, await conta.ler())
    const fila = { current: operacoesPara(await conta.ler(), alvo) }
    await processarFila(fila, conta, () => {})
    const depois = await conta.ler()
    expect(depois.favoritos.sort()).toEqual(alvo.favoritos.sort())
    expect(depois.carteira.map(t => t.id).sort()).toEqual(['1', '2', '3'])
    expect(depois.definicoes).toEqual(pc.definicoes)
    expect(depois.notas).toEqual(alvo.notas)
    expect(depois.cenarios).toEqual(pc.cenarios)
    expect(operacoesPara(depois, alvo)).toEqual([]) // nada mais a enviar
  })

  it('carteira: só envia o que mudou, em lotes de 500', () => {
    const antes = [tx('1'), tx('2')]
    expect(operacoesCarteira(antes, [tx('1'), tx('3')])).toEqual([
      { t: 'transacoes', linhas: [tx('3')] }, { t: 'transacoes_apagar', ids: ['2'] }])
    const muitas = Array.from({ length: 1200 }, (_, i) => tx(String(i)))
    expect(operacoesCarteira([], muitas).map(o => o.t === 'transacoes' ? o.linhas.length : 0)).toEqual([500, 500, 200])
    expect(operacoesCarteira(antes, antes)).toEqual([])
  })

  it('sem rede: a fila para no erro, guarda o resto e continua depois', async () => {
    const conta = contaFalsa(vazio(), 1) // a 2.ª operação falha
    const fila = { current: [
      { t: 'favorito', ticker: 'A', ativo: true }, { t: 'favorito', ticker: 'B', ativo: true }, { t: 'nota', ticker: 'A', texto: 'x' },
    ] as Operacao[] }
    let guardada: Operacao[] = []
    await expect(processarFila(fila, conta, f => { guardada = f })).rejects.toThrow('sem rede')
    expect(fila.current).toHaveLength(2) // B e a nota ficam por enviar
    expect(guardada).toHaveLength(2)
    await processarFila(fila, conta, () => {}) // a rede voltou
    expect(fila.current).toEqual([])
    expect((await conta.ler()).favoritos).toEqual(['A', 'B'])
  })

  it('o que é acrescentado à fila enquanto envia também segue', async () => {
    const conta = contaFalsa()
    const fila = { current: [{ t: 'favorito', ticker: 'A', ativo: true }] as Operacao[] }
    const lento: Backend = { ler: conta.ler, aplicar: async op => { await conta.aplicar(op); if (op.t === 'favorito' && op.ticker === 'A') fila.current.push({ t: 'favorito', ticker: 'B', ativo: true }) } }
    await processarFila(fila, lento, () => {})
    expect((await conta.ler()).favoritos).toEqual(['A', 'B'])
  })
})
