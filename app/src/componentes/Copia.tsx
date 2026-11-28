import { useRef, useState } from 'react'
import { ler, gravar } from '../lib/armazenamento'
import { CHAVES_APARELHO, contar, criarCopia, lerCopia, nomeFicheiro, type Contagens, type Copia } from '../lib/copia'
import { useApp } from '../lib/contexto'
import { dataHora } from '../lib/formato'
import { Cartao } from './Comuns'

function Resumo({ c }: { c: Contagens }) {
  return (
    <>
      {c.posicoes} {c.posicoes === 1 ? 'ação' : 'ações'} na carteira ({c.operacoes} operações) · {c.favoritos} favoritos ·
      {' '}{c.notas} notas · {c.cenarios} cenários · {c.decisoes} decisões{c.definicoes ? ' · definições personalizadas' : ''}
    </>
  )
}

/** Cartão "Cópia de segurança" nas Definições: exportar e importar um ficheiro .json. */
export function CartaoCopia() {
  const { dadosPessoais, importarDados, sessao } = useApp()
  const entrada = useRef<HTMLInputElement>(null)
  const [aRever, setARever] = useState<Copia | null>(null)
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const exportar = () => {
    const aparelho = Object.fromEntries(CHAVES_APARELHO.map(k => [k, ler<unknown>(k, undefined)]).filter(([, v]) => v !== undefined))
    const copia = criarCopia(dadosPessoais(), aparelho)
    const url = URL.createObjectURL(new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = nomeFicheiro()
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    setMensagem({ tipo: 'ok', texto: `Cópia descarregada (${a.download}).` })
  }

  const escolher = async (f: File | undefined) => {
    if (!f) return
    setMensagem(null)
    const r = lerCopia(await f.text())
    if ('erro' in r) setMensagem({ tipo: 'erro', texto: r.erro })
    else setARever(r.copia)
    if (entrada.current) entrada.current.value = ''
  }

  const confirmar = () => {
    if (!aRever) return
    importarDados(aRever.dados)
    for (const [k, v] of Object.entries(aRever.aparelho)) gravar(k, v)
    setARever(null)
    setMensagem({ tipo: 'ok', texto: sessao ? 'Cópia reposta. A enviar para a conta…' : 'Cópia reposta.' })
  }

  return (
    <Cartao titulo={<span id="copia">Cópia de segurança</span>}>
      <div data-copia className="space-y-3 text-sm">
        <p>
          Guarde num ficheiro a carteira, os favoritos, as notas, as definições e os cenários. Serve para os passar para outro
          aparelho ou para os recuperar se o browser apagar os dados.
        </p>
        <p className="text-xs text-slate-500">
          ⚠️ O ficheiro tem os seus dados pessoais em texto legível (sem senha). Guarde-o num sítio seguro e não o partilhe.
          Não leva a sessão nem senhas.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportar} data-exportar
            className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white dark:bg-white dark:text-slate-900">Exportar cópia</button>
          <button type="button" onClick={() => entrada.current?.click()} data-importar
            className="rounded-lg px-4 py-2 font-medium ring-1 ring-slate-300 dark:ring-slate-700">Importar cópia…</button>
          <input ref={entrada} type="file" accept=".json,application/json" className="hidden" aria-label="Ficheiro da cópia de segurança"
            onChange={e => void escolher(e.target.files?.[0])} />
        </div>

        {aRever && (
          <div data-rever-copia className="space-y-2 rounded-xl bg-amber-50 p-3 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
            <p><b>Repor esta cópia?</b> {aRever.exportada_em && <>Feita em {dataHora(aRever.exportada_em)}.</>}</p>
            <p><span className="font-medium">Na cópia:</span> <Resumo c={contar(aRever.dados)} /></p>
            <p><span className="font-medium">Agora{sessao ? ' (neste aparelho e na conta)' : ' (neste aparelho)'}:</span> <Resumo c={contar(dadosPessoais())} /></p>
            <p>O que tem agora é <b>substituído</b> pelo que está na cópia (o que não estiver nela é apagado).</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={confirmar} data-confirmar-copia
                className="rounded-lg bg-amber-700 px-4 py-2 font-medium text-white">Sim, repor</button>
              <button type="button" onClick={() => setARever(null)} className="rounded-lg px-4 py-2 font-medium ring-1 ring-amber-300 dark:ring-amber-800">Cancelar</button>
            </div>
          </div>
        )}
        {mensagem && (
          <p role={mensagem.tipo === 'erro' ? 'alert' : 'status'} data-mensagem-copia
            className={mensagem.tipo === 'erro' ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}>{mensagem.texto}</p>
        )}
      </div>
    </Cartao>
  )
}
