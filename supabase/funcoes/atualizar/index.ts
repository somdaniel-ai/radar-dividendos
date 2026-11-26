// Edge Function "atualizar" — pede ao GitHub uma atualização completa dos dados ("Publicar app").
//
// Como instalar: painel do Supabase → Edge Functions → Deploy a new function → Via Editor →
// nome "atualizar" → colar este ficheiro inteiro → Deploy. Nos Details da função, desligar
// "Verify JWT with legacy secret" (a verificação é feita aqui, em baixo).
// Segredos necessários (Edge Functions → Secrets):
//   DONO_ID                 = o teu "User UID" (Authentication → Users)
//   GITHUB_TOKEN_ATUALIZAR  = token "fine-grained" do GitHub, só do repositório radar-dividendos
//                             e só com a permissão "Actions: Read and write"
//
// Pedidos (POST, só do dono da app, só do endereço da app):
//   {"acao": "estado"} → última execução do "Publicar app" + validade do token
//   {"acao": "lancar"} → lança uma atualização de 30 minutos, se não houver nenhuma a correr

const ORIGEM = 'https://somdaniel-ai.github.io'
const SUPABASE_URL = 'https://mimdxffecbctnzhskjwh.supabase.co'
const CHAVE_PUBLICA = 'sb_publishable_UiTkJf1X_KLJgVceus7S5A_9d-RK3sy' // pública (é a mesma da app)
const REPO = 'somdaniel-ai/radar-dividendos'
const WORKFLOW = 'publicar.yml'
const MINUTOS = '30'

const cabecalhos = {
  'Access-Control-Allow-Origin': ORIGEM,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
}
const resposta = (corpo: unknown, estado = 200) =>
  new Response(JSON.stringify(corpo), { status: estado, headers: { ...cabecalhos, 'Content-Type': 'application/json' } })

async function eDono(req: Request): Promise<boolean> {
  const dono = Deno.env.get('DONO_ID')
  const auth = req.headers.get('Authorization') ?? ''
  if (!dono || !auth.startsWith('Bearer ')) return false
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: CHAVE_PUBLICA } })
  if (!r.ok) return false
  const u = await r.json()
  return u?.id === dono
}

let validade: string | null = null

async function github(caminho: string, init: RequestInit = {}) {
  const token = Deno.env.get('GITHUB_TOKEN_ATUALIZAR')
  if (!token) throw new Error('Falta o segredo GITHUB_TOKEN_ATUALIZAR no Supabase.')
  const r = await fetch(`https://api.github.com/repos/${REPO}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'radar-dividendos',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  validade = r.headers.get('github-authentication-token-expiration') ?? validade
  if (r.status === 401) throw new Error('O token do GitHub foi recusado (expirou ou foi apagado). Cria um novo.')
  if (r.status === 403 || r.status === 404) throw new Error('O token do GitHub não tem acesso às Actions do repositório.')
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`)
  return r.status === 204 ? null : await r.json()
}

interface Execucao { id: number; status: string; conclusion: string | null; event: string; created_at: string; updated_at: string; run_started_at?: string }
const resumo = (e: Execucao | undefined) => e && {
  id: e.id, estado: e.status, resultado: e.conclusion, origem: e.event,
  criada_em: e.created_at, iniciada_em: e.run_started_at ?? e.created_at, atualizada_em: e.updated_at,
}

async function ultimas() {
  const d = await github(`/actions/workflows/${WORKFLOW}/runs?per_page=10&exclude_pull_requests=true`)
  return (d?.workflow_runs ?? []) as Execucao[]
}
const aCorrer = (xs: Execucao[]) => xs.find(e => e.status !== 'completed')

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecalhos })
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido' }, 405)
  const origem = req.headers.get('Origin')
  if (origem && origem !== ORIGEM) return resposta({ erro: 'Origem não permitida' }, 403)
  if (!(await eDono(req))) return resposta({ erro: 'Só o dono da app pode pedir atualizações.' }, 401)

  let acao = 'estado'
  try { acao = (await req.json())?.acao ?? 'estado' } catch { /* sem corpo → estado */ }

  try {
    let xs = await ultimas()
    if (acao === 'lancar') {
      const atual = aCorrer(xs)
      if (atual) return resposta({ lancada: false, motivo: 'Já há uma atualização a correr.', ultima: resumo(atual), validade_token: validade })
      await github(`/actions/workflows/${WORKFLOW}/dispatches`, {
        method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { minutos: MINUTOS } }),
      })
      // o GitHub demora 1–3 s a criar a execução
      for (let i = 0; i < 4; i++) {
        await new Promise(r => setTimeout(r, 1500))
        xs = await ultimas()
        if (aCorrer(xs)) break
      }
      return resposta({ lancada: true, ultima: resumo(aCorrer(xs) ?? xs[0]), validade_token: validade })
    }
    return resposta({ ultima: resumo(xs[0]), a_correr: !!aCorrer(xs), validade_token: validade })
  } catch (e) {
    return resposta({ erro: e instanceof Error ? e.message : String(e), validade_token: validade }, 502)
  }
})
