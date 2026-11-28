import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Carregando, Cartao, Erro, NOMES_CATEGORIA } from '../componentes/Comuns'
import { Suspeitos } from '../componentes/Suspeitos'
import { UniversoCartao } from '../componentes/UniversoCartao'
import { useApp, type Tema } from '../lib/contexto'
import { numero } from '../lib/formato'
import type { ImpostoPais, Parametros } from '../tipos'
import { EscolherColunas } from '../componentes/Colunas'
import { CartaoConta } from '../componentes/Conta'
import { CartaoCopia } from '../componentes/Copia'
import { useColunas } from '../lib/colunas'
import { ALERTAS_PADRAO, TIPOS_ALERTA } from '../lib/alertas'

type Tipo = 'pct' | 'num' | 'bool' | 'select' | 'hora'

function obter(obj: unknown, caminho: string): unknown {
  return caminho.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj)
}

const ler = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function CampoNumero({ valor, pct, onMudar, sufixo }: { valor: number; pct?: boolean; onMudar: (v: number) => void; sufixo?: string }) {
  const mostrar = (v: number) => numero(pct ? v * 100 : v, pct ? 2 : 2).replace(/,00$/, '').replace(/(,\d)0$/, '$1')
  const [texto, setTexto] = useState(mostrar(valor))
  useEffect(() => setTexto(mostrar(valor)), [valor]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className="inline-flex items-center gap-1">
      <input inputMode="decimal" value={texto} onChange={e => setTexto(e.target.value)}
        onBlur={() => { const n = ler(texto); if (n == null) setTexto(mostrar(valor)); else onMudar(pct ? n / 100 : n) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-base dark:border-slate-700 dark:bg-slate-950" />
      <span className="w-6 text-sm text-slate-500">{pct ? '%' : sufixo ?? ''}</span>
    </span>
  )
}

function Campo({ caminho, rotulo, tipo, ajuda, opcoes, sufixo }: {
  caminho: string; rotulo: string; tipo: Tipo; ajuda?: ReactNode; opcoes?: [string, string][]; sufixo?: string
}) {
  const { params, padrao, alterar } = useApp()
  const v = obter(params, caminho)
  const p = obter(padrao, caminho)
  const diferente = JSON.stringify(v) !== JSON.stringify(p)
  const textoPadrao = tipo === 'pct' ? `${numero((p as number) * 100, 2).replace(/,00$/, '')}%`
    : tipo === 'bool' ? (p ? 'sim' : 'não') : tipo === 'hora' ? String(p) : tipo === 'select' ? opcoes?.find(o => o[0] === p)?.[1] : String(p)
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
      <div className="min-w-0 flex-1">
        <label className="text-sm font-medium" htmlFor={caminho}>{rotulo}</label>
        {ajuda && <p className="text-xs text-slate-500">{ajuda}</p>}
        {diferente && (
          <button type="button" className="text-xs text-sky-700 underline dark:text-sky-400" onClick={() => alterar(caminho, p)}>
            repor ({textoPadrao})
          </button>
        )}
      </div>
      <div id={caminho} className="max-w-full">
        {tipo === 'bool' && (
          <input type="checkbox" className="size-5" checked={Boolean(v)} onChange={e => alterar(caminho, e.target.checked)} aria-label={rotulo} />
        )}
        {(tipo === 'pct' || tipo === 'num') && (
          <CampoNumero valor={v as number} pct={tipo === 'pct'} onMudar={n => alterar(caminho, n)} sufixo={sufixo} />
        )}
        {tipo === 'hora' && (
          <input type="time" value={String(v ?? '')} aria-label={rotulo} step={60}
            onChange={e => { if (/^\d{2}:\d{2}$/.test(e.target.value)) alterar(caminho, e.target.value) }}
            className="w-32 max-w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-base dark:border-slate-700 dark:bg-slate-950" />
        )}
        {tipo === 'select' && (
          <select value={String(v)} onChange={e => alterar(caminho, e.target.value)} aria-label={rotulo}
            className="max-w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950">
            {opcoes?.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}

function TabelaPaises() {
  const { params, alterar } = useApp()
  const [novo, setNovo] = useState('')
  if (!params) return null
  const paises = params.impostos.por_pais
  const mudar = (pais: string, campo: keyof ImpostoPais, valor: number | undefined) => {
    const linha = { ...paises[pais], [campo]: valor }
    if (valor === undefined) delete linha[campo]
    alterar('impostos.por_pais', { ...paises, [pais]: linha })
  }
  const remover = (pais: string) => {
    const c = { ...paises }
    delete c[pais]
    alterar('impostos.por_pais', c)
  }
  return (
    <div className="mt-2">
      <p className="mb-2 text-xs text-slate-500">
        Retenção = taxa retida no país de origem. Com W-8BEN = taxa retida se tiver o formulário W-8BEN (só EUA).
        Crédito máx. = máximo que Portugal desconta (taxa da convenção). Escreva o nome do país tal como aparece na app (ex.: "Estados Unidos", "Canadá", "França", "Países Baixos").
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr><th className="py-1">País</th><th className="py-1">Retenção</th><th className="py-1">Com W-8BEN</th><th className="py-1">Crédito máx.</th><th /></tr>
          </thead>
          <tbody>
            {Object.entries(paises).map(([pais, cfg]) => (
              <tr key={pais} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1 pr-2 font-medium">{pais}</td>
                <td className="py-1"><CampoNumero pct valor={cfg.retencao} onMudar={n => mudar(pais, 'retencao', n)} /></td>
                <td className="py-1">{cfg.retencao_w8ben !== undefined
                  ? <CampoNumero pct valor={cfg.retencao_w8ben} onMudar={n => mudar(pais, 'retencao_w8ben', n)} />
                  : <button type="button" className="text-xs text-sky-700 underline dark:text-sky-400" onClick={() => mudar(pais, 'retencao_w8ben', cfg.retencao)}>definir</button>}</td>
                <td className="py-1"><CampoNumero pct valor={cfg.credito_max ?? cfg.retencao} onMudar={n => mudar(pais, 'credito_max', n)} /></td>
                <td className="py-1"><button type="button" onClick={() => remover(pais)} className="text-red-600" aria-label={`Remover ${pais}`}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="mt-2 flex gap-2" onSubmit={e => {
        e.preventDefault()
        const n = novo.trim()
        if (n && !paises[n]) alterar('impostos.por_pais', { ...paises, [n]: { retencao: 0.15, credito_max: 0.15 } })
        setNovo('')
      }}>
        <input value={novo} onChange={e => setNovo(e.target.value)} placeholder="Acrescentar país (ex.: França)"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-base dark:border-slate-700 dark:bg-slate-950" />
        <button type="submit" className="rounded-lg bg-slate-900 px-3 py-1 text-sm text-white dark:bg-white dark:text-slate-900">Acrescentar</button>
      </form>
    </div>
  )
}

function CategoriasPayout() {
  const { params, alterar } = useApp()
  if (!params) return null
  const lista = params.pontuacao.armadilha_payout_ignorar_categorias
  return (
    <div className="border-b border-slate-100 py-2.5 dark:border-slate-800">
      <p className="text-sm font-medium">Ignorar o sinal de payout nestas categorias</p>
      <p className="text-xs text-slate-500">Nos REIT, BDC e fundos o lucro contabilístico não mostra bem o dinheiro disponível para distribuir.</p>
      <div className="mt-1 flex flex-wrap gap-3">
        {['EMPRESA', 'REIT', 'BDC', 'CEF', 'ETF'].map(c => (
          <label key={c} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" className="size-4" checked={lista.includes(c)}
              onChange={e => alterar('pontuacao.armadilha_payout_ignorar_categorias', e.target.checked ? [...lista, c] : lista.filter(x => x !== c))} />
            {NOMES_CATEGORIA[c]}
          </label>
        ))}
      </div>
    </div>
  )
}

/** Cada tipo de alerta: ligado para a carteira e/ou para os favoritos. */
function TiposAlerta() {
  const { params, padrao, alterar } = useApp()
  if (!params?.alertas) return null
  const a = params.alertas as unknown as Record<string, { carteira: boolean; favoritos: boolean }>
  const p = (padrao?.alertas ?? ALERTAS_PADRAO) as unknown as Record<string, { carteira: boolean; favoritos: boolean }>
  return (
    <table data-tipos-alerta className="mt-2 w-full table-fixed text-sm">
      <thead className="text-left text-xs text-slate-500">
        <tr><th className="py-1 font-normal">Alerta</th><th className="w-[4.5rem] text-center font-normal">💼<br />Carteira</th><th className="w-[4.5rem] text-center font-normal">⭐<br />Favoritos</th></tr>
      </thead>
      <tbody>
        {TIPOS_ALERTA.map(t => (
          <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800">
            <td className="py-2 pr-2 break-words">
              <div className="font-medium"><span aria-hidden>{t.emoji}</span> {t.nome}</div>
              <div className="text-xs text-slate-500">{t.ajuda}</div>
              {JSON.stringify(a[t.id]) !== JSON.stringify(p[t.id]) && (
                <button type="button" className="text-xs text-sky-700 underline dark:text-sky-400" onClick={() => alterar(`alertas.${t.id}`, p[t.id])}>repor</button>
              )}
            </td>
            {(['carteira', 'favoritos'] as const).map(onde => (
              <td key={onde} className="text-center">
                <input type="checkbox" className="size-5" checked={Boolean(a[t.id]?.[onde])}
                  aria-label={`${t.nome} — ${onde === 'carteira' ? 'carteira' : 'favoritos'}`}
                  onChange={e => alterar(`alertas.${t.id}.${onde}`, e.target.checked)} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SoLeitura({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-slate-800">
      <span className="text-slate-600 dark:text-slate-300">{rotulo}</span><span className="font-medium">{valor}</span>
    </div>
  )
}

export function Definicoes() {
  const { params, padrao, aCarregar, erro, repor, personalizado, tema, setTema, sessao } = useApp()
  const { hash } = useLocation()
  const colunas = useColunas()
  useEffect(() => {
    if (!aCarregar && hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [hash, aCarregar])
  if (erro) return <Erro texto={erro} />
  if (aCarregar || !params || !padrao) return <Carregando />
  const pf: Parametros['frequencia'] = padrao.frequencia
  const somaPesos = params.pontuacao.peso_rendimento + params.pontuacao.peso_consistencia + params.pontuacao.peso_preco

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Definições</h1>
          <p className="text-sm text-slate-500">As alterações aplicam-se logo a todo o radar. Ficam guardadas neste aparelho e, se entrar com o GitHub (cartão Conta), também na sua conta, iguais no PC e no iPhone.</p>
        </div>
        <button type="button" disabled={!personalizado}
          onClick={() => { if (confirm('Repor todos os valores por defeito?')) repor() }}
          className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">
          Repor valores por defeito
        </button>
      </div>

      <CartaoConta />

      <CartaoCopia />

      <Cartao titulo="Aparência">
        <div className="flex flex-wrap gap-2">
          {([['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']] as [Tema, string][]).map(([k, t]) => (
            <button key={k} type="button" aria-pressed={tema === k} onClick={() => setTema(k)}
              className={`rounded-full px-3 py-1 text-sm ${tema === k ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'ring-1 ring-slate-300 dark:ring-slate-700'}`}>{t}</button>
          ))}
        </div>
      </Cartao>

      <Cartao titulo={<span id="colunas">Colunas do Radar (PC)</span>}>
        <EscolherColunas {...colunas} />
      </Cartao>

      <Cartao titulo="Rendimento e impostos">
        <Campo caminho="rendimento.metodo_dividendo_anual" rotulo="Dividendo anual" tipo="select"
          opcoes={[['ultimo', 'Último dividendo × pagamentos/ano (como o Excel)'], ['ttm', 'Soma dos últimos 12 meses (TTM)']]} />
        <Campo caminho="impostos.modo" rotulo="Modo de impostos" tipo="select"
          opcoes={[['simples', 'Simples (taxa única)'], ['avancado', 'Avançado (por país + Portugal)']]} />
        {params.impostos.modo === 'simples' ? (
          <Campo caminho="impostos.taxa_simples" rotulo="Taxa única sobre os dividendos" tipo="pct" />
        ) : (
          <>
            <Campo caminho="impostos.taxa_portugal" rotulo="Imposto em Portugal" tipo="pct" />
            <Campo caminho="impostos.w8ben_ativo" rotulo="Tenho o formulário W-8BEN (EUA)" tipo="bool"
              ajuda="Com o W-8BEN os EUA retêm 15% em vez de 30%." />
            <TabelaPaises />
            <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
              Total = retenção + máx(0; imposto PT − mín(retenção; crédito máx.)). As taxas são exemplos: <b>confirme-as</b> (por exemplo, com um contabilista). Países sem taxa definida usam só o imposto português e aparecem com o aviso 🧾.
            </p>
          </>
        )}
      </Cartao>

      <Cartao titulo="Preço justo e intervalos">
        <Campo caminho="preco.yield_alvo" rotulo="Yield alvo (preço justo = dividendo anual ÷ yield alvo)" tipo="pct" />
        <Campo caminho="preco.limite_perto_minimo" rotulo="Destacar perto do mínimo (posição ≤)" tipo="pct" />
        <Campo caminho="preco.limite_perto_maximo" rotulo="Destacar perto do máximo (posição ≥)" tipo="pct" />
        <Campo caminho="preco.usar_precos_ajustados" rotulo="Usar máximos/mínimos ajustados" tipo="bool"
          ajuda="Ajustados = corrigidos pelos dividendos pagos (fator = preço ajustado ÷ preço)." />
        <Campo caminho="preco.anos_media_yield" rotulo="Anos para o yield habitual (preço justo histórico)" tipo="num" sufixo="anos"
          ajuda="Entre 2 e 10. Se a ação tiver menos histórico, usa-se o que houver (mínimo 2 anos)." />
        <Campo caminho="preco.preco_justo_pontuacao" rotulo="Preço justo usado no «preço atrativo» da pontuação" tipo="select"
          opcoes={[['historico', 'Histórico (yield habitual da ação)'], ['alvo', 'Com yield alvo']]}
          ajuda="Se o histórico não estiver disponível, usa-se o do yield alvo." />
      </Cartao>

      <Cartao titulo="Pagamentos atrasados">
        <Campo caminho="pagamentos.modo_atraso" rotulo="Considerar atrasado quando passar" tipo="select"
          opcoes={[['dias', 'Um nº fixo de dias'], ['percentagem', 'Uma % do intervalo normal']]} />
        {params.pagamentos.modo_atraso === 'dias'
          ? <Campo caminho="pagamentos.dias_atraso" rotulo="Dias de tolerância" tipo="num" sufixo="dias" />
          : <Campo caminho="pagamentos.percentagem_atraso" rotulo="Tolerância (% do intervalo normal)" tipo="pct" />}
      </Cartao>

      <Cartao titulo="Consistência e cores">
        <Campo caminho="consistencia.limite_corte" rotulo="Corte = descida anual superior a" tipo="pct" />
        <Campo caminho="consistencia.limite_aumento" rotulo="Aumento = subida anual superior a" tipo="pct" />
        <Campo caminho="consistencia.min_pagamentos_historico" rotulo="Mínimo de pagamentos (menos = pouco histórico)" tipo="num" />
        <Campo caminho="consistencia.nivel6_anos_sem_corte" rotulo="Dourado escuro: anos sem cortes ≥" tipo="num" />
        <Campo caminho="consistencia.nivel6_aumentos_em_10_anos" rotulo="Dourado escuro: aumentos nos últimos 10 anos ≥" tipo="num" />
        <Campo caminho="consistencia.nivel6_anos_seguidos_aumento" rotulo="Dourado escuro: ou anos seguidos de aumento ≥" tipo="num" />
        <Campo caminho="consistencia.nivel5_anos_sem_corte" rotulo="Dourado claro: anos sem cortes ≥" tipo="num" />
        <Campo caminho="consistencia.nivel4_anos_sem_corte" rotulo="Verde escuro: anos sem cortes ≥" tipo="num" />
        <Campo caminho="consistencia.nivel3_anos_sem_corte" rotulo="Verde médio: anos sem cortes ≥" tipo="num" />
        <Campo caminho="consistencia.nivel1_cortes_em_5_anos" rotulo="Verde muito claro: cortes em 5 anos ≥" tipo="num" />
      </Cartao>

      <Cartao titulo="Pontuação">
        <Campo caminho="pontuacao.peso_rendimento" rotulo="Peso do rendimento" tipo="pct" />
        <Campo caminho="pontuacao.peso_consistencia" rotulo="Peso da consistência" tipo="pct" />
        <Campo caminho="pontuacao.peso_preco" rotulo="Peso do preço atrativo" tipo="pct" />
        {Math.abs(somaPesos - 1) > 1e-6 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">Os pesos somam {numero(somaPesos * 100, 0)}% — a app usa-os na proporção (equivale a dividir pela soma).</p>
        )}
        <Campo caminho="pontuacao.batentes_ativos" rotulo="Batentes de yield ativos" tipo="bool" ajuda="Fora destes limites a ação é marcada e, por defeito, escondida no radar." />
        <Campo caminho="pontuacao.yield_minimo" rotulo="Yield líquido mínimo" tipo="pct" />
        <Campo caminho="pontuacao.yield_maximo" rotulo="Yield líquido máximo" tipo="pct" />
        <Campo caminho="pontuacao.desconto_para_nota_maxima" rotulo="Desconto face ao preço justo para nota máxima" tipo="pct" />
      </Cartao>

      <Cartao titulo="Armadilhas de rendimento">
        <Campo caminho="pontuacao.armadilhas_ativas" rotulo="Detetar armadilhas" tipo="bool" />
        <Campo caminho="pontuacao.penalizacao_por_armadilha" rotulo="Pontos retirados por cada sinal" tipo="num" sufixo="pts" />
        <Campo caminho="pontuacao.armadilha_yield_acima_maximo" rotulo="🔥 Yield acima do máximo" tipo="bool" />
        <Campo caminho="pontuacao.armadilha_payout" rotulo="💸 Payout acima do limite" tipo="bool" />
        <Campo caminho="pontuacao.armadilha_payout_limite" rotulo="Limite do payout" tipo="pct" />
        <CategoriasPayout />
        <Campo caminho="pontuacao.armadilha_queda_preco" rotulo="📉 Queda do preço em 12 meses" tipo="bool" />
        <Campo caminho="pontuacao.armadilha_queda_limite" rotulo="Queda superior a" tipo="pct" />
        <Campo caminho="pontuacao.armadilha_atraso" rotulo="⏰ Dividendo atrasado" tipo="bool" />
      </Cartao>

      <Suspeitos />

      <UniversoCartao />

      <Cartao titulo="Simulador">
        <Campo caminho="simulador.investimento_padrao" rotulo="Valor a investir por defeito" tipo="num" sufixo="€" ajuda="Usado no modo «Cada ação» do Simulador." />
      </Cartao>

      <Cartao titulo={<span id="meta">Meta de rendimento</span>}>
        <Campo caminho="meta.rendimento_mensal_padrao" rotulo="Rendimento mensal pretendido (por defeito)" tipo="num" sufixo="€" />
        <Campo caminho="meta.max_empresa" rotulo="Máximo por empresa" tipo="pct" ajuda="Ex.: 10% = pelo menos 10 empresas." />
        <Campo caminho="meta.max_setor" rotulo="Máximo por setor" tipo="pct" />
        <Campo caminho="meta.max_pais" rotulo="Máximo por país" tipo="pct" ajuda="100% = sem limite." />
        <Campo caminho="meta.nivel_minimo" rotulo="Nível de consistência mínimo" tipo="num"
          ajuda="6 = dourado escuro · 5 = dourado claro · 4 = verde escuro · 3 = verde médio · 2 = verde claro · 1 = verde muito claro · 0 = todos." />
        <Campo caminho="meta.excluir_armadilhas" rotulo="Excluir ações com sinais de armadilha" tipo="bool" />
        <Campo caminho="meta.so_favoritos" rotulo="Só favoritos" tipo="bool" ajuda="A proposta usa apenas as ações dos favoritos." />
      </Cartao>

      <Cartao titulo={<span id="alertas">Alertas</span>}>
        <p className="mb-1 text-xs text-slate-500">
          Para as ações da carteira e dos favoritos. O motor procura novidades todas as noites e junta-as numa só mensagem
          do Telegram por dia, à hora escolhida; aparecem também na página <Link to="/alertas" className="text-sky-700 underline dark:text-sky-400">🔔 Alertas</Link>.
          As mudanças valem a partir da noite seguinte{sessao ? '' : ' e só depois de entrar com o GitHub (as escolhas ficam na sua conta)'}.
        </p>
        <Campo caminho="alertas.telegram" rotulo="Enviar pelo Telegram" tipo="bool" />
        <Campo caminho="alertas.hora_envio" rotulo="Hora da mensagem diária (Lisboa)" tipo="hora"
          ajuda="Pode chegar alguns minutos depois (o GitHub às vezes atrasa as tarefas agendadas). Os alertas que aparecerem durante o dia esperam pela hora do dia seguinte." />
        <Campo caminho="alertas.valores_em_euros" rotulo="Mostrar valores em euros" tipo="bool"
          ajuda="Preços e dividendos em €, com a moeda original entre parênteses, e quanto vai receber nas ações da carteira. Desligado: só na moeda original e sem os valores da carteira." />
        <Campo caminho="alertas.yield_limite" rotulo="Limite do alerta «yield alto» (líquido)" tipo="pct" />
        <Campo caminho="alertas.falha_atualizacao" rotulo="Avisar quando a atualização noturna falhar" tipo="bool" />
        <TiposAlerta />
      </Cartao>

      <Cartao titulo="Motor de dados (só leitura)">
        <p className="mb-2 text-xs text-slate-500">
          Estes parâmetros são aplicados quando os dados são descarregados (todas as noites), porque precisam do histórico completo de cada ação.
          Para os alterar, peça-me para mudar <code>pipeline/radar/parametros.py</code>.
        </p>
        <SoLeitura rotulo="Excluir quem não paga há mais de" valor={`${padrao.universo.meses_sem_dividendo_para_excluir} meses`} />
        <SoLeitura rotulo="Intervalos usados na mediana (frequência)" valor={String(pf.num_intervalos_mediana)} />
        <SoLeitura rotulo="Mensal / Trimestral / Semestral / Anual (dias)"
          valor={['mensal', 'trimestral', 'semestral', 'anual'].map(k => pf.limites_dias[k].join('–')).join(' · ')} />
        <SoLeitura rotulo="Extraordinário se maior do que" valor={`${numero(pf.fator_extraordinario, 1)}× a mediana`} />
        <SoLeitura rotulo="Pagamentos a mais num ano contam como extra" valor={pf.extra_por_contagem ? 'sim' : 'não'} />
        <SoLeitura rotulo="Excluir extraordinários do rendimento normal" valor={pf.excluir_extraordinarios ? 'sim' : 'não'} />
        <SoLeitura rotulo="Tendência: variação até ±… conta como igual" valor={`${numero(padrao.pagamentos.tolerancia_igual * 100, 0)}%`} />
        <SoLeitura rotulo="Possível extraordinário: acima dos outros do ano" valor={`${numero(pf.suspeito_fator_no_ano, 1)}× a mediana`} />
        <SoLeitura rotulo="Possível extraordinário: salto seguido de descida" valor={`+${numero(pf.suspeito_salto * 100, 0)}% e depois −${numero(pf.suspeito_descida * 100, 0)}%`} />
        <SoLeitura rotulo="Procurar possíveis extraordinários nos últimos" valor={`${pf.suspeito_anos} anos`} />
      </Cartao>
    </div>
  )
}
