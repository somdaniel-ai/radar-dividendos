import { NIVEIS } from '../lib/calculos'

const CLASSES: Record<number, string> = {
  6: 'bg-nivel-6 text-white',
  5: 'bg-nivel-5 text-stone-900',
  4: 'bg-nivel-4 text-white',
  3: 'bg-nivel-3 text-white',
  2: 'bg-nivel-2 text-emerald-950',
  1: 'bg-nivel-1 text-emerald-900 ring-1 ring-emerald-200 dark:ring-emerald-800',
  0: 'bg-nivel-0 text-white',
}

export function corNivel(n: number) {
  return CLASSES[n] ?? CLASSES[0]
}

export function EtiquetaNivel({ nivel, curta = false }: { nivel: number; curta?: boolean }) {
  const info = NIVEIS[nivel] ?? NIVEIS[0]
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${corNivel(nivel)}`}
      title={`${info.nome}: ${info.texto}`}
    >
      {nivel === 0 ? '⚠' : nivel}
      {!curta && <span className="font-medium">{info.nome}</span>}
    </span>
  )
}

export function Legenda() {
  return (
    <ul className="grid gap-2 text-sm sm:grid-cols-2">
      {[6, 5, 4, 3, 2, 1, 0].map(n => (
        <li key={n} className="flex items-start gap-2">
          <EtiquetaNivel nivel={n} curta />
          <span>
            <b>{NIVEIS[n].nome}</b> — {NIVEIS[n].texto}
          </span>
        </li>
      ))}
    </ul>
  )
}
