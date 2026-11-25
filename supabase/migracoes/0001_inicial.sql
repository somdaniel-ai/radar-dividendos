-- Radar de Dividendos — tabelas pessoais (Fase 4)
-- Colar no Supabase: SQL Editor → New query → colar tudo → Run.
-- Pode ser corrido mais do que uma vez sem estragar nada.
--
-- Regras de segurança:
--  * cada tabela tem RLS (Row Level Security): cada utilizador só vê e altera as SUAS linhas;
--  * acesso dado explicitamente só ao papel "authenticated" (sessão iniciada);
--    o papel "anon" (visitantes sem sessão) não tem acesso a nenhuma tabela;
--  * user_id é preenchido automaticamente com o utilizador da sessão.

-- ——— Definições (um documento por utilizador: parâmetros ⚙️, colunas do Radar, tema…) ———
create table if not exists public.definicoes (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- ——— Favoritos ———
create table if not exists public.favoritos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker text not null check (length(ticker) between 1 and 40),
  criado_em timestamptz not null default now(),
  primary key (user_id, ticker)
);

-- ——— Notas por ação ———
create table if not exists public.notas (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker text not null check (length(ticker) between 1 and 40),
  texto text not null check (length(texto) <= 5000),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, ticker)
);

-- ——— Operações da carteira (extrato da XTB + compras manuais) ———
-- "id" = ID da XTB (sem duplicados ao reimportar) ou "manual-…"
create table if not exists public.transacoes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  tipo text not null check (tipo in ('compra', 'venda', 'dividendo', 'retencao', 'deposito',
                                     'levantamento', 'juro', 'imposto_juro', 'outro')),
  ticker text,
  nome text,
  data timestamptz not null,
  valor_eur numeric not null,
  quantidade numeric,
  preco numeric,
  moeda text,
  por_acao numeric,
  taxa numeric,
  corrige text,
  comentario text,
  tipo_original text,
  origem text not null check (origem in ('xtb', 'manual')),
  criado_em timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists transacoes_ticker on public.transacoes (user_id, ticker);

-- ——— Decisões sobre possíveis dividendos extraordinários ———
create table if not exists public.extraordinarios_decisoes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker text not null,
  data date not null,
  decisao text not null check (decisao in ('confirmar', 'rejeitar')),
  valor_extra numeric not null default 0,
  decidido_em timestamptz not null default now(),
  primary key (user_id, ticker, data)
);

-- ——— Segurança: RLS + acesso só para quem tem sessão iniciada ———
do $$
declare t text;
begin
  foreach t in array array['definicoes', 'favoritos', 'notas', 'transacoes', 'extraordinarios_decisoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "só as minhas linhas" on public.%I', t);
    execute format($p$create policy "só as minhas linhas" on public.%I for all to authenticated
                      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- ——— "Manter acordado": o plano gratuito pausa projetos parados durante 1 semana ———
-- A atualização noturna chama esta função (sem sessão) para mostrar atividade.
-- Não lê nem devolve dados de ninguém.
create or replace function public.ping()
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select 'ok'::text $$;
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
