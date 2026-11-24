import type { ReactNode } from 'react'
import type { Sinal } from '../tipos'

export const AVISO_LEGAL = 'Ferramenta de apoio pessoal. Não constitui aconselhamento financeiro nem fiscal.'

export function Cartao({ titulo, children, className = '', acao }: {
  titulo?: ReactNode; children: ReactNode; className?: string; acao?: ReactNode
}) {
  return (
    <section className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 ${className}`}>
      {(titulo || acao) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {titulo && <h2 className="text-base font-semibold">{titulo}</h2>}
          {acao}
        </div>
      )}
      {children}
    </section>
  )
}

export function Estrela({ ativa, onClick, tamanho = 'text-xl' }: { ativa: boolean; onClick: () => void; tamanho?: string }) {
  return (
    <button
      type="button"
      onClick={e => { e.preventDefault(); e.stopPropagation(); onClick() }}
      className={`${tamanho} leading-none ${ativa ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400 dark:text-slate-600'}`}
      aria-label={ativa ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      aria-pressed={ativa}
    >
      {ativa ? '★' : '☆'}
    </button>
  )
}

const ICONES: Record<string, string> = {
  yield_alto: '🔥', payout: '💸', queda_preco: '📉', atraso: '⏰', devolucao_capital: '↩️', imposto_pais: '🧾',
  possivel_extra: '❓',
}

export function IconesSinais({ sinais }: { sinais: Sinal[] }) {
  if (!sinais.length) return null
  return (
    <span className="inline-flex gap-0.5" title={sinais.map(s => s.texto).join('\n')}>
      {sinais.map(s => <span key={s.codigo} aria-label={s.texto}>{ICONES[s.codigo] ?? '⚠️'}</span>)}
    </span>
  )
}

export function ListaSinais({ sinais, tipo }: { sinais: Sinal[]; tipo: 'armadilha' | 'aviso' }) {
  if (!sinais.length) return null
  const cor = tipo === 'armadilha'
    ? 'bg-red-50 text-red-900 ring-red-200 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900'
    : 'bg-amber-50 text-amber-950 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900'
  return (
    <ul className={`space-y-1 rounded-xl p-3 text-sm ring-1 ${cor}`}>
      {sinais.map(s => (
        <li key={s.codigo} className="flex gap-2">
          <span aria-hidden>{ICONES[s.codigo] ?? '⚠️'}</span>
          <span>{s.texto}</span>
        </li>
      ))}
    </ul>
  )
}

export function Etiqueta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300 ${className}`}>
      {children}
    </span>
  )
}

export const NOMES_CATEGORIA: Record<string, string> = {
  EMPRESA: 'Empresa', REIT: 'REIT', BDC: 'BDC', CEF: 'Fundo fechado', ETF: 'ETF',
}

export function EtiquetaCategoria({ categoria }: { categoria: string }) {
  const cores: Record<string, string> = {
    REIT: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
    BDC: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
    CEF: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
    ETF: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200',
  }
  if (categoria === 'EMPRESA') return null
  return <Etiqueta className={cores[categoria] ?? ''}>{NOMES_CATEGORIA[categoria] ?? categoria}</Etiqueta>
}

export function Carregando({ texto = 'A carregar…' }: { texto?: string }) {
  return <p className="p-6 text-center text-slate-500">{texto}</p>
}

export function Erro({ texto }: { texto: string }) {
  return (
    <div className="m-4 rounded-xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900">
      <b>Não foi possível carregar os dados.</b>
      <p className="mt-1">{texto}</p>
      <p className="mt-1">Verifique a ligação à internet e tente recarregar a página.</p>
    </div>
  )
}
