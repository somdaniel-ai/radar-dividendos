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

/** Colunas da tabela de posições da Carteira (PC). Ficam no mesmo registo das do Radar
 *  (ids começados por "c_"), por isso também são guardadas na conta. */
export const COLUNAS_CARTEIRA = [
  { id: 'c_qtd', nome: 'Quantidade', padrao: true },
  { id: 'c_pmedio', nome: 'Preço médio', padrao: false },
  { id: 'c_patual', nome: 'Preço atual', padrao: false },
  { id: 'c_valor', nome: 'Valor atual', padrao: true },
  { id: 'c_ganho', nome: 'Ganho/perda (€ e %)', padrao: true },
  { id: 'c_peso', nome: 'Peso na carteira', padrao: true },
  { id: 'c_mes', nome: 'Previsto por mês (líquido)', padrao: true },
  { id: 'c_yield', nome: 'Yield atual (líquido)', padrao: false },
  { id: 'c_yoc', nome: 'Yield sobre o custo (líquido)', padrao: true },
  { id: 'c_ex', nome: 'Próxima data ex-dividendo', padrao: true },
  { id: 'c_pag', nome: 'Próximo pagamento', padrao: true },
  { id: 'c_receb', nome: 'Dividendos recebidos', padrao: true },
] as const

export type ListaColunas = readonly { id: string; nome: string; padrao: boolean }[]

export const CHAVE_COLUNAS = 'radar.colunas'

const padrao = (lista: ListaColunas = [...COLUNAS_RADAR, ...COLUNAS_CARTEIRA]): Record<string, boolean> =>
  Object.fromEntries(lista.map(c => [c.id, c.padrao]))

export function lerColunas(): Record<string, boolean> {
  return { ...padrao(), ...ler<Record<string, boolean>>(CHAVE_COLUNAS, {}) }
}

/** Colunas visíveis de uma tabela (por defeito, a do Radar). */
export function useColunas(lista: ListaColunas = COLUNAS_RADAR) {
  const { colunas, gravarColunas } = useApp()
  const visiveis = { ...padrao(lista), ...Object.fromEntries(lista.filter(c => c.id in colunas).map(c => [c.id, colunas[c.id]])) }
  const mudar = useCallback((id: string, ver: boolean) => gravarColunas({ ...colunas, [id]: ver }), [colunas, gravarColunas])
  // repor só mexe nas colunas desta tabela
  const repor = useCallback(() => gravarColunas({ ...colunas, ...padrao(lista) }), [colunas, gravarColunas, lista])
  const personalizadas = lista.some(c => visiveis[c.id] !== c.padrao)
  return { visiveis, mudar, repor, personalizadas, lista }
}
