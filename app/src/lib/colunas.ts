// Colunas visíveis na tabela do Radar (PC). Guardadas com as Definições
// (no aparelho e, com sessão iniciada, na conta).
import { useCallback } from 'react'
import { ler } from './armazenamento'
import { useApp } from './contexto'

export const COLUNAS_RADAR = [
  { id: 'nivel', nome: 'Nível de consistência', padrao: true },
  { id: 'pontos', nome: 'Pontos', padrao: true },
  { id: 'yliq', nome: 'Yield líquido', padrao: true },
  { id: 'ybruto', nome: 'Yield bruto', padrao: false },
  { id: 'freq', nome: 'Frequência', padrao: false },
  { id: 'preco', nome: 'Preço', padrao: true },
  { id: 'desconto', nome: 'Preço justo (yield alvo)', padrao: true },
  { id: 'descontoH', nome: 'Preço justo histórico', padrao: true },
  { id: 'pos52', nome: 'Posição 52 semanas', padrao: false },
  { id: 'proximo', nome: 'Próximo pagamento', padrao: true },
  { id: 'sinais', nome: 'Sinais', padrao: true },
] as const

export const CHAVE_COLUNAS = 'radar.colunas'

const padrao = (): Record<string, boolean> => Object.fromEntries(COLUNAS_RADAR.map(c => [c.id, c.padrao]))

export function lerColunas(): Record<string, boolean> {
  return { ...padrao(), ...ler<Record<string, boolean>>(CHAVE_COLUNAS, {}) }
}

export function useColunas() {
  const { colunas, gravarColunas } = useApp()
  const visiveis = { ...padrao(), ...colunas }
  const mudar = useCallback((id: string, ver: boolean) => gravarColunas({ ...colunas, [id]: ver }), [colunas, gravarColunas])
  const repor = useCallback(() => gravarColunas(padrao()), [gravarColunas])
  const personalizadas = COLUNAS_RADAR.some(c => visiveis[c.id] !== c.padrao)
  return { visiveis, mudar, repor, personalizadas }
}
