-- Radar de Dividendos — cenários do simulador (Fase 5)
-- Colar no Supabase: SQL Editor → New query → colar tudo → Run.
-- Pode ser corrido mais do que uma vez sem estragar nada.
-- Mesmas regras de segurança da 0001: RLS, só "authenticated", cada conta só vê os seus.

create table if not exists public.cenarios (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (length(id) between 1 and 100),
  nome text not null check (length(nome) between 1 and 100),
  -- { "valor": 1000, "linhas": [ { "ticker": "KO.US", "pct": 50 }, … ] }
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.cenarios enable row level security;
revoke all on public.cenarios from anon, authenticated;
grant select, insert, update, delete on public.cenarios to authenticated;
drop policy if exists "só as minhas linhas" on public.cenarios;
create policy "só as minhas linhas" on public.cenarios for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
