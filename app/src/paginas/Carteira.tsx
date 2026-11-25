import { useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { Carregando, Cartao, Erro } from '../componentes/Comuns'
import {
  calcularCarteira, diversificacao, juntar, pagamentos, porMes, resumo, verificar, type Diferenca, type Posicao,
} from '../lib/carteira'
import { useApp } from '../lib/contexto'
import { lerFicheiroExtrato, type Extrato, type Transacao } from '../lib/extrato'
import { data, euros, moeda, numero, pct } from '../lib/formato'

const AZUL = '#0284c7'

function Numero({ rotulo, valor, sub, cor = '' }: { rotulo: string; valor: string; sub?: React.ReactNode; cor?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className={`text-lg font-bold ${cor}`}>{valor}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

const corLucro = (x: number | null) => (x == null ? '' : x >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')
const mes = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' })

// ——— importação ———

interface Previa { extrato: Extrato; novas: number; repetidas: number; diferencas: Diferenca[]; posicoesXtb: number }

function Importar({ carteira, gravar }: { carteira: Transacao[]; gravar: (t: Transacao[]) => void }) {
  const { acoes } = useApp()
  const entrada = useRef<HTMLInputElement>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aLer, setALer] = useState(false)
  const [feito, setFeito] = useState<string | null>(null)

  async function escolher(f: File | undefined) {
    if (!f) return
    setErro(null); setFeito(null); setALer(true)
    try {
      const extrato = await lerFicheiroExtrato(f)
      const j = juntar(carteira, extrato.transacoes)
      // a verificação usa só as operações da XTB (as compras manuais não estão na folha Open Positions)
      const xtb = j.todas.filter(t => t.origem === 'xtb')
      const diferencas = verificar(calcularCarteira(xtb, acoes), extrato.posicoes)
      setPrevia({ extrato, novas: j.novas, repetidas: j.repetidas, diferencas, posicoesXtb: extrato.posicoes.length })
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setALer(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  function confirmar() {
    if (!previa) return
    const j = juntar(carteira, previa.extrato.transacoes)
    gravar(j.todas)
    setFeito(`Importadas ${j.novas} operações novas${j.repetidas ? ` (${j.repetidas} já estavam importadas e foram ignoradas)` : ''}.`)
    setPrevia(null)
  }

  return (
    <Cartao titulo="Importar o extrato da XTB">
      <p className="text-sm">
        No site ou na app da XTB: <b>Histórico da conta → Exportar → Excel (.xlsx)</b>, com o período todo.
        Depois escolha o ficheiro aqui. Pode importar o mesmo extrato (ou um mais recente) as vezes que quiser: as operações já importadas são ignoradas.
      </p>
      <p className="mt-1 text-xs text-slate-500">🔒 O ficheiro é lido neste aparelho e não é enviado para lado nenhum. O número de conta não é guardado.</p>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800">
        {aLer ? 'A ler…' : 'Escolher ficheiro .xlsx'}
        <input ref={entrada} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only" onChange={e => escolher(e.target.files?.[0])} data-importar-extrato />
      </label>
      {erro && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-100 dark:ring-red-900">{erro}</p>}
      {feito && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-900">✓ {feito}</p>}
      {previa && (
        <div className="mt-3 space-y-2 rounded-xl p-3 text-sm ring-1 ring-slate-200 dark:ring-slate-700" data-previa-importacao>
          <p>
            Extrato{previa.extrato.gerado_em ? ` de ${data(previa.extrato.gerado_em)}` : ''}: <b>{previa.extrato.transacoes.length}</b> operações —{' '}
            <b>{previa.novas}</b> novas, {previa.repetidas} já importadas.
          </p>
          {previa.posicoesXtb > 0 && (previa.diferencas.length === 0 ? (
            <p className="text-emerald-700 dark:text-emerald-400">
              ✓ Verificação: as {previa.posicoesXtb} posições abertas batem certo com a folha "Open Positions" da XTB (quantidades e preço médio).
            </p>
          ) : (
            <div className="rounded-lg bg-amber-50 p-2 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
              <p className="font-medium">⚠️ Há diferenças face à folha "Open Positions" da XTB:</p>
              <ul className="mt-1 list-disc pl-5">
                {previa.diferencas.map(d => (
                  <li key={`${d.ticker}-${d.campo}`}><b>{d.ticker}</b> — {d.campo}: aqui {d.nosso == null ? '—' : numero(d.nosso, 4)}, na XTB {d.xtb == null ? '—' : numero(d.xtb, 4)}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs">Causas habituais: um extrato que não começa no início da conta, ou compras manuais repetidas. Pode importar na mesma.</p>
            </div>
          ))}
          {previa.extrato.avisos.length > 0 && (
            <details><summary className="cursor-pointer">{previa.extrato.avisos.length} linhas com avisos</summary>
              <ul className="mt-1 list-disc pl-5 text-xs">{previa.extrato.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </details>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={confirmar} disabled={previa.novas === 0}
              className="rounded-lg bg-sky-700 px-4 py-2 font-medium text-white hover:bg-sky-800 disabled:opacity-40">
              Importar {previa.novas} operações
            </button>
            <button type="button" onClick={() => setPrevia(null)} className="text-sky-700 underline dark:text-sky-400">Cancelar</button>
          </div>
        </div>
      )}
    </Cartao>
  )
}

// ——— compra manual ———

function CompraManual({ carteira, gravar, fechar }: { carteira: Transacao[]; gravar: (t: Transacao[]) => void; fechar: () => void }) {
  const { acoes } = useApp()
  const [f, setF] = useState({ ticker: '', data: new Date().toISOString().slice(0, 10), quantidade: '', preco: '', custo: '' })
  const n = (s: string) => Number(s.replace(',', '.'))
  const a = acoes.find(x => x.ticker === f.ticker.trim().toUpperCase())
  const valido = f.ticker.trim() && n(f.quantidade) > 0 && n(f.custo) > 0 && f.data
  function guardar() {
    const t: Transacao = {
      id: `manual-${Date.now()}`, tipo: 'compra', ticker: f.ticker.trim().toUpperCase(), nome: a?.nome ?? null,
      data: `${f.data}T12:00:00.000Z`, valor_eur: -n(f.custo), quantidade: n(f.quantidade),
      preco: f.preco ? n(f.preco) : null, moeda: a?.cotacao_xtb?.moeda ?? a?.moeda ?? null, origem: 'manual',
    }
    gravar([...carteira, t])
    fechar()
  }
  const campo = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900'
  return (
    <Cartao titulo="Adicionar uma compra à mão" acao={<button type="button" onClick={fechar} className="text-sm text-sky-700 underline dark:text-sky-400">Fechar</button>}>
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <label><span className="mb-1 block font-medium">Ação (ticker XTB)</span>
          <input className={campo} value={f.ticker} onChange={e => setF({ ...f, ticker: e.target.value })} placeholder="ex.: KO.US" list="tickers-radar" />
          <datalist id="tickers-radar">{acoes.slice(0, 3000).map(x => <option key={x.ticker} value={x.ticker}>{x.nome}</option>)}</datalist>
          {a && <span className="mt-1 block text-xs text-slate-500">{a.nome}</span>}
        </label>
        <label><span className="mb-1 block font-medium">Data</span>
          <input type="date" className={campo} value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></label>
        <label><span className="mb-1 block font-medium">Quantidade</span>
          <input inputMode="decimal" className={campo} value={f.quantidade} onChange={e => setF({ ...f, quantidade: e.target.value })} placeholder="ex.: 2,5" /></label>
        <label><span className="mb-1 block font-medium">Preço por ação ({a?.cotacao_xtb?.moeda ?? a?.moeda ?? 'moeda da bolsa'})</span>
          <input inputMode="decimal" className={campo} value={f.preco} onChange={e => setF({ ...f, preco: e.target.value })} placeholder="opcional" /></label>
        <label><span className="mb-1 block font-medium">Total pago (€)</span>
          <input inputMode="decimal" className={campo} value={f.custo} onChange={e => setF({ ...f, custo: e.target.value })} placeholder="ex.: 120,50" /></label>
      </div>
      <button type="button" disabled={!valido} onClick={guardar}
        className="mt-3 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-40">Guardar compra</button>
    </Cartao>
  )
}

// ——— posições ———

function LinhaPosicao({ p, apagar }: { p: Posicao; apagar: (id: string) => void }) {
  const [aberta, setAberta] = useState(false)
  const m = p.acao?.cotacao_xtb?.moeda ?? p.acao?.moeda ?? null
  return (
    <li className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800">
      <button type="button" onClick={() => setAberta(v => !v)} aria-expanded={aberta}
        className="flex w-full flex-wrap items-start justify-between gap-x-4 gap-y-1 p-3 text-left">
        <div className="min-w-0">
          <div className="font-semibold">{p.ticker} {p.retencao.aviso && <span title="Retenção acima da esperada">⚠️</span>}</div>
          <div className="text-xs text-slate-500">{p.nome}</div>
        </div>
        <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4 lg:grid-cols-7">
          <div><dt className="text-slate-500">Quantidade</dt><dd className="font-medium">{numero(p.quantidade, 4)}</dd></div>
          <div><dt className="text-slate-500">Preço médio</dt><dd>{p.preco_medio != null ? moeda(p.preco_medio, m) : '—'}</dd></div>
          <div><dt className="text-slate-500">Investido</dt><dd>{euros(p.custo_eur)}</dd></div>
          <div><dt className="text-slate-500">Valor atual</dt><dd className="font-medium">{euros(p.valor_eur)}</dd></div>
          <div><dt className="text-slate-500">Lucro/prejuízo</dt>
            <dd className={corLucro(p.lucro_eur)}>{euros(p.lucro_eur)} {p.lucro_pct != null && `(${pct(p.lucro_pct)})`}</dd></div>
          <div><dt className="text-slate-500">Dividendos recebidos</dt><dd>{euros(p.dividendos.liquido)} <span className="text-slate-500">líq.</span></dd></div>
          <div><dt className="text-slate-500">Previsto / ano</dt>
            <dd>{euros(p.previsto.anual_liquido)} <span className="text-slate-500">· YoC {pct(p.yield_on_cost.liquido)}</span></dd></div>
        </dl>
      </button>
      {aberta && (
        <div className="border-t border-slate-200 p-3 text-xs dark:border-slate-800">
          {p.retencao.aviso && (
            <p className="mb-2 rounded-lg bg-amber-50 p-2 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
              ⚠️ A XTB reteve <b>{pct(p.retencao.real, 0)}</b> nos dividendos, mas o esperado para {p.acao?.pais ?? 'este país'} (nas suas Definições) é <b>{pct(p.retencao.esperada, 0)}</b>.
              {p.acao?.pais === 'Estados Unidos'
                ? ' Causa provável: o formulário W-8BEN não está preenchido ou expirou (sem ele os EUA retêm 30% em vez de 15%). Confirme na área de cliente da XTB (documentos/formulários) ou pergunte ao apoio ao cliente se o W-8BEN está ativo.'
                : ' Causa provável: a corretora não está a aplicar a taxa da convenção entre Portugal e esse país. Pode pedir a devolução do excesso ao país de origem, ou confirmar a taxa nas Definições.'}
            </p>
          )}
          <table className="w-full">
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
            <span>Dividendos recebidos: bruto {euros(p.dividendos.bruto)} · retido {euros(p.dividendos.retido)} · líquido {euros(p.dividendos.liquido)}</span>
            {p.acao ? <Link to={`/acao/${p.ticker}`} className="text-sky-700 underline dark:text-sky-400">Ver a ação no radar</Link>
              : <span>Não está no radar: sem cotação atual nem previsão.</span>}
          </div>
        </div>
      )}
    </li>
  )
}

// ——— gráficos ———

function DicaMes({ active, payload }: { active?: boolean; payload?: { payload: { mes: string; bruto: number; retido: number; liquido: number } }[] }) {
  if (!active || !payload?.length) return null
  const x = payload[0].payload
  return (
    <div className="rounded-lg bg-white p-2 text-xs shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
      <div className="font-semibold">{mes(x.mes)}</div>
      <div>Líquido: <b>{euros(x.liquido)}</b></div>
      <div className="text-slate-500">Bruto {euros(x.bruto)} · retido {euros(x.retido)}</div>
    </div>
  )
}

function Diversificacao({ posicoes }: { posicoes: Posicao[] }) {
  const [por, setPor] = useState<'empresa' | 'setor' | 'pais' | 'moeda'>('empresa')
  const linhas = diversificacao(posicoes, por)
  const max = Math.max(...linhas.map(l => l.peso), 0.0001)
  return (
    <Cartao titulo="Diversificação" acao={
      <div className="flex gap-1 text-xs" role="group" aria-label="Agrupar por">
        {([['empresa', 'Empresa'], ['setor', 'Setor'], ['pais', 'País'], ['moeda', 'Moeda']] as const).map(([k, t]) => (
          <button key={k} type="button" aria-pressed={por === k} onClick={() => setPor(k)}
            className={`rounded-full px-2.5 py-1 ${por === k ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'ring-1 ring-slate-300 dark:ring-slate-700'}`}>{t}</button>
        ))}
      </div>}>
      <ul className="space-y-1.5 text-sm">
        {linhas.map(l => (
          <li key={l.nome} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-2" title={`${l.nome}: ${euros(l.valor)}`}>
            <span className="truncate">{l.nome}</span>
            <span className="h-3 rounded-r bg-slate-100 dark:bg-slate-800">
              <span className="block h-3 rounded-r" style={{ width: `${(l.peso / max) * 100}%`, background: AZUL }} />
            </span>
            <span className="w-24 text-right tabular-nums">{pct(l.peso)} <span className="text-xs text-slate-500">{euros(l.valor, 0)}</span></span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">Peso pelo valor atual (ou pelo valor investido, se não houver cotação).</p>
    </Cartao>
  )
}

// ——— página ———

export function Carteira() {
  const { aCarregar, erro, acoes, params, carteira, gravarCarteira } = useApp()
  const [manual, setManual] = useState(false)
  const posicoes = useMemo(() => calcularCarteira(carteira, acoes, params?.impostos), [carteira, acoes, params])
  const r = useMemo(() => resumo(posicoes, carteira), [posicoes, carteira])
  const meses = useMemo(() => porMes(carteira).slice(-24), [carteira])
  const porAcao = useMemo(() => {
    const m: Record<string, { bruto: number; retido: number; liquido: number; n: number }> = {}
    for (const p of pagamentos(carteira)) {
      const x = (m[p.ticker] ??= { bruto: 0, retido: 0, liquido: 0, n: 0 })
      x.bruto += p.bruto; x.retido += p.retido; x.liquido += p.liquido; x.n += 1
    }
    return Object.entries(m).sort((a, b) => b[1].liquido - a[1].liquido)
  }, [carteira])

  if (erro) return <Erro texto={erro} />
  if (aCarregar) return <Carregando />

  const apagar = (id: string) => gravarCarteira(carteira.filter(t => t.id !== id))
  const avisos = posicoes.filter(p => p.retencao.aviso)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Carteira</h1>
          <p className="text-sm text-slate-500">
            {carteira.length ? `${posicoes.length} posições · ${carteira.length} operações importadas` : 'Ainda sem operações.'}
            {carteira.length ? '.' : ''} Guardado neste aparelho (quando ligarmos o Supabase, fica sincronizado entre o PC e o iPhone).
          </p>
        </div>
        <button type="button" onClick={() => setManual(v => !v)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium dark:border-slate-700 dark:bg-slate-900">
          + Compra manual
        </button>
      </div>

      {manual && <CompraManual carteira={carteira} gravar={gravarCarteira} fechar={() => setManual(false)} />}
      <Importar carteira={carteira} gravar={gravarCarteira} />

      {posicoes.length > 0 && (
        <>
          <Cartao titulo="Resumo">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Numero rotulo="Valor atual" valor={euros(r.valor_eur)} sub={r.sem_cotacao.length ? `sem cotação: ${r.sem_cotacao.join(', ')}` : undefined} />
              <Numero rotulo="Investido" valor={euros(r.investido_eur)} sub={`depósitos: ${euros(r.depositos_eur)}`} />
              <Numero rotulo="Lucro/prejuízo" valor={euros(r.lucro_eur)} cor={corLucro(r.lucro_eur)}
                sub={r.investido_eur > 0 ? pct(r.lucro_eur / r.investido_eur) : undefined} />
              <Numero rotulo="Dividendos recebidos (líq.)" valor={euros(r.dividendos.liquido)}
                sub={`bruto ${euros(r.dividendos.bruto)} · retido ${euros(r.dividendos.retido)}`} />
              <Numero rotulo="Previsto (líquido)" valor={`${euros(r.previsto_mensal_liquido)}/mês`} sub={`${euros(r.previsto_anual_liquido)}/ano`} />
              <Numero rotulo="Yield on cost (líq.)" valor={pct(r.yield_on_cost_liquido)} sub="previsto ÷ investido" />
            </div>
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <b>Real vs previsto:</b> nos últimos 12 meses recebeu <b>{euros(r.ultimos12m_liquido)}</b> líquidos; com as posições de hoje, o previsto para 12 meses é <b>{euros(r.previsto_anual_liquido)}</b>.
              {' '}<span className="text-slate-500">(As compras recentes ainda não tiveram tempo de pagar um ano inteiro.)</span>
            </p>
            {r.juros_liquidos_eur !== 0 && <p className="mt-2 text-xs text-slate-500">Juros do dinheiro parado na XTB (líquidos): {euros(r.juros_liquidos_eur)}.</p>}
          </Cartao>

          {avisos.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
              ⚠️ <b>Retenção acima do esperado</b> em {avisos.map(p => `${p.ticker} (${pct(p.retencao.real, 0)} em vez de ${pct(p.retencao.esperada, 0)})`).join(', ')}.
              {' '}Toque na posição para ver a causa provável.
            </div>
          )}

          <Cartao titulo="Posições">
            <ul className="space-y-2">{posicoes.map(p => <LinhaPosicao key={p.ticker} p={p} apagar={apagar} />)}</ul>
          </Cartao>

          <div className="grid gap-3 lg:grid-cols-2">
            <Cartao titulo="Dividendos recebidos por mês (líquidos)">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={meses} margin={{ left: -10, right: 4, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickFormatter={mes} minTickGap={8} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => numero(v, 0)} />
                    <Tooltip content={<DicaMes />} cursor={{ fill: '#94a3b822' }} />
                    <Bar dataKey="liquido" name="Líquido" fill={AZUL} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer">Ver em tabela</summary>
                <table className="mt-2 w-full text-xs">
                  <thead className="text-left text-slate-500"><tr><th className="py-1 font-normal">Mês</th><th className="text-right font-normal">Bruto</th><th className="text-right font-normal">Retido</th><th className="text-right font-normal">Líquido</th></tr></thead>
                  <tbody>{[...meses].reverse().map(x => (
                    <tr key={x.mes} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1">{mes(x.mes)}</td><td className="text-right">{euros(x.bruto)}</td><td className="text-right">{euros(x.retido)}</td><td className="text-right font-medium">{euros(x.liquido)}</td>
                    </tr>))}
                  </tbody>
                </table>
              </details>
            </Cartao>
            <Diversificacao posicoes={posicoes} />
          </div>

          <Cartao titulo="Dividendos recebidos por ação">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500"><tr><th className="py-1 font-normal">Ação</th><th className="text-right font-normal">Pagamentos</th><th className="text-right font-normal">Bruto</th><th className="text-right font-normal">Retido</th><th className="text-right font-normal">Líquido</th></tr></thead>
              <tbody>{porAcao.map(([t, x]) => (
                <tr key={t} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1 font-medium">{t}</td><td className="text-right">{x.n}</td><td className="text-right">{euros(x.bruto)}</td><td className="text-right">{euros(x.retido)}</td><td className="text-right font-medium">{euros(x.liquido)}</td>
                </tr>))}
              </tbody>
            </table>
          </Cartao>

          <p className="text-xs text-slate-500">
            Valores em EUR tal como no extrato da XTB (já convertidos). Valor atual e previsões usam as cotações e dividendos da última atualização do radar e as taxas de imposto das suas Definições.{' '}
            <button type="button" className="text-red-700 underline dark:text-red-400"
              onClick={() => { if (confirm('Apagar toda a carteira deste aparelho? (pode voltar a importar o extrato)')) gravarCarteira([]) }}>
              Apagar a carteira deste aparelho
            </button>
          </p>
        </>
      )}
    </div>
  )
}
