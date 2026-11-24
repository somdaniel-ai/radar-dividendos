// Guarda pequenas coisas neste aparelho (localStorage).
// Na Fase 4, favoritos, notas e definições passam para o Supabase (sincronizados).

export function ler<T>(chave: string, padrao: T): T {
  try {
    const v = localStorage.getItem(chave)
    return v == null ? padrao : (JSON.parse(v) as T)
  } catch {
    return padrao
  }
}

export function gravar<T>(chave: string, valor: T): void {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
  } catch {
    /* modo privado ou sem espaço: ignora */
  }
}

export function apagar(chave: string): void {
  try {
    localStorage.removeItem(chave)
  } catch {
    /* ignora */
  }
}
