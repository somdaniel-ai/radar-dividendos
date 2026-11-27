import { useEffect, useMemo, useState } from 'react'
import type { Parametros } from '../tipos'
import { Link } from 'react-router-dom'
import { NIVEIS } from '../lib/calculos'
import { useApp } from '../lib/contexto'
import { euros, numero, pct } from '../lib/formato'
import { gravar, ler } from '../lib/armazenamento'
import { emPercentagens, META_PADRAO, proporMeta } from '../lib/meta'
import { lerNumero } from '../lib/simulador'
import { BarrasPeso } from './Barras'
import { AVISO_LEGAL, Cartao, EtiquetaCategoria } from './Comuns'
import { EtiquetaNivel } from './Nivel'

const K_ALVO = 'radar.meta.alvo'

function Numero({ rotulo, valor, sub, dados }: { rotulo: string; valor: string; sub?: React.ReactNode; dados?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60" data-numero={dados}>
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className="text-xl font-bold">{valor}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

type LimitesMeta = Parametros['meta']
type ChaveNum = 'max_empresa' | 'max_setor' | 'max_pais' | 'nivel_minimo'

const BARRAS: { k: ChaveNum; rotulo: string; min: number; max: number; passo: number; mostrar: (v: number) => string }[] = [
  { k: 'max_empresa', rotulo: 'Máximo por empresa', min: 0.02, max: 0.5, passo: 0.01, mostrar: v => pct(v, 0) },
  { k: 'max_setor', rotulo: 'Máximo por setor', min: 0.05, max: 1, passo: 0.05, mostrar: v => (v >= 0.999 ? 'sem limite' : pct(v, 0)) },
  { k: 'max_pais', rotulo: 'Máximo por país', min: 0.1, max: 1, passo: 0.05, mostrar: v => (v >= 0.999 ? 'sem limite' : pct(v, 0)) },
  { k: 'nivel_minimo', rotulo: 'Nível mínimo', min: 0, max: 6, passo: 1, mostrar: v => (v === 0 ? '0 · todos' : `${v} · ${NIVEIS[v]?.nome ?? ''}`) },
]
const arred = (v: number, passo: number) => Math.round(Math.round(v / passo) * passo * 100) / 100

/**
 * Limites da proposta, com barras deslizantes. Enquanto se arrasta, a proposta muda logo (só no
 * aparelho); ao largar, o valor é gravado nas Definições (o mesmo sítio da página Definições,
 * sincronizado com a conta) — assim não se envia uma alteração por cada pixel.
 */
function Limites({ m, mudarRascunho, gravarValor, repor }: {
  m: LimitesMeta
  mudarRascunho: (k: ChaveNum, v: number) => void
  gravarValor: (k: keyof LimitesMeta, v: number | boolean) => void
  repor: () => void
}) {
  return (
    <div data-limites-meta className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Limites</h2>
        <button type="button" onClick={repor} className="text-xs text-sky-700 underline dark:text-sky-400">Repor</button>
      </div>
      <div className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {BARRAS.map(b => {
          const v = m[b.k] ?? (b.k === 'max_pais' ? 1 : b.min)
          const largar = (e: React.SyntheticEvent<HTMLInputElement>) => gravarValor(b.k, arred(Number(e.currentTarget.value), b.passo))
          return (
            <label key={b.k} className="block text-sm">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-slate-600 dark:text-slate-300">{b.rotulo}</span>
                <b data-valor-limite={b.k} className="whitespace-nowrap">{b.mostrar(v)}</b>
              </span>
              <input type="range" min={b.min} max={b.max} step={b.passo} value={v} aria-label={b.rotulo}
                aria-valuetext={b.mostrar(v)} data-barra={b.k}
                onChange={e => mudarRascunho(b.k, arred(Number(e.target.value), b.passo))}
                onPointerUp={largar} onKeyUp={largar} onTouchEnd={largar} onBlur={largar}
                className="mt-1 h-6 w-full cursor-pointer accent-sky-600" />
            </label>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {([['excluir_armadilhas', 'Excluir ações com sinais de armadilha'], ['so_favoritos', 'Só favoritos']] as const).map(([k, t]) => (
          <label key={k} className="flex items-center gap-2">
            <input type="checkbox" checked={!!m[k]} onChange={e => gravarValor(k, e.target.checked)} className="size-4" data-interruptor={k} />
            {t}
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Também estão nas <Link to="/definicoes#meta" className="underline">Definições</Link>: os dois sítios mostram sempre os mesmos valores.
      </p>
    </div>
  )
}

/** "Quero receber X € por mês" → distribuição proposta e capital necessário. */
export function MetaRendimento({ abrirNoSimulador }: {
  abrirNoSimulador: (valor: number, linhas: { ticker: string; pct: number }[], nome: string) => void
}) {
  const { acoes, params, padrao, favoritos, alterar } = useApp()
  const guardado = useMemo(() => ({ ...META_PADRAO, ...(params?.meta ?? {}) }), [params?.meta])
  // valores enquanto se arrasta uma barra (ainda não gravados)
  const [rascunho, setRascunho] = useState<Partial<LimitesMeta>>({})
  const m = useMemo(() => ({ ...guardado, ...rascunho }), [guardado, rascunho])
  const gravarLimite = (k: keyof LimitesMeta, v: number | boolean) => {
    setRascunho(r => { const n = { ...r }; delete n[k]; return n })
    if (guardado[k] !== v) alterar(`meta.${k}`, v)
  }
  const repor = () => {
    const base = { ...META_PADRAO, ...(padrao?.meta ?? {}) }
    setRascunho({})
    for (const k of ['max_empresa', 'max_setor', 'max_pais', 'nivel_minimo', 'excluir_armadilhas', 'so_favoritos'] as const)
      if (guardado[k] !== base[k]) alterar(`meta.${k}`, base[k])
  }
  const [texto, setTexto] = useState(() => numero(ler(K_ALVO, m.rendimento_mensal_padrao), 0))
  const alvo = lerNumero(texto)
  useEffect(() => { if (alvo > 0) gravar(K_ALVO, alvo) }, [alvo])
  const r = useMemo(() => proporMeta(acoes, alvo > 0 ? alvo : 0, m, favoritos), [acoes, alvo, m, favoritos])

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
          A app escolhe as ações com melhor <b>pontuação</b>{m.so_favoritos ? <> (só dos <b>favoritos</b>)</> : null} e dá a cada uma o
          máximo permitido pelos limites, até chegar a 100%. Ficam sempre de fora as ações fora dos limites de yield.
        </p>
        <Limites m={m} mudarRascunho={(k, v) => setRascunho(x => ({ ...x, [k]: v }))} gravarValor={gravarLimite} repor={repor} />
      </Cartao>

      {!(alvo > 0) ? (
        <Cartao><p className="text-sm text-slate-500">Escreva quanto quer receber por mês (por exemplo, 100 ou 500).</p></Cartao>
      ) : !r.possivel ? (
        <Cartao>
          <p role="status" className="text-sm text-amber-800 dark:text-amber-200">
            Com estes limites só é possível distribuir <b>{pct(r.distribuido, 0)}</b>: há {r.candidatas} ações que cumprem os critérios
            {r.setores.length ? ` em ${r.setores.length} setores` : ''}{m.so_favoritos ? ' (só favoritos)' : ''}. Para chegar a 100%, aumente o
            máximo por empresa, por setor ou por país, baixe o nível mínimo{m.excluir_armadilhas ? ', permita armadilhas' : ''}
            {m.so_favoritos ? ' ou desligue «Só favoritos»' : ''} nos limites acima.
          </p>
        </Cartao>
      ) : (
        <>
          <Cartao titulo="Resultado">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Numero rotulo="Capital necessário" dados="capital" valor={euros(r.capital, 0)} sub={`para ${euros(alvo)}/mês líquidos`} />
              <Numero rotulo="Yield líquido médio" valor={pct(r.yield_liquido, 2)} sub="por ano, sobre o investido" />
              <Numero rotulo="Por ano (líquido)" valor={euros(alvo * 12)} />
              <Numero rotulo="Empresas" valor={String(r.linhas.length)} sub={`${r.setores.length} setores · ${r.paises.length} ${r.paises.length === 1 ? 'país' : 'países'}`} />
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
                    <div className="text-xs text-slate-500"><Link to={`/acao/${l.acao.ticker}`} className="hover:underline">{l.acao.nome}</Link>{l.acao.setor ? ` · ${l.acao.setor}` : ''}</div>
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
            <BarrasPeso linhas={r.setores.map(s => ({ nome: s.setor, peso: s.peso, valor: (r.capital ?? 0) * s.peso }))} rotulo="Peso por setor" />
          </Cartao>
          <Cartao titulo="Por país">
            <BarrasPeso linhas={r.paises.map(s => ({ nome: s.pais, peso: s.peso, valor: (r.capital ?? 0) * s.peso }))} rotulo="Peso por país" />
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
