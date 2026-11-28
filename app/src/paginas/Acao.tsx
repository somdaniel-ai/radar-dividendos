import { useMemo, useState, type ReactNode } from 'react'
import { ComposicaoEtf } from '../componentes/Composicao'
import { Link, useParams } from 'react-router-dom'
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { GraficoDividendos } from '../componentes/GraficoDividendos'
import { Carregando, Cartao, Erro, Estrela, EtiquetaCategoria, ListaSinais } from '../componentes/Comuns'
import { EtiquetaNivel, Legenda } from '../componentes/Nivel'
import { recalcular, semDecididos } from '../lib/calculos'
import { useApp } from '../lib/contexto'
import { lerAcao, usePedido } from '../lib/dados'
import { useOrigem } from '../lib/posicao'
import { data, dataHora, dias, euros, grande, moeda, numero, pct, pctSinal } from '../lib/formato'
import type { AcaoDetalhe } from '../tipos'

function Linha({ rotulo, valor, destaque, ajuda }: { rotulo: ReactNode; valor: ReactNode; destaque?: string; ajuda?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0 dark:border-slate-800">
      <dt className="text-sm text-slate-500" title={ajuda}>{rotulo}</dt>
      <dd className={`text-right text-sm font-medium ${destaque ?? ''}`}>{valor}</dd>
    </div>
  )
}

