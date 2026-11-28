import { describe, expect, it } from 'vitest'
import { contar, criarCopia, lerCopia, operacoesSubstituir } from '../lib/copia'
import type { DadosPessoais } from '../lib/sincronizar'

const t = (id: string, ticker: string) => ({ id, ticker, data: '2026-01-02', tipo: 'compra', quantidade: 1, preco: 10 }) as never
const base: DadosPessoais = {
  definicoes: { parametros: { meta: { max_pais: 0.5 } }, colunas: {}, tema: 'auto' },
  favoritos: ['KO', 'O'], notas: { KO: 'boa' }, carteira: [t('1', 'KO'), t('2', 'O')],
  decisoes: { 'KO|2026-01-02': { decisao: 'rejeitar', valor_extra: 0, em: 'x' } }, cenarios: {},
}

describe('cópia de segurança', () => {
  it('vai e volta sem perder nada, e só leva as preferências conhecidas do aparelho', () => {
    const c = criarCopia(base, { 'radar.meta.alvo': 250, 'radar.sessao': 'TOKEN-SECRETO' })
    const texto = JSON.stringify(c)
    expect(texto).not.toContain('TOKEN-SECRETO')
    const r = lerCopia(texto)
    expect('copia' in r && r.copia.dados).toEqual(base)
    expect('copia' in r && r.copia.aparelho).toEqual({ 'radar.meta.alvo': 250 })
  })
  it('recusa ficheiros que não são cópias', () => {
    expect(lerCopia('olá')).toHaveProperty('erro')
    expect(lerCopia('{"app":"outra","dados":{}}')).toHaveProperty('erro')
    expect(lerCopia(JSON.stringify({ ...criarCopia(base, {}), versao: 99 }))).toHaveProperty('erro')
    expect(lerCopia(JSON.stringify({ ...criarCopia(base, {}), dados: { ...base, carteira: [{ x: 1 }] } }))).toHaveProperty('erro')
  })
  it('conta o que tem', () => {
    expect(contar(base)).toEqual({ operacoes: 2, posicoes: 2, favoritos: 2, notas: 1, cenarios: 0, decisoes: 1, definicoes: true })
  })
  it('substituir: acrescenta o que falta e apaga o que não está na cópia', () => {
    const agora: DadosPessoais = { ...base, favoritos: ['KO', 'MO'], notas: { MO: 'x' }, carteira: [t('1', 'KO'), t('3', 'MO')], decisoes: {} }
    const ops = operacoesSubstituir(agora, base)
    expect(ops).toContainEqual({ t: 'favorito', ticker: 'O', ativo: true })
    expect(ops).toContainEqual({ t: 'favorito', ticker: 'MO', ativo: false })
    expect(ops).toContainEqual({ t: 'nota', ticker: 'MO', texto: '' })
    expect(ops).toContainEqual({ t: 'nota', ticker: 'KO', texto: 'boa' })
    expect(ops).toContainEqual({ t: 'transacoes_apagar', ids: ['3'] })
    expect(ops.some(o => o.t === 'transacoes' && o.linhas.map(l => l.id).join() === '2')).toBe(true)
    expect(ops.some(o => o.t === 'decisao' && o.chave === 'KO|2026-01-02')).toBe(true)
    expect(operacoesSubstituir(base, base)).toEqual([])
  })
})
