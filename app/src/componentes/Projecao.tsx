import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { gravar, ler } from '../lib/armazenamento'
import { calcularCarteira, resumo } from '../lib/carteira'
import { useApp } from '../lib/contexto'
import { euros, numero, pct } from '../lib/formato'
import { crescimentoHistorico, projetar, type AnoProjecao } from '../lib/projecao'
import { distribuir, lerNumero } from '../lib/simulador'
import { AZUL } from './Barras'
import { AVISO_LEGAL, Cartao } from './Comuns'

const CINZA = '#64748b'
const K_PROJECAO = 'radar.projecao'

interface Escolhas {
  /** de onde vêm o capital e o yield: a carteira, um cenário guardado (id) ou manual */
  fonte: 'carteira' | 'manual' | `cenario:${string}`
  capital: number
  yieldManual: number
  mensal: number
  anos: number
  reinvestir: boolean
  dividendoHistorico: boolean
  crescDividendo: number
  crescPreco: number
}
const PADRAO: Escolhas = {
  fonte: 'carteira', capital: 3500, yieldManual: 0.06, mensal: 100, anos: 10, reinvestir: true,
  dividendoHistorico: true, crescDividendo: 0.03, crescPreco: 0.03,
}

/** Campo numérico à portuguesa; `pct` mostra/guarda percentagens (5 ↔ 0,05). */
function Num({ rotulo, valor, mudar, pctual = false, sufixo, min = 0, max, ajuda, desligado = false }: {
  rotulo: string; valor: number; mudar: (v: number) => void; pctual?: boolean; sufixo?: string; min?: number; max?: number
  ajuda?: React.ReactNode; desligado?: boolean
}) {
  const mostrar = (v: number) => numero(pctual ? v * 100 : v, pctual ? 1 : (v % 1 ? 2 : 0))
  const [texto, setTexto] = useState(mostrar(valor))
  useEffect(() => { const v = lerNumero(texto); if ((pctual ? v / 100 : v) !== valor) setTexto(mostrar(valor)) }, [valor]) // eslint-disable-line react-hooks/exhaustive-deps
  const n = lerNumero(texto)
  const ok = Number.isFinite(n) && n >= min && (max == null || n <= max)
  return (
    <label className="block text-sm">
      <span className="font-medium">{rotulo}</span>
      <span className="relative mt-1 block">
        <input inputMode="decimal" value={texto} disabled={desligado} aria-label={rotulo} aria-invalid={!ok}
          onChange={e => { setTexto(e.target.value); const v = lerNumero(e.target.value); if (Number.isFinite(v) && v >= min && (max == null || v <= max)) mudar(pctual ? v / 100 : v) }}
          className={`w-full rounded-lg border bg-white py-1.5 pl-2 ${!pctual && sufixo && sufixo.length > 1 ? 'pr-14' : 'pr-7'} text-right text-base disabled:opacity-50 dark:bg-slate-950 ${ok ? 'border-slate-300 dark:border-slate-700' : 'border-red-500'}`} />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">{pctual ? '%' : sufixo}</span>
      </span>
      {ajuda && <span className="mt-0.5 block text-xs text-slate-500">{ajuda}</span>}
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

function Dica({ active, payload }: { active?: boolean; payload?: { payload: AnoProjecao }[] }) {
  if (!active || !payload?.length) return null
  const a = payload[0].payload
  return (
    <div className="rounded-lg bg-white p-2 text-xs shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
      <div className="font-semibold">{a.ano === 0 ? 'Hoje' : `Ano ${a.ano}`}</div>
      <div>Valor: <b>{euros(a.valor, 0)}</b></div>
      <div>Total investido: {euros(a.investido, 0)}</div>
      <div>Rendimento: <b>{euros(a.rendimento_mensal)}</b>/mês</div>
      {a.ano > 0 && <div>Dividendos nesse ano: {euros(a.dividendos_ano, 0)}</div>}
    </div>
  )
}

export function Projecao() {
  const { acoes, carteira, params, cenarios } = useApp()
  const [e, setE] = useState<Escolhas>(() => ({ ...PADRAO, ...ler<Partial<Escolhas>>(K_PROJECAO, {}) }))
  useEffect(() => gravar(K_PROJECAO, e), [e])
  const mudar = (p: Partial<Escolhas>) => setE(x => ({ ...x, ...p }))
  const [verTabela, setVerTabela] = useState(false)

  // ponto de partida: carteira, cenário ou manual
  const posicoes = useMemo(() => calcularCarteira(carteira, acoes, params?.impostos), [carteira, acoes, params])
  const daCarteira = useMemo(() => {
    if (!posicoes.length) return null
    const r = resumo(posicoes, carteira)
    if (!(r.valor_eur > 0)) return null
    return {
      capital: r.valor_eur, yield: r.previsto_anual_liquido / r.valor_eur,
      crescimento: crescimentoHistorico(posicoes.map(p => ({ acao: p.acao, valor: p.valor_eur ?? p.custo_eur }))),
    }
  }, [posicoes, carteira])
  const idCenario = e.fonte.startsWith('cenario:') ? e.fonte.slice(8) : null
  const doCenario = useMemo(() => {
    const c = idCenario ? cenarios[idCenario] : null
    if (!c) return null
    const d = distribuir(c.linhas, c.valor, acoes)
    return {
      nome: c.nome, capital: c.valor, yield: d.total.yield_liquido ?? 0,
      crescimento: crescimentoHistorico(d.linhas.map(l => ({ acao: l.acao, valor: l.valor }))),
    }
  }, [idCenario, cenarios, acoes])
  const fonte = e.fonte === 'carteira' && daCarteira ? daCarteira : idCenario && doCenario ? doCenario : null
  const capital = fonte ? fonte.capital : e.capital
  const yieldLiq = fonte ? fonte.yield : e.yieldManual
  const historico = fonte?.crescimento ?? null
  const usarHistorico = e.dividendoHistorico && historico?.valor != null
  const crescDiv = usarHistorico ? historico!.valor! : e.crescDividendo

  const linhas = useMemo(() => projetar({
    capital, mensal: e.mensal, anos: e.anos, reinvestir: e.reinvestir, yield_liquido: yieldLiq,
    cresc_dividendo: crescDiv, cresc_preco: e.crescPreco,
  }), [capital, e.mensal, e.anos, e.reinvestir, yieldLiq, crescDiv, e.crescPreco])
  const fim = linhas[linhas.length - 1]
  const listaCenarios = Object.entries(cenarios).sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'pt'))

  return (
    <div className="space-y-3" data-projecao>
      <Cartao titulo="Ponto de partida">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ponto de partida">
          {([['carteira', '💼 A minha carteira', !daCarteira], ['manual', 'Valores à mão', false]] as const).map(([v, t, off]) => (
            <button key={v} type="button" role="radio" aria-checked={e.fonte === v} disabled={off} onClick={() => mudar({ fonte: v })}
              className={`rounded-full px-3 py-1 text-sm font-medium disabled:opacity-40 ${e.fonte === v
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'ring-1 ring-slate-300 dark:ring-slate-700'}`}>{t}</button>
          ))}
          {listaCenarios.length > 0 && (
            <select value={idCenario ?? ''} onChange={ev => mudar({ fonte: ev.target.value ? `cenario:${ev.target.value}` : 'manual' })}
              aria-label="Usar um cenário guardado"
              className={`rounded-full px-3 py-1 text-sm font-medium ${idCenario ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700'}`}>
              <option value="">Cenário guardado…</option>
              {listaCenarios.map(([id, c]) => <option key={id} value={id}>{c.nome}</option>)}
            </select>
          )}
        </div>
        {e.fonte === 'carteira' && !daCarteira && (
          <p className="mt-2 text-sm text-slate-500">Ainda não tem carteira: <Link to="/carteira" className="underline">importe o extrato</Link> ou use valores à mão.</p>
        )}
        {fonte ? (
          <p className="mt-2 text-sm">
            {idCenario ? <>Cenário <b>{doCenario?.nome}</b>: </> : <>A sua carteira hoje: </>}
            <b>{euros(fonte.capital, 0)}</b> a render <b>{pct(fonte.yield, 2)}</b> líquidos por ano ({euros((fonte.capital * fonte.yield) / 12)}/mês).
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
            <Num rotulo="Capital inicial" valor={e.capital} mudar={v => mudar({ capital: v })} sufixo="€" />
            <Num rotulo="Yield líquido inicial" valor={e.yieldManual} mudar={v => mudar({ yieldManual: v })} pctual max={50} />
          </div>
        )}
      </Cartao>

      <Cartao titulo="Pressupostos">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Num rotulo="Junto por mês" valor={e.mensal} mudar={v => mudar({ mensal: v })} sufixo="€" />
          <Num rotulo="Durante" valor={e.anos} mudar={v => mudar({ anos: Math.round(v) })} sufixo="anos" min={1} max={50} />
          <div className="text-sm">
            {historico?.valor != null ? (
              <>
                <span className="font-medium">Crescimento do dividendo por ano</span>
                <label className="mt-1 flex items-center gap-2">
                  <input type="checkbox" checked={e.dividendoHistorico} onChange={ev => mudar({ dividendoHistorico: ev.target.checked })} />
                  <span>Usar o histórico: <b>{pct(historico.valor, 1)}</b></span>
                </label>
                {!usarHistorico && <div className="mt-1"><Num rotulo="Outro valor" valor={e.crescDividendo} mudar={v => mudar({ crescDividendo: v })} pctual min={-20} max={20} /></div>}
              </>
            ) : <Num rotulo="Crescimento do dividendo por ano" valor={e.crescDividendo} mudar={v => mudar({ crescDividendo: v })} pctual min={-20} max={20} />}
            {usarHistorico && historico && (
              <span className="mt-0.5 block text-xs text-slate-500">
                Média dos últimos 5 anos de cada ação, pesada pelo valor{historico.cobertura < 0.999 ? ` (${pct(historico.cobertura, 0)} com dados)` : ''}; limitada a ±15%.
              </span>
            )}
          </div>
          <Num rotulo="Crescimento do preço por ano" valor={e.crescPreco} mudar={v => mudar({ crescPreco: v })} pctual min={-20} max={30}
            ajuda="Escolha sua: o passado não garante o futuro." />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={e.reinvestir} onChange={ev => mudar({ reinvestir: ev.target.checked })} />
          <span><b>Reinvestir os dividendos</b> (comprar mais ações com o que recebe, todos os meses)</span>
        </label>
      </Cartao>

      <Cartao titulo={`Daqui a ${e.anos} ${e.anos === 1 ? 'ano' : 'anos'}`}>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-projecao-fim>
          <Numero rotulo="Valor da carteira" valor={euros(fim.valor, 0)} sub={`investido ${euros(fim.investido, 0)}`} />
          <Numero rotulo="Rendimento por mês (líq.)" valor={euros(fim.rendimento_mensal)} sub={`hoje ${euros(linhas[0].rendimento_mensal)}`} />
          <Numero rotulo="Dividendos recebidos (líq.)" valor={euros(fim.dividendos_acumulados, 0)} sub={e.reinvestir ? 'todos reinvestidos' : 'levantados, não reinvestidos'} />
          <Numero rotulo="Yield sobre o investido" valor={pct(fim.yield_on_cost, 1)} sub="rendimento anual ÷ investido" />
        </div>
      </Cartao>

      <div className="grid gap-3 lg:grid-cols-2">
        <Cartao titulo="Valor da carteira">
          <div className="mb-1 flex flex-wrap gap-x-4 text-xs text-slate-600 dark:text-slate-300" aria-hidden>
            <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5" style={{ background: AZUL }} /> Valor</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-5 border-t-2 border-dashed" style={{ borderColor: CINZA }} /> Total investido</span>
          </div>
          <div className="h-60" role="img" aria-label={`Valor da carteira ano a ano: de ${euros(linhas[0].valor, 0)} para ${euros(fim.valor, 0)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={linhas} margin={{ left: 4, right: 8, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 11 }} tickFormatter={a => (a === 0 ? 'hoje' : String(a))} />
                <YAxis tick={{ fontSize: 11 }} width={52} tickFormatter={v => (v >= 10000 ? `${numero(v / 1000, 0)} mil` : numero(v, 0))} />
                <Tooltip content={<Dica />} />
                <Line type="monotone" dataKey="investido" name="Total investido" stroke={CINZA} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="valor" name="Valor" stroke={AZUL} strokeWidth={2} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Cartao>
        <Cartao titulo="Rendimento por mês (líquido)">
          <div className="h-60 pt-5" role="img" aria-label={`Rendimento mensal: de ${euros(linhas[0].rendimento_mensal)} para ${euros(fim.rendimento_mensal)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={linhas} margin={{ left: 4, right: 8, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 11 }} tickFormatter={a => (a === 0 ? 'hoje' : String(a))} />
                <YAxis tick={{ fontSize: 11 }} width={52} tickFormatter={v => numero(v, 0)} />
                <Tooltip content={<Dica />} cursor={{ fill: '#94a3b822' }} />
                <Bar dataKey="rendimento_mensal" name="Rendimento por mês" fill={AZUL} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Cartao>
      </div>

      <Cartao titulo="Ano a ano" acao={
        <button type="button" onClick={() => setVerTabela(v => !v)} aria-expanded={verTabela} className="text-sm text-sky-700 underline dark:text-sky-400">
          {verTabela ? 'Esconder tabela' : 'Ver tabela'}
        </button>}>
        {verTabela ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm tabular-nums" data-tabela-projecao>
              <thead className="text-xs text-slate-500">
                <tr><th className="py-1 text-left">Ano</th><th>Investido</th><th>Valor</th><th>Dividendos no ano</th><th>Por mês</th></tr>
              </thead>
              <tbody>
                {linhas.map(a => (
                  <tr key={a.ano} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1 text-left">{a.ano === 0 ? 'Hoje' : a.ano}</td>
                    <td>{euros(a.investido, 0)}</td>
                    <td className="font-medium">{euros(a.valor, 0)}</td>
                    <td>{a.ano === 0 ? '—' : euros(a.dividendos_ano, 0)}</td>
                    <td>{euros(a.rendimento_mensal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500">Os mesmos números dos gráficos, numa tabela.</p>}
      </Cartao>

      <p className="text-xs text-slate-500">
        Projeção com taxas constantes, sem contar com a inflação, sem comissões nem impostos sobre mais-valias. O dividendo
        reinvestido já é o líquido. Serve para comparar hipóteses, não para prever o futuro. {AVISO_LEGAL}
      </p>
    </div>
  )
}
