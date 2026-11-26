import { useLayoutEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../lib/contexto'
import { dataHora } from '../lib/formato'
import { saudeAtualizacao } from '../lib/saude'
import { AVISO_LEGAL } from './Comuns'
import { BotaoConta } from './Conta'
import { RedeSeguranca } from './RedeSeguranca'
import { SinoAlertas } from './Sino'

const LINKS = [
  { para: '/', texto: 'Radar', icone: '📡' },
  { para: '/favoritos', texto: 'Favoritos', icone: '★' },
  { para: '/carteira', texto: 'Carteira', icone: '💼' },
  { para: '/simular', texto: 'Simular', icone: '🧮' },
  { para: '/calendario', texto: 'Calendário', icone: '📅' },
  { para: '/definicoes', texto: 'Definições', icone: '⚙️' },
  // no telemóvel, o "Sobre" fica no rodapé (a barra de baixo só tem lugar para 6)
  { para: '/sobre', texto: 'Sobre', icone: 'ℹ️', soPc: true },
]

export function Layout() {
  const { meta } = useApp()
  const { pathname } = useLocation()
  // altura da barra do topo (os títulos da tabela do Radar ficam presos logo abaixo dela)
  const topo = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = topo.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const medir = () => document.documentElement.style.setProperty('--altura-topo', `${el.offsetHeight}px`)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // o Radar e os Favoritos usam toda a largura do ecrã (a tabela cabe sem scroll para o lado)
  const largo = pathname === '/' || pathname === '/favoritos'
  const saude = saudeAtualizacao(meta)
  return (
    <div className="min-h-dvh text-slate-900 dark:text-slate-100">
      <header ref={topo} className="topo-seguro sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 xl:gap-4">
          <NavLink to="/" className="flex items-center gap-2 font-bold">
            <span aria-hidden className="text-xl">📡</span>
            {/* em janelas médias (tablet / PC estreito) só o ícone, para o menu caber */}
            <span className="md:max-xl:sr-only">Radar de Dividendos</span>
          </NavLink>
          <nav className="hidden gap-1 md:flex" aria-label="Navegação principal">
            {LINKS.map(l => (
              <NavLink key={l.para} to={l.para} end
                className={({ isActive }) => `${l.soPc ? 'hidden xl:block' : ''} rounded-lg px-2 py-1.5 text-sm font-medium xl:px-3 ${isActive
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                {l.texto}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
          {meta && (
            <span className="hidden text-xs text-slate-500 lg:block" title="Data/hora da última atualização dos dados">
              Atualizado: {dataHora(meta.gerado_em)}
            </span>
          )}
            <SinoAlertas />
            <BotaoConta />
          </div>
        </div>
      </header>

      <main className={`pb-seguro mx-auto px-3 pt-3 sm:px-4 ${largo ? 'max-w-none' : 'max-w-7xl'}`}>
        {saude.avisar && (
          <div role="status" data-aviso-atualizacao
            className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-950 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-100 dark:ring-red-900">
            ⚠️ <b>A atualização noturna falhou nas últimas {saude.noitesFalhadas} noites.</b>{' '}
            Última atualização bem-sucedida: {dataHora(saude.ultimaNoiteOk)}. Os dados podem estar desatualizados.{' '}
            <Link to="/sobre#atualizacao" className="underline">O que fazer</Link>
          </div>
        )}
        {/* se a página falhar, aparece uma mensagem; o menu continua a funcionar */}
        <RedeSeguranca chave={pathname}><Outlet /></RedeSeguranca>
        <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500 dark:border-slate-800">
          <p>{AVISO_LEGAL}</p>
          <p className="mt-1 xl:hidden"><Link to="/sobre" className="underline">ℹ️ Sobre esta app</Link></p>
          {meta && <p className="mt-1 lg:hidden">Dados atualizados em {dataHora(meta.gerado_em)}</p>}
        </footer>
      </main>

      <nav className="barra-inferior fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-950/95"
        aria-label="Navegação">
        <div className="grid grid-cols-6">
          {LINKS.filter(l => !l.soPc).map(l => (
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
