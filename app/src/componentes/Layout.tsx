import { NavLink, Outlet } from 'react-router-dom'
import { useApp } from '../lib/contexto'
import { dataHora } from '../lib/formato'
import { AVISO_LEGAL } from './Comuns'

const LINKS = [
  { para: '/', texto: 'Radar', icone: '📡' },
  { para: '/favoritos', texto: 'Favoritos', icone: '★' },
  { para: '/definicoes', texto: 'Definições', icone: '⚙️' },
  { para: '/sobre', texto: 'Sobre', icone: 'ℹ️' },
]

export function Layout() {
  const { meta } = useApp()
  return (
    <div className="min-h-dvh text-slate-900 dark:text-slate-100">
      <header className="topo-seguro sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 font-bold">
            <span aria-hidden className="text-xl">📡</span>
            <span>Radar de Dividendos</span>
          </NavLink>
          <nav className="hidden gap-1 md:flex" aria-label="Navegação principal">
            {LINKS.map(l => (
              <NavLink key={l.para} to={l.para} end
                className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                {l.texto}
              </NavLink>
            ))}
          </nav>
          {meta && (
            <span className="hidden text-xs text-slate-500 lg:block" title="Data/hora da última atualização dos dados">
              Atualizado: {dataHora(meta.gerado_em)}
            </span>
          )}
        </div>
      </header>

      <main className="pb-seguro mx-auto max-w-7xl px-3 pt-3 sm:px-4">
        <Outlet />
        <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500 dark:border-slate-800">
          <p>{AVISO_LEGAL}</p>
          {meta && <p className="mt-1 lg:hidden">Dados atualizados em {dataHora(meta.gerado_em)}</p>}
        </footer>
      </main>

      <nav className="barra-inferior fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-950/95"
        aria-label="Navegação">
        <div className="grid grid-cols-4">
          {LINKS.map(l => (
            <NavLink key={l.para} to={l.para} end
              className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive
                ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500'}`}>
              <span aria-hidden className="text-lg leading-none">{l.icone}</span>
              {l.texto}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
