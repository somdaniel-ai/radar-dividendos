import type { AcaoDetalhe } from '../tipos'
import { data, pct } from '../lib/formato'
import { BarrasPeso } from './Barras'
import { Cartao } from './Comuns'

/** ETF: custo anual (TER), 10 maiores posições e divisão por setor (dados do Yahoo, renovados todos os meses). */
export function ComposicaoEtf({ c }: { c: AcaoDetalhe['composicao'] }) {
  const ter = c?.ter != null && (
    <p className="text-sm" data-ter>Custo anual (TER): <b>{pct(c.ter, 2)}</b>
      <span className="text-xs text-slate-500"> · já descontado pelo fundo, não é cobrado à parte</span></p>
  )
  return (
    <Cartao titulo="Composição do ETF">
      <div data-composicao-etf className="space-y-4">
        {!c ? (
          <p className="text-sm text-slate-500">Ainda por obter: chega numa das próximas atualizações noturnas.</p>
        ) : !c.disponivel ? (
          <>
            {ter}
            <p className="text-sm text-slate-500" data-composicao-indisponivel>
              Composição indisponível: o Yahoo não tem estes dados para este ETF (acontece muito nos ETF europeus/UCITS).
            </p>
          </>
        ) : (
          <>
            {ter}
            {c.posicoes.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">{c.posicoes.length === 10 ? 'As 10 maiores posições' : 'Maiores posições'}
                  <span className="font-normal text-slate-500"> · {pct(c.posicoes.reduce((s, p) => s + p.peso, 0), 0)} do fundo</span></h3>
                <BarrasPeso nomesLongos rotulo="Maiores posições" linhas={c.posicoes.map(p => ({ nome: p.nome === p.simbolo ? p.nome : `${p.nome} (${p.simbolo})`, peso: p.peso }))} />
              </div>
            )}
            {c.setores.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Por setor</h3>
                <BarrasPeso rotulo="Divisão por setor" linhas={c.setores.map(s => ({ nome: s.setor, peso: s.peso }))} />
              </div>
            )}
            {c.posicoes.length === 0 && <p className="text-xs text-slate-500">O Yahoo não tem as maiores posições deste ETF, só os setores.</p>}
          </>
        )}
        {c && <p className="text-xs text-slate-500">Dados do Yahoo de {data(c.obtida_em.slice(0, 10))}, renovados uma vez por mês.</p>}
      </div>
    </Cartao>
  )
}
