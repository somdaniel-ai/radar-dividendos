// Calendário de dividendos: datas ex-dividendo e de pagamento das ações da carteira e dos favoritos.
//
// - **Confirmadas**: as que a empresa já anunciou (vêm do Yahoo: próxima data ex-dividendo e data
//   de pagamento).
// - **Estimadas**: a partir da última data ex-dividendo + o intervalo habitual (12 / pagamentos por
//   ano). A data de pagamento estimada usa o atraso habitual entre a data ex e o pagamento dessa
//   ação (quando é conhecido).
// - **Recebidos**: os dividendos que já entraram na conta (extrato da XTB).
import type { AcaoCalculada } from './calculos'
import type { Pagamento } from './carteira'

export type TipoEvento = 'ex' | 'pagamento' | 'recebido'

export interface Evento {
  data: string
  ticker: string
  nome: string
  tipo: TipoEvento
  /** anunciada pela empresa (true) ou estimada (false); os recebidos são sempre true */
  confirmada: boolean
  na_carteira: boolean
  favorito: boolean
  /** dividendo por ação, na moeda da ação (estimado = último dividendo normal) */
  por_acao: number | null
  moeda: string | null
  /** só para ações na carteira: valor previsto (ou recebido) em EUR */
  bruto_eur: number | null
  liquido_eur: number | null
}

export interface EntradaCalendario {
  acoes: AcaoCalculada[]
  /** quantidade de cada ação na carteira */
  quantidades: Record<string, number>
  favoritos: Set<string>
  recebidos: Pagamento[]
  nomes?: Record<string, string>
  hoje: string
  /** quantos meses para a frente (estimadas) */
  meses?: number
}

