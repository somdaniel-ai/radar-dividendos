// Cliente do Supabase (login com GitHub). Só é carregado quando é preciso.
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_CHAVE_PUBLICA, SUPABASE_URL } from './config'

let cliente: Promise<SupabaseClient> | null = null

export function obterCliente(): Promise<SupabaseClient> {
  cliente ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'radar.sessao' },
  }))
  return cliente
}

/** Endereço para onde o GitHub/Supabase devolve o utilizador depois do login (sem o "#/…"). */
export function enderecoRegresso(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}

/** Há uma sessão guardada (ou um regresso do login) — vale a pena carregar o cliente logo? */
export function haSessaoGuardada(): boolean {
  try {
    return !!localStorage.getItem('radar.sessao') || /[?&]code=/.test(window.location.search)
  } catch {
    return false
  }
}
