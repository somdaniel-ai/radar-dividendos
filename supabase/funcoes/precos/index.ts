// Edge Function "precos" — preços atuais (Yahoo) das ações da carteira e dos favoritos.
//
// Como instalar: painel do Supabase → Edge Functions → Deploy a new function → Via Editor →
// nome "precos" → colar este ficheiro inteiro → Deploy. Nos Details da função, desligar
// "Verify JWT with legacy secret" (a verificação é feita aqui, em baixo).
// Segredo necessário (Edge Functions → Secrets): DONO_ID = o teu "User UID" (Authentication → Users).
//
// O que faz: recebe {"simbolos": ["KO", "VOD.L", "EURUSD=X", ...]} (no máximo 80), pede ao Yahoo
// a cotação de cada um e devolve {"precos": {"KO": {preco, moeda, anterior, hora}, ...}, "em": ...}.
// Não lê nem grava nada na base de dados e não usa nenhum segredo além do DONO_ID.
// Só responde ao dono da app (sessão iniciada) e só a pedidos vindos do endereço da app.

const ORIGEM = 'https://somdaniel-ai.github.io'
const SUPABASE_URL = 'https://mimdxffecbctnzhskjwh.supabase.co'
const CHAVE_PUBLICA = 'sb_publishable_UiTkJf1X_KLJgVceus7S5A_9d-RK3sy' // pública (é a mesma da app)
const MAXIMO = 80
const SIMBOLO = /^[A-Za-z0-9.\-^=]{1,24}$/

const cabecalhos = {
  'Access-Control-Allow-Origin': ORIGEM,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
}
const resposta = (corpo: unknown, estado = 200) =>
  new Response(JSON.stringify(corpo), { status: estado, headers: { ...cabecalhos, 'Content-Type': 'application/json' } })

/** Confirma que o pedido vem do dono da app (sessão do Supabase válida + id igual ao DONO_ID). */
async function eDono(req: Request): Promise<boolean> {
  const dono = Deno.env.get('DONO_ID')
  const auth = req.headers.get('Authorization') ?? ''
  if (!dono || !auth.startsWith('Bearer ')) return false
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: CHAVE_PUBLICA } })
  if (!r.ok) return false
  const u = await r.json()
  return u?.id === dono
}

async function cotacao(simbolo: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=1d&interval=1d`
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } })
  if (!r.ok) throw new Error(`Yahoo ${r.status}`)
  const m = (await r.json())?.chart?.result?.[0]?.meta
  if (!m || typeof m.regularMarketPrice !== 'number') throw new Error('sem preço')
  return {
    preco: m.regularMarketPrice as number,
    moeda: (m.currency ?? null) as string | null,
    anterior: (m.chartPreviousClose ?? m.previousClose ?? null) as number | null,
    hora: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecalhos })
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido' }, 405)
  const origem = req.headers.get('Origin')
  if (origem && origem !== ORIGEM) return resposta({ erro: 'Origem não permitida' }, 403)
  if (!(await eDono(req))) return resposta({ erro: 'Só o dono da app pode atualizar os preços.' }, 401)

  let simbolos: string[] = []
  try {
    const corpo = await req.json()
    simbolos = Array.isArray(corpo?.simbolos) ? corpo.simbolos : []
  } catch { /* corpo inválido → lista vazia */ }
  simbolos = [...new Set(simbolos.filter(s => typeof s === 'string' && SIMBOLO.test(s)))]
  if (!simbolos.length) return resposta({ erro: 'Sem símbolos válidos' }, 400)
  if (simbolos.length > MAXIMO) return resposta({ erro: `No máximo ${MAXIMO} símbolos de cada vez` }, 400)

  const precos: Record<string, unknown> = {}
  const falhados: string[] = []
  // de 8 em 8, para não carregar demasiado no Yahoo
  for (let i = 0; i < simbolos.length; i += 8) {
    const lote = simbolos.slice(i, i + 8)
    const r = await Promise.allSettled(lote.map(cotacao))
    r.forEach((x, j) => {
      if (x.status === 'fulfilled') precos[lote[j]] = x.value
      else falhados.push(lote[j])
    })
  }
  if (!Object.keys(precos).length) return resposta({ erro: 'O Yahoo não respondeu. Tenta mais tarde.', falhados }, 502)
  return resposta({ precos, falhados, em: new Date().toISOString() })
})
