import { useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from 'recharts'
import { gravar, ler } from '../lib/armazenamento'
import { data, moeda, numero, pctSinal } from '../lib/formato'
import type { AcaoDetalhe } from '../tipos'
import { Cartao } from './Comuns'

type Vista = 'ano' | 'pagamento'
type Periodo = '5' | '10' | 'tudo'

const AZUL = '#0284c7'
const LARANJA = '#f59e0b'
const VERDE = '#16a34a'
const VERMELHO = '#dc2626'

interface Ponto {
  t: number
  data: string
  normal: number | null // parte normal do pagamento
  extra: number | null // valor total, só para pagamentos com parte extraordinária
  parteExtra: number
  total: number
  variacao: number | null // variação da parte normal face ao pagamento normal anterior
  cor: string
}

function Botoes<T extends string>({ opcoes, valor, onMudar, rotulo }: {
  opcoes: [T, string][]; valor: T; onMudar: (v: T) => void; rotulo: string
}) {
  return (
    <div className="flex gap-1 text-xs" role="group" aria-label={rotulo}>
      {opcoes.map(([k, t]) => (
        <button key={k} type="button" onClick={() => onMudar(k)} aria-pressed={valor === k}
          className={`rounded-full px-2.5 py-1 ${valor === k ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'ring-1 ring-slate-300 dark:ring-slate-700'}`}>
          {t}
        </button>
      ))}
    </div>
  )
}

function DicaPagamento({ active, payload, m }: { active?: boolean; payload?: { payload: Ponto }[]; m: string | null }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg bg-white p-2 text-xs shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
      <div className="font-semibold">{data(p.data)}</div>
      <div>Valor: <b>{moeda(p.total, m, 4)}</b></div>
      {p.parteExtra > 0 && <div className="text-amber-600">dos quais extraordinário: {moeda(p.parteExtra, m, 4)}</div>}
      <div style={{ color: p.cor === AZUL ? undefined : p.cor }}>
        Variação face ao anterior: {p.variacao == null ? '—' : pctSinal(p.variacao)}
      </div>
    </div>
  )
}

function PontoColorido(props: { cx?: number; cy?: number; payload?: Ponto }) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload || payload.normal == null) return null
  return <circle cx={cx} cy={cy} r={payload.cor === AZUL ? 3 : 4.5} fill={payload.cor} stroke="white" strokeWidth={1} />
}

export function GraficoDividendos({ dados, tolerancia }: { dados: AcaoDetalhe; tolerancia: number }) {
  const [vista, setVistaE] = useState<Vista>(() => ler('radar.grafico.vista', 'ano'))
  const [periodo, setPeriodoE] = useState<Periodo>(() => ler('radar.grafico.periodo', '5'))
  const setVista = (v: Vista) => { setVistaE(v); gravar('radar.grafico.vista', v) }
  const setPeriodo = (v: Periodo) => { setPeriodoE(v); gravar('radar.grafico.periodo', v) }
  const m = dados.moeda
  const anoRef = Number((dados.atualizado_em ?? new Date().toISOString()).slice(0, 4))
  const desde = periodo === 'tudo' ? null : `${anoRef - Number(periodo)}${(dados.atualizado_em ?? '').slice(4, 10) || '-01-01'}`

  const pontos = useMemo<Ponto[]>(() => {
    let anterior: number | null = null
    const lista: Ponto[] = []
    for (const h of dados.historico_dividendos) {
      const normal = h.valor - h.parte_extraordinaria
      const soExtra = normal <= 1e-9
      let variacao: number | null = null
      let cor = AZUL
      if (!soExtra) {
        if (anterior && anterior > 0) {
          variacao = normal / anterior - 1
          if (variacao > tolerancia) cor = VERDE
          else if (variacao < -tolerancia) cor = VERMELHO
        }
        anterior = normal
      }
      lista.push({
        t: new Date(h.data).getTime(), data: h.data, normal: soExtra ? null : normal,
        extra: h.parte_extraordinaria > 1e-9 ? h.valor : null, parteExtra: h.parte_extraordinaria,
        total: h.valor, variacao, cor,
      })
    }
    return desde ? lista.filter(p => p.data >= desde) : lista
  }, [dados, tolerancia, desde])

  const porAno = useMemo(() => {
    const mapa = new Map<number, { ano: number; normal: number; extra: number }>()
    for (const h of dados.historico_dividendos) {
      const ano = Number(h.data.slice(0, 4))
      const e = mapa.get(ano) ?? { ano, normal: 0, extra: 0 }
      e.extra += h.parte_extraordinaria
      e.normal += h.valor - h.parte_extraordinaria
      mapa.set(ano, e)
    }
    const lista = [...mapa.values()].sort((x, y) => x.ano - y.ano)
    return periodo === 'tudo' ? lista : lista.filter(x => x.ano >= anoRef - Number(periodo))
  }, [dados, periodo, anoRef])

  const cortes = pontos.filter(p => p.cor === VERMELHO).length
  const aumentos = pontos.filter(p => p.cor === VERDE).length

  return (
    <Cartao titulo={`Dividendos (${m ?? ''})`} acao={
      <Botoes rotulo="Vista" opcoes={[['ano', 'Por ano'], ['pagamento', 'Por pagamento']]} valor={vista} onMudar={setVista} />
    }>
      <div className="mb-2 flex justify-end">
        <Botoes rotulo="Período" opcoes={[['5', '5 anos'], ['10', '10 anos'], ['tudo', 'Tudo']]} valor={periodo} onMudar={setPeriodo} />
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {vista === 'ano' ? (
            <BarChart data={porAno} margin={{ left: -10, right: 4, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
              <XAxis dataKey="ano" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => numero(v, 2)} />
              <Tooltip formatter={v => moeda(Number(v), m, 3)} labelFormatter={l => `Ano ${l}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="normal" name="Normal" stackId="d" fill={AZUL} />
              <Bar dataKey="extra" name="Extraordinário" stackId="d" fill={LARANJA} />
            </BarChart>
          ) : (
            <ComposedChart data={pontos} margin={{ left: -10, right: 8, top: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tick={{ fontSize: 10 }}
                tickFormatter={t => new Date(t).getFullYear().toString()} minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => numero(v, 2)} domain={[0, 'auto']} />
              <Tooltip content={<DicaPagamento m={m} />} />
              <Line dataKey="normal" name="Normal" type="stepAfter" stroke={AZUL} strokeWidth={1.5}
                dot={<PontoColorido />} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
              <Scatter dataKey="extra" name="Com extraordinário" fill={LARANJA} isAnimationActive={false} />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
      {vista === 'pagamento' ? (
        <div className="mt-1 space-y-1 text-xs text-slate-500">
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            <span><span style={{ color: AZUL }}>●</span> normal</span>
            <span><span style={{ color: LARANJA }}>●</span> com extraordinário (valor total)</span>
            <span><span style={{ color: VERDE }}>●</span> aumento ({aumentos})</span>
            <span><span style={{ color: VERMELHO }}>●</span> corte ({cortes})</span>
          </p>
          <p>Aumento/corte: parte normal face ao pagamento normal anterior. Toque num ponto (ou passe o rato) para ver os detalhes. Em empresas com dividendo intercalar e final diferentes, as cores alternam naturalmente.</p>
        </div>
      ) : (
        <p className="mt-1 text-xs text-slate-500">O ano corrente ainda não está completo e não conta para a consistência.</p>
      )}
    </Cartao>
  )
}
