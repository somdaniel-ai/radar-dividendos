// Posições da Carteira: tabela no PC (títulos presos ao descer, ordenação, botão Colunas,
// linha de totais) e cartões no telemóvel (com "Ordenar por"). Clicar numa posição abre os
// lotes de compra.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState,
} from '@tanstack/react-table'
import { gravar, ler } from '../lib/armazenamento'
import { proximasDatas, type ProximaData } from '../lib/calendario'
import type { Posicao } from '../lib/carteira'
import { COLUNAS_CARTEIRA, useColunas } from '../lib/colunas'
import { useApp } from '../lib/contexto'
import { data, dias, euros, moeda, numero, pct } from '../lib/formato'
import { Cartao, EtiquetaCategoria } from './Comuns'
import { EscolherColunas } from './Colunas'
import { EtiquetaNivel } from './Nivel'

const K_ORDEM = 'radar.carteira.ordem'

export const corLucro = (x: number | null) => (x == null ? '' : x >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')

/** Uma posição com os valores já calculados para a tabela. */
export interface LinhaTabela {
  p: Posicao
  peso: number | null
  ex: ProximaData | null
  pag: ProximaData | null
  /** preço atual na moeda da cotação usada (XTB, se houver) */
  preco_atual: number | null
  moeda_preco: string | null
}

export function linhasTabela(posicoes: Posicao[], hoje: string): LinhaTabela[] {
  const base = (p: Posicao) => p.valor_eur ?? p.custo_eur
  const total = posicoes.reduce((s, p) => s + base(p), 0)
  return posicoes.map(p => {
    const a = p.acao
    const d = a ? proximasDatas(a, hoje) : { ex: null, pagamento: null }
    const xtb = a?.cotacao_xtb?.preco != null
    return {
      p, peso: total > 0 ? base(p) / total : null, ex: d.ex, pag: d.pagamento,
      preco_atual: a ? (xtb ? a.cotacao_xtb.preco : a.preco) : null,
      moeda_preco: a ? (xtb ? a.cotacao_xtb.moeda : a.moeda) : null,
    }
  })
}

export function totais(linhas: LinhaTabela[]) {
  const s = (f: (l: LinhaTabela) => number | null) => linhas.reduce((t, l) => t + (f(l) ?? 0), 0)
  const investido = s(l => l.p.custo_eur)
  const valor = s(l => l.p.valor_eur ?? l.p.custo_eur)
  const anual = s(l => l.p.previsto.anual_liquido)
  return {
    investido, valor, ganho: valor - investido, ganho_pct: investido > 0 ? (valor - investido) / investido : null,
    mensal: anual / 12, yoc: investido > 0 ? anual / investido : null, recebidos: s(l => l.p.dividendos.liquido),
  }
}

/** Data com ✓ (confirmada) ou ≈ (estimada) e os dias que faltam. */
export function DataProxima({ d }: { d: ProximaData | null }) {
  if (!d) return <span className="text-slate-400" title="Sem data prevista (pagamentos irregulares ou atraso habitual desconhecido)">—</span>
  return (
    <span className="leading-tight" title={d.confirmada ? 'Confirmada (anunciada pela empresa)' : 'Estimada (última data + frequência habitual)'}>
      <span className="whitespace-nowrap">
        {data(d.data).slice(0, 5)}{' '}
        {d.confirmada ? <span className="text-emerald-700 dark:text-emerald-400">✓</span> : <span className="text-slate-500">≈</span>}
      </span>
      <span className="block text-[11px] text-slate-500">{dias(d.dias)}</span>
    </span>
  )
}

function Ganho({ p }: { p: Posicao }) {
  return (
    <span className={`leading-tight ${corLucro(p.lucro_eur)}`}>
      {euros(p.lucro_eur)}
      {p.lucro_pct != null && <span className="block text-[11px]">{p.lucro_pct >= 0 ? '+' : ''}{pct(p.lucro_pct)}</span>}
    </span>
  )
}

function NomePosicao({ p }: { p: Posicao }) {
  const a = p.acao
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1">
        {a ? <Link to={`/acao/${p.ticker}`} onClick={e => e.stopPropagation()} className="font-semibold text-sky-700 dark:text-sky-400">{p.ticker}</Link>
          : <span className="font-semibold">{p.ticker}</span>}
        {a && <EtiquetaNivel nivel={a.nivel.nivel} curta />}
        {a && <EtiquetaCategoria categoria={a.categoria} />}
        {p.retencao.aviso && <span title="Retenção acima da esperada" aria-label="Retenção acima da esperada">⚠️</span>}
      </div>
      <div className="min-w-[8rem] max-w-[14rem] text-xs leading-snug text-slate-500">{p.nome}{!a && ' · fora do radar'}</div>
    </div>
  )
}

