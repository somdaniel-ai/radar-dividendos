import {
  createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState,
} from '@tanstack/react-table'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Carregando, Cartao, Erro, Estrela, EtiquetaCategoria, IconesSinais, NOMES_CATEGORIA,
} from '../componentes/Comuns'
import { EscolherColunas } from '../componentes/Colunas'
import { EtiquetaNivel, Legenda } from '../componentes/Nivel'
import { gravar, ler } from '../lib/armazenamento'
import { useColunas } from '../lib/colunas'
import type { AcaoCalculada } from '../lib/calculos'
import { useApp } from '../lib/contexto'
import { dias, euros, pct } from '../lib/formato'

interface Filtros {
  texto: string
  categoria: string // '' = todas
  setor: string
  pais: string
  moeda: string
  frequencia: string
  niveis: number[]
  yieldMin: string
  yieldMax: string
  payoutMax: string
  soAbaixoJusto: boolean
  soAbaixoJustoHist: boolean
  esconderArmadilhas: boolean
  esconderForaBatentes: boolean
}

const FILTROS_PADRAO: Filtros = {
  texto: '', categoria: '', setor: '', pais: '', moeda: '', frequencia: '', niveis: [],
  yieldMin: '', yieldMax: '', payoutMax: '', soAbaixoJusto: false, soAbaixoJustoHist: false, esconderArmadilhas: false,
  esconderForaBatentes: true,
}

const CATEGORIAS = [
  { v: '', t: 'Todas' }, { v: 'EMPRESA', t: 'Empresas' }, { v: 'REIT', t: 'REIT' }, { v: 'BDC', t: 'BDC' },
  { v: 'CEF', t: 'Fundos fechados' }, { v: 'ETF', t: 'ETF' },
]

const ORDENACOES = [
  { id: 'pontos', t: 'Pontuação' }, { id: 'yliq', t: 'Yield líquido' }, { id: 'ybruto', t: 'Yield bruto' },
  { id: 'nivel', t: 'Nível de consistência' }, { id: 'desconto', t: 'Desconto face ao preço justo (alvo)' },
  { id: 'descontoH', t: 'Desconto face ao preço justo histórico' },
  { id: 'pos52', t: 'Posição 52 semanas' }, { id: 'proximo', t: 'Próximo pagamento' }, { id: 'acao', t: 'Nome' },
  { id: 'preco', t: 'Preço' },
]

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
const desconto = (a: AcaoCalculada) =>
  a.preco_justo_eur && a.preco_eur ? (a.preco_justo_eur - a.preco_eur) / a.preco_justo_eur : null
const descontoH = (a: AcaoCalculada) =>
  a.preco_justo_historico_eur && a.preco_eur ? (a.preco_justo_historico_eur - a.preco_eur) / a.preco_justo_historico_eur : null

function Justo({ valor, abaixo, titulo }: { valor: number | null; abaixo: boolean; titulo: string }) {
  return (
    <span className={abaixo ? 'font-semibold text-emerald-700 dark:text-emerald-400' : ''}
      title={abaixo ? `Preço atual abaixo do ${titulo}` : titulo}>
      {euros(valor)}{abaixo ? ' ✓' : ''}
    </span>
  )
}

const col = createColumnHelper<AcaoCalculada>()

// colunas fixas à esquerda na tabela do PC (estrela e nome da ação); a da ação tem uma linha de separação
const FIXAS: Record<string, string> = {
  fav: 'left-0 w-9 min-w-9 max-w-9',
  acao: 'left-9 shadow-[1px_0_0_0_rgb(226_232_240)] dark:shadow-[1px_0_0_0_rgb(30_41_59)]',
}
const fixa = (id: string) => FIXAS[id] ?? ''
const POR_PAGINA = 100

