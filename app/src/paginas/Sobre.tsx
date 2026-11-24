import { Cartao, AVISO_LEGAL } from '../componentes/Comuns'
import { Legenda } from '../componentes/Nivel'
import { useApp } from '../lib/contexto'
import { dataHora } from '../lib/formato'

export function Sobre() {
  const { meta } = useApp()
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Sobre</h1>
      <Cartao>
        <p className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">{AVISO_LEGAL}</p>
        <p className="mt-3 text-sm">
          O Radar de Dividendos analisa ações e fundos disponíveis na XTB que pagam dividendos e ordena-os por uma
          pontuação de 0 a 100 que junta <b>rendimento</b>, <b>consistência</b> dos pagamentos e <b>preço atrativo</b>.
        </p>
        <p className="mt-2 text-sm">
          Os dados de mercado vêm do Yahoo Finance (que não é uma fonte oficial e pode ter erros) e são atualizados
          automaticamente. Confirme sempre a informação importante antes de investir.
        </p>
      </Cartao>

      <Cartao titulo="Como é calculado">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li><b>Yield bruto</b> = dividendo anual ÷ preço. <b>Yield líquido</b> = bruto × (1 − imposto).</li>
          <li><b>Dividendo anual</b> = último dividendo normal × pagamentos por ano (ou soma dos últimos 12 meses).</li>
          <li><b>Extraordinários</b> (dividendos especiais) ficam fora do rendimento normal e da consistência.</li>
          <li><b>Preço justo</b> = dividendo anual ÷ yield alvo (6% por defeito).</li>
          <li><b>Posição no intervalo</b>: 0% = no mínimo, 100% = no máximo (52 semanas, 5 anos, desde sempre).</li>
          <li><b>Possivelmente suspenso</b>: o pagamento esperado passou há mais do que a tolerância e não há nova data anunciada.</li>
          <li><b>Consistência</b>: contada por anos civis completos; o ano corrente não conta.</li>
          <li><b>Pontuação</b>: 50% rendimento + 35% consistência + 15% preço, menos pontos por cada sinal de armadilha.</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">Todos os valores podem ser alterados nas Definições.</p>
      </Cartao>

      <Cartao titulo="Cores de consistência"><Legenda /></Cartao>

      <Cartao titulo="Dados">
        <p className="text-sm">Última atualização: <b>{dataHora(meta?.gerado_em)}</b> ({meta?.tipo_atualizacao === 'parcial' ? 'parcial' : 'completa'}).</p>
        {meta && <p className="text-sm">{meta.total_radar} ações no radar de {meta.total_universo} analisadas.</p>}
        {meta && meta.erros.length > 0 && (
          <details className="mt-2 text-sm"><summary className="cursor-pointer">Ações com erro na última atualização ({meta.erros.length})</summary>
            <ul className="mt-1 list-disc pl-5">{meta.erros.map(e => <li key={e.ticker}>{e.ticker}: {e.erro}</li>)}</ul>
          </details>
        )}
        {meta && meta.sem_dividendos_recentes.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">Sem dividendos recentes (fora do radar): {meta.sem_dividendos_recentes.join(', ')}</p>
        )}
      </Cartao>
    </div>
  )
}
