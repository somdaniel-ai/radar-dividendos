import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Carregando, Cartao, Erro } from '../componentes/Comuns'
import { gravar, ler } from '../lib/armazenamento'
import { calcularCarteira, pagamentos } from '../lib/carteira'
import { eventos, grelhaMes, mesDe, somarMeses, totalPorMes, diasEntre, type Evento, type TipoEvento } from '../lib/calendario'
import { useApp } from '../lib/contexto'
import { dias, euros, moeda } from '../lib/formato'

const K_FILTRO = 'radar.calendario.filtro'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
const diaSemana = (s: string) => SEMANA[(new Date(`${s}T00:00:00Z`).getUTCDay() + 6) % 7]

const TIPOS: Record<TipoEvento, { t: string; curto: string; cor: string }> = {
  ex: { t: 'Data ex-dividendo', curto: 'Ex', cor: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200' },
  pagamento: { t: 'Pagamento', curto: 'Pg', cor: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' },
  recebido: { t: 'Recebido', curto: '✓', cor: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100' },
}

const FILTROS = [
  { v: 'todas', t: 'Carteira e favoritos' }, { v: 'carteira', t: '💼 Carteira' }, { v: 'favoritos', t: '⭐ Favoritos' },
] as const
type Filtro = (typeof FILTROS)[number]['v']

function Separador({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={ativo} onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${ativo
        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
        : 'bg-white text-slate-700 ring-1 ring-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'}`}>
      {children}
    </button>
  )
}

function EtiquetaTipo({ tipo }: { tipo: TipoEvento }) {
  const t = TIPOS[tipo]
  return <span className={`inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${t.cor}`}>{t.t}</span>
}

function Estado({ ev }: { ev: Evento }) {
  if (ev.tipo === 'recebido') return null
  return ev.confirmada
    ? <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400" title="Anunciada pela empresa">✓ confirmada</span>
    : <span className="text-xs text-slate-500" title="Calculada a partir da última data e da frequência habitual">≈ estimada</span>
}

function LinhaEvento({ ev, hoje }: { ev: Evento; hoje: string }) {
  const d = Number(ev.data.slice(8, 10))
  const futuro = ev.data >= hoje
  return (
    <li data-evento={ev.tipo} data-confirmada={ev.confirmada} className="flex items-start gap-3 py-2">
      <div className="w-11 shrink-0 text-center">
        <div className="text-lg font-bold leading-tight">{d}</div>
        <div className="text-[11px] text-slate-500">{diaSemana(ev.data)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <EtiquetaTipo tipo={ev.tipo} />
          <Link to={`/acao/${ev.ticker}`} className="font-semibold text-sky-700 dark:text-sky-400">{ev.ticker}</Link>
          {ev.na_carteira && <span title="Na carteira" aria-label="Na carteira">💼</span>}
          {ev.favorito && <span title="Favorito" aria-label="Favorito" className="text-amber-500">★</span>}
          <Estado ev={ev} />
        </div>
        <div className="truncate text-xs text-slate-500">
          {ev.nome}
          {futuro && ev.tipo !== 'recebido' && <> · {dias(diasEntre(hoje, ev.data))}</>}
        </div>
        {ev.tipo === 'ex' && futuro && (
          <div className="text-xs text-violet-800 dark:text-violet-300">
            {ev.na_carteira ? 'Já tem a ação: recebe este dividendo se não vender antes desta data.' : 'Para receber, compre antes desta data.'}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right text-sm">
        {ev.liquido_eur != null ? (
          <>
            <div className="font-semibold">{ev.tipo === 'recebido' ? '' : '≈ '}{euros(ev.liquido_eur)}</div>
            <div className="text-[11px] text-slate-500">líquido</div>
          </>
        ) : ev.por_acao != null ? (
          <>
            <div>{moeda(ev.por_acao, ev.moeda, 4)}</div>
            <div className="text-[11px] text-slate-500">por ação</div>
          </>
        ) : null}
      </div>
    </li>
  )
}

function ListaMes({ mes, evs, hoje, total }: { mes: string; evs: Evento[]; hoje: string; total?: { previsto: number; recebido: number } }) {
  return (
    <section data-mes={mes}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-1 dark:border-slate-800">
        <h3 className="font-semibold capitalize">{nomeMes(mes)}</h3>
        {total && (total.previsto > 0 || total.recebido > 0) && (
          <span className="text-xs text-slate-500">
            {total.recebido > 0 && <>recebido {euros(total.recebido)}</>}
            {total.recebido > 0 && total.previsto > 0 && ' · '}
            {total.previsto > 0 && <>previsto ≈ {euros(total.previsto)} líquido</>}
          </span>
        )}
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {evs.map((ev, i) => <LinhaEvento key={`${ev.ticker}-${ev.tipo}-${ev.data}-${i}`} ev={ev} hoje={hoje} />)}
      </ul>
    </section>
  )
}

function Grelha({ mes, evs, hoje }: { mes: string; evs: Evento[]; hoje: string }) {
  const porDia = useMemo(() => {
    const m: Record<string, Evento[]> = {}
    for (const ev of evs) (m[ev.data] ??= []).push(ev)
    return m
  }, [evs])
  return (
    <table data-grelha-mes className="w-full table-fixed border-collapse text-xs">
      <caption className="sr-only">Calendário de {nomeMes(mes)}</caption>
      <thead>
        <tr>{SEMANA.map(s => <th key={s} scope="col" className="pb-1 font-medium text-slate-500">{s}</th>)}</tr>
      </thead>
      <tbody>
        {grelhaMes(mes).map((semana, i) => (
          <tr key={i}>
            {semana.map((d, j) => {
              const lista = d ? porDia[d] ?? [] : []
              return (
                <td key={j} className={`h-16 border border-slate-100 p-0.5 align-top dark:border-slate-800 sm:h-20 ${d ? '' : 'bg-slate-50 dark:bg-slate-900/50'}`}>
                  {d && (
                    <>
                      <div className={`mb-0.5 text-right text-[11px] ${d === hoje ? 'font-bold text-sky-700 dark:text-sky-400' : 'text-slate-500'}`}>
                        {d === hoje ? <span className="rounded-full bg-sky-100 px-1 dark:bg-sky-950">{Number(d.slice(8))}</span> : Number(d.slice(8))}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {lista.slice(0, 3).map((ev, k) => (
                          <span key={k} title={`${TIPOS[ev.tipo].t}: ${ev.ticker}${ev.tipo !== 'recebido' ? (ev.confirmada ? ' (confirmada)' : ' (estimada)') : ''}`}
                            className={`truncate rounded px-0.5 text-[10px] leading-4 ${TIPOS[ev.tipo].cor} ${!ev.confirmada ? 'opacity-70 outline-1 outline-dashed outline-current' : ''}`}>
                            <span className="font-semibold">{TIPOS[ev.tipo].curto}</span> {ev.ticker.replace(/\.[A-Z]+$/, '')}
                          </span>
                        ))}
                        {lista.length > 3 && <span className="text-[10px] text-slate-500">+{lista.length - 3}</span>}
                      </div>
                    </>
                  )}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Calendario() {
  const { acoes, carteira, favoritos, params, hoje, aCarregar, erro } = useApp()
  const [url, setUrl] = useSearchParams()
  const vista = url.get('vista') === 'mes' ? 'mes' : 'lista'
  const mesAtual = mesDe(hoje)
  const mes = /^\d{4}-\d{2}$/.test(url.get('mes') ?? '') ? (url.get('mes') as string) : mesAtual
  const [filtro, setFiltro] = useState<Filtro>(() => {
    const f = ler<string>(K_FILTRO, 'todas')
    return FILTROS.some(x => x.v === f) ? (f as Filtro) : 'todas'
  })
  const mudar = (m: Record<string, string>) => {
    const n = new URLSearchParams(url)
    for (const [k, v] of Object.entries(m)) n.set(k, v)
    setUrl(n, { replace: true })
  }
  const mudarFiltro = (f: Filtro) => { gravar(K_FILTRO, f); setFiltro(f) }

  const { todos, semDatas } = useMemo(() => {
    const posicoes = calcularCarteira(carteira, acoes, params?.impostos)
    const quantidades = Object.fromEntries(posicoes.map(p => [p.ticker, p.quantidade]))
    const nomes = Object.fromEntries(posicoes.map(p => [p.ticker, p.nome]))
    const todos = eventos({ acoes, quantidades, favoritos, recebidos: pagamentos(carteira), nomes, hoje })
    const comDatas = new Set(todos.filter(e => e.data >= hoje).map(e => e.ticker))
    const daCarteira = posicoes.map(p => p.ticker)
    const escolhidos = filtro === 'carteira' ? daCarteira : filtro === 'favoritos' ? [...favoritos] : [...daCarteira, ...favoritos]
    const semDatas = [...new Set(escolhidos)].filter(t => !comDatas.has(t)).sort()
    return { todos, semDatas }
  }, [acoes, carteira, favoritos, params?.impostos, hoje, filtro])

  if (aCarregar) return <Carregando />
  if (erro) return <Erro texto={erro} />

  const visiveis = todos.filter(e => filtro === 'todas' || (filtro === 'carteira' ? e.na_carteira : e.favorito))
  const totais = totalPorMes(visiveis)
  const vazio = !carteira.length && !favoritos.size

  const proximos = visiveis.filter(e => e.data >= hoje && e.tipo !== 'recebido')
  const porMes: Record<string, Evento[]> = {}
  for (const ev of proximos) (porMes[mesDe(ev.data)] ??= []).push(ev)
  const doMes = visiveis.filter(e => mesDe(e.data) === mes)
  const limiteAtras = somarMeses(`${mesAtual}-01`, -12).slice(0, 7)
  const limiteFrente = somarMeses(`${mesAtual}-01`, 12).slice(0, 7)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Calendário</h1>
        <p className="text-sm text-slate-500">Datas ex-dividendo e de pagamento das ações da carteira e dos favoritos.</p>
      </div>

      <div data-lembrete-ex className="rounded-xl bg-violet-50 p-3 text-sm text-violet-950 ring-1 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-100 dark:ring-violet-900">
        💡 Para receber um dividendo, precisa de <b>ter a ação antes da data ex-dividendo</b> (comprar, no máximo, no dia útil anterior).
        Quem compra na própria data ex já não recebe esse pagamento. <b>✓ confirmada</b> = anunciada pela empresa;{' '}
        <b>≈ estimada</b> = calculada a partir da última data e da frequência habitual (pode mudar).
      </div>

      {vazio ? (
        <Cartao>
          <p className="text-sm">
            Ainda não há ações para mostrar. Marque ações como ⭐ favoritas no <Link to="/" className="text-sky-700 underline dark:text-sky-400">Radar</Link>{' '}
            ou importe o extrato na <Link to="/carteira" className="text-sky-700 underline dark:text-sky-400">Carteira</Link>.
          </p>
        </Cartao>
      ) : (
        <Cartao>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Que ações mostrar">
              {FILTROS.map(f => <Separador key={f.v} ativo={filtro === f.v} onClick={() => mudarFiltro(f.v)}>{f.t}</Separador>)}
            </div>
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm dark:bg-slate-800" role="tablist" aria-label="Vista">
              {[['lista', 'Lista'], ['mes', 'Mês']].map(([v, t]) => (
                <button key={v} type="button" role="tab" aria-selected={vista === v} onClick={() => mudar({ vista: v })}
                  className={`rounded-lg px-3 py-1.5 font-medium ${vista === v ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-600 dark:text-slate-300'}`}>{t}</button>
              ))}
            </div>
          </div>

          {vista === 'lista' ? (
            <div data-vista-lista className="space-y-5">
              {Object.keys(porMes).length === 0 && <p className="text-sm text-slate-500">Sem datas previstas nos próximos 12 meses.</p>}
              {Object.entries(porMes).map(([m, evs]) => <ListaMes key={m} mes={m} evs={evs} hoje={hoje} total={totais[m]} />)}
            </div>
          ) : (
            <div data-vista-mes className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => mudar({ mes: somarMeses(`${mes}-01`, -1).slice(0, 7) })} disabled={mes <= limiteAtras}
                  className="rounded-lg px-3 py-1.5 ring-1 ring-slate-300 disabled:opacity-40 dark:ring-slate-700" aria-label="Mês anterior">◀</button>
                <div className="text-center">
                  <div className="font-semibold capitalize">{nomeMes(mes)}</div>
                  {mes !== mesAtual && <button type="button" onClick={() => mudar({ mes: mesAtual })} className="text-xs text-sky-700 underline dark:text-sky-400">voltar a este mês</button>}
                </div>
                <button type="button" onClick={() => mudar({ mes: somarMeses(`${mes}-01`, 1).slice(0, 7) })} disabled={mes >= limiteFrente}
                  className="rounded-lg px-3 py-1.5 ring-1 ring-slate-300 disabled:opacity-40 dark:ring-slate-700" aria-label="Mês seguinte">▶</button>
              </div>
              <Grelha mes={mes} evs={doMes} hoje={hoje} />
              <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
                {(Object.keys(TIPOS) as TipoEvento[]).map(t => (
                  <span key={t} className="inline-flex items-center gap-1">
                    <span className={`rounded px-1 font-semibold ${TIPOS[t].cor}`}>{TIPOS[t].curto}</span> {TIPOS[t].t}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1">
                  <span className="rounded px-1 opacity-70 outline-1 outline-dashed">Ex</span> tracejado = estimada
                </span>
              </div>
              {doMes.length ? <ListaMes mes={mes} evs={doMes} hoje={hoje} total={totais[mes]} />
                : <p className="text-sm text-slate-500">Sem datas neste mês.</p>}
            </div>
          )}

          {semDatas.length > 0 && (
            <p data-sem-datas className="mt-4 text-xs text-slate-500">
              Sem datas previstas: {semDatas.join(', ')} (pagamentos irregulares, pouco histórico ou ação fora do radar).
            </p>
          )}
        </Cartao>
      )}
    </div>
  )
}