export function Radar({ soFavoritos = false }: { soFavoritos?: boolean }) {
  const { aCarregar, erro, acoes, params, favoritos, alternarFavorito, notas, naCarteira } = useApp()
  const chave = soFavoritos ? 'radar.filtros.favoritos' : 'radar.filtros'
  // nos favoritos mostra-se tudo o que o utilizador escolheu, mesmo fora dos limites de yield
  const padraoFiltros = soFavoritos ? { ...FILTROS_PADRAO, esconderForaBatentes: false } : FILTROS_PADRAO
  const [f, setF] = useState<Filtros>(() => ({ ...padraoFiltros, ...ler<Partial<Filtros>>(chave, {}) }))
  const [ordem, setOrdem] = useState<SortingState>(() => ler(`${chave}.ordem`, [{ id: 'pontos', desc: true }]))
  const [verFiltros, setVerFiltros] = useState(false)
  const [verLegenda, setVerLegenda] = useState(false)
  const [verColunas, setVerColunas] = useState(false)
  const colunasVisiveis = useColunas()
  const navegar = useNavigate()

  useEffect(() => gravar(chave, f), [chave, f])
  useEffect(() => gravar(`${chave}.ordem`, ordem), [chave, ordem])
  const muda = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setF(x => ({ ...x, [k]: v }))

  const opcoes = useMemo(() => {
    const u = (fn: (a: AcaoCalculada) => string | null) =>
      [...new Set(acoes.map(fn).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt'))
    return { setor: u(a => a.setor), pais: u(a => a.pais), moeda: u(a => a.moeda), frequencia: u(a => a.frequencia) }
  }, [acoes])

  const filtradas = useMemo(() => {
    const t = f.texto.trim().toLowerCase()
    const ymin = num(f.yieldMin), ymax = num(f.yieldMax), pmax = num(f.payoutMax)
    return acoes.filter(a => {
      if (soFavoritos && !favoritos.has(a.ticker)) return false
      if (t && !`${a.ticker} ${a.nome} ${a.ticker_yahoo}`.toLowerCase().includes(t)) return false
      if (f.categoria && a.categoria !== f.categoria) return false
      if (f.setor && a.setor !== f.setor) return false
      if (f.pais && a.pais !== f.pais) return false
      if (f.moeda && a.moeda !== f.moeda) return false
      if (f.frequencia && a.frequencia !== f.frequencia) return false
      if (f.niveis.length && !f.niveis.includes(a.nivel.nivel)) return false
      const yl = a.yield.liquido
      if (ymin != null && (yl == null || yl * 100 < ymin)) return false
      if (ymax != null && (yl == null || yl * 100 > ymax)) return false
      if (pmax != null && a.payout != null && a.payout * 100 > pmax) return false
      if (f.soAbaixoJusto && !a.abaixo_preco_justo) return false
      if (f.soAbaixoJustoHist && !a.abaixo_preco_justo_historico) return false
      if (f.esconderArmadilhas && a.armadilhas.length) return false
      if (f.esconderForaBatentes && a.fora_batentes) return false
      return true
    })
  }, [acoes, f, soFavoritos, favoritos])

  const colunas = useMemo(() => [
    col.display({
      id: 'fav', header: '', enableSorting: false,
      cell: c => <Estrela ativa={favoritos.has(c.row.original.ticker)} onClick={() => alternarFavorito(c.row.original.ticker)} tamanho="text-lg" />,
    }),
    col.accessor(a => a.nome, {
      id: 'acao', header: 'Ação', sortingFn: 'text',
      cell: c => {
        const a = c.row.original
        return (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1">
              <span className="font-semibold">{a.ticker}</span>
              <EtiquetaCategoria categoria={a.categoria} />
              {naCarteira.has(a.ticker) && <span title="Está na sua carteira" aria-label="Na carteira">💼</span>}
              {notas[a.ticker] && <span title={notas[a.ticker]} aria-label="Tem nota">📝</span>}
            </div>
            <div className="min-w-[8rem] max-w-[15rem] text-xs leading-snug text-slate-500">{a.nome}</div>
          </div>
        )
      },
    }),
    col.accessor(a => a.nivel.nivel, { id: 'nivel', header: 'Nível', sortDescFirst: true, cell: c => <EtiquetaNivel nivel={c.getValue()} curta /> }),
    col.accessor(a => a.pontuacao.total, { id: 'pontos', header: 'Pontos', sortDescFirst: true, cell: c => <b>{c.getValue().toFixed(1).replace('.', ',')}</b> }),
    col.accessor(a => a.yield.liquido ?? -1, { id: 'yliq', header: 'Yield líq.', sortDescFirst: true, cell: c => pct(c.row.original.yield.liquido) }),
    col.accessor(a => a.yield.bruto ?? -1, { id: 'ybruto', header: 'Yield bruto', sortDescFirst: true, cell: c => pct(c.row.original.yield.bruto) }),
    col.accessor(a => a.pagamentos_ano, { id: 'freq', header: 'Freq.', sortDescFirst: true, cell: c => c.row.original.frequencia }),
    col.accessor(a => a.preco_eur ?? 0, { id: 'preco', header: 'Preço', cell: c => euros(c.row.original.preco_eur) }),
    col.accessor(a => desconto(a) ?? -99, {
      id: 'desconto', header: `Justo ${pct(params?.preco.yield_alvo ?? 0.06, 0)}`, sortDescFirst: true,
      cell: c => <Justo valor={c.row.original.preco_justo_eur} abaixo={c.row.original.abaixo_preco_justo}
        titulo="preço justo (dividendo anual ÷ yield alvo)" />,
    }),
    col.accessor(a => descontoH(a) ?? -99, {
      id: 'descontoH', header: 'Justo hist.', sortDescFirst: true,
      cell: c => <Justo valor={c.row.original.preco_justo_historico_eur} abaixo={c.row.original.abaixo_preco_justo_historico}
        titulo="preço justo histórico (dividendo anual ÷ yield habitual da ação)" />,
    }),
    col.accessor(a => a.posicao['52s'] ?? 2, {
      id: 'pos52', header: 'Pos. 52s',
      cell: c => {
        const a = c.row.original
        const cor = a.perto_minimo_52s ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : a.perto_maximo_52s ? 'text-red-700 dark:text-red-400' : ''
        return <span className={cor}>{pct(a.posicao['52s'], 0)}</span>
      },
    }),
    col.accessor(a => a.pagamento.dias_para_pagamento ?? 99999, {
      id: 'proximo', header: 'Próx. pag.',
      cell: c => {
        const a = c.row.original
        return <span className={a.pagamento.atrasado ? 'text-red-700 dark:text-red-400' : ''}>{dias(a.pagamento.dias_para_pagamento)}</span>
      },
    }),
    col.display({ id: 'sinais', header: 'Sinais', cell: c => <IconesSinais sinais={[...c.row.original.armadilhas, ...c.row.original.avisos]} /> }),
  ], [favoritos, alternarFavorito, notas, params, naCarteira])

  const tabela = useReactTable({
    data: filtradas, columns: colunas, state: { sorting: ordem, columnVisibility: colunasVisiveis.visiveis },
    onSortingChange: setOrdem,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  })

  // com milhares de ações, desenha-se 100 de cada vez (a página fica rápida também no telemóvel).
  // Atenção: todos os "hooks" (useState, useEffect…) têm de vir ANTES dos "return" de baixo.
  const [mostrar, setMostrar] = useState(POR_PAGINA)
  useEffect(() => setMostrar(POR_PAGINA), [f, ordem])

  // A tabela usa o scroll normal da página (títulos presos debaixo da barra do topo).
  // Só se a janela for estreita demais para a tabela é que passa a ter scroll para o lado
  // (numa caixa própria, com os títulos e o nome da ação fixos).
  const caixaTabela = useRef<HTMLDivElement>(null)
  const [estreita, setEstreita] = useState(false)
  useLayoutEffect(() => {
    const caixa = caixaTabela.current
    const tab = caixa?.querySelector('table')
    if (!caixa || !tab || typeof ResizeObserver === 'undefined') return
    const medir = () => setEstreita(tab.offsetWidth > caixa.clientWidth + 1)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(caixa)
    ro.observe(tab)
    return () => ro.disconnect()
  })

  if (erro) return <Erro texto={erro} />
  if (aCarregar || !params) return <Carregando />

  const todasLinhas = tabela.getRowModel().rows
  const linhas = todasLinhas.slice(0, mostrar)
  const ativos = Object.entries(f).filter(([k, v]) =>
    k !== 'texto' && k !== 'categoria' && JSON.stringify(v) !== JSON.stringify(padraoFiltros[k as keyof Filtros])).length
  const ordemAtual = ordem[0] ?? { id: 'pontos', desc: true }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{soFavoritos ? 'Favoritos' : 'Radar'}</h1>
          <p className="text-sm text-slate-500">
            A mostrar {todasLinhas.length} de {soFavoritos ? favoritos.size : acoes.length} ações
            {f.esconderForaBatentes && params.pontuacao.batentes_ativos && (
              <> · yield líquido entre {pct(params.pontuacao.yield_minimo, 0)} e {pct(params.pontuacao.yield_maximo, 0)}</>
            )}
          </p>
        </div>
        <button type="button" onClick={() => setVerLegenda(v => !v)} className="text-sm text-sky-700 underline dark:text-sky-400">
          {verLegenda ? 'Esconder legenda' : 'Legenda das cores'}
        </button>
      </div>

      {verLegenda && <Cartao titulo="Níveis de consistência"><Legenda />
        <p className="mt-3 text-xs text-slate-500">Sinais: 🔥 yield muito alto · 💸 paga mais do que lucra · 📉 preço em queda · ⏰ dividendo atrasado · ↩️ pode incluir devolução de capital · 🧾 taxa de imposto não definida · ❓ possível extraordinário a confirmar</p>
      </Cartao>}

      {soFavoritos && favoritos.size === 0 && (
        <Cartao><p className="text-sm">Ainda não tem favoritos. Toque na ☆ de uma ação no Radar para a acrescentar.</p></Cartao>
      )}

      {/* pesquisa + categorias */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input type="search" value={f.texto} onChange={e => muda('texto', e.target.value)} placeholder="Pesquisar ticker ou nome…"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-900"
            aria-label="Pesquisar" />
          <button type="button" onClick={() => setVerFiltros(v => !v)}
            className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium dark:border-slate-700 dark:bg-slate-900"
            aria-expanded={verFiltros}>
            Filtros{ativos ? ` (${ativos})` : ''}
          </button>
          <button type="button" onClick={() => setVerColunas(v => !v)}
            className="hidden shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium md:block dark:border-slate-700 dark:bg-slate-900"
            aria-expanded={verColunas}>
            Colunas
          </button>
        </div>
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Categoria">
          {CATEGORIAS.map(c => {
            const n = c.v ? acoes.filter(a => a.categoria === c.v && (!soFavoritos || favoritos.has(a.ticker))).length : null
            if (c.v && n === 0) return null
            return (
              <button key={c.v} type="button" role="tab" aria-selected={f.categoria === c.v} onClick={() => muda('categoria', c.v)}
                className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${f.categoria === c.v
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-white text-slate-700 ring-1 ring-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'}`}>
                {c.t}{n != null ? ` · ${n}` : ''}
              </button>
            )
          })}
        </div>
        {f.categoria === 'CEF' && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
            ↩️ Nos <b>fundos fechados</b> a distribuição pode incluir <b>devolução de capital</b>: parte do que recebe pode ser o seu próprio dinheiro devolvido, e não rendimento. O yield pode parecer melhor do que é.
          </p>
        )}
      </div>

      {verColunas && (
        <Cartao titulo="Colunas da tabela" className="hidden md:block"
          acao={<button type="button" className="text-sm text-sky-700 underline dark:text-sky-400" onClick={() => setVerColunas(false)}>Fechar</button>}>
          <EscolherColunas {...colunasVisiveis} />
          <p className="mt-2 text-xs text-slate-500">Fica guardado (também pode mudar em Definições → Colunas do Radar).</p>
        </Cartao>
      )}

      {verFiltros && (
        <Cartao titulo="Filtros" acao={<button type="button" className="text-sm text-sky-700 underline dark:text-sky-400"
          onClick={() => setF(x => ({ ...padraoFiltros, texto: x.texto, categoria: x.categoria }))}>Limpar</button>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(['setor', 'pais', 'moeda', 'frequencia'] as const).map(k => (
              <label key={k} className="text-sm">
                <span className="mb-1 block font-medium">{{ setor: 'Setor', pais: 'País', moeda: 'Moeda', frequencia: 'Frequência' }[k]}</span>
                <select value={f[k]} onChange={e => muda(k, e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
                  <option value="">Todos</option>
                  {opcoes[k].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            ))}
            <label className="text-sm">
              <span className="mb-1 block font-medium">Yield líquido mínimo (%)</span>
              <input inputMode="decimal" value={f.yieldMin} onChange={e => muda('yieldMin', e.target.value)} placeholder="ex.: 5"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Yield líquido máximo (%)</span>
              <input inputMode="decimal" value={f.yieldMax} onChange={e => muda('yieldMax', e.target.value)} placeholder="ex.: 15"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Payout máximo (%)</span>
              <input inputMode="decimal" value={f.payoutMax} onChange={e => muda('payoutMax', e.target.value)} placeholder="ex.: 90"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <div className="text-sm">
              <span className="mb-1 block font-medium">Nível de cor</span>
              <div className="flex flex-wrap gap-1">
                {[6, 5, 4, 3, 2, 1, 0].map(n => (
                  <button key={n} type="button" aria-pressed={f.niveis.includes(n)}
                    onClick={() => muda('niveis', f.niveis.includes(n) ? f.niveis.filter(x => x !== n) : [...f.niveis, n])}
                    className={`rounded-full ${f.niveis.includes(n) ? 'ring-2 ring-sky-500' : 'opacity-60'}`}>
                    <EtiquetaNivel nivel={n} curta />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {([
              ['soAbaixoJusto', `Só abaixo do preço justo (${pct(params.preco.yield_alvo, 0)})`],
              ['soAbaixoJustoHist', 'Só abaixo do preço justo histórico'],
              ['esconderArmadilhas', 'Esconder armadilhas'],
              ['esconderForaBatentes', 'Esconder fora dos limites de yield'],
            ] as const).map(([k, t]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={f[k]} onChange={e => muda(k, e.target.checked)} className="size-4" />
                {t}
              </label>
            ))}
          </div>
        </Cartao>
      )}

      {/* ordenação (telemóvel) */}
      <div className="flex items-center gap-2 text-sm md:hidden">
        <label htmlFor="ordem" className="text-slate-500">Ordenar por</label>
        <select id="ordem" value={ordemAtual.id} onChange={e => setOrdem([{ id: e.target.value, desc: ordemAtual.desc }])}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
          {ORDENACOES.map(o => <option key={o.id} value={o.id}>{o.t}</option>)}
        </select>
        <button type="button" onClick={() => setOrdem([{ id: ordemAtual.id, desc: !ordemAtual.desc }])}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          aria-label={ordemAtual.desc ? 'Ordem decrescente' : 'Ordem crescente'}>
          {ordemAtual.desc ? '↓' : '↑'}
        </button>
      </div>

      {/* cartões (telemóvel) */}
      <ul className="space-y-2 md:hidden">
        {linhas.map(r => {
          const a = r.original
          return (
            <li key={a.ticker}>
              <Link to={`/acao/${a.ticker}`}
                className="block rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 active:bg-slate-50 dark:bg-slate-900 dark:ring-slate-800">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">{a.ticker}</span>
                      {naCarteira.has(a.ticker) && <span title="Está na sua carteira" aria-label="Na carteira">💼</span>}
                      <EtiquetaNivel nivel={a.nivel.nivel} curta />
                      <EtiquetaCategoria categoria={a.categoria} />
                      <IconesSinais sinais={[...a.armadilhas, ...a.avisos]} />
                    </div>
                    <div className="truncate text-xs text-slate-500">{a.nome}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-lg font-bold leading-none">{a.pontuacao.total.toFixed(0)}</div>
                      <div className="text-[10px] text-slate-500">pontos</div>
                    </div>
                    <Estrela ativa={favoritos.has(a.ticker)} onClick={() => alternarFavorito(a.ticker)} />
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-slate-500">Yield líq.</dt><dd className="font-semibold">{pct(a.yield.liquido)}</dd></div>
                  <div><dt className="text-slate-500">Preço</dt><dd className="font-semibold">{euros(a.preco_eur)}</dd></div>
                  <div><dt className="text-slate-500">Justo {pct(params.preco.yield_alvo, 0)}</dt>
                    <dd><Justo valor={a.preco_justo_eur} abaixo={a.abaixo_preco_justo} titulo="preço justo" /></dd></div>
                  <div><dt className="text-slate-500">Yield habitual</dt><dd>{pct(a.yield_medio_historico)}</dd></div>
                  <div><dt className="text-slate-500">Justo hist.</dt>
                    <dd><Justo valor={a.preco_justo_historico_eur} abaixo={a.abaixo_preco_justo_historico} titulo="preço justo histórico" /></dd></div>
                  <div><dt className="text-slate-500">Frequência</dt><dd>{a.frequencia}</dd></div>
                  <div><dt className="text-slate-500">Pos. 52s</dt>
                    <dd className={a.perto_minimo_52s ? 'font-semibold text-emerald-700 dark:text-emerald-400' : a.perto_maximo_52s ? 'text-red-700 dark:text-red-400' : ''}>{pct(a.posicao['52s'], 0)}</dd></div>
                  <div><dt className="text-slate-500">Próx. pag.</dt>
                    <dd className={a.pagamento.atrasado ? 'text-red-700 dark:text-red-400' : ''}>{dias(a.pagamento.dias_para_pagamento)}</dd></div>
                </dl>
              </Link>
            </li>
          )
        })}
      </ul>

      {/* tabela (PC) */}
      <div ref={caixaTabela} data-tabela-radar data-estreita={estreita || undefined}
        className={`hidden rounded-2xl ${estreita ? 'max-h-[calc(100dvh-var(--altura-topo,4rem)-1rem)] overflow-auto' : ''} bg-white shadow-sm ring-1 ring-slate-200 md:block dark:bg-slate-900 dark:ring-slate-800`}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            {tabela.getHeaderGroups().map(g => (
              <tr key={g.id}>
                {g.headers.map(h => {
                  const s = h.column.getIsSorted()
                  return (
                    <th key={h.id} className={`sticky ${estreita ? 'top-0' : 'top-(--altura-topo,4rem)'} border-b border-slate-200 bg-slate-50 px-2 py-2 align-bottom leading-tight first:rounded-tl-2xl last:rounded-tr-2xl dark:border-slate-700 dark:bg-slate-800 ${fixa(h.column.id) ? `${fixa(h.column.id)} z-[12]` : 'z-[11]'}`}
                      aria-sort={s === 'asc' ? 'ascending' : s === 'desc' ? 'descending' : undefined}>
                      {h.column.getCanSort() ? (
                        <button type="button" onClick={h.column.getToggleSortingHandler()} className="inline-flex items-end gap-1 text-left uppercase hover:text-slate-900 dark:hover:text-white">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <span aria-hidden>{s === 'asc' ? '▲' : s === 'desc' ? '▼' : ''}</span>
                        </button>
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {linhas.map(r => (
              <tr key={r.id} onClick={() => navegar(`/acao/${r.original.ticker}`)}
                className="group cursor-pointer">
                {r.getVisibleCells().map(c => (
                  <td key={c.id} className={`border-b border-slate-100 px-2 py-2 group-hover:bg-sky-50 dark:border-slate-800 dark:group-hover:bg-slate-800 ${c.column.id === 'acao' ? '' : 'whitespace-nowrap'} ${fixa(c.column.id) ? `sticky z-10 bg-white dark:bg-slate-900 ${fixa(c.column.id)}` : ''}`}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {linhas.length === 0 && <p className="p-6 text-center text-slate-500">Nenhuma ação corresponde aos filtros.</p>}
      </div>
      {linhas.length === 0 && <p className="p-6 text-center text-slate-500 md:hidden">Nenhuma ação corresponde aos filtros.</p>}
      {todasLinhas.length > linhas.length && (
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
          <span className="text-slate-500">A ver {linhas.length} de {todasLinhas.length}</span>
          <button type="button" onClick={() => setMostrar(m => m + POR_PAGINA)}
            className="rounded-lg bg-sky-700 px-4 py-2 font-medium text-white hover:bg-sky-800">
            Mostrar mais {Math.min(POR_PAGINA, todasLinhas.length - linhas.length)}
          </button>
          <button type="button" onClick={() => setMostrar(todasLinhas.length)}
            className="text-sky-700 underline dark:text-sky-400">Mostrar todas</button>
        </div>
      )}
      <p className="text-xs text-slate-500">Categorias: {Object.values(NOMES_CATEGORIA).join(' · ')}. Os cálculos usam as suas Definições.</p>
    </div>
  )
}
