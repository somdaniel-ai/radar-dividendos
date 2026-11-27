// Posição na página: ao abrir uma página nova começa no topo; ao voltar para trás (botão do
// browser / gesto do iPhone) volta exatamente à posição onde estava.
// Também tem ajuda para guardar filtros/pesquisas no endereço (assim o "voltar" repõe-nos).
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom'

const CHAVE = 'radar.posicoes'

function lerPosicoes(): Record<string, number> {
  try { return JSON.parse(sessionStorage.getItem(CHAVE) ?? '{}') } catch { return {} }
}
function gravarPosicao(chave: string, y: number) {
  try {
    const p = lerPosicoes()
    p[chave] = y
    // só as últimas 50 páginas
    const ks = Object.keys(p)
    for (const k of ks.slice(0, Math.max(0, ks.length - 50))) delete p[k]
    sessionStorage.setItem(CHAVE, JSON.stringify(p))
  } catch { /* modo privado: ignora */ }
}

export function usePosicaoPagina() {
  const local = useLocation()
  const tipo = useNavigationType()
  const atual = useRef(local.key)

  // o browser não deve tentar sozinho (com páginas que carregam aos poucos, falha)
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])

  // guarda a posição da página atual enquanto se anda nela
  useEffect(() => {
    atual.current = local.key
    // um filtro mudado (replace) dá uma "entrada" nova ao histórico: leva a posição consigo
    if (tipo === 'REPLACE') gravarPosicao(local.key, window.scrollY)
    let pendente = 0
    const aoMexer = () => {
      // a página e a posição são as do momento do scroll (não as do momento da gravação)
      const k = atual.current, y = window.scrollY
      cancelAnimationFrame(pendente)
      pendente = requestAnimationFrame(() => gravarPosicao(k, y))
    }
    window.addEventListener('scroll', aoMexer, { passive: true })
    return () => { window.removeEventListener('scroll', aoMexer); cancelAnimationFrame(pendente) }
  }, [local.key]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    // já é a página nova: o scroll que vem a seguir (topo, reposição) é desta página
    atual.current = local.key
    // mudanças só de filtros (replace) não mexem na posição
    if (tipo === 'REPLACE') return
    if (tipo === 'PUSH') { window.scrollTo(0, 0); return }
    // POP: repor; a página pode ainda estar a desenhar a lista → tenta durante ~2 s
    const y = lerPosicoes()[local.key]
    if (!y) return
    let tentativas = 0, t = 0
    const repor = () => {
      const cabe = document.documentElement.scrollHeight - window.innerHeight >= y - 2
      window.scrollTo(0, y)
      if (!cabe && ++tentativas < 40) t = window.setTimeout(repor, 50)
    }
    repor()
    return () => clearTimeout(t)
  }, [local.key]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Um valor guardado no endereço (ex.: ?q=reit). Mudar não cria passos no histórico. */
export function useParametroUrl(nome: string, padrao = ''): [string, (v: string) => void] {
  const [p, setP] = useSearchParams()
  const valor = p.get(nome) ?? padrao
  const mudar = useCallback((v: string) => setP(x => {
    const n = new URLSearchParams(x)
    if (v === padrao || v === '') n.delete(nome)
    else n.set(nome, v)
    return n
  }, { replace: true }), [setP, nome, padrao])
  return [valor, mudar]
}
