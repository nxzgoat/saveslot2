-- Catálogo real (IGDB) e importações PlayStation/Xbox. Rode DEPOIS de 003_social.sql.
alter table public.games
  add column if not exists igdb_id integer unique,
  add column if not exists release_date date,
  add column if not exists platform_names text[] not null default '{}',
  add column if not exists igdb_rating numeric(4,1),
  add column if not exists igdb_rating_count integer not null default 0;

alter table public.games drop constraint if exists games_cover_https;
alter table public.games add constraint games_cover_https check (cover_url is null or cover_url ~ '^https://') not valid;

alter table public.profile_games add column if not exists external_id text;
alter table public.profile_games drop constraint if exists profile_games_source_check;
alter table public.profile_games add constraint profile_games_source_check check (source in ('manual', 'steam', 'demo', 'psn', 'xbox'));
create index if not exists profile_games_external on public.profile_games (profile_id, external_id);

-- o navegador nunca define IDs externos de catálogo
create or replace function public.protect_game_fields() returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' then new.steam_appid := null; new.igdb_id := null; end if;
  return new;
end $$;

drop view if exists public.game_stats;
create view public.game_stats as
select g.id as game_id, g.title, g.cover_url, g.description, g.is_demo, g.created_at,
  g.igdb_id, g.release_date, g.platform_names, g.igdb_rating_count,
  (select round(avg(r.rating), 2) from public.reviews r where r.game_id = g.id) as avg_rating,
  (select count(*) from public.reviews r where r.game_id = g.id)::int as review_count,
  coalesce((select array_agg(distinct pg.platform) from public.profile_games pg where pg.game_id = g.id), '{}'::text[]) as platforms
from public.games g;
grant select on public.game_stats to anon, authenticated;
