// Leitura dos ficheiros JSON gerados pelo pipeline (publicados junto com a app).
import { useEffect, useState } from 'react'
import type { Acao, AcaoDetalhe, Meta, Parametros } from '../tipos'

const BASE = `${import.meta.env.BASE_URL}data/`

async function obter<T>(ficheiro: string): Promise<T> {
  const r = await fetch(BASE + ficheiro, { cache: 'no-cache' })
  if (!r.ok) throw new Error(`Não foi possível ler ${ficheiro} (${r.status})`)
  return (await r.json()) as T
}

export const lerRadar = () => obter<{ gerado_em: string; acoes: Acao[] }>('radar.json')
export const lerMeta = () => obter<Meta>('meta.json')
export const lerPadrao = () => obter<Parametros>('definicoes_padrao.json')
export const lerAcao = (ticker: string) => obter<AcaoDetalhe>(`acoes/${encodeURIComponent(ticker)}.json`)

export interface Estado<T> {
  dados: T | null
  erro: string | null
  aCarregar: boolean
}

export function usePedido<T>(fn: () => Promise<T>, deps: unknown[]): Estado<T> {
  const [estado, setEstado] = useState<Estado<T>>({ dados: null, erro: null, aCarregar: true })
  useEffect(() => {
    let ativo = true
    setEstado(e => ({ ...e, aCarregar: true, erro: null }))
    fn()
      .then(d => ativo && setEstado({ dados: d, erro: null, aCarregar: false }))
      .catch(e => ativo && setEstado({ dados: null, erro: String(e.message ?? e), aCarregar: false }))
    return () => { ativo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return estado
}
