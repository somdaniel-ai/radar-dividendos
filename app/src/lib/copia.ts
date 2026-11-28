// Cópia de segurança: um ficheiro .json com os dados pessoais (carteira, favoritos, notas,
// definições, cenários, decisões) e as preferências guardadas só neste aparelho.
// NUNCA leva a sessão (tokens de login) nem os preços guardados.
import type { Transacao } from './extrato'
import type { DadosPessoais, Operacao } from './sincronizar'
import { operacoesCarteira } from './sincronizar'

export const VERSAO_COPIA = 1
/** Preferências só deste aparelho que também vão na cópia (não são dados da conta). */
export const CHAVES_APARELHO = [
  'radar.meta.alvo', 'radar.projecao', 'radar.simulador.valor', 'radar.simulador.rascunho', 'radar.carteira.ordem',
  'radar.filtros', 'radar.filtros.favoritos', 'radar.calendario.filtro', 'radar.grafico.periodo', 'radar.grafico.vista',
]

export interface Copia {
  app: 'radar-dividendos'
  versao: number
  exportada_em: string
  aviso: string
  dados: DadosPessoais
  aparelho: Record<string, unknown>
}

export function criarCopia(dados: DadosPessoais, aparelho: Record<string, unknown>, agora = new Date()): Copia {
  return {
    app: 'radar-dividendos', versao: VERSAO_COPIA, exportada_em: agora.toISOString(),
    aviso: 'Contém dados pessoais (carteira, favoritos, notas). Guarde-o num sítio seguro e não o partilhe.',
    dados, aparelho: Object.fromEntries(Object.entries(aparelho).filter(([k]) => CHAVES_APARELHO.includes(k))),
  }
}

export const nomeFicheiro = (agora = new Date()) => `radar-dividendos-copia-${agora.toISOString().slice(0, 10)}.json`

const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Lê e valida um ficheiro de cópia. */
export function lerCopia(texto: string): { copia: Copia } | { erro: string } {
  let j: unknown
  try { j = JSON.parse(texto) } catch { return { erro: 'O ficheiro não é uma cópia de segurança desta app (não é JSON).' } }
  if (!objeto(j) || j.app !== 'radar-dividendos' || !objeto(j.dados)) return { erro: 'O ficheiro não é uma cópia de segurança do Radar de Dividendos.' }
  if (typeof j.versao !== 'number' || j.versao > VERSAO_COPIA) return { erro: 'Esta cópia foi feita por uma versão mais recente da app. Atualize a app e tente outra vez.' }
  const d = j.dados
  if (!Array.isArray(d.favoritos) || !objeto(d.notas) || !Array.isArray(d.carteira) || !objeto(d.decisoes) || !objeto(d.cenarios)
    || (d.definicoes !== null && !objeto(d.definicoes))) return { erro: 'O ficheiro está incompleto ou danificado.' }
  if (!(d.carteira as unknown[]).every(t => objeto(t) && typeof t.id === 'string' && typeof t.ticker === 'string')) return { erro: 'A carteira do ficheiro está danificada.' }
  return {
    copia: {
      app: 'radar-dividendos', versao: j.versao, exportada_em: String(j.exportada_em ?? ''), aviso: String(j.aviso ?? ''),
      dados: {
        definicoes: (d.definicoes as DadosPessoais['definicoes']) ?? null,
        favoritos: (d.favoritos as unknown[]).map(String), notas: d.notas as Record<string, string>,
        carteira: d.carteira as Transacao[], decisoes: d.decisoes as DadosPessoais['decisoes'], cenarios: d.cenarios as DadosPessoais['cenarios'],
      },
      aparelho: objeto(j.aparelho) ? Object.fromEntries(Object.entries(j.aparelho).filter(([k]) => CHAVES_APARELHO.includes(k))) : {},
    },
  }
}

export interface Contagens { operacoes: number; posicoes: number; favoritos: number; notas: number; cenarios: number; decisoes: number; definicoes: boolean }
export function contar(d: DadosPessoais): Contagens {
  return {
    operacoes: d.carteira.length, posicoes: new Set(d.carteira.map(t => t.ticker)).size, favoritos: d.favoritos.length,
    notas: Object.values(d.notas).filter(Boolean).length, cenarios: Object.keys(d.cenarios).length,
    decisoes: Object.keys(d.decisoes).length, definicoes: !!d.definicoes && Object.keys(d.definicoes.parametros ?? {}).length > 0,
  }
}

/** O que enviar para a conta ficar EXATAMENTE igual à cópia (também apaga o que não está nela). */
export function operacoesSubstituir(antes: DadosPessoais, depois: DadosPessoais): Operacao[] {
  const ops: Operacao[] = []
  if (depois.definicoes && JSON.stringify(depois.definicoes) !== JSON.stringify(antes.definicoes)) ops.push({ t: 'definicoes', dados: depois.definicoes })
  const favDepois = new Set(depois.favoritos), favAntes = new Set(antes.favoritos)
  for (const f of depois.favoritos) if (!favAntes.has(f)) ops.push({ t: 'favorito', ticker: f, ativo: true })
  for (const f of antes.favoritos) if (!favDepois.has(f)) ops.push({ t: 'favorito', ticker: f, ativo: false })
  for (const k of new Set([...Object.keys(antes.notas), ...Object.keys(depois.notas)])) {
    const v = depois.notas[k] ?? ''
    if ((antes.notas[k] ?? '') !== v) ops.push({ t: 'nota', ticker: k, texto: v })
  }
  ops.push(...operacoesCarteira(antes.carteira, depois.carteira))
  for (const k of new Set([...Object.keys(antes.decisoes), ...Object.keys(depois.decisoes)])) {
    const d = depois.decisoes[k] ?? null
    if (JSON.stringify(antes.decisoes[k] ?? null) !== JSON.stringify(d)) ops.push({ t: 'decisao', chave: k, d })
  }
  for (const k of new Set([...Object.keys(antes.cenarios), ...Object.keys(depois.cenarios)])) {
    const c = depois.cenarios[k] ?? null
    if (JSON.stringify(antes.cenarios[k] ?? null) !== JSON.stringify(c)) ops.push({ t: 'cenario', id: k, c })
  }
  return ops
}
