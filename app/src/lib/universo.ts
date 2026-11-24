// Ler uma lista colada (da XTB, de uma folha de cálculo, à mão) e ver em que estado está cada ação.

export type EstadoUniverso = 'radar' | 'dividendos' | 'sem_dividendos' | 'sem_simbolo' | 'erro' | 'por_verificar'

export interface Universo {
  gerado_em: string
  instrumentos: Record<string, { n: string; o: 'manual' | 'xtb'; e: EstadoUniverso }>
}

export const NOMES_ESTADO: Record<EstadoUniverso | 'fora', string> = {
  radar: 'No radar',
  dividendos: 'No radar',
  sem_dividendos: 'Sem dividendos nos últimos 24 meses',
  sem_simbolo: 'Não encontrada no Yahoo',
  erro: 'Erro na última atualização',
  por_verificar: 'Ainda por verificar',
  fora: 'Fora do universo',
}

// Símbolos XTB: letras/números, ponto e a bolsa (ex.: KO.US, NOS.PT, VHYD.DE).
// Aceita minúsculas, o sufixo "_9" de alguns extratos e ignora tudo o resto (nomes, valores…).
const SIMBOLO = /\b([A-Za-z0-9][A-Za-z0-9-]*\.[A-Za-z]{2,3})(?:_\d+)?\b/g

export function lerListaColada(texto: string): string[] {
  const vistos = new Set<string>()
  for (const m of texto.matchAll(SIMBOLO)) {
    const t = m[1].toUpperCase()
    if (!/^\d+\.\d+$/.test(m[1])) vistos.add(t) // "12.50" é um número, não um símbolo
  }
  return [...vistos]
}

export interface Linha { ticker: string; nome: string; estado: EstadoUniverso | 'fora' }

export function classificar(tickers: string[], u: Universo | null): Linha[] {
  return tickers.map(t => {
    const i = u?.instrumentos[t]
    return { ticker: t, nome: i?.n ?? '', estado: i ? (i.e === 'dividendos' ? 'radar' : i.e) : 'fora' }
  })
}

// Linhas para acrescentar a pipeline/universo/universo_xtb.csv (as que ainda não estão no universo)
export function linhasCsv(linhas: Linha[]): string {
  return linhas.filter(l => l.estado === 'fora').map(l => `${l.ticker},,ACAO,sim,`).join('\n')
}
