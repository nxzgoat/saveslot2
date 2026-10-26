-- Conexão de contas (Steam). Rode no SQL Editor DEPOIS de schema.sql.
alter table public.games add column if not exists steam_appid integer unique;
alter table public.linked_accounts add column if not exists external_id text;
alter table public.linked_accounts add column if not exists verified boolean not null default false;
alter table public.linked_accounts add column if not exists last_synced_at timestamptz;
alter table public.profile_games add column if not exists source text not null default 'manual' check (source in ('manual', 'steam'));

create unique index if not exists linked_accounts_one_per_platform
  on public.linked_accounts (profile_id, platform) where external_id is not null;

-- O navegador nunca pode definir ID externo, selo de verificação nem data de sincronização:
-- só a Edge Function (service_role) escreve esses campos.
create or replace function public.protect_link_fields() returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      new.external_id := null; new.verified := false; new.last_synced_at := null;
    else
      new.external_id := old.external_id; new.verified := old.verified; new.last_synced_at := old.last_synced_at;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists protect_link_fields on public.linked_accounts;
create trigger protect_link_fields before insert or update on public.linked_accounts
  for each row execute function public.protect_link_fields();

create or replace function public.protect_game_fields() returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' then new.steam_appid := null; end if;
  return new;
end $$;

drop trigger if exists protect_game_fields on public.games;
create trigger protect_game_fields before insert on public.games
  for each row execute function public.protect_game_fields();
