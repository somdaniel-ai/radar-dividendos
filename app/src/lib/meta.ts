// Meta de rendimento: "quero receber X € por mês (líquido)" → procura uma distribuição
// entre as ações com melhor pontuação, respeitando os limites das Definições, e calcula
// o capital necessário. É uma regra simples e transparente, NÃO uma otimização nem um conselho.
import type { AcaoCalculada } from './calculos'
import type { Parametros } from '../tipos'
import { simular, type Simulacao } from './simulador'

export const META_PADRAO: Parametros['meta'] = {
  rendimento_mensal_padrao: 100,
  max_empresa: 0.10,
  max_setor: 0.25,
  max_pais: 1,
  nivel_minimo: 3,
  excluir_armadilhas: true,
  so_favoritos: false,
}

export const SEM_SETOR = 'Sem setor'
export const SEM_PAIS = 'País desconhecido'

export interface LinhaMeta {
  acao: AcaoCalculada
  /** peso de 0 a 1 */
  peso: number
  valor: number
  sim: Simulacao
}

export interface PropostaMeta {
  /** conseguiu chegar a 100% dentro dos limites */
  possivel: boolean
  /** até onde chegou (0 a 1) quando não é possível */
  distribuido: number
  linhas: LinhaMeta[]
  /** yield líquido médio da distribuição */
  yield_liquido: number | null
  /** capital necessário para a meta (EUR) */
  capital: number | null
  setores: { setor: string; peso: number }[]
  paises: { pais: string; peso: number }[]
  /** quantas ações passaram nos filtros (candidatas) */
  candidatas: number
}

/** As ações que podem entrar na meta, pela ordem da pontuação (melhor primeiro). */
export function candidatas(acoes: AcaoCalculada[], m: Parametros['meta'], favoritos?: Set<string>): AcaoCalculada[] {
  return acoes
    .filter(a => (!m.so_favoritos || !!favoritos?.has(a.ticker))
      && a.preco_eur && a.dividendo.anual_eur != null && (a.yield.liquido ?? 0) > 0
      && !a.fora_batentes
      && a.nivel.nivel >= m.nivel_minimo
      && (!m.excluir_armadilhas || a.armadilhas.length === 0))
    .sort((x, y) => y.pontuacao.total - x.pontuacao.total || x.ticker.localeCompare(y.ticker))
}

/**
 * Pela ordem da pontuação, dá a cada ação o máximo permitido (limite por empresa e o que
 * ainda cabe no setor e no país), até chegar a 100%. Ex.: com 10% por empresa ficam 10 ações.
 */
export function proporMeta(acoes: AcaoCalculada[], alvoMensal: number, m: Parametros['meta'], favoritos?: Set<string>): PropostaMeta {
  const lista = candidatas(acoes, m, favoritos)
  const maxPais = m.max_pais ?? 1
  const porSetor = new Map<string, number>()
  const porPais = new Map<string, number>()
  const pesos: { acao: AcaoCalculada; peso: number }[] = []
  let resto = 1
  for (const a of lista) {
    if (resto < 1e-9) break
    const setor = a.setor || SEM_SETOR
    const pais = a.pais || SEM_PAIS
    const usado = porSetor.get(setor) ?? 0
    const usadoPais = porPais.get(pais) ?? 0
    const peso = Math.min(m.max_empresa, m.max_setor - usado, maxPais - usadoPais, resto)
    if (peso < 1e-9) continue
    pesos.push({ acao: a, peso })
    porSetor.set(setor, usado + peso)
    porPais.set(pais, usadoPais + peso)
    resto -= peso
  }
  const distribuido = 1 - resto
  const possivel = resto < 1e-6
  const yieldLiq = pesos.length && distribuido > 0
    ? pesos.reduce((s, p) => s + p.peso * (p.acao.yield.liquido ?? 0), 0) / distribuido : null
  const capital = possivel && yieldLiq && alvoMensal > 0 ? (alvoMensal * 12) / yieldLiq : null
  const linhas = pesos.map(p => {
    const valor = (capital ?? 0) * p.peso
    return { acao: p.acao, peso: p.peso, valor, sim: simular(p.acao, valor)! }
  })
  return {
    possivel, distribuido, linhas, yield_liquido: yieldLiq, capital,
    setores: [...porSetor].map(([setor, peso]) => ({ setor, peso })).sort((a, b) => b.peso - a.peso),
    paises: [...porPais].map(([pais, peso]) => ({ pais, peso })).sort((a, b) => b.peso - a.peso),
    candidatas: lista.length,
  }
}

/** Pesos (0–1) → percentagens com 2 casas que somam exatamente 100 (para o Simulador). */
export function emPercentagens(pesos: number[]): number[] {
  const p = pesos.map(x => Math.round(x * 10000) / 100)
  const dif = Math.round((100 - p.reduce((s, x) => s + x, 0)) * 100) / 100
  if (p.length && dif) p[0] = Math.round((p[0] + dif) * 100) / 100
  return p
}
