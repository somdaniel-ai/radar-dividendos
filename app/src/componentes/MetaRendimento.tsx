import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { NIVEIS } from '../lib/calculos'
import { useApp } from '../lib/contexto'
import { euros, numero, pct } from '../lib/formato'
import { gravar, ler } from '../lib/armazenamento'
import { emPercentagens, META_PADRAO, proporMeta } from '../lib/meta'
import { lerNumero } from '../lib/simulador'
import { AVISO_LEGAL, Cartao, EtiquetaCategoria } from './Comuns'
import { EtiquetaNivel } from './Nivel'

const K_ALVO = 'radar.meta.alvo'

function Numero({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className="text-xl font-bold">{valor}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

/** "Quero receber X € por mês" → distribuição proposta e capital necessário. */
export function MetaRendimento({ abrirNoSimulador }: {
  abrirNoSimulador: (valor: number, linhas: { ticker: string; pct: number }[], nome: string) => void
}) {
  const { acoes, params } = useApp()
  const m = params?.meta ?? META_PADRAO
  const [texto, setTexto] = useState(() => numero(ler(K_ALVO, m.rendimento_mensal_padrao), 0))
  const alvo = lerNumero(texto)
  useEffect(() => { if (alvo > 0) gravar(K_ALVO, alvo) }, [alvo])
  const r = useMemo(() => proporMeta(acoes, alvo > 0 ? alvo : 0, m), [acoes, alvo, m])

  const abrir = () => {
    if (!r.capital) return
    const p = emPercentagens(r.linhas.map(l => l.peso))
    abrirNoSimulador(Math.ceil(r.capital), r.linhas.map((l, i) => ({ ticker: l.acao.ticker, pct: p[i] })), `Meta ${numero(alvo, 0)} €/mês`)
  }

  return (
    <div className="space-y-3" data-meta-rendimento>
      <Cartao>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Quero receber por mês (líquido)</span>
          <span className="relative">
            <input inputMode="decimal" value={texto} onChange={e => setTexto(e.target.value)} aria-label="Rendimento mensal líquido pretendido"
              aria-invalid={!(alvo > 0)}
              className={`w-32 rounded-lg border bg-white py-1.5 pl-2 pr-6 text-right text-base dark:bg-slate-950 ${alvo > 0 ? 'border-slate-300 dark:border-slate-700' : 'border-red-500'}`} />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">€</span>
          </span>
        </label>
        <p className="mt-2 text-xs text-slate-500">
          A app escolhe as ações com melhor <b>pontuação</b> e dá a cada uma o máximo permitido pelos limites, até chegar a 100%.
          Limites atuais: até <b>{pct(m.max_empresa, 0)}</b> por empresa, até <b>{pct(m.max_setor, 0)}</b> por setor, nível mínimo{' '}
          <b>{NIVEIS[m.nivel_minimo]?.nome ?? m.nivel_minimo}</b>{m.excluir_armadilhas ? ', sem armadilhas' : ''}, dentro dos limites de yield.{' '}
          <Link to="/definicoes#meta" className="underline">Mudar nas Definições</Link>.
        </p>
      </Cartao>

      {!(alvo > 0) ? (
        <Cartao><p className="text-sm text-slate-500">Escreva quanto quer receber por mês (por exemplo, 100 ou 500).</p></Cartao>
      ) : !r.possivel ? (
        <Cartao>
          <p role="status" className="text-sm text-amber-800 dark:text-amber-200">
            Com estes limites só é possível distribuir <b>{pct(r.distribuido, 0)}</b>: há {r.candidatas} ações que cumprem os critérios
            {r.setores.length ? ` em ${r.setores.length} setores` : ''}. Para chegar a 100%, aumente o máximo por empresa ou por setor,
            baixe o nível mínimo ou permita armadilhas nas <Link to="/definicoes#meta" className="underline">Definições</Link>.
          </p>
        </Cartao>
      ) : (
        <>
          <Cartao titulo="Resultado">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Numero rotulo="Capital necessário" valor={euros(r.capital, 0)} sub={`para ${euros(alvo)}/mês líquidos`} />
              <Numero rotulo="Yield líquido médio" valor={pct(r.yield_liquido, 2)} sub="por ano, sobre o investido" />
              <Numero rotulo="Por ano (líquido)" valor={euros(alvo * 12)} />
              <Numero rotulo="Empresas" valor={String(r.linhas.length)} sub={`${r.setores.length} setores`} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={abrir}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-slate-900">
                Abrir no Simulador (Distribuição)
              </button>
              <span className="text-xs text-slate-500">Para ajustar as percentagens à mão e guardar como cenário.</span>
            </div>
          </Cartao>

          <Cartao titulo="Distribuição proposta">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {r.linhas.map(l => (
                <li key={l.acao.ticker} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                  <div className="min-w-[11rem] flex-1">
                    <Link to={`/acao/${l.acao.ticker}`} className="font-semibold text-sky-700 dark:text-sky-400">{l.acao.ticker}</Link>
                    {' '}<EtiquetaCategoria categoria={l.acao.categoria} />
                    <div className="text-xs text-slate-500">{l.acao.nome}{l.acao.setor ? ` · ${l.acao.setor}` : ''}</div>
                  </div>
                  <EtiquetaNivel nivel={l.acao.nivel.nivel} />
                  <div className="w-14 text-right font-medium">{pct(l.peso, 1)}</div>
                  <div className="w-24 text-right">{euros(l.valor, 0)}</div>
                  <div className="w-44 text-right text-xs text-slate-500">
                    yield {pct(l.acao.yield.liquido)} · <b className="whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{euros(l.sim.mensal_liquido)}/mês</b>
                  </div>
                </li>
              ))}
            </ul>
          </Cartao>

          <Cartao titulo="Por setor">
            <ul className="space-y-1.5 text-sm" aria-label="Peso por setor">
              {r.setores.map(s => (
                <li key={s.setor} className="grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] items-center gap-2">
                  <span className="truncate" title={s.setor}>{s.setor}</span>
                  <span className="h-2.5 rounded bg-slate-100 dark:bg-slate-800">
                    <span className="block h-2.5 rounded bg-sky-600" style={{ width: `${s.peso * 100}%` }} />
                  </span>
                  <span className="text-right">{pct(s.peso, 0)}</span>
                </li>
              ))}
            </ul>
          </Cartao>
        </>
      )}
      <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
        <b>Não é aconselhamento financeiro.</b> É uma regra automática e simples (as melhores pontuações, com limites), com os dividendos
        de hoje: os futuros podem ser diferentes. Antes de investir, veja cada ação. {AVISO_LEGAL}
      </p>
    </div>
  )
}
