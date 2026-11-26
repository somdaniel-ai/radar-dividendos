import type { ReactNode } from 'react'
import { euros, pct } from '../lib/formato'

export const AZUL = '#0284c7'

export interface LinhaPeso { nome: string; peso: number; valor?: number }

/** Lista de barras horizontais com o peso de cada grupo (Carteira, Meta, Simulador).
 *  Uma só série (azul): a identidade vem do nome escrito, nunca da cor. */
export function BarrasPeso({ linhas, rotulo }: { linhas: LinhaPeso[]; rotulo: string }) {
  const max = Math.max(...linhas.map(l => l.peso), 0.0001)
  return (
    <ul className="space-y-1.5 text-sm" aria-label={rotulo}>
      {linhas.map(l => (
        <li key={l.nome} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-2"
          title={`${l.nome}: ${pct(l.peso)}${l.valor != null ? ` · ${euros(l.valor)}` : ''}`}>
          <span className="truncate">{l.nome}</span>
          <span className="h-3 rounded-r bg-slate-100 dark:bg-slate-800">
            <span className="block h-3 rounded-r" style={{ width: `${(l.peso / max) * 100}%`, background: AZUL }} />
          </span>
          <span className="w-24 text-right tabular-nums">
            {pct(l.peso)}{l.valor != null && <> <span className="text-xs text-slate-500">{euros(l.valor, 0)}</span></>}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Botões "Agrupar por" (pequenos, no canto do cartão). */
export function AgruparPor<K extends string>({ opcoes, valor, mudar }: {
  opcoes: readonly (readonly [K, ReactNode])[]; valor: K; mudar: (k: K) => void
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1 text-xs" role="group" aria-label="Agrupar por">
      {opcoes.map(([k, t]) => (
        <button key={k} type="button" aria-pressed={valor === k} onClick={() => mudar(k)}
          className={`rounded-full px-2.5 py-1 ${valor === k ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'ring-1 ring-slate-300 dark:ring-slate-700'}`}>{t}</button>
      ))}
    </div>
  )
}
