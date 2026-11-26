import { useCallback, useEffect, useRef, useState } from 'react'
import { diasValidade, estadoAtualizacao, lancarAtualizacao, type EstadoAtualizacao } from '../lib/atualizar'
import { useApp } from '../lib/contexto'
import { dataHora } from '../lib/formato'
import { diaLisboa, horaLisboa } from '../lib/alertas'

const minutosDesde = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))

/** ⟳ no topo (só com sessão): preços do momento e atualização completa a pedido. */
export function BotaoAtualizar() {
  const { sessao, meta, precosAgora, atualizarPrecos } = useApp()
  const [aberto, setAberto] = useState(false)
  const [precos, setPrecos] = useState<{ aPedir: boolean; msg?: string; erro?: string }>({ aPedir: false })
  const [estado, setEstado] = useState<EstadoAtualizacao | null>(null)
  const [erroEstado, setErroEstado] = useState<string | null>(null)
  const [aLancar, setALancar] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  const lerEstado = useCallback(() => {
    estadoAtualizacao().then(e => { setEstado(e); setErroEstado(null) }).catch(e => setErroEstado(e instanceof Error ? e.message : String(e)))
  }, [])

  // ao abrir o painel lê o estado; enquanto houver uma atualização a correr, volta a ver a cada minuto
  const aCorrer = !!estado?.ultima && estado.ultima.estado !== 'completed'
  useEffect(() => { if (aberto && sessao) lerEstado() }, [aberto, sessao, lerEstado])
  useEffect(() => {
    if (!aCorrer) return
    const t = setInterval(lerEstado, 60_000)
    return () => clearInterval(t)
  }, [aCorrer, lerEstado])

  // fechar ao clicar fora ou com Esc
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  if (!sessao) return null

  const pedirPrecos = async () => {
    setPrecos({ aPedir: true })
    try {
      const r = await atualizarPrecos()
      setPrecos({
        aPedir: false,
        msg: r.pedidas === 0 ? 'Não há ações na carteira nem nos favoritos.'
          : `${r.atualizadas} de ${r.pedidas} ações com o preço atualizado.${r.atualizadas < r.pedidas ? ' As outras ficam com o preço da última atualização.' : ''}`,
      })
    } catch (e) {
      setPrecos({ aPedir: false, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  const lancar = async () => {
    if (!confirm('Lançar uma atualização completa dos dados? Demora cerca de 40 minutos e no fim a app é publicada outra vez.')) return
    setALancar(true)
    try {
      const r = await lancarAtualizacao()
      setEstado(r)
      setErroEstado(r.lancada === false && r.motivo ? r.motivo : null)
    } catch (e) {
      setErroEstado(e instanceof Error ? e.message : String(e))
    } finally {
      setALancar(false)
    }
  }

  const u = estado?.ultima
  // terminou depois dos dados que esta página carregou → há dados novos para ver
  const haNovos = !!u && u.estado === 'completed' && u.resultado === 'success' && !!meta
    && new Date(u.atualizada_em) > new Date(meta.gerado_em) && minutosDesde(u.atualizada_em) < 24 * 60
  const dias = diasValidade(estado?.validade_token ?? null)

  return (
    <div ref={caixa} className="relative">
      <button type="button" data-botao-atualizar aria-expanded={aberto} aria-label="Atualizar agora"
        onClick={() => setAberto(a => !a)}
        className={`rounded-lg px-2 py-1 text-lg leading-none ${aberto ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
        <span aria-hidden className={`inline-block ${aCorrer || precos.aPedir ? 'animate-spin' : ''}`}>⟳</span>
      </button>
      {aberto && (
        <div data-painel-atualizar role="dialog" aria-label="Atualizar agora"
          className="fixed inset-x-3 top-16 z-30 max-h-[80dvh] overflow-y-auto rounded-xl bg-white p-4 text-sm shadow-xl ring-1 ring-slate-200 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 dark:bg-slate-900 dark:ring-slate-700">
          <h2 className="font-semibold">Atualizar agora</h2>
          <dl className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
            <div className="flex justify-between gap-3"><dt>Dados completos</dt><dd className="font-medium" data-hora-dados>{dataHora(meta?.gerado_em)}</dd></div>
            <div className="flex justify-between gap-3">
              <dt>Preços da carteira e favoritos</dt>
              <dd className="font-medium" data-hora-precos>{!precosAgora ? 'os dos dados completos' : diaLisboa(precosAgora.em) === diaLisboa(new Date().toISOString()) ? `hoje às ${horaLisboa(precosAgora.em)}` : dataHora(precosAgora.em)}</dd>
            </div>
          </dl>

          <section className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
            <h3 className="font-medium">💲 Preços do momento</h3>
            <p className="mt-0.5 text-xs text-slate-500">Em segundos, só as ações da carteira e dos favoritos. Recalcula o yield, o valor da carteira e o preço justo. Fica só neste aparelho.</p>
            <button type="button" onClick={() => void pedirPrecos()} disabled={precos.aPedir} data-atualizar-precos
              className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">
              {precos.aPedir ? 'A pedir os preços…' : 'Atualizar preços'}
            </button>
            {precos.msg && <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400" data-resultado-precos>✓ {precos.msg}</p>}
            {precos.erro && <p className="mt-2 text-xs text-red-700 dark:text-red-400" data-erro-precos>Não foi possível: {precos.erro}</p>}
          </section>

          <section className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
            <h3 className="font-medium">🔄 Atualização completa</h3>
            <p className="mt-0.5 text-xs text-slate-500">Como a da noite, mas com 30 minutos de dados (a carteira e os favoritos vão primeiro). Demora cerca de 40 minutos.</p>
            <div className="mt-2 text-xs" data-estado-atualizacao>
              {!estado && !erroEstado && <p className="text-slate-500">A ver o estado…</p>}
              {u && aCorrer && <p>⏳ A correr há {minutosDesde(u.iniciada_em)} min (desde as {horaLisboa(u.iniciada_em)}).</p>}
              {u && !aCorrer && haNovos && (
                <p className="text-emerald-700 dark:text-emerald-400">✓ Terminada às {horaLisboa(u.atualizada_em)}.{' '}
                  <button type="button" onClick={() => window.location.reload()} className="font-medium underline">Recarregar a app</button>
                </p>
              )}
              {u && !aCorrer && !haNovos && u.resultado === 'success' && <p className="text-slate-500">Última: {dataHora(u.atualizada_em)} ✓</p>}
              {u && !aCorrer && u.resultado && u.resultado !== 'success' && (
                <p className="text-amber-700 dark:text-amber-400">A última ({dataHora(u.atualizada_em)}) {u.resultado === 'cancelled' ? 'foi cancelada' : 'falhou'}. Os dados ficam os anteriores.</p>
              )}
              {erroEstado && <p className="text-red-700 dark:text-red-400" data-erro-atualizacao>{erroEstado}</p>}
            </div>
            <button type="button" onClick={() => void lancar()} disabled={aLancar || aCorrer || !estado} data-lancar-atualizacao
              className="mt-2 w-full rounded-lg px-3 py-2 font-medium ring-1 ring-slate-300 disabled:opacity-50 dark:ring-slate-600">
              {aLancar ? 'A pedir…' : aCorrer ? 'Já há uma atualização a correr' : 'Lançar atualização completa'}
            </button>
            {dias != null && dias <= 30 && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" data-aviso-token>
                ⚠️ O token do GitHub expira {dias <= 0 ? 'hoje' : `daqui a ${dias} dia${dias === 1 ? '' : 's'}`}. Vê no README como criar um novo.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
