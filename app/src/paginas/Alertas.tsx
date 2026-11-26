import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Carregando, Cartao } from '../componentes/Comuns'
import {
  apagarAlertas, diaLisboa, EMOJI_ALERTA, horaLisboa, lerAlertas, marcarLidos, type Alerta,
} from '../lib/alertas'
import { useApp } from '../lib/contexto'
import { dataCurta } from '../lib/formato'

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

function nomeDia(dia: string, hoje: string) {
  if (dia === hoje) return 'Hoje'
  const ontem = new Date(`${hoje}T12:00:00Z`)
  ontem.setUTCDate(ontem.getUTCDate() - 1)
  if (dia === ontem.toISOString().slice(0, 10)) return 'Ontem'
  return `${SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()]}, ${dataCurta(dia)}`
}

function ItemAlerta({ a, abrir }: { a: Alerta; abrir: (a: Alerta) => void }) {
  return (
    <li data-alerta={a.tipo} data-lido={a.lido}
      className={`flex gap-3 rounded-xl p-3 ring-1 ${a.lido ? 'ring-slate-200 dark:ring-slate-800' : 'bg-sky-50 ring-sky-200 dark:bg-sky-950/40 dark:ring-sky-900'}`}>
      <span aria-hidden className="text-xl leading-none">{EMOJI_ALERTA[a.tipo] ?? '•'}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="font-semibold">
            {!a.lido && <span className="mr-1 inline-block size-2 rounded-full bg-sky-600 align-middle" aria-label="Por ler" />}
            {a.titulo}
          </p>
          <span className="text-xs text-slate-500">{horaLisboa(a.criado_em)}</span>
        </div>
        {a.texto && <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{a.texto}</p>}
        <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500">
          {a.ticker && <Link to={`/acao/${a.ticker}`} onClick={() => abrir(a)} className="text-sky-700 underline dark:text-sky-400">Ver a ação</Link>}
          <span>{a.enviado_em ? `📨 enviado pelo Telegram às ${horaLisboa(a.enviado_em)}` : '📨 à espera do envio diário'}</span>
          {!a.lido && <button type="button" onClick={() => abrir(a)} className="underline">marcar como lido</button>}
        </div>
      </div>
    </li>
  )
}

export function Alertas() {
  const { sessao, entrar, params, hoje } = useApp()
  const [alertas, setAlertas] = useState<Alerta[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [soPorLer, setSoPorLer] = useState(false)

  const carregar = useCallback(() => {
    setErro(null)
    lerAlertas().then(setAlertas).catch(e => setErro(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => { if (sessao) carregar() }, [sessao, carregar])

  const visiveis = useMemo(() => (alertas ?? []).filter(a => !soPorLer || !a.lido), [alertas, soPorLer])
  const porDia = useMemo(() => {
    const m: [string, Alerta[]][] = []
    for (const a of visiveis) {
      const d = diaLisboa(a.criado_em)
      if (m.at(-1)?.[0] === d) m.at(-1)![1].push(a)
      else m.push([d, [a]])
    }
    return m
  }, [visiveis])

  const mudarLocal = (chaves: string[], f: (a: Alerta) => Alerta | null) =>
    setAlertas(xs => (xs ?? []).map(a => (chaves.includes(a.chave) ? f(a) : a)).filter((a): a is Alerta => a !== null))
  const abrir = (a: Alerta) => {
    if (a.lido) return
    mudarLocal([a.chave], x => ({ ...x, lido: true }))
    marcarLidos([a.chave]).catch(e => setErro(String(e)))
  }
  const porLer = (alertas ?? []).filter(a => !a.lido).map(a => a.chave)
  const lidos = (alertas ?? []).filter(a => a.lido).map(a => a.chave)

  const e = params?.alertas
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Alertas</h1>
        <p className="text-sm text-slate-500">
          Novidades das ações da carteira e dos favoritos, calculadas todas as noites.
          {e?.telegram ? <> Chegam também pelo Telegram, todos os dias às <b>{e.hora_envio}</b> (hora de Lisboa), só quando há novidades.</> : <> O envio pelo Telegram está desligado.</>}
          {' '}<Link to="/definicoes#alertas" className="text-sky-700 underline dark:text-sky-400">Escolher os alertas</Link>
        </p>
      </div>

      {!sessao ? (
        <Cartao>
          <p className="text-sm">Os alertas ficam guardados na sua conta. Entre com o GitHub para os ver.</p>
          <button type="button" onClick={() => void entrar()}
            className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900">Entrar com o GitHub</button>
        </Cartao>
      ) : erro ? (
        <Cartao>
          <p className="text-sm text-red-700 dark:text-red-400">Não foi possível ler os alertas: {erro}</p>
          <button type="button" onClick={carregar} className="mt-2 text-sm underline">Tentar outra vez</button>
        </Cartao>
      ) : alertas === null ? <Carregando /> : (
        <Cartao>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm dark:bg-slate-800" role="tablist" aria-label="Que alertas mostrar">
              {[[false, `Todos · ${alertas.length}`], [true, `Por ler · ${porLer.length}`]].map(([v, t]) => (
                <button key={String(v)} type="button" role="tab" aria-selected={soPorLer === v} onClick={() => setSoPorLer(v as boolean)}
                  className={`rounded-lg px-3 py-1.5 font-medium ${soPorLer === v ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-600 dark:text-slate-300'}`}>{t as string}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <button type="button" disabled={!porLer.length} className="text-sky-700 underline disabled:opacity-40 dark:text-sky-400"
                onClick={() => { mudarLocal(porLer, a => ({ ...a, lido: true })); marcarLidos(porLer).catch(x => setErro(String(x))) }}>
                Marcar todos como lidos
              </button>
              <button type="button" disabled={!lidos.length} className="text-red-700 underline disabled:opacity-40 dark:text-red-400"
                onClick={() => {
                  if (!confirm(`Apagar ${lidos.length} alerta(s) já lido(s)?`)) return
                  mudarLocal(lidos, () => null); apagarAlertas(lidos).catch(x => setErro(String(x)))
                }}>
                Apagar os lidos
              </button>
            </div>
          </div>
          {porDia.length === 0 ? (
            <p className="text-sm text-slate-500">
              {alertas.length ? 'Não há alertas por ler.' : 'Ainda não há alertas. O motor procura novidades todas as noites.'}
            </p>
          ) : (
            <div className="space-y-4">
              {porDia.map(([dia, xs]) => (
                <section key={dia}>
                  <h2 className="mb-2 text-sm font-semibold capitalize text-slate-600 dark:text-slate-300">{nomeDia(dia, hoje)}</h2>
                  <ul className="space-y-2">{xs.map(a => <ItemAlerta key={a.chave} a={a} abrir={abrir} />)}</ul>
                </section>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">Os alertas com mais de 1 ano são apagados automaticamente. Não é aconselhamento financeiro.</p>
        </Cartao>
      )}
    </div>
  )
}
