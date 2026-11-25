import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/contexto'
import type { Decisao } from '../lib/sincronizar'
import { lerSuspeitos, usePedido } from '../lib/dados'
import { data, moeda, numero } from '../lib/formato'
import type { SuspeitoLista } from '../tipos'
import { Cartao } from './Comuns'

const chave = (s: SuspeitoLista) => `${s.ticker}|${s.data}`

/** Linhas para acrescentar aos ficheiros do pipeline (enquanto não há Supabase). */
export function textoDecisoes(decisoes: Record<string, Decisao>): string {
  const conf: string[] = []
  const rej: string[] = []
  for (const [k, d] of Object.entries(decisoes)) {
    const [ticker, dt] = k.split('|')
    if (d.decisao === 'confirmar') conf.push(`${ticker},${dt},${Number(d.valor_extra.toFixed(6))},"Confirmado na app em ${d.em}"`)
    else rej.push(`${ticker},${dt},"Rejeitado na app em ${d.em}"`)
  }
  return [
    '# Acrescentar a pipeline/universo/extraordinarios.csv',
    ...conf.sort(),
    '',
    '# Acrescentar a pipeline/universo/extraordinarios_rejeitados.csv',
    ...rej.sort(),
  ].join('\n')
}

function Linha({ s, d, onDecidir, onDesfazer }: {
  s: SuspeitoLista; d?: Decisao; onDecidir: (x: Decisao['decisao'], v: number) => void; onDesfazer: () => void
}) {
  const [valor, setValor] = useState(numero(s.extra_estimado, 4))
  const v = Number(valor.replace(',', '.'))
  return (
    <li className="border-t border-slate-100 py-2.5 first:border-0 dark:border-slate-800">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Link to={`/acao/${s.ticker}`} className="font-semibold text-sky-700 dark:text-sky-400">{s.ticker}</Link>
        <span className="text-xs text-slate-500">{s.nome}</span>
      </div>
      <p className="text-sm">
        <b>{data(s.data)}</b> · pagou {moeda(s.valor, s.moeda, 4)} · {s.motivo}
      </p>
      {d ? (
        <p className="mt-1 text-sm">
          {d.decisao === 'confirmar'
            ? <span className="text-amber-700 dark:text-amber-300">✓ Confirmado como extraordinário ({moeda(d.valor_extra, s.moeda, 4)})</span>
            : <span className="text-slate-500">✕ Rejeitado (é um dividendo normal)</span>}
          {' '}<button type="button" className="text-xs text-sky-700 underline dark:text-sky-400" onClick={onDesfazer}>desfazer</button>
        </p>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1">
            <span className="text-slate-500">Parte extra:</span>
            <input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} aria-label="Parte extraordinária"
              className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <button type="button" disabled={!(v > 0 && v <= s.valor)} onClick={() => onDecidir('confirmar', v)}
            className="rounded-lg bg-amber-500 px-3 py-1 font-medium text-white disabled:opacity-40">É extraordinário</button>
          <button type="button" onClick={() => onDecidir('rejeitar', 0)}
            className="rounded-lg px-3 py-1 font-medium ring-1 ring-slate-300 dark:ring-slate-700">É normal</button>
        </div>
      )}
    </li>
  )
}

export function Suspeitos() {
  const { dados, erro, aCarregar } = usePedido(lerSuspeitos, [])
  const { decisoes, gravarDecisoes, sessao } = useApp()
  const [mostrarDecididos, setMostrarDecididos] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const guardar = gravarDecisoes

  const lista = useMemo(() => dados?.suspeitos ?? [], [dados])
  const pendentes = lista.filter(s => !decisoes[chave(s)])
  const visiveis = mostrarDecididos ? lista : pendentes
  const nDecisoes = Object.keys(decisoes).length
  const hoje = new Date().toISOString().slice(0, 10)

  const copiar = async () => {
    const texto = textoDecisoes(decisoes)
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      const blob = new Blob([texto], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const el = document.createElement('a')
      el.href = url
      el.download = 'decisoes_extraordinarios.txt'
      el.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <Cartao titulo={<span id="suspeitos">Possíveis extraordinários (a confirmar)</span>}>
      <p className="mb-2 text-xs text-slate-500">
        O motor de dados assinala pagamentos que parecem extraordinários (muito acima dos outros desse ano, ou um salto seguido de descida).
        Enquanto não decidir, contam como <b>normais</b>. Se confirmar, indique a parte extraordinária (o valor sugerido é uma estimativa).
      </p>
      {erro && <p className="text-sm text-red-700">Não foi possível carregar a lista ({erro}).</p>}
      {aCarregar && <p className="text-sm text-slate-500">A carregar…</p>}
      {dados && (
        <>
          <p className="text-sm"><b>{pendentes.length}</b> por decidir de {lista.length}.
            {' '}<label className="ml-2 inline-flex items-center gap-1 text-xs">
              <input type="checkbox" checked={mostrarDecididos} onChange={e => setMostrarDecididos(e.target.checked)} /> mostrar também os já decididos
            </label>
          </p>
          <ul className="mt-1 max-h-[32rem] overflow-y-auto">
            {visiveis.map(s => (
              <Linha key={chave(s)} s={s} d={decisoes[chave(s)]}
                onDecidir={(x, v) => guardar({ ...decisoes, [chave(s)]: { decisao: x, valor_extra: v, em: hoje } })}
                onDesfazer={() => { const n = { ...decisoes }; delete n[chave(s)]; guardar(n) }} />
            ))}
          </ul>
          {visiveis.length === 0 && <p className="py-2 text-sm text-slate-500">Nada por decidir. 🎉</p>}
        </>
      )}
      <div className="mt-3 rounded-xl bg-sky-50 p-3 text-xs text-sky-950 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900">
        {sessao ? (
          <p data-decisoes-conta>
            <b>Como as decisões entram nos cálculos:</b> ficam guardadas na sua conta e o motor de dados lê-as sozinho todas as noites.
            As ações com decisões novas são as primeiras a ser recalculadas, por isso a mudança aparece na próxima atualização noturna.
          </p>
        ) : (
          <p data-decisoes-conta>
            <b>Como as decisões entram nos cálculos:</b> sem sessão iniciada ficam só neste aparelho e o motor de dados não as vê.
            {' '}<Link to="/definicoes#conta" className="font-medium underline">Entre com o GitHub</Link> para o motor as ler sozinho
            todas as noites. Em alternativa, copie-as para as gravar à mão nos ficheiros do motor.
          </p>
        )}
        <button type="button" disabled={!nDecisoes} onClick={copiar}
          className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">
          {copiado ? 'Copiado ✓' : `Copiar decisões (${nDecisoes})`}
        </button>
      </div>
    </Cartao>
  )
}