function Grande({ rotulo, valor, sub }: { rotulo: string; valor: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className="text-lg font-bold">{valor}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

function BarraIntervalo({ rotulo, pos, min, max, moedaCod, pMin, pMax }: {
  rotulo: string; pos: number | null; min?: number; max?: number; moedaCod: string | null; pMin: number; pMax: number
}) {
  const cor = pos == null ? 'bg-slate-400' : pos <= pMin ? 'bg-emerald-600' : pos >= pMax ? 'bg-red-600' : 'bg-sky-600'
  return (
    <div className="py-1.5">
      <div className="flex justify-between text-xs"><span className="font-medium">{rotulo}</span><span>{pct(pos, 0)}</span></div>
      <div className="relative mt-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
        {pos != null && <div className={`absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-slate-900 ${cor}`}
          style={{ left: `${Math.max(0, Math.min(1, pos)) * 100}%` }} />}
      </div>
      <div className="mt-0.5 flex justify-between text-[11px] text-slate-500">
        <span>mín. {moeda(min, moedaCod)}</span><span>máx. {moeda(max, moedaCod)}</span>
      </div>
    </div>
  )
}

const TENDENCIA: Record<string, string> = { aumento: '▲ Aumento', igual: '= Igual', corte: '▼ Corte' }

export function Acao() {
  const { ticker = '' } = useParams()
  const { dados, erro, aCarregar } = usePedido(() => lerAcao(ticker), [ticker])
  if (erro) return <Erro texto={erro} />
  if (aCarregar || !dados) return <Carregando />
  return <VistaAcao dados={dados} />
}

const BOLSAS: Record<string, string> = {
  US: 'EUA', UK: 'Londres', DE: 'Alemanha', FR: 'Paris', NL: 'Amesterdão', IT: 'Milão', ES: 'Madrid',
  BE: 'Bruxelas', PT: 'Lisboa', PL: 'Varsóvia', CH: 'Suíça', DK: 'Copenhaga', SE: 'Estocolmo', NO: 'Oslo',
  FI: 'Helsínquia', CZ: 'Praga', IL: 'Telavive',
}

/** A mesma empresa (mesmo ISIN) noutras bolsas/moedas da XTB; assinala a versão em euros. */
function VersoesXtb({ versoes, atual }: { versoes: { ticker: string; moeda: string }[]; atual: string }) {
  const temEur = versoes.some(v => v.moeda === 'EUR')
  return (
    <div className="mt-3 rounded-xl p-3 text-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <p className="font-medium">Versões na XTB ({versoes.length}, a mesma empresa: mesmo ISIN)</p>
      <ul className="mt-2 space-y-1">
        {versoes.map(v => (
          <li key={v.ticker} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <b>{v.ticker}</b>
            <span className="text-slate-500">{BOLSAS[v.ticker.split('.').pop() ?? ''] ?? ''} · {v.moeda}</span>
            {v.moeda === 'EUR' && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100">
                € em euros: sem conversão na compra e venda
              </span>
            )}
            {v.ticker === atual && <span className="text-xs text-slate-500">(a analisada aqui)</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        {temEur
          ? 'A sua conta é em euros: comprar e vender a versão em EUR evita a comissão de conversão de moeda da XTB. É a mesma empresa (mesmo ISIN), mas atenção: numa bolsa secundária o dividendo pode continuar a ser pago na moeda de origem (e convertido), e costuma haver menos volume (diferença maior entre preço de compra e de venda).'
          : 'Não há versão em euros: na compra, na venda e nos dividendos há conversão de moeda (com comissão da XTB).'}
      </p>
    </div>
  )
}

export function VistaAcao({ dados }: { dados: AcaoDetalhe }) {
  const origem = useOrigem()
  const { params, hoje, favoritos, alternarFavorito, notas, gravarNota, decisoes } = useApp()
  const [vistaPreco, setVistaPreco] = useState<'5a' | 'sempre'>('5a')
  const [verLegenda, setVerLegenda] = useState(false)
  const [verOriginal, setVerOriginal] = useState(false)

  const a = useMemo(() => {
    if (!dados || !params) return null
    const d = semDecididos(dados, decisoes)
    return { ...d, ...recalcular(d, params, hoje) }
  }, [dados, params, hoje, decisoes])

  const serie = useMemo(() => {
    if (!dados) return []
    const s = vistaPreco === '5a' ? dados.precos.semanal : dados.precos.mensal
    return s.map(([d, v]) => ({ d, v }))
  }, [dados, vistaPreco])

  if (!a || !params) return <Carregando />

  const m = a.moeda
  const c = a.consistencia
  const pp = params.pontuacao
  const fav = favoritos.has(a.ticker)
  const xtbDiferente = a.cotacao_xtb && a.cotacao_xtb.simbolo !== a.ticker_yahoo

  return (
    <div className="space-y-3">
      <Link to="/" data-voltar className="text-sm text-sky-700 dark:text-sky-400"
        onClick={e => { if (origem.voltar && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); origem.voltar() } }}>
        ← Voltar {origem.texto}</Link>

      {/* cabeçalho */}
      <Cartao>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{a.ticker}</h1>
              <EtiquetaNivel nivel={a.nivel.nivel} />
              <EtiquetaCategoria categoria={a.categoria} />
            </div>
            <p className="text-slate-600 dark:text-slate-300">{a.nome}</p>
            <p className="mt-1 text-xs text-slate-500">
              {[a.setor, a.industria, a.pais, a.bolsa].filter(Boolean).join(' · ')}
              {a.capitalizacao ? ` · Capitalização ${grande(a.capitalizacao)} ${m ?? ''}` : ''}
            </p>
            <p className="text-xs text-slate-500">Yahoo: {a.ticker_yahoo}{a.desatualizado ? ' · ⚠ dados desatualizados' : ''}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Estrela ativa={fav} onClick={() => alternarFavorito(a.ticker)} tamanho="text-3xl" />
            <div className="text-right">
              <div className="text-3xl font-bold leading-none">{a.pontuacao.total.toFixed(0)}</div>
              <div className="text-xs text-slate-500">pontos (de 100)</div>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Grande rotulo="Preço" valor={euros(a.preco_eur)}
            sub={<>{moeda(a.preco, m)} · <span className={(a.variacao_dia ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}>{pctSinal(a.variacao_dia, 2)} hoje</span></>} />
          <Grande rotulo="Yield líquido" valor={pct(a.yield.liquido, 2)} sub={`bruto ${pct(a.yield.bruto, 2)} · imposto ${pct(a.imposto.taxa, 0)}`} />
          <Grande rotulo={`Preço justo (${pct(params.preco.yield_alvo, 0)})`}
            valor={<span className={a.abaixo_preco_justo ? 'text-emerald-700 dark:text-emerald-400' : ''}>{euros(a.preco_justo_eur)}{a.abaixo_preco_justo ? ' ✓' : ''}</span>}
            sub={a.abaixo_preco_justo ? 'preço atual abaixo' : `com yield alvo de ${pct(params.preco.yield_alvo, 1)}`} />
          <Grande rotulo="Preço justo histórico"
            valor={<span className={a.abaixo_preco_justo_historico ? 'text-emerald-700 dark:text-emerald-400' : ''}>{euros(a.preco_justo_historico_eur)}{a.abaixo_preco_justo_historico ? ' ✓' : ''}</span>}
            sub={a.yield_medio_historico == null ? 'histórico insuficiente (< 2 anos)' : a.abaixo_preco_justo_historico ? 'preço atual abaixo' : `yield habitual ${pct(a.yield_medio_historico, 1)}`} />
          <Grande rotulo="Dividendo anual" valor={euros(a.dividendo.anual_eur, 3)}
            sub={`${moeda(a.dividendo.anual, m, 3)} · ${a.frequencia}`} />
        </div>
        {a.yield_medio_historico != null && a.yield.bruto != null && (
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            Hoje rende <b>{pct(a.yield.bruto, 1)}</b>, quando costuma render <b>{pct(a.yield_medio_historico, 1)}</b>
            {' '}(yield bruto habitual nos últimos {a.anos_media_usados} anos
            {a.anos_media_usados < params.preco.anos_media_yield ? `; só há ${a.anos_media_usados} anos de histórico` : ''}).
            {' '}{a.yield.bruto > a.yield_medio_historico * 1.02
              ? 'Está a render mais do que é habitual: o preço está abaixo do habitual face ao dividendo.'
              : a.yield.bruto < a.yield_medio_historico * 0.98
                ? 'Está a render menos do que é habitual: o preço está acima do habitual face ao dividendo.'
                : 'Está a render o que é habitual.'}
            <span className="mt-1 block text-xs text-slate-500">
              Preço justo histórico = dividendo anual ÷ yield habitual. "Habitual" = mediana dos yields mensais, sem extraordinários.
              {' '}Conta para a pontuação: preço justo {a.preco_justo_pontuacao === 'historico' ? 'histórico' : `com yield alvo (${pct(params.preco.yield_alvo, 0)})`}
              {params.preco.preco_justo_pontuacao === 'historico' && a.preco_justo_pontuacao === 'alvo' ? ' (o histórico não está disponível)' : ''}.
            </span>
          </p>
        )}
        {a.yield_medio_historico == null && (
          <p className="mt-3 text-xs text-slate-500">Preço justo histórico indisponível: são precisos pelo menos 2 anos de histórico de yields.</p>
        )}
        {xtbDiferente && (
          <p className="mt-3 rounded-xl bg-sky-50 p-3 text-xs text-sky-950 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900">
            Rendimento calculado com os dados de <b>{a.ticker_yahoo}</b> ({m}), onde o dividendo é declarado. Na XTB esta ação é <b>{a.ticker}</b>, cotada a {moeda(a.cotacao_xtb.preco, a.cotacao_xtb.moeda)} ({euros(a.cotacao_xtb.preco_eur)}) — é esta cotação que conta para a carteira.
          </p>
        )}
        {dados.versoes_xtb && dados.versoes_xtb.length > 1 && <VersoesXtb versoes={dados.versoes_xtb} atual={a.ticker} />}
      </Cartao>

      {(a.armadilhas.length > 0 || a.avisos.length > 0 || a.fora_batentes) && (
        <div className="space-y-2">
          <ListaSinais sinais={a.armadilhas} tipo="armadilha" />
          <ListaSinais sinais={[
            ...a.avisos,
            ...(a.fora_batentes ? [{ codigo: 'batentes', texto: `Yield líquido ${a.fora_batentes === 'abaixo' ? 'abaixo do mínimo' : 'acima do máximo'} definido (${pct(pp.yield_minimo, 0)}–${pct(pp.yield_maximo, 0)}).` }] : []),
          ]} tipo="aviso" />
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {/* nível */}
        <Cartao titulo="Consistência" acao={<button type="button" className="text-sm text-sky-700 underline dark:text-sky-400" onClick={() => setVerLegenda(v => !v)}>Legenda</button>}>
          <div className="mb-2 flex items-center gap-2"><EtiquetaNivel nivel={a.nivel.nivel} /><span className="text-sm">{a.nivel.texto}</span></div>
          <p className="mb-2 text-sm font-medium">Porque recebeu este nível:</p>
          <ul className="mb-3 list-disc space-y-0.5 pl-5 text-sm">{a.nivel.motivos.map(t => <li key={t}>{t}</li>)}</ul>
          {verLegenda && <div className="mb-3"><Legenda /></div>}
          <dl>
            <Linha rotulo="Anos seguidos a pagar" valor={c.anos_a_pagar} />
            <Linha rotulo="Anos seguidos sem cortes" valor={c.anos_sem_corte} ajuda={`Corte = descida do dividendo anual superior a ${pct(params.consistencia.limite_corte, 0)}`} />
            <Linha rotulo="Anos seguidos a aumentar" valor={c.anos_seguidos_aumento} />
            <Linha rotulo="Aumentos nos últimos 10 anos" valor={c.aumentos_ultimos_10} />
            <Linha rotulo="Cortes nos últimos 10 anos" valor={c.cortes_ultimos_10} destaque={c.cortes_ultimos_10 ? 'text-red-700 dark:text-red-400' : ''} />
            <Linha rotulo="Crescimento médio (5 anos)" valor={pctSinal(c.cagr_5)} />
            <Linha rotulo="Crescimento médio (10 anos)" valor={pctSinal(c.cagr_10)} />
            <Linha rotulo="Regularidade dos pagamentos" valor={pct(c.regularidade, 0)} ajuda="100% = intervalos sempre iguais entre pagamentos" />
            <Linha rotulo="Pagamentos no histórico" valor={c.num_pagamentos} />
          </dl>
        </Cartao>

        {/* pontuação */}
        <Cartao titulo={`Pontuação: ${numero(a.pontuacao.total, 1)} / 100`}>
          {([
            ['Rendimento', a.pontuacao.rendimento, pp.peso_rendimento, `Yield líquido entre ${pct(pp.yield_minimo, 0)} (0) e ${pct(pp.yield_maximo, 0)} (100)`],
            ['Consistência', a.pontuacao.consistencia, pp.peso_consistencia, 'Nível de cor, anos sem cortes e regularidade'],
            ['Preço atrativo', a.pontuacao.preco, pp.peso_preco, 'Desconto face ao preço justo e proximidade do mínimo de 52 semanas'],
          ] as const).map(([t, v, peso, ajuda]) => (
            <div key={t} className="mb-3">
              <div className="flex justify-between text-sm"><span><b>{t}</b> <span className="text-slate-500">(peso {pct(peso, 0)})</span></span><span>{numero(v, 0)}/100</span></div>
              <div className="mt-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-2 rounded-full bg-sky-600" style={{ width: `${v}%` }} /></div>
              <p className="mt-0.5 text-xs text-slate-500">{ajuda}</p>
            </div>
          ))}
          {a.pontuacao.penalizacao > 0 && (
            <p className="text-sm text-red-700 dark:text-red-400">−{a.pontuacao.penalizacao} pontos por {a.armadilhas.length} sinal(is) de armadilha.</p>
          )}
        </Cartao>
      </div>

      {/* dividendos: por ano / por pagamento */}
      <GraficoDividendos dados={dados} tolerancia={params.pagamentos.tolerancia_igual} />

      {a.extraordinarios_suspeitos.length > 0 && (
        <Cartao titulo="Possíveis extraordinários (a confirmar)">
          <ul className="space-y-1 text-sm">
            {a.extraordinarios_suspeitos.map(s => (
              <li key={s.data}>❓ <b>{data(s.data)}</b>: {moeda(s.valor, m, 4)} (extra estimado ≈ {moeda(s.extra_estimado, m, 4)}) — {s.motivo}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Enquanto não forem confirmados, estes pagamentos contam como normais. <Link to="/definicoes#suspeitos" className="text-sky-700 underline dark:text-sky-400">Confirmar ou rejeitar nas Definições</Link>.</p>
        </Cartao>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {/* pagamentos */}
        <Cartao titulo="Pagamentos">
          <dl>
            <Linha rotulo="Último dividendo normal" valor={`${moeda(a.dividendo.ultimo, m, 4)} · ${data(a.dividendo.ultimo_data)}`} />
            <Linha rotulo="Frequência" valor={`${a.frequencia}${a.intervalo_mediano_dias ? ` (≈ ${numero(a.intervalo_mediano_dias, 0)} dias)` : ''}`} />
            <Linha rotulo="Tendência do último dividendo" valor={a.tendencia ? TENDENCIA[a.tendencia] : '—'}
              destaque={a.tendencia === 'corte' ? 'text-red-700 dark:text-red-400' : a.tendencia === 'aumento' ? 'text-emerald-700 dark:text-emerald-400' : ''}
              ajuda="Último dividendo comparado com a média dos 2 anteriores" />
            <Linha rotulo="Próximo pagamento esperado" valor={`${data(a.pagamento.esperado)} (${dias(a.pagamento.dias_para_pagamento)})`}
              destaque={a.pagamento.atrasado ? 'text-red-700 dark:text-red-400' : ''} ajuda="Estimativa: último pagamento + intervalo normal" />
            <Linha rotulo="Próxima data ex-dividendo" valor={a.pagamento.proxima_ex_anunciada && a.pagamento.proxima_ex_anunciada >= hoje
              ? <>{data(a.pagamento.proxima_ex_anunciada)} <span className="text-emerald-600">✓ confirmada</span></> : 'ainda não anunciada'} />
            {a.pagamento.data_pagamento && <Linha rotulo="Data de pagamento anunciada" valor={data(a.pagamento.data_pagamento)} />}
            <Linha rotulo="Dividendos nos últimos 12 meses" valor={`${moeda(a.dividendo.ttm, m, 3)}${a.dividendo.ttm_total > a.dividendo.ttm + 1e-9 ? ` (+ ${moeda(a.dividendo.ttm_total - a.dividendo.ttm, m, 3)} extra)` : ''}`} />
            <Linha rotulo="Método do dividendo anual" valor={a.dividendo.metodo === 'ultimo' ? 'Último × pagamentos/ano' : 'Últimos 12 meses'} />
            <Linha rotulo="Yield mensal (bruto)" valor={pct(a.yield.mensal, 2)} />
            <Linha rotulo="Payout (dividendos ÷ lucro)" valor={pct(a.payout, 0)} />
          </dl>
          <p className="mt-2 text-xs text-slate-500">Para receber o dividendo tem de ter a ação <b>antes</b> da data ex-dividendo.</p>
        </Cartao>

        {/* preço */}
        <Cartao titulo={`Preço (${m ?? ''})`} acao={
          <div className="flex gap-1 text-xs">
            {(['5a', 'sempre'] as const).map(v => (
              <button key={v} type="button" onClick={() => setVistaPreco(v)} aria-pressed={vistaPreco === v}
                className={`rounded-full px-2 py-0.5 ${vistaPreco === v ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'ring-1 ring-slate-300 dark:ring-slate-700'}`}>
                {v === '5a' ? '5 anos' : 'Sempre'}
              </button>
            ))}
          </div>}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie} margin={{ left: -10, right: 4, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                <XAxis dataKey="d" tick={{ fontSize: 10 }} tickFormatter={d => String(d).slice(0, 4)} minTickGap={30} />
                <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={v => numero(v, 0)} />
                <Tooltip formatter={v => moeda(Number(v), m)} labelFormatter={l => data(String(l))} />
                <Line dataKey="v" name="Preço" dot={false} stroke="#0284c7" strokeWidth={1.5} />
                {a.preco_justo != null && <ReferenceLine y={a.preco_justo} stroke="#16a34a" strokeDasharray="4 4" label={{ value: 'justo', fontSize: 10, fill: '#16a34a', position: 'insideTopRight' }} />}
                {vistaPreco === '5a' && a.extremos['52s'] && <ReferenceLine y={a.extremos['52s'].max} stroke="#dc2626" strokeDasharray="2 4" />}
                {vistaPreco === '5a' && a.extremos['52s'] && <ReferenceLine y={a.extremos['52s'].min} stroke="#dc2626" strokeDasharray="2 4" />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mb-2 text-xs text-slate-500">Linha verde = preço justo · linhas vermelhas = máx./mín. de 52 semanas{params.preco.usar_precos_ajustados ? ' · posição calculada com preços ajustados' : ''}.</p>
          {(['52s', '5a', 'sempre'] as const).map(k => {
            const e = a.extremos[k]
            const aj = params.preco.usar_precos_ajustados
            return <BarraIntervalo key={k} rotulo={{ '52s': '52 semanas', '5a': '5 anos', sempre: 'Desde sempre' }[k]} pos={a.posicao[k]}
              min={aj ? e?.min_aj : e?.min} max={aj ? e?.max_aj : e?.max} moedaCod={m}
              pMin={params.preco.limite_perto_minimo} pMax={params.preco.limite_perto_maximo} />
          })}
          <Linha rotulo="Variação em 12 meses" valor={pctSinal(a.variacao_12m)} destaque={(a.variacao_12m ?? 0) < 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'} />
        </Cartao>
      </div>

      {a.categoria === 'ETF' && <ComposicaoEtf c={dados.composicao} />}

      {/* nota pessoal */}
      <Cartao titulo="As minhas notas">
        <textarea defaultValue={notas[a.ticker] ?? ''} onBlur={e => gravarNota(a.ticker, e.target.value)} rows={3}
          placeholder="Escreva aqui as suas notas sobre esta ação (guardadas neste aparelho)."
          className="w-full rounded-xl border border-slate-300 bg-white p-2 text-base dark:border-slate-700 dark:bg-slate-950" />
      </Cartao>

      {/* histórico */}
      <Cartao titulo="Histórico de dividendos (últimos 24)">
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Data ex-dividendo</th><th className="py-1 text-right">Valor</th><th className="py-1 text-right">Extra</th></tr></thead>
            <tbody>
              {[...a.historico_dividendos].reverse().slice(0, 24).map(h => (
                <tr key={h.data} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1">{data(h.data)}</td>
                  <td className="py-1 text-right">{moeda(h.valor, m, 4)}</td>
                  <td className="py-1 text-right text-amber-600">{h.parte_extraordinaria > 0 ? moeda(h.parte_extraordinaria, m, 4) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>

      {a.descricao && (
        <Cartao titulo="Sobre a empresa">
          {a.descricao_estado === 'traduzida' ? (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300" lang={verOriginal ? 'en' : 'pt-PT'}>
                {verOriginal ? a.descricao_original : a.descricao}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {verOriginal ? 'Texto original (inglês).' : 'Tradução automática.'}{' '}
                <button type="button" className="text-sky-700 underline dark:text-sky-400" onClick={() => setVerOriginal(v => !v)}>
                  {verOriginal ? 'ver tradução' : 'ver original'}
                </button>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300" lang="en">{a.descricao}</p>
              <p className="mt-1 text-xs text-slate-500">Original em inglês — tradução indisponível (será tentada na próxima atualização).</p>
            </>
          )}
        </Cartao>
      )}
      <p className="text-xs text-slate-500">Dados desta ação atualizados em {dataHora(a.atualizado_em)}.</p>
    </div>
  )
}
