// @ts-nocheck — teste só para o PC (usa módulos do Node, sem os tipos instalados na app)
// Verificação com o extrato real da XTB que está em privado/ (só existe no PC do utilizador:
// no GitHub este teste é saltado). Não imprime valores, só contagens e diferenças.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { calcularCarteira, pagamentos, verificar } from '../lib/carteira'
import { lerFicheiroExtrato } from '../lib/extrato'

const PASTA = join(__dirname, '../../../privado')
const ficheiro = existsSync(PASTA) ? readdirSync(PASTA).find(f => /^EUR_.*\.xlsx$/i.test(f)) : undefined

describe.skipIf(!ficheiro)('extrato real da XTB (privado/)', () => {
  it('lê as operações e bate certo com "Open Positions"', async () => {
    // a mesma leitura que a app faz no browser
    const e = await lerFicheiroExtrato(new Blob([readFileSync(join(PASTA, ficheiro!))]))
    const porTipo: Record<string, number> = {}
    for (const t of e.transacoes) porTipo[t.tipo] = (porTipo[t.tipo] ?? 0) + 1
    const posicoes = calcularCarteira(e.transacoes, [])
    const dif = verificar(posicoes, e.posicoes)
    console.log('operações por tipo:', porTipo, '| posições:', posicoes.length, '| na XTB:', e.posicoes.length,
      '| pagamentos de dividendos:', pagamentos(e.transacoes).length, '| avisos:', e.avisos, '| diferenças:', dif)
    expect(porTipo.outro ?? 0).toBe(0)
    expect(e.avisos).toEqual([])
    expect(e.transacoes.filter(t => t.tipo === 'compra').every(t => t.quantidade && t.preco && t.ticker)).toBe(true)
    expect(posicoes.length).toBe(e.posicoes.length)
    expect(dif).toEqual([])
    // o número de conta nunca entra nos dados
    expect(JSON.stringify(e)).not.toMatch(/account|conta/i)
  })
})
