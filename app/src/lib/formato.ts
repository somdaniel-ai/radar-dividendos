// Formatação em português de Portugal, com o formato pedido: 1.234,56 €
// (usa-se o formato "de-DE" para os números porque o "pt-PT" separa os milhares com espaço
// e não agrupa números de 4 algarismos).

const cache = new Map<string, Intl.NumberFormat>()
function nf(min: number, max: number) {
  const k = `${min}-${max}`
  if (!cache.has(k)) cache.set(k, new Intl.NumberFormat('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max }))
  return cache.get(k)!
}

export const vazio = '—'

export function numero(x: number | null | undefined, casas = 2): string {
  if (x == null || Number.isNaN(x)) return vazio
  return nf(casas, casas).format(x)
}

export function euros(x: number | null | undefined, casas = 2): string {
  if (x == null || Number.isNaN(x)) return vazio
  return `${nf(casas, casas).format(x)} €`
}

const SIMBOLOS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', GBp: 'p', CHF: 'CHF', CAD: 'C$' }

export function moeda(x: number | null | undefined, codigo: string | null | undefined, casas = 2): string {
  if (x == null || Number.isNaN(x)) return vazio
  const s = SIMBOLOS[codigo ?? ''] ?? codigo ?? ''
  return `${nf(casas, casas).format(x)} ${s}`.trim()
}

export function pct(x: number | null | undefined, casas = 1): string {
  if (x == null || Number.isNaN(x)) return vazio
  return `${nf(casas, casas).format(x * 100)}%`
}

export function pctSinal(x: number | null | undefined, casas = 1): string {
  if (x == null || Number.isNaN(x)) return vazio
  return `${x > 0 ? '+' : ''}${pct(x, casas)}`
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "2026-05-06" → "06/05/2026" */
export function data(iso: string | null | undefined): string {
  if (!iso) return vazio
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** "2026-05-06" → "6 mai 2026" */
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return vazio
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MESES[m - 1]} ${a}`
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return vazio
  const d = new Date(iso)
  return d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function dias(n: number | null | undefined): string {
  if (n == null) return vazio
  if (n === 0) return 'hoje'
  if (n > 0) return `daqui a ${n} dia${n === 1 ? '' : 's'}`
  return `há ${-n} dia${n === -1 ? '' : 's'}`
}

export function grande(x: number | null | undefined): string {
  if (x == null) return vazio
  if (x >= 1e12) return `${numero(x / 1e12, 1)} B`
  if (x >= 1e9) return `${numero(x / 1e9, 1)} mil M`
  if (x >= 1e6) return `${numero(x / 1e6, 0)} M`
  return numero(x, 0)
}
