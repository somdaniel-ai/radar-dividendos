// Ligação ao Supabase (dados pessoais: carteira, favoritos, notas, definições).
// Estes dois valores são PÚBLICOS por natureza (vão dentro da app que qualquer pessoa descarrega).
// A segurança vem das regras RLS das tabelas: cada utilizador só vê as suas linhas.
// NUNCA pôr aqui a "secret key" / "service_role" nem a palavra-passe da base de dados.
export const SUPABASE_URL = 'https://mimdxffecbctnzhskjwh.supabase.co'
export const SUPABASE_CHAVE_PUBLICA = 'sb_publishable_UiTkJf1X_KLJgVceus7S5A_9d-RK3sy'