/** Atraso máximo aceite entre a data ex e o pagamento (dias); acima disto não se usa. */
const ATRASO_MAX = 120

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const paraData = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`)

/** Soma meses a uma data (o dia fica limitado ao fim do mês: 31 jan + 1 mês = 28/29 fev). */
export function somarMeses(s: string, meses: number): string {
  const d = paraData(s)
  const alvo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1))
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d.getUTCDate(), ultimoDia))
  return iso(alvo)
}

export function somarDias(s: string, n: number): string {
  const d = paraData(s)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

export const diasEntre = (a: string, b: string) => Math.round((paraData(b).getTime() - paraData(a).getTime()) / 86_400_000)

/** Datas futuras de uma ação (confirmadas + estimadas até `ate`). */
export function datasAcao(a: AcaoCalculada, hoje: string, ate: string) {
  const p = a.pagamento
  const out: { data: string; tipo: 'ex' | 'pagamento'; confirmada: boolean }[] = []
  const exAnunciada = p.proxima_ex_anunciada
  // pagamento anunciado: só conta se for depois da data ex anunciada (e não muito depois)
  const pagAnunciado = p.data_pagamento && exAnunciada
    && diasEntre(exAnunciada, p.data_pagamento) >= 0 && diasEntre(exAnunciada, p.data_pagamento) <= ATRASO_MAX
    ? p.data_pagamento : null
  const atraso = pagAnunciado && exAnunciada ? diasEntre(exAnunciada, pagAnunciado) : null

  if (exAnunciada && exAnunciada >= hoje && exAnunciada <= ate) out.push({ data: exAnunciada, tipo: 'ex', confirmada: true })
  if (pagAnunciado && pagAnunciado >= hoje && pagAnunciado <= ate) out.push({ data: pagAnunciado, tipo: 'pagamento', confirmada: true })

  // estimadas: a partir da data ex mais recente conhecida (a anunciada ou a última do histórico)
  const freq = a.pagamentos_ano
  const base = [exAnunciada, p.ultimo_ex].filter((x): x is string => !!x).sort().at(-1)
  if (freq > 0 && base && 12 % freq === 0) {
    const passo = 12 / freq
    for (let k = 1; k <= 12 * 4; k++) {
      const ex = somarMeses(base, passo * k)
      if (ex > ate) break
      if (ex >= hoje) out.push({ data: ex, tipo: 'ex', confirmada: false })
      if (atraso != null) {
        const pg = somarDias(ex, atraso)
        if (pg >= hoje && pg <= ate) out.push({ data: pg, tipo: 'pagamento', confirmada: false })
      }
    }
  }
  return out
}

/** Todos os eventos (carteira + favoritos), ordenados por data. */
export function eventos(e: EntradaCalendario): Evento[] {
  const ate = somarMeses(e.hoje, e.meses ?? 12)
  const porTicker = new Map(e.acoes.map(a => [a.ticker, a]))
  const tickers = new Set([...Object.keys(e.quantidades).filter(t => e.quantidades[t] > 1e-9), ...e.favoritos])
  const out: Evento[] = []
  for (const t of tickers) {
    const a = porTicker.get(t)
    if (!a) continue
    const qtd = e.quantidades[t] ?? 0
    const porAcao = a.dividendo.ultimo
    const porAcaoEur = porAcao != null && a.cambio_eur ? porAcao * a.cambio_eur : null
    const bruto = qtd > 1e-9 && porAcaoEur != null ? porAcaoEur * qtd : null
    for (const d of datasAcao(a, e.hoje, ate)) {
      out.push({
        ...d, ticker: t, nome: a.nome, na_carteira: qtd > 1e-9, favorito: e.favoritos.has(t),
        por_acao: porAcao, moeda: a.moeda, bruto_eur: bruto, liquido_eur: bruto != null ? bruto * (1 - a.imposto.taxa) : null,
      })
    }
  }
  for (const r of e.recebidos) {
    if (r.bruto <= 0) continue // acertos de retenção sem pagamento
    out.push({
      data: r.data, ticker: r.ticker, nome: porTicker.get(r.ticker)?.nome ?? e.nomes?.[r.ticker] ?? r.ticker,
      tipo: 'recebido', confirmada: true, na_carteira: (e.quantidades[r.ticker] ?? 0) > 1e-9, favorito: e.favoritos.has(r.ticker),
      por_acao: r.por_acao, moeda: r.moeda, bruto_eur: r.bruto, liquido_eur: r.liquido,
    })
  }
  const ordemTipo = { ex: 0, pagamento: 1, recebido: 2 }
  return out.sort((x, y) => x.data.localeCompare(y.data) || ordemTipo[x.tipo] - ordemTipo[y.tipo] || x.ticker.localeCompare(y.ticker))
}

/** "2026-12" de uma data. */
export const mesDe = (s: string) => s.slice(0, 7)

/** Rendimento líquido da carteira por mês (pagamentos previstos + recebidos). */
export function totalPorMes(evs: Evento[]): Record<string, { previsto: number; recebido: number }> {
  const out: Record<string, { previsto: number; recebido: number }> = {}
  for (const ev of evs) {
    if (ev.liquido_eur == null) continue
    const m = (out[mesDe(ev.data)] ??= { previsto: 0, recebido: 0 })
    if (ev.tipo === 'pagamento') m.previsto += ev.liquido_eur
    else if (ev.tipo === 'recebido') m.recebido += ev.liquido_eur
  }
  return out
}

/** Grelha de um mês (semanas de segunda a domingo); null = dia de outro mês. */
export function grelhaMes(mes: string): (string | null)[][] {
  const primeiro = `${mes}-01`
  const diaSemana = (paraData(primeiro).getUTCDay() + 6) % 7 // 0 = segunda
  const ultimo = Number(somarDias(somarMeses(primeiro, 1), -1).slice(8, 10))
  const dias: (string | null)[] = [...Array(diaSemana).fill(null)]
  for (let d = 1; d <= ultimo; d++) dias.push(`${mes}-${pad(d)}`)
  while (dias.length % 7) dias.push(null)
  const semanas: (string | null)[][] = []
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7))
  return semanas
}

export interface ProximaData { data: string; confirmada: boolean; dias: number }

/** Próxima data ex-dividendo e próximo pagamento de uma ação (as mesmas regras do Calendário). */
export function proximasDatas(a: AcaoCalculada, hoje: string): { ex: ProximaData | null; pagamento: ProximaData | null } {
  const ds = datasAcao(a, hoje, somarMeses(hoje, 13)).sort((x, y) => x.data.localeCompare(y.data))
  const primeira = (tipo: 'ex' | 'pagamento') => {
    const d = ds.find(x => x.tipo === tipo)
    return d ? { data: d.data, confirmada: d.confirmada, dias: diasEntre(hoje, d.data) } : null
  }
  return { ex: primeira('ex'), pagamento: primeira('pagamento') }
}
