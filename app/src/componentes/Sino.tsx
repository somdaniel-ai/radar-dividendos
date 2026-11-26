import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { contarPorLer, EVENTO_ALERTAS } from '../lib/alertas'
import { useApp } from '../lib/contexto'

/** 🔔 no topo, com o número de alertas por ler (só com sessão iniciada). */
export function SinoAlertas() {
  const { sessao } = useApp()
  const { pathname } = useLocation()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!sessao) { setN(0); return }
    let vivo = true
    const contar = () => { contarPorLer().then(x => { if (vivo) setN(x) }).catch(() => {}) }
    contar()
    const aoVoltar = () => { if (document.visibilityState === 'visible') contar() }
    window.addEventListener(EVENTO_ALERTAS, contar)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => { vivo = false; window.removeEventListener(EVENTO_ALERTAS, contar); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [sessao, pathname])
  if (!sessao) return null
  return (
    <Link to="/alertas" data-sino-alertas aria-label={n ? `Alertas: ${n} por ler` : 'Alertas'}
      className={`relative rounded-lg px-2 py-1 text-lg leading-none ${pathname === '/alertas' ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
      <span aria-hidden>🔔</span>
      {n > 0 && (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">
          {n > 99 ? '99+' : n}
        </span>
      )}
    </Link>
  )
}
