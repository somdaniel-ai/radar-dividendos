// Ligação ao Supabase (dados pessoais: carteira, favoritos, notas, definições).
// Os valores vêm do config.json da raiz do repositório (o único sítio a mudar numa cópia da app).
// São PÚBLICOS por natureza (vão dentro da app que qualquer pessoa descarrega).
// A segurança vem das regras RLS das tabelas: cada utilizador só vê as suas linhas.
// NUNCA pôr no config.json a "secret key" / "service_role" nem a palavra-passe da base de dados.
declare const __CONFIG__: { site: string; repositorio: string; supabase_url: string; supabase_chave_publica: string }

export const SUPABASE_URL = __CONFIG__.supabase_url
export const SUPABASE_CHAVE_PUBLICA = __CONFIG__.supabase_chave_publica
export const SITE = __CONFIG__.site
export const REPOSITORIO = __CONFIG__.repositorio
