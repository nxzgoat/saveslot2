-- Saveslot: esquema, RLS e storage. Rode no SQL Editor do Supabase (ou via CLI).
create extension if not exists pgcrypto;

create type game_status as enum ('playing', 'completed', 'backlog', 'dropped');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete cascade, -- nulo = perfil de demonstração
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 40),
  bio text check (char_length(bio) <= 500),
  avatar_url text,
  banner_url text,
  is_public boolean not null default true,
  show_library boolean not null default true,
  show_achievements boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  cover_url text,
  created_by uuid references auth.users (id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index games_title_lower on public.games (lower(title));

create table public.profile_games (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  platform text not null check (platform in ('steam','playstation','xbox','nintendo','pc','mobile','retro','other')),
  status game_status not null default 'playing',
  hours numeric(8,1) check (hours >= 0 and hours < 100000),
  rating smallint check (rating between 1 and 10),
  is_favorite boolean not null default false,
  last_played_at date,
  primary key (profile_id, game_id)
);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  title text not null,
  description text
);

create table public.profile_achievements (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  unlocked_at date,
  primary key (profile_id, achievement_id)
);

create table public.linked_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (char_length(platform) <= 30),
  username text check (char_length(username) <= 60),
  url text check (url is null or url ~ '^https?://'),
  created_at timestamptz not null default now()
);

-- Cria o perfil automaticamente quando alguém se cadastra
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text := lower(coalesce(new.raw_user_meta_data ->> 'username', 'user_' || substr(new.id::text, 1, 8)));
begin
  insert into public.profiles (user_id, username, display_name) values (new.id, uname, uname);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.owns_profile(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = pid and user_id = auth.uid());
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.profile_games enable row level security;
alter table public.achievements enable row level security;
alter table public.profile_achievements enable row level security;
alter table public.linked_accounts enable row level security;

create policy "profiles: leitura" on public.profiles for select using (is_public or user_id = auth.uid());
create policy "profiles: dono edita" on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "profiles: dono apaga" on public.profiles for delete using (user_id = auth.uid());

create policy "games: leitura" on public.games for select using (true);
create policy "games: logado cria" on public.games for insert to authenticated with check (created_by = auth.uid() and is_demo = false);

create policy "profile_games: leitura" on public.profile_games for select using (
  exists (select 1 from public.profiles p where p.id = profile_id and ((p.is_public and p.show_library) or p.user_id = auth.uid())));
create policy "profile_games: dono insere" on public.profile_games for insert to authenticated with check (public.owns_profile(profile_id));
create policy "profile_games: dono edita" on public.profile_games for update to authenticated using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));
create policy "profile_games: dono apaga" on public.profile_games for delete to authenticated using (public.owns_profile(profile_id));

create policy "achievements: leitura" on public.achievements for select using (true);

create policy "profile_achievements: leitura" on public.profile_achievements for select using (
  exists (select 1 from public.profiles p where p.id = profile_id and ((p.is_public and p.show_achievements) or p.user_id = auth.uid())));
create policy "profile_achievements: dono escreve" on public.profile_achievements for all to authenticated
  using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));

create policy "linked_accounts: leitura" on public.linked_accounts for select using (
  exists (select 1 from public.profiles p where p.id = profile_id and (p.is_public or p.user_id = auth.uid())));
create policy "linked_accounts: dono escreve" on public.linked_accounts for all to authenticated
  using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));

-- Storage: avatares e banners (pasta = id do usuário)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy "media: leitura" on storage.objects for select using (bucket_id = 'media');
create policy "media: dono envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media: dono troca" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media: dono apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