/** Lotes de compra, aviso de retenção e dividendos recebidos (ao abrir uma posição). */
function DetalhePosicao({ p, apagar }: { p: Posicao; apagar: (id: string) => void }) {
  const m = p.acao?.cotacao_xtb?.moeda ?? p.acao?.moeda ?? null
  return (
    <div data-detalhe-posicao className="text-xs">
      {p.retencao.aviso && (
        <p className="mb-2 rounded-lg bg-amber-50 p-2 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
          ⚠️ A XTB reteve <b>{pct(p.retencao.real, 0)}</b> nos dividendos, mas o esperado para {p.acao?.pais ?? 'este país'} (nas suas Definições) é <b>{pct(p.retencao.esperada, 0)}</b>.
          {p.acao?.pais === 'Estados Unidos'
            ? ' Causa provável: o formulário W-8BEN não está preenchido ou expirou (sem ele os EUA retêm 30% em vez de 15%). Confirme na área de cliente da XTB (documentos/formulários) ou pergunte ao apoio ao cliente se o W-8BEN está ativo.'
            : ' Causa provável: a corretora não está a aplicar a taxa da convenção entre Portugal e esse país. Pode pedir a devolução do excesso ao país de origem, ou confirmar a taxa nas Definições.'}
        </p>
      )}
      <table className="w-full max-w-2xl">
        <thead className="text-left text-slate-500"><tr><th className="py-1 font-normal">Compra</th><th className="font-normal">Quantidade</th><th className="font-normal">Preço</th><th className="font-normal">Custo</th><th /></tr></thead>
        <tbody>
          {p.lotes.map(l => (
            <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-1">{data(l.data)}{l.origem === 'manual' && <span className="ml-1 text-slate-500">(manual)</span>}</td>
              <td>{numero(l.quantidade, 4)}</td><td>{l.preco != null ? moeda(l.preco, m) : '—'}</td><td>{euros(l.custo_eur)}</td>
              <td className="text-right">{l.origem === 'manual' && (
                <button type="button" className="text-red-700 underline dark:text-red-400"
                  onClick={() => { if (confirm('Apagar esta compra manual?')) apagar(l.id) }}>apagar</button>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap gap-x-4 text-slate-500">
        <span>Investido: {euros(p.custo_eur)}</span>
        <span>Dividendos recebidos: bruto {euros(p.dividendos.bruto)} · retido {euros(p.dividendos.retido)} · líquido {euros(p.dividendos.liquido)}</span>
        {p.acao ? <Link to={`/acao/${p.ticker}`} className="text-sky-700 underline dark:text-sky-400">Ver a ação no radar</Link>
          : <span>Não está no radar: sem cotação atual nem previsão.</span>}
      </div>
    </div>
  )
}

const col = createColumnHelper<LinhaTabela>()
const NUM = -1e15 // valores em falta vão para o fim ao ordenar

const ORDENACOES = [
  { id: 'c_valor', t: 'Valor atual' }, { id: 'c_ganho', t: 'Ganho/perda (€)' }, { id: 'c_ganho_pct', t: 'Ganho/perda (%)' },
  { id: 'c_peso', t: 'Peso' }, { id: 'c_mes', t: 'Previsto por mês' }, { id: 'c_yoc', t: 'Yield sobre o custo' },
  { id: 'c_yield', t: 'Yield atual' }, { id: 'c_freq', t: 'Frequência' }, { id: 'c_ex', t: 'Próxima data ex' }, { id: 'c_pag', t: 'Próximo pagamento' },
  { id: 'c_receb', t: 'Dividendos recebidos' }, { id: 'acao', t: 'Ação (A–Z)' },
] as const
// as datas ordenam-se do mais próximo para o mais distante; o resto do maior para o menor
const CRESCENTE = new Set(['c_ex', 'c_pag', 'acao'])

export function TabelaPosicoes({ posicoes, apagar }: { posicoes: Posicao[]; apagar: (id: string) => void }) {
  const { hoje } = useApp()
  const linhas = useMemo(() => linhasTabela(posicoes, hoje), [posicoes, hoje])
  const t = useMemo(() => totais(linhas), [linhas])
  const colunasVisiveis = useColunas(COLUNAS_CARTEIRA)
  const [verColunas, setVerColunas] = useState(false)
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const [ordem, setOrdem] = useState<SortingState>(() => ler<SortingState>(K_ORDEM, [{ id: 'c_valor', desc: true }]))
  useEffect(() => gravar(K_ORDEM, ordem), [ordem])
  const alternar = (ticker: string) => setAbertas(s => {
    const n = new Set(s)
    if (n.has(ticker)) n.delete(ticker)
    else n.add(ticker)
    return n
  })

  const colunas = useMemo(() => [
    col.accessor(l => l.p.ticker, { id: 'acao', header: 'Ação', sortingFn: 'text', cell: c => <NomePosicao p={c.row.original.p} /> }),
    col.accessor(l => l.p.quantidade, { id: 'c_qtd', header: 'Quant.', sortDescFirst: true, cell: c => numero(c.getValue(), 4) }),
    col.accessor(l => l.p.preco_medio ?? NUM, {
      id: 'c_pmedio', header: 'Preço médio', sortDescFirst: true,
      cell: c => { const l = c.row.original; return l.p.preco_medio != null ? moeda(l.p.preco_medio, l.moeda_preco ?? l.p.acao?.moeda) : '—' },
    }),
    col.accessor(l => l.preco_atual ?? NUM, {
      id: 'c_patual', header: 'Preço atual', sortDescFirst: true,
      cell: c => { const l = c.row.original; return l.preco_atual != null ? moeda(l.preco_atual, l.moeda_preco) : '—' },
    }),
    col.accessor(l => l.p.valor_eur ?? NUM, { id: 'c_valor', header: 'Valor atual', sortDescFirst: true, cell: c => <b>{euros(c.row.original.p.valor_eur)}</b> }),
    col.accessor(l => l.p.lucro_eur ?? NUM, { id: 'c_ganho', header: 'Ganho/perda', sortDescFirst: true, cell: c => <Ganho p={c.row.original.p} /> }),
    // só para ordenar (no telemóvel): ganho em %
    col.accessor(l => l.p.lucro_pct ?? NUM, { id: 'c_ganho_pct', header: 'Ganho %', sortDescFirst: true }),
    col.accessor(l => l.peso ?? NUM, { id: 'c_peso', header: 'Peso', sortDescFirst: true, cell: c => pct(c.row.original.peso) }),
    col.accessor(l => l.p.previsto.mensal_liquido ?? NUM, { id: 'c_mes', header: 'Previsto/mês', sortDescFirst: true, cell: c => euros(c.row.original.p.previsto.mensal_liquido) }),
    col.accessor(l => l.p.acao?.yield.liquido ?? NUM, { id: 'c_yield', header: 'Yield atual', sortDescFirst: true, cell: c => pct(c.row.original.p.acao?.yield.liquido) }),
    col.accessor(l => l.p.yield_on_cost.liquido ?? NUM, { id: 'c_yoc', header: 'Yield s/ custo', sortDescFirst: true, cell: c => pct(c.row.original.p.yield_on_cost.liquido) }),
    // a mesma frequência do Radar; ordena da mais frequente (mensal) para a menos (irregular)
    col.accessor(l => l.p.acao?.pagamentos_ano ?? -1, { id: 'c_freq', header: 'Freq.', sortDescFirst: true, cell: c => c.row.original.p.acao?.frequencia ?? '—' }),
    col.accessor(l => l.ex?.data ?? '9999', { id: 'c_ex', header: 'Próx. ex', sortingFn: 'text', cell: c => <DataProxima d={c.row.original.ex} /> }),
    col.accessor(l => l.pag?.data ?? '9999', { id: 'c_pag', header: 'Próx. pag.', sortingFn: 'text', cell: c => <DataProxima d={c.row.original.pag} /> }),
    col.accessor(l => l.p.dividendos.liquido, { id: 'c_receb', header: 'Recebidos', sortDescFirst: true, cell: c => euros(c.getValue()) }),
  ], [])

  const tabela = useReactTable({
    data: linhas, columns: colunas,
    state: { sorting: ordem, columnVisibility: { ...colunasVisiveis.visiveis, c_ganho_pct: false } },
    onSortingChange: setOrdem, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  })
  const ordenadas = tabela.getRowModel().rows
  const ordemAtual = ordem[0] ?? { id: 'c_valor', desc: true }
  const nVisiveis = tabela.getVisibleLeafColumns().length

  // como no Radar: scroll normal da página com os títulos presos; só numa janela estreita
  // demais é que a tabela passa a ter scroll próprio (com a coluna da ação fixa)
  const caixa = useRef<HTMLDivElement>(null)
  const [estreita, setEstreita] = useState(false)
  useLayoutEffect(() => {
    const cx = caixa.current
    const tab = cx?.querySelector('table')
    if (!cx || !tab || typeof ResizeObserver === 'undefined') return
    const medir = () => setEstreita(tab.offsetWidth > cx.clientWidth + 1)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(cx)
    ro.observe(tab)
    return () => ro.disconnect()
  })

  // célula da linha de totais para cada coluna
  const total: Record<string, React.ReactNode> = {
    acao: <span>Total <span className="block text-[11px] font-normal text-slate-500">investido {euros(t.investido)}</span></span>,
    c_valor: euros(t.valor),
    c_ganho: <span className={`leading-tight ${corLucro(t.ganho)}`}>{euros(t.ganho)}
      {t.ganho_pct != null && <span className="block text-[11px]">{t.ganho_pct >= 0 ? '+' : ''}{pct(t.ganho_pct)}</span>}</span>,
    c_peso: pct(1, 0), c_mes: euros(t.mensal), c_yoc: pct(t.yoc), c_receb: euros(t.recebidos),
  }
  const fixaAcao = estreita ? 'sticky left-0 shadow-[1px_0_0_0_rgb(226_232_240)] dark:shadow-[1px_0_0_0_rgb(30_41_59)]' : ''

  return (
    <Cartao titulo="Posições" acao={
      <button type="button" onClick={() => setVerColunas(v => !v)} aria-expanded={verColunas}
        className="hidden rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium md:block dark:border-slate-700 dark:bg-slate-900">
        Colunas
      </button>}>
      {verColunas && (
        <div className="mb-3 hidden rounded-xl bg-slate-50 p-3 md:block dark:bg-slate-800/60">
          <EscolherColunas {...colunasVisiveis} nota="O nome da ação aparece sempre. Só afeta a tabela do PC (no telemóvel aparecem cartões). Fica guardado, também na sua conta." />
        </div>
      )}

      {/* telemóvel: cartões + "Ordenar por" */}
      <div className="mb-2 flex items-center gap-2 text-sm md:hidden">
        <label htmlFor="ordem-carteira" className="text-slate-500">Ordenar por</label>
        <select id="ordem-carteira" value={ordemAtual.id}
          onChange={e => setOrdem([{ id: e.target.value, desc: !CRESCENTE.has(e.target.value) }])}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
          {ORDENACOES.map(o => <option key={o.id} value={o.id}>{o.t}</option>)}
        </select>
        <button type="button" onClick={() => setOrdem([{ id: ordemAtual.id, desc: !ordemAtual.desc }])}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          aria-label={ordemAtual.desc ? 'Ordem decrescente' : 'Ordem crescente'}>
          {ordemAtual.desc ? '↓' : '↑'}
        </button>
      </div>
      <ul className="space-y-2 md:hidden">
        {ordenadas.map(r => {
          const l = r.original, p = l.p, aberta = abertas.has(p.ticker)
          return (
            <li key={p.ticker} data-cartao-posicao className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800">
              <div role="button" tabIndex={0} aria-expanded={aberta} onClick={() => alternar(p.ticker)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(p.ticker) } }}
                className="cursor-pointer p-3">
                <div className="flex items-start justify-between gap-2">
                  <NomePosicao p={p} />
                  <div className="text-right">
                    <div className="font-bold">{euros(p.valor_eur)}</div>
                    <div className="text-[11px] text-slate-500">{pct(l.peso)} da carteira</div>
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs">
                  <div><dt className="text-slate-500">Quantidade</dt><dd>{numero(p.quantidade, 4)}</dd></div>
                  <div><dt className="text-slate-500">Ganho/perda</dt><dd><Ganho p={p} /></dd></div>
                  <div><dt className="text-slate-500">Previsto/mês</dt><dd className="font-semibold">{euros(p.previsto.mensal_liquido)}</dd></div>
                  <div><dt className="text-slate-500">Yield s/ custo</dt><dd>{pct(p.yield_on_cost.liquido)}</dd></div>
                  <div><dt className="text-slate-500">Frequência</dt><dd>{p.acao?.frequencia ?? '—'}</dd></div>
                  <div><dt className="text-slate-500">Próx. ex</dt><dd><DataProxima d={l.ex} /></dd></div>
                  <div><dt className="text-slate-500">Próx. pag.</dt><dd><DataProxima d={l.pag} /></dd></div>
                  <div><dt className="text-slate-500">Recebidos</dt><dd>{euros(p.dividendos.liquido)}</dd></div>
                  <div><dt className="text-slate-500">Yield atual</dt><dd>{pct(p.acao?.yield.liquido)}</dd></div>
                  <div><dt className="text-slate-500">Preço médio</dt><dd>{p.preco_medio != null ? moeda(p.preco_medio, l.moeda_preco ?? p.acao?.moeda) : '—'}</dd></div>
                </dl>
              </div>
              {aberta && <div className="border-t border-slate-200 p-3 dark:border-slate-800"><DetalhePosicao p={p} apagar={apagar} /></div>}
            </li>
          )
        })}
      </ul>
      <div data-totais-telemovel className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-slate-50 p-3 text-xs md:hidden dark:bg-slate-800/60">
        <div className="col-span-2 font-semibold">Total da carteira</div>
        <div><span className="text-slate-500">Valor atual</span> <b>{euros(t.valor)}</b></div>
        <div><span className="text-slate-500">Investido</span> {euros(t.investido)}</div>
        <div><span className="text-slate-500">Ganho/perda</span> <span className={corLucro(t.ganho)}>{euros(t.ganho)} ({pct(t.ganho_pct)})</span></div>
        <div><span className="text-slate-500">Previsto/mês</span> <b>{euros(t.mensal)}</b></div>
        <div><span className="text-slate-500">Yield s/ custo</span> {pct(t.yoc)}</div>
        <div><span className="text-slate-500">Recebidos</span> {euros(t.recebidos)}</div>
      </div>

      {/* PC: tabela */}
      <div ref={caixa} data-tabela-carteira data-estreita={estreita || undefined}
        className={`-mx-4 hidden md:block ${estreita ? 'max-h-[calc(100dvh-var(--altura-topo,4rem)-1rem)] overflow-auto' : ''}`}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            {tabela.getHeaderGroups().map(g => (
              <tr key={g.id}>
                {g.headers.map(h => {
                  const s = h.column.getIsSorted()
                  const direita = h.column.id !== 'acao' && h.column.id !== 'c_ex' && h.column.id !== 'c_pag' && h.column.id !== 'c_freq'
                  return (
                    <th key={h.id} aria-sort={s === 'asc' ? 'ascending' : s === 'desc' ? 'descending' : undefined}
                      className={`sticky ${estreita ? 'top-0' : 'top-(--altura-topo,4rem)'} border-b border-slate-200 bg-slate-50 px-2 py-2 align-bottom leading-tight first:pl-4 last:pr-4 dark:border-slate-700 dark:bg-slate-800 ${h.column.id === 'acao' ? `${fixaAcao} z-[12]` : 'z-[11]'} ${direita ? 'text-right' : ''}`}>
                      <button type="button" onClick={h.column.getToggleSortingHandler()}
                        className={`inline-flex items-end gap-1 uppercase hover:text-slate-900 dark:hover:text-white ${direita ? 'flex-row-reverse text-right' : 'text-left'}`}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <span aria-hidden>{s === 'asc' ? '▲' : s === 'desc' ? '▼' : ''}</span>
                      </button>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {ordenadas.map(r => {
              const aberta = abertas.has(r.original.p.ticker)
              return (
                <Fragment key={r.id}>
                  <tr data-posicao={r.original.p.ticker} aria-expanded={aberta} onClick={() => alternar(r.original.p.ticker)}
                    className="group cursor-pointer" title="Clique para ver os lotes de compra">
                    {r.getVisibleCells().map(c => {
                      const id = c.column.id
                      const direita = id !== 'acao' && id !== 'c_ex' && id !== 'c_pag' && id !== 'c_freq'
                      return (
                        <td key={c.id} className={`border-b border-slate-100 px-2 py-2 align-top first:pl-4 last:pr-4 group-hover:bg-sky-50 dark:border-slate-800 dark:group-hover:bg-slate-800 ${id === 'acao' ? `${fixaAcao} ${estreita ? 'z-10 bg-white dark:bg-slate-900' : ''}` : 'whitespace-nowrap'} ${direita ? 'text-right tabular-nums' : ''}`}>
                          {id === 'acao'
                            ? <div className="flex items-start gap-1"><span aria-hidden className="mt-0.5 w-3 text-slate-400">{aberta ? '▾' : '▸'}</span>{flexRender(c.column.columnDef.cell, c.getContext())}</div>
                            : flexRender(c.column.columnDef.cell, c.getContext())}
                        </td>
                      )
                    })}
                  </tr>
                  {aberta && (
                    <tr><td colSpan={nVisiveis} className="border-b border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/30">
                      <DetalhePosicao p={r.original.p} apagar={apagar} />
                    </td></tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot data-totais>
            <tr className="font-semibold">
              {tabela.getVisibleLeafColumns().map(c => (
                <td key={c.id} className={`border-t-2 border-slate-300 px-2 py-2 align-top first:pl-4 last:pr-4 dark:border-slate-600 ${c.id === 'acao' ? `${fixaAcao} ${estreita ? 'bg-white dark:bg-slate-900' : ''}` : 'whitespace-nowrap text-right tabular-nums'}`}>
                  {total[c.id] ?? ''}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Preços na moeda da bolsa; os outros valores em euros. Ganho/perda inclui o efeito do câmbio. Yields e previsto são <b>líquidos</b> (depois da retenção).
        Peso pelo valor atual (ou pelo investido, se não houver cotação). Datas: <b>✓</b> confirmada pela empresa, <b>≈</b> estimada
        (última data + frequência habitual); o próximo pagamento pode vir antes da próxima data ex quando a data ex já passou e o dinheiro ainda não chegou.
        Clique numa posição para ver os lotes de compra. Ver também o <Link to="/calendario" className="text-sky-700 underline dark:text-sky-400">Calendário</Link>.
      </p>
    </Cartao>
  )
}
