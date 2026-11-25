-- Radar de Dividendos — o motor de dados lê as decisões sobre extraordinários (Fase 4)
-- Colar no Supabase: SQL Editor → New query → colar tudo → Run.
-- Pode ser corrido mais do que uma vez sem estragar nada.
--
-- Acesso mínimo (sem usar a chave secreta do Supabase, que daria acesso a tudo):
--  * o motor só pode chamar UMA função, decisoes_motor(chave), que devolve apenas
--    ticker, data, decisão e parte extra — nunca a carteira, notas, favoritos ou definições;
--  * a função só responde a quem tiver a "chave do motor": um código aleatório gerado aqui
--    no Supabase, mostrado uma única vez e guardado pelo utilizador nos Secrets do GitHub;
--  * no Supabase fica só a "impressão digital" (SHA-256) do código, nunca o código em si,
--    numa tabela fora da API (esquema "privado", que o Supabase não expõe).

create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create table if not exists privado.chave_motor (
  id int primary key default 1 check (id = 1), -- só uma chave de cada vez
  hash text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  criada_em timestamptz not null default now()
);
revoke all on privado.chave_motor from public, anon, authenticated;

-- Gera uma chave nova (e invalida a anterior). Só pode ser corrida no SQL Editor do Supabase.
-- As decisões devolvidas são as da (única) conta do projeto.
create or replace function privado.nova_chave_motor()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  chave text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  dono uuid;
begin
  if (select count(*) from auth.users) <> 1 then
    raise exception 'Esperava exatamente 1 conta no projeto';
  end if;
  select id into dono from auth.users;
  insert into privado.chave_motor (id, hash, user_id)
  values (1, encode(sha256(convert_to(chave, 'UTF8')), 'hex'), dono)
  on conflict (id) do update set hash = excluded.hash, user_id = excluded.user_id, criada_em = now();
  return chave;
end $$;
revoke all on function privado.nova_chave_motor() from public, anon, authenticated;

-- O que o motor chama todas as noites (com a chave publicável + a chave do motor).
create or replace function public.decisoes_motor(chave text)
returns table (ticker text, data date, decisao text, valor_extra numeric)
language plpgsql
stable
security definer -- lê a tabela de decisões em nome do dono, mas só estas 4 colunas
set search_path = ''
as $$
declare dono uuid;
begin
  if chave is null or length(chave) <> 64 then
    raise exception 'chave inválida' using errcode = '28000';
  end if;
  select c.user_id into dono from privado.chave_motor c
   where c.id = 1 and c.hash = encode(sha256(convert_to(chave, 'UTF8')), 'hex');
  if dono is null then
    raise exception 'chave inválida' using errcode = '28000';
  end if;
  return query
    select d.ticker, d.data, d.decisao, d.valor_extra
      from public.extraordinarios_decisoes d
     where d.user_id = dono
     order by d.ticker, d.data;
end $$;
revoke all on function public.decisoes_motor(text) from public;
grant execute on function public.decisoes_motor(text) to anon;
