// Quando alguém sem autorização tenta entrar, o Supabase devolve-o à app com um erro no endereço
// (ex.: "Signups not allowed for this instance"). Sem isto a app abria o Radar sem dizer nada.
const CHAVE = 'radar.erro_entrada'

/** Chamado no arranque: guarda o erro, limpa o endereço e abre a Conta nas Definições. */
export function apanharErroEntrada() {
  if (typeof window === 'undefined') return
  // pode vir antes ou depois do "#" (o Supabase usa os dois, conforme o tipo de erro)
  const m = /[?#&/]error_description=([^&#]*)/.exec(window.location.search + window.location.hash)
  let d: string | null = null
  try { d = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null } catch { d = m?.[1] ?? null }
  if (!d) return
  try { sessionStorage.setItem(CHAVE, d) } catch { /* modo privado */ }
  window.history.replaceState(null, '', `${window.location.pathname}#/definicoes`)
}

/** O erro da última tentativa de entrar, em português (e apaga-o: só aparece uma vez). */
export function lerErroEntrada(): string | null {
  let d: string | null = null
  try { d = sessionStorage.getItem(CHAVE); sessionStorage.removeItem(CHAVE) } catch { return null }
  if (!d) return null
  return /signup|sign up|not allowed/i.test(d)
    ? 'Esta app não aceita contas novas: só o dono pode entrar. Pode continuar a usá-la sem conta.'
    : `Não foi possível entrar: ${d}`
}
