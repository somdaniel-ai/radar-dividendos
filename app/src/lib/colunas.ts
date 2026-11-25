// Colunas visíveis na tabela do Radar (PC). Guardado no browser, como as outras definições.
import { useCallback, useState } from 'react'
import { apagar, gravar, ler } from './armazenamento'

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

const CHAVE = 'radar.colunas'

export function lerColunas(): Record<string, boolean> {
  const guardadas = ler<Record<string, boolean>>(CHAVE, {})
  return Object.fromEntries(COLUNAS_RADAR.map(c => [c.id, guardadas[c.id] ?? c.padrao]))
}

export function useColunas() {
  const [visiveis, setVisiveis] = useState(lerColunas)
  const mudar = useCallback((id: string, ver: boolean) => setVisiveis(v => {
    const n = { ...v, [id]: ver }
    gravar(CHAVE, n)
    return n
  }), [])
  const repor = useCallback(() => { apagar(CHAVE); setVisiveis(lerColunas()) }, [])
  const personalizadas = COLUNAS_RADAR.some(c => visiveis[c.id] !== c.padrao)
  return { visiveis, mudar, repor, personalizadas }
}
