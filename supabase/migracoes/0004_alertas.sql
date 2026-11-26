-- Radar de Dividendos — alertas (Fase 6)
-- Colar no Supabase: SQL Editor → New query → colar tudo → Run.
-- Pode ser corrido mais do que uma vez sem estragar nada.
--
-- Como funciona:
--  * à noite, o motor pede a lista de ações da carteira (ticker + quantidade) e dos
--    favoritos, e as escolhas de alertas (alertas_motor); calcula as novidades e
--    guarda-as aqui (registar_alertas). O mesmo alerta nunca é guardado duas vezes;
--  * à hora escolhida (por defeito 08:30 de Lisboa), uma tarefa do GitHub lê os alertas
--    por enviar (alertas_por_enviar), manda UMA mensagem pelo Telegram e marca-os como
--    enviados (marcar_enviados);
--  * a app (com sessão iniciada) lê, marca como lidos e apaga os alertas — só os seus (RLS).
--
-- Acesso mínimo, como em 0002: as 4 funções do motor só respondem a quem tiver a "chave
-- do motor" e só devolvem/aceitam o que está escrito aqui. Nunca preços de compra,
-- valores investidos, notas, operações ou definições que não sejam as dos alertas.

-- ——— Tabela ———
create table if not exists public.alertas (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chave text not null check (length(chave) between 1 and 200), -- "impressão digital" do alerta
  tipo text not null check (tipo in ('abaixo_justo', 'dividendo_aumento', 'dividendo_corte', 'atrasado',
                                     'yield_alto', 'nova_ex', 'vespera_ex', 'falha', 'teste')),
  ticker text check (length(ticker) <= 40),
  titulo text not null check (length(titulo) <= 300),
  texto text not null default '' check (length(texto) <= 2000),
  criado_em timestamptz not null default now(),
  enviado_em timestamptz, -- quando foi enviado pelo Telegram (null = por enviar)
  lido boolean not null default false,
  primary key (user_id, chave)
);
create index if not exists alertas_por_enviar on public.alertas (user_id, criado_em) where enviado_em is null;

-- a app só pode ler, marcar como lido e apagar (os alertas são criados pelo motor)
alter table public.alertas enable row level security;
revoke all on public.alertas from anon, authenticated;
grant select, delete on public.alertas to authenticated;
grant update (lido) on public.alertas to authenticated;
drop policy if exists "só as minhas linhas" on public.alertas;
create policy "só as minhas linhas" on public.alertas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ——— Verificação da chave do motor (a mesma de 0002) ———
create or replace function privado.dono_motor(chave text)
returns uuid
language plpgsql
stable
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
  return dono;
end $$;
revoke all on function privado.dono_motor(text) from public, anon, authenticated;

-- ——— 1) O que o motor precisa de saber ———
-- {"favoritos": [tickers], "carteira": {ticker: quantidade}, "alertas": {escolhas},
--  "ultimo_envio": data/hora do último envio pelo Telegram}
create or replace function public.alertas_motor(chave text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare dono uuid := privado.dono_motor(chave);
begin
  return jsonb_build_object(
    'favoritos', coalesce((select jsonb_agg(f.ticker order by f.ticker) from public.favoritos f where f.user_id = dono), '[]'::jsonb),
    'carteira', coalesce((
      select jsonb_object_agg(q.ticker, q.quantidade)
        from (select t.ticker,
                     sum(case when t.tipo = 'compra' then t.quantidade else -t.quantidade end) as quantidade
                from public.transacoes t
               where t.user_id = dono and t.tipo in ('compra', 'venda')
                 and t.ticker is not null and t.quantidade is not null
               group by t.ticker) q
       where q.quantidade > 0.000000001), '{}'::jsonb),
    'alertas', coalesce((select d.dados #> '{parametros,alertas}' from public.definicoes d where d.user_id = dono), '{}'::jsonb),
    'ultimo_envio', (select max(a.enviado_em) from public.alertas a where a.user_id = dono)
  );
end $$;

-- ——— 2) Guardar alertas novos (os repetidos são ignorados) ———
-- itens = [{"chave", "tipo", "ticker", "titulo", "texto"}]; devolve quantos eram novos.
create or replace function public.registar_alertas(chave text, itens jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  dono uuid := privado.dono_motor(chave);
  n integer;
begin
  if jsonb_typeof(itens) <> 'array' or jsonb_array_length(itens) > 300 then
    raise exception 'lista de alertas inválida';
  end if;
  insert into public.alertas (user_id, chave, tipo, ticker, titulo, texto)
  select dono, x.chave, x.tipo, x.ticker, x.titulo, coalesce(x.texto, '')
    from jsonb_to_recordset(itens) as x(chave text, tipo text, ticker text, titulo text, texto text)
  on conflict on constraint alertas_pkey do nothing;
  get diagnostics n = row_count;
  -- arrumação: alertas com mais de 1 ano saem
  delete from public.alertas a where a.user_id = dono and a.criado_em < now() - interval '365 days';
  return n;
end $$;

-- ——— 3) Alertas por enviar (dos últimos 7 dias); "id" = a chave do alerta ———
create or replace function public.alertas_por_enviar(chave text)
returns table (id text, tipo text, ticker text, titulo text, texto text, criado_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare dono uuid := privado.dono_motor(chave);
begin
  return query
    select a.chave, a.tipo, a.ticker, a.titulo, a.texto, a.criado_em
      from public.alertas a
     where a.user_id = dono and a.enviado_em is null and a.criado_em > now() - interval '7 days'
     order by a.criado_em, a.chave;
end $$;

-- ——— 4) Marcar como enviados ———
create or replace function public.marcar_enviados(chave text, chaves text[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  dono uuid := privado.dono_motor(chave);
  n integer;
begin
  update public.alertas a set enviado_em = now()
   where a.user_id = dono and a.chave = any (chaves) and a.enviado_em is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- só o papel "anon" (o motor, com a chave publicável) pode chamar as funções do motor
do $$
declare f text;
begin
  foreach f in array array['public.alertas_motor(text)', 'public.registar_alertas(text, jsonb)',
                           'public.alertas_por_enviar(text)', 'public.marcar_enviados(text, text[])'] loop
    execute format('revoke all on function %s from public, authenticated', f);
    execute format('grant execute on function %s to anon', f);
  end loop;
end $$;
