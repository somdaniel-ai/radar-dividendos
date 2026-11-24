// Definições → "Universo": quantos instrumentos o motor acompanha e importar/colar uma lista.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/contexto'
import { usePedido } from '../lib/dados'
import { classificar, lerListaColada, linhasCsv, NOMES_ESTADO, type Universo } from '../lib/universo'
import { Cartao } from './Comuns'

const lerUniverso = async (): Promise<Universo> => {
  const r = await fetch(`${import.meta.env.BASE_URL}data/universo.json`, { cache: 'no-cache' })
  if (!r.ok) throw new Error(`universo.json (${r.status})`)
  return r.json()
}

const COR: Record<string, string> = {
  radar: 'text-emerald-700 dark:text-emerald-400',
  fora: 'text-amber-700 dark:text-amber-400',
}

export function UniversoCartao() {
  const { meta, favoritos, alternarFavorito } = useApp()
  const [texto, setTexto] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [pedido, setPedido] = useState(false) // o ficheiro só é descarregado quando é preciso
  const u = usePedido(() => (pedido ? lerUniverso() : Promise.resolve(null)), [pedido])

  const tickers = useMemo(() => lerListaColada(texto), [texto])
  const linhas = useMemo(() => classificar(tickers, u.dados), [tickers, u.dados])
  const noRadar = linhas.filter(l => l.estado === 'radar')
  const fora = linhas.filter(l => l.estado === 'fora')
  const novosFav = noRadar.filter(l => !favoritos.has(l.ticker))

  const lerFicheiro = async (f: File | undefined) => {
    if (!f) return
    setPedido(true)
    setTexto(await f.text())
  }
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(linhasCsv(linhas))
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch { /* sem acesso à área de transferência: o texto continua visível para copiar à mão */ }
  }

  const tr = meta?.triagem
  const uv = meta?.universo
  return (
    <Cartao titulo={<span id="universo">Universo (lista de instrumentos)</span>}>
      {uv && tr ? (
        <div className="text-sm">
          <p>
            O motor acompanha <b>{uv.total.toLocaleString('pt-PT')}</b> instrumentos: <b>{uv.manual}</b> da sua lista
            {uv.lista_xtb > 0 && <> e os restantes da lista oficial da XTB (ações e ETF de distribuição)</>}.
          </p>
          <ul className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            <li>No radar (pagaram dividendos nos últimos 24 meses): <b>{meta.total_radar.toLocaleString('pt-PT')}</b></li>
            <li>Sem dividendos recentes: {(tr.estados.sem_dividendos ?? 0).toLocaleString('pt-PT')} (voltam a ser verificados de 2 em 2 meses)</li>
            <li>Ainda por verificar: {Math.max(0, uv.total - Object.values(tr.estados).reduce((a, b) => a + b, 0)).toLocaleString('pt-PT')}
              {tr.interrompido === 'tempo' && ' — o motor verifica uma parte por noite'}
              {tr.interrompido === 'bloqueio' && ' — o Yahoo recusou pedidos na última noite; continua na próxima'}</li>
          </ul>
        </div>
      ) : <p className="text-sm text-slate-500">Sem informação do universo (o motor ainda não correu com a versão nova).</p>}

      <div className="mt-3">
        <label htmlFor="lista" className="text-sm font-medium">Colar ou importar uma lista</label>
        <p className="text-xs text-slate-500">
          Símbolos da XTB (ex.: KO.US, NOS.PT), um por linha ou separados por vírgulas. Pode colar uma coluna de uma folha de cálculo
          ou de um extrato — o resto do texto é ignorado.
        </p>
        <textarea id="lista" value={texto} rows={4} onFocus={() => setPedido(true)} onChange={e => setTexto(e.target.value)}
          placeholder={'KO.US\nNOS.PT, VHYD.DE'}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900" />
        <label className="mt-1 inline-flex cursor-pointer items-center gap-2 text-xs text-sky-700 underline dark:text-sky-400">
          Importar ficheiro (CSV ou texto)
          <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={e => lerFicheiro(e.target.files?.[0])} />
        </label>
      </div>

      {tickers.length > 0 && (
        <div className="mt-3">
          {u.aCarregar && <p className="text-sm text-slate-500">A verificar…</p>}
          {u.erro && <p className="text-sm text-red-700">Não foi possível ler o universo ({u.erro}).</p>}
          <p className="text-sm"><b>{tickers.length}</b> símbolos: {noRadar.length} no radar, {fora.length} fora do universo,
            {' '}{linhas.length - noRadar.length - fora.length} noutro estado.</p>
          <ul className="mt-1 max-h-64 overflow-y-auto text-sm">
            {linhas.map(l => (
              <li key={l.ticker} className="flex flex-wrap gap-x-2 border-b border-slate-100 py-1 dark:border-slate-800">
                {l.estado === 'radar'
                  ? <Link to={`/acao/${l.ticker}`} className="font-mono font-medium text-sky-700 underline dark:text-sky-400">{l.ticker}</Link>
                  : <span className="font-mono font-medium">{l.ticker}</span>}
                <span className="text-slate-500">{l.nome}</span>
                <span className={`ml-auto text-xs ${COR[l.estado] ?? 'text-slate-500'}`}>{NOMES_ESTADO[l.estado]}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={!novosFav.length} onClick={() => novosFav.forEach(l => alternarFavorito(l.ticker))}
              className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
              ★ Juntar aos favoritos ({novosFav.length})
            </button>
            <button type="button" disabled={!fora.length} onClick={copiar}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">
              {copiado ? 'Copiado ✓' : `Copiar as que faltam (${fora.length})`}
            </button>
          </div>
          {fora.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              As que estão fora do universo não constam da lista da XTB (ou estão desligadas). Copie-as e envie-mas para eu as acrescentar
              à lista manual; na Fase 4 isto passa a ser automático.
            </p>
          )}
        </div>
      )}
    </Cartao>
  )
}
