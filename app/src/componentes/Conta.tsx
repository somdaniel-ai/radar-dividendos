import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/contexto'
import { dataHora } from '../lib/formato'
import { Cartao } from './Comuns'

/** Estado da sincronização numa frase curta. */
export function TextoSync() {
  const { sessao, sync } = useApp()
  if (!sessao) return <>Guardado só neste aparelho.</>
  if (sync.estado === 'a_sincronizar') return <>A sincronizar…</>
  if (sync.estado === 'erro') return <>⚠️ Por sincronizar{sync.pendentes ? ` (${sync.pendentes} alterações)` : ''}.</>
  return <>☁️ Sincronizado{sync.em ? ` às ${dataHora(sync.em).split(', ')[1] ?? ''}` : ''}.</>
}

/** Botão pequeno para o topo da app (PC). */
export function BotaoConta() {
  const { sessao, entrar, sync } = useApp()
  const [aEntrar, setAEntrar] = useState(false)
  if (sessao) {
    return (
      <Link to="/definicoes#conta" className="flex items-center gap-1.5 text-xs text-slate-500" title={`Sessão: ${sessao.nome}`}>
        {sessao.avatar && <img src={sessao.avatar} alt="" className="size-6 rounded-full" />}
        <span>{sync.estado === 'erro' ? '⚠️' : sync.estado === 'a_sincronizar' ? '…' : '☁️'}</span>
      </Link>
    )
  }
  return (
    <button type="button" disabled={aEntrar} onClick={() => { setAEntrar(true); entrar().catch(() => setAEntrar(false)) }}
      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800">
      {aEntrar ? 'A abrir…' : 'Entrar'}
    </button>
  )
}

/** Cartão "Conta" nas Definições. */
export function CartaoConta() {
  const { sessao, sync, entrar, sair, sincronizarAgora } = useApp()
  const [erro, setErro] = useState<string | null>(null)
  const [aEntrar, setAEntrar] = useState(false)

  if (!sessao) {
    return (
      <Cartao titulo={<span id="conta">Conta</span>}>
        <p className="text-sm">
          Entre com a sua conta do <b>GitHub</b> para guardar a carteira, os favoritos, as notas e as definições na sua conta
          e os ver iguais no PC e no iPhone. Sem entrar, tudo fica só neste aparelho.
        </p>
        <p className="mt-1 text-xs text-slate-500">Os dados ficam no Supabase (UE, Irlanda), protegidos para que só a sua conta os veja.</p>
        <button type="button" disabled={aEntrar}
          onClick={() => { setErro(null); setAEntrar(true); entrar().catch(e => { setErro(String(e.message ?? e)); setAEntrar(false) }) }}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
          {aEntrar ? 'A abrir o GitHub…' : 'Entrar com GitHub'}
        </button>
        {erro && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">Não foi possível entrar: {erro}</p>}
      </Cartao>
    )
  }

  return (
    <Cartao titulo={<span id="conta">Conta</span>}>
      <div className="flex flex-wrap items-center gap-3">
        {sessao.avatar && <img src={sessao.avatar} alt="" className="size-10 rounded-full" />}
        <div className="min-w-0 text-sm">
          <p>Sessão iniciada como <b>{sessao.nome}</b> (GitHub).</p>
          <p className="text-slate-500"><TextoSync /></p>
        </div>
      </div>
      {sync.estado === 'erro' && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
          Não foi possível falar com a conta{sync.mensagem ? ` (${sync.mensagem})` : ''}. As alterações ficam guardadas neste aparelho
          e são enviadas quando a ligação voltar.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <button type="button" onClick={sincronizarAgora} className="rounded-lg px-3 py-1.5 font-medium ring-1 ring-slate-300 dark:ring-slate-700">
          Sincronizar agora
        </button>
        <button type="button" className="text-red-700 underline dark:text-red-400" onClick={() => {
          const aviso = sync.pendentes
            ? `Há ${sync.pendentes} alterações por enviar para a conta e perdem-se se sair agora. Sair mesmo assim?`
            : 'Sair da conta? Os dados ficam guardados na conta; neste aparelho apaga-se a cópia (volta a aparecer quando entrar de novo).'
          if (confirm(aviso)) void sair()
        }}>Sair</button>
      </div>
    </Cartao>
  )
}
