-- Rode este arquivo UMA vez no Supabase: SQL Editor > New query > Run.

create table if not exists public.dados_grupo (
  user_id uuid primary key references auth.users(id) on delete cascade,
  estado jsonb not null default '{"pessoas":[],"itens":[]}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- Segurança: cada grupo só enxerga e altera a PRÓPRIA linha.
alter table public.dados_grupo enable row level security;

create policy "grupo le os proprios dados" on public.dados_grupo
  for select to authenticated using (auth.uid() = user_id);

create policy "grupo cria os proprios dados" on public.dados_grupo
  for insert to authenticated with check (auth.uid() = user_id);

create policy "grupo atualiza os proprios dados" on public.dados_grupo
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
