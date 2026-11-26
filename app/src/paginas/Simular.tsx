import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AVISO_LEGAL, Carregando, Cartao, Erro, EtiquetaCategoria, NOMES_CATEGORIA } from '../componentes/Comuns'
import { TextoSync } from '../componentes/Conta'
import { gravar, ler } from '../lib/armazenamento'
import type { AcaoCalculada } from '../lib/calculos'
import { useApp } from '../lib/contexto'
import { euros, numero, pct } from '../lib/formato'
import type { Cenario } from '../lib/sincronizar'
import { distribuir, lerNumero, partesIguais, simular } from '../lib/simulador'

const K_VALOR = 'radar.simulador.valor'
const K_RASCUNHO = 'radar.simulador.rascunho'

type Linha = { ticker: string; pct: number }
interface Rascunho { id: string | null; nome: string; valor: number; linhas: Linha[] }
const RASCUNHO_VAZIO: Rascunho = { id: null, nome: '', valor: 1000, linhas: [] }

const novoId = () => (globalThis.crypto?.randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(36).slice(2)}`)

// ——— peças ———

function CampoValor({ valor, mudar, rotulo = 'Valor a investir' }: { valor: number; mudar: (v: number) => void; rotulo?: string }) {
  const [texto, setTexto] = useState(numero(valor, valor % 1 ? 2 : 0))
  useEffect(() => { if (lerNumero(texto) !== valor) setTexto(numero(valor, valor % 1 ? 2 : 0)) }, [valor]) // eslint-disable-line react-hooks/exhaustive-deps
  const n = lerNumero(texto)
  const invalido = !(n >= 0)
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{rotulo}</span>
      <span className="relative">
        <input inputMode="decimal" value={texto} aria-label={rotulo} aria-invalid={invalido}
          onChange={e => { setTexto(e.target.value); const v = lerNumero(e.target.value); if (v >= 0) mudar(v) }}
          className={`w-32 rounded-lg border bg-white py-1.5 pl-2 pr-6 text-right text-base dark:bg-slate-950 ${invalido ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`} />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">€</span>
      </span>
      {invalido && <span className="text-xs text-red-700 dark:text-red-400">Escreva um número (ex.: 100 ou 250,50).</span>}
    </label>
  )
}

function Numero({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className="text-lg font-bold">{valor}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

function NomeAcao({ a, ticker }: { a: AcaoCalculada | null; ticker: string }) {
  return (
    <div className="min-w-0">
      <Link to={`/acao/${ticker}`} className="font-semibold text-sky-700 dark:text-sky-400">{ticker}</Link>
      {a && <> <EtiquetaCategoria categoria={a.categoria} /></>}
      {a && <div className="text-xs text-slate-500">{a.nome}</div>}
    </div>
  )
}

// ——— modo "cada ação" ———

const ORDENS = {
  pontos: { t: 'Pontuação', f: (a: AcaoCalculada) => -a.pontuacao.total },
  mensal: { t: 'Mais rendimento', f: (a: AcaoCalculada) => -(a.yield.liquido ?? -1) },
  nome: { t: 'Nome', f: (a: AcaoCalculada) => a.nome },
} as const

function CadaAcao({ juntar, naDistribuicao }: { juntar: (t: string) => void; naDistribuicao: Set<string> }) {
  const { acoes, naCarteira, params } = useApp()
  const [valor, setValor] = useState<number>(() => ler(K_VALOR, 100))
  const [texto, setTexto] = useState('')
  const [categoria, setCategoria] = useState('')
  const [ordem, setOrdem] = useState<keyof typeof ORDENS>('pontos')
  const [verForaLimites, setVerForaLimites] = useState(false)
  const [mostrar, setMostrar] = useState(50)
  useEffect(() => gravar(K_VALOR, valor), [valor])

  const lista = useMemo(() => {
    const t = texto.trim().toLowerCase()
    const f = acoes.filter(a => (!t || `${a.ticker} ${a.nome}`.toLowerCase().includes(t))
      && (!categoria || (categoria === 'CARTEIRA' ? naCarteira.has(a.ticker) : a.categoria === categoria))
      && a.preco_eur && a.dividendo.anual_eur != null
      // como no Radar: yields fora dos limites costumam ser erros nos dados ou cortes por anunciar
      && (verForaLimites || !a.fora_batentes || (categoria === 'CARTEIRA' && naCarteira.has(a.ticker))))
    const k = ORDENS[ordem].f
    return f.map(a => ({ a, s: simular(a, valor)! }))
      .sort((x, y) => { const p = k(x.a), q = k(y.a); return typeof p === 'string' ? p.localeCompare(q as string, 'pt') : (p as number) - (q as number) })
  }, [acoes, texto, categoria, ordem, valor, naCarteira, verForaLimites])

  return (
    <div className="space-y-3" data-simulador-cada>
      <Cartao>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <CampoValor valor={valor} mudar={setValor} />
          <input type="search" placeholder="Pesquisar ticker ou nome…" value={texto} onChange={e => setTexto(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-base dark:border-slate-700 dark:bg-slate-950" />
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Mostrar</span>
            <select value={categoria} onChange={e => setCategoria(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950">
              <option value="">Todas</option>
              {Object.entries(NOMES_CATEGORIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              <option value="CARTEIRA">💼 Carteira</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Ordenar por</span>
            <select value={ordem} onChange={e => setOrdem(e.target.value as keyof typeof ORDENS)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950">
              {Object.entries(ORDENS).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Quantas ações compraria com {euros(valor)} (frações permitidas) e quanto receberia de dividendos, com o dividendo anual e
          o imposto das suas <Link to="/definicoes" className="underline">Definições</Link>. {lista.length} ações.
        </p>
        {params?.pontuacao.batentes_ativos && (
          <label className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={verForaLimites} onChange={e => setVerForaLimites(e.target.checked)} />
            Mostrar também as ações fora dos limites de yield ({pct(params.pontuacao.yield_minimo, 0)} a {pct(params.pontuacao.yield_maximo, 0)}): yields
            assim costumam ser erros nos dados ou cortes por anunciar
          </label>
        )}
      </Cartao>

      {/* PC: tabela */}
      <div className="hidden overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 md:block dark:bg-slate-900 dark:ring-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2">Ação</th>
              <th className="px-2 py-2 text-right">Preço</th>
              <th className="px-2 py-2 text-right">Nº ações</th>
              <th className="px-2 py-2 text-right">Por mês (bruto)</th>
              <th className="px-2 py-2 text-right">Por mês (líquido)</th>
              <th className="px-2 py-2 text-right">Por ano (líquido)</th>
              <th className="px-2 py-2 text-right">Yield líq.</th>
              <th className="px-3 py-2"><span className="sr-only">Distribuição</span></th>
            </tr>
          </thead>
          <tbody>
            {lista.slice(0, mostrar).map(({ a, s }) => (
              <tr key={a.ticker} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2"><NomeAcao a={a} ticker={a.ticker} /></td>
                <td className="px-2 py-2 text-right">{euros(a.preco_eur)}</td>
                <td className="px-2 py-2 text-right">{numero(s.acoes, 4)}</td>
                <td className="px-2 py-2 text-right">{euros(s.mensal_bruto)}</td>
                <td className="px-2 py-2 text-right font-semibold">{euros(s.mensal_liquido)}</td>
                <td className="px-2 py-2 text-right">{euros(s.anual_liquido)}</td>
                <td className="px-2 py-2 text-right">{pct(a.yield.liquido)}</td>
                <td className="px-3 py-2 text-right">
                  <BotaoJuntar ativo={naDistribuicao.has(a.ticker)} onClick={() => juntar(a.ticker)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* telemóvel: cartões */}
      <ul className="space-y-2 md:hidden">
        {lista.slice(0, mostrar).map(({ a, s }) => (
          <li key={a.ticker} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <div className="flex items-start justify-between gap-2">
              <NomeAcao a={a} ticker={a.ticker} />
              <BotaoJuntar ativo={naDistribuicao.has(a.ticker)} onClick={() => juntar(a.ticker)} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div><div className="text-slate-500">Nº ações</div><div className="text-sm">{numero(s.acoes, 4)}</div></div>
              <div><div className="text-slate-500">Por mês líq.</div><div className="text-sm font-semibold">{euros(s.mensal_liquido)}</div></div>
              <div><div className="text-slate-500">Por ano líq.</div><div className="text-sm">{euros(s.anual_liquido)}</div></div>
            </div>
          </li>
        ))}
      </ul>

      {lista.length > mostrar && (
        <div className="flex justify-center gap-2">
          <button type="button" onClick={() => setMostrar(m => m + 50)} className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-slate-300 dark:ring-slate-700">Mostrar mais</button>
          <button type="button" onClick={() => setMostrar(lista.length)} className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-slate-300 dark:ring-slate-700">Mostrar todas</button>
        </div>
      )}
    </div>
  )
}

function BotaoJuntar({ ativo, onClick }: { ativo: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={ativo} onClick={onClick} title="Juntar à distribuição"
      className="shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-300 disabled:text-slate-400 disabled:ring-slate-200 dark:text-sky-400 dark:ring-sky-800 dark:disabled:ring-slate-800">
      {ativo ? '✓ Na distribuição' : '+ Distribuição'}
    </button>
  )
}

// ——— modo "distribuição" ———

function Distribuicao({ r, mudar }: { r: Rascunho; mudar: (r: Rascunho) => void }) {
  const { acoes, cenarios, gravarCenario, sessao } = useApp()
  const [procura, setProcura] = useState('')
  const [guardado, setGuardado] = useState<string | null>(null)
  const res = useMemo(() => distribuir(r.linhas, r.valor, acoes), [r.linhas, r.valor, acoes])
  const sugestoes = useMemo(() => {
    const t = procura.trim().toLowerCase()
    if (t.length < 2) return []
    const ja = new Set(r.linhas.map(l => l.ticker))
    return acoes.filter(a => !ja.has(a.ticker) && `${a.ticker} ${a.nome}`.toLowerCase().includes(t)).slice(0, 8)
  }, [procura, acoes, r.linhas])

  const juntar = (t: string) => {
    if (r.linhas.some(l => l.ticker === t)) return
    const falta = Math.max(0, Math.round((100 - res.soma_pct) * 100) / 100)
    mudar({ ...r, linhas: [...r.linhas, { ticker: t, pct: falta }] })
    setProcura('')
  }
  const mudarPct = (i: number, v: number) => mudar({ ...r, linhas: r.linhas.map((l, j) => (j === i ? { ...l, pct: v } : l)) })
  const iguais = () => { const p = partesIguais(r.linhas.length); mudar({ ...r, linhas: r.linhas.map((l, i) => ({ ...l, pct: p[i] })) }) }

  const guardar = (comoNovo: boolean) => {
    const nome = r.nome.trim()
    if (!nome || !res.valida) return
    const id = !comoNovo && r.id ? r.id : novoId()
    const c: Cenario = { nome, valor: r.valor, linhas: r.linhas, atualizado_em: new Date().toISOString() }
    gravarCenario(id, c)
    mudar({ ...r, id })
    setGuardado(`Cenário "${nome}" guardado.`)
    setTimeout(() => setGuardado(null), 3000)
  }
  const falta = Math.round((100 - res.soma_pct) * 100) / 100
  const listaCenarios = Object.entries(cenarios).sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'pt'))

  return (
    <div className="space-y-3" data-simulador-distribuicao>
      <Cartao>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <CampoValor valor={r.valor} mudar={v => mudar({ ...r, valor: v })} rotulo="Valor total a investir" />
          <div className="relative min-w-0 flex-1">
            <input type="search" placeholder="Acrescentar ação: escreva o ticker ou o nome…" value={procura} onChange={e => setProcura(e.target.value)}
              aria-label="Acrescentar ação"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-base dark:border-slate-700 dark:bg-slate-950" />
            {sugestoes.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
                {sugestoes.map(a => (
                  <li key={a.ticker}>
                    <button type="button" onClick={() => juntar(a.ticker)} className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                      <b>{a.ticker}</b> <span className="truncate text-slate-500">{a.nome}</span>
                      <span className="ml-auto shrink-0 text-xs text-slate-500">{pct(a.yield.liquido)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Escolha as ações e a percentagem de cada uma (têm de somar 100%). Também pode juntar ações no modo <b>Cada ação</b>.
        </p>
      </Cartao>

      {r.linhas.length === 0 ? (
        <Cartao><p className="text-sm text-slate-500">Ainda não escolheu nenhuma ação.</p></Cartao>
      ) : (
        <Cartao titulo="Distribuição" acao={
          <button type="button" onClick={iguais} className="text-sm font-medium text-sky-700 underline dark:text-sky-400">Partes iguais</button>}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {res.linhas.map((l, i) => (
              <li key={l.ticker} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                <div className="min-w-[10rem] flex-1"><NomeAcao a={l.acao} ticker={l.ticker} /></div>
                <label className="flex items-center gap-1">
                  <input inputMode="decimal" defaultValue={numero(l.pct, l.pct % 1 ? 2 : 0)} key={`${l.ticker}-${l.pct}`}
                    aria-label={`Percentagem de ${l.ticker}`}
                    onBlur={e => { const v = lerNumero(e.target.value); if (v >= 0 && v <= 100) mudarPct(i, v); else e.target.value = numero(l.pct, 2) }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-base dark:border-slate-700 dark:bg-slate-950" />
                  <span>%</span>
                </label>
                <div className="w-24 text-right">{euros(l.valor)}</div>
                {l.sim ? (
                  <div className="w-52 text-right text-xs text-slate-500">
                    {numero(l.sim.acoes, 4)} ações · <b className="whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{euros(l.sim.mensal_liquido)}/mês</b>
                  </div>
                ) : (
                  <div className="w-52 text-right text-xs text-amber-700 dark:text-amber-300">Sem dados no Radar</div>
                )}
                <button type="button" aria-label={`Tirar ${l.ticker}`} onClick={() => mudar({ ...r, linhas: r.linhas.filter((_, j) => j !== i) })}
                  className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
              </li>
            ))}
          </ul>
          <p data-soma-pct className={`mt-2 text-sm font-medium ${res.valida ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>
            Soma: {numero(res.soma_pct, 2)}%{res.valida ? ' ✓' : falta > 0 ? ` — faltam ${numero(falta, 2)}%` : ` — passa ${numero(-falta, 2)}% dos 100%`}
          </p>
        </Cartao>
      )}

      {r.linhas.length > 0 && (
        <Cartao titulo="Resultado">
          {!res.valida && <p className="mb-2 text-sm text-amber-700 dark:text-amber-300">As percentagens têm de somar 100% para o resultado contar o valor todo.</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Numero rotulo="Por mês (líquido)" valor={euros(res.total.mensal_liquido)} sub={`bruto ${euros(res.total.mensal_bruto)}`} />
            <Numero rotulo="Por ano (líquido)" valor={euros(res.total.anual_liquido)} sub={`bruto ${euros(res.total.anual_bruto)}`} />
            <Numero rotulo="% do investido por ano" valor={pct(res.total.yield_liquido, 2)} sub={`bruto ${pct(res.total.yield_bruto, 2)}`} />
            <Numero rotulo="Investido" valor={euros(r.valor * Math.min(res.soma_pct, 100) / 100)} sub={`${r.linhas.length} ações`} />
          </div>
          {res.sem_dados.length > 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Sem dados (não contam no total): {res.sem_dados.join(', ')}.</p>
          )}
        </Cartao>
      )}

      <Cartao titulo="Cenários guardados">
        <div className="flex flex-wrap items-center gap-2">
          <input value={r.nome} onChange={e => mudar({ ...r, nome: e.target.value })} placeholder="Nome do cenário (ex.: Reforma)" maxLength={100}
            aria-label="Nome do cenário"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-base dark:border-slate-700 dark:bg-slate-950" />
          <button type="button" disabled={!r.nome.trim() || !res.valida} onClick={() => guardar(false)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">
            {r.id && cenarios[r.id] ? 'Guardar alterações' : 'Guardar cenário'}
          </button>
          {r.id && cenarios[r.id] && (
            <button type="button" disabled={!r.nome.trim() || !res.valida} onClick={() => guardar(true)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-slate-300 disabled:opacity-40 dark:ring-slate-700">Guardar como novo</button>
          )}
          <button type="button" onClick={() => mudar({ ...RASCUNHO_VAZIO, valor: r.valor })}
            className="text-sm text-slate-500 underline">Começar outro</button>
        </div>
        {guardado && <p role="status" className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">{guardado}</p>}
        {!res.valida && r.linhas.length > 0 && <p className="mt-1 text-xs text-slate-500">Só pode guardar quando as percentagens somarem 100%.</p>}
        {listaCenarios.length > 0 ? (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {listaCenarios.map(([id, c]) => {
              const t = distribuir(c.linhas, c.valor, acoes).total
              return (
                <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <b>{c.nome}</b>{r.id === id && <span className="ml-1 text-xs text-sky-700 dark:text-sky-400">(aberto)</span>}
                    <div className="text-xs text-slate-500">{euros(c.valor, 0)} em {c.linhas.length} ações · {euros(t.mensal_liquido)}/mês líquido</div>
                  </div>
                  <button type="button" onClick={() => mudar({ id, nome: c.nome, valor: c.valor, linhas: c.linhas })}
                    className="rounded-lg px-2.5 py-1 font-medium ring-1 ring-slate-300 dark:ring-slate-700">Abrir</button>
                  <button type="button" className="text-red-700 underline dark:text-red-400"
                    onClick={() => { if (confirm(`Apagar o cenário "${c.nome}"?`)) { gravarCenario(id, null); if (r.id === id) mudar({ ...r, id: null }) } }}>Apagar</button>
                </li>
              )
            })}
          </ul>
        ) : <p className="mt-3 text-sm text-slate-500">Ainda não há cenários guardados.</p>}
        <p className="mt-2 text-xs text-slate-500">
          <TextoSync />{!sessao && <> <Link to="/definicoes#conta" className="underline">Entre com o GitHub</Link> para os ver também no iPhone.</>}
        </p>
      </Cartao>
    </div>
  )
}

// ——— página ———

const SEPARADORES = [
  { v: 'simulador', t: 'Simulador' },
] as const

export function Simular() {
  const { aCarregar, erro } = useApp()
  const [params, setParams] = useSearchParams()
  const modo = params.get('modo') === 'distribuicao' ? 'distribuicao' : 'cada'
  const [r, setR] = useState<Rascunho>(() => ({ ...RASCUNHO_VAZIO, ...ler<Partial<Rascunho>>(K_RASCUNHO, {}) }))
  useEffect(() => gravar(K_RASCUNHO, r), [r])
  const naDistribuicao = useMemo(() => new Set(r.linhas.map(l => l.ticker)), [r.linhas])
  const irPara = (m: string) => setParams(p => { const n = new URLSearchParams(p); if (m === 'cada') n.delete('modo'); else n.set('modo', m); return n }, { replace: true })

  if (erro) return <Erro texto={erro} />
  if (aCarregar) return <Carregando />

  const juntarDeCada = (t: string) => {
    if (naDistribuicao.has(t)) return
    const soma = r.linhas.reduce((s, l) => s + l.pct, 0)
    setR({ ...r, linhas: [...r.linhas, { ticker: t, pct: Math.max(0, Math.round((100 - soma) * 100) / 100) }] })
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Simular</h1>
        <div className="mt-2 flex gap-1.5" role="tablist" aria-label="Ferramenta">
          {SEPARADORES.map(s => (
            <span key={s.v} role="tab" aria-selected className="rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white dark:bg-white dark:text-slate-900">{s.t}</span>
          ))}
        </div>
      </div>
      <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm dark:bg-slate-800" role="tablist" aria-label="Modo do simulador">
        {[['cada', 'Cada ação'], ['distribuicao', `Distribuição${r.linhas.length ? ` · ${r.linhas.length}` : ''}`]].map(([v, t]) => (
          <button key={v} type="button" role="tab" aria-selected={modo === v} onClick={() => irPara(v)}
            className={`rounded-lg px-3 py-1.5 font-medium ${modo === v ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-600 dark:text-slate-300'}`}>{t}</button>
        ))}
      </div>
      {modo === 'cada' ? <CadaAcao juntar={juntarDeCada} naDistribuicao={naDistribuicao} /> : <Distribuicao r={r} mudar={setR} />}
      <p className="text-xs text-slate-500">
        Estimativas com o dividendo dos últimos pagamentos: os dividendos futuros podem ser diferentes (cortes, aumentos, câmbio).
        Não inclui comissões. {AVISO_LEGAL}
      </p>
    </div>
  )
}
