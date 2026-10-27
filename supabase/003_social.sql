-- Saveslot: camada social (amizades, chat, grupos, feed, reviews, troféus). Rode DEPOIS de schema.sql e 002_conectar_steam.sql.

-- ===== colunas novas =====
alter table public.profiles
  add column if not exists location text check (location is null or char_length(location) <= 60),
  add column if not exists show_activity boolean not null default true,
  add column if not exists show_friends boolean not null default true,
  add column if not exists allow_messages boolean not null default true,
  add column if not exists show_in_rankings boolean not null default true,
  add column if not exists notif_prefs jsonb not null default '{"friend":true,"message":true,"group":true,"like":true,"comment":true}';

alter table public.games
  add column if not exists description text,
  add column if not exists achievements_complete boolean not null default false;

alter table public.achievements
  add column if not exists api_name text,
  add column if not exists platform text,
  add column if not exists global_percent numeric(5,2) check (global_percent is null or global_percent between 0 and 100),
  add column if not exists is_dlc boolean not null default false,
  add column if not exists icon_url text;
create unique index if not exists achievements_game_api on public.achievements (game_id, api_name);
create unique index if not exists achievements_game_title on public.achievements (game_id, title);

alter table public.profile_games add column if not exists achievements_synced_at timestamptz;
alter table public.profile_games drop constraint if exists profile_games_source_check;
alter table public.profile_games add constraint profile_games_source_check check (source in ('manual', 'steam', 'demo'));

alter table public.linked_accounts add column if not exists is_demo boolean not null default false;

-- ===== configuração dos troféus (editável) =====
create table if not exists public.app_config (key text primary key, value text not null);
insert into public.app_config (key, value) values
  ('trophy_bronze_above', '40'), ('trophy_silver_min', '15'),
  ('points_bronze', '1'), ('points_silver', '3'), ('points_gold', '10'), ('points_platinum', '50'),
  ('level_step', '50'), ('dlc_counts_for_platinum', 'false'), ('site_percent_min_sample', '5')
on conflict (key) do nothing;

-- ===== tabelas =====
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
create unique index friendships_pair on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  actor_id uuid references public.profiles (id) on delete cascade,
  link text,
  text text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_profile on public.notifications (profile_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);
create index messages_pair on public.messages (sender_id, recipient_id, created_at desc);
create index messages_unread on public.messages (recipient_id) where read_at is null;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 60),
  description text check (char_length(description) <= 500),
  cover_url text,
  avatar_url text,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'moderator', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

create table public.group_invites (
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('invite', 'request')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

create table public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index group_messages_idx on public.group_messages (group_id, created_at desc);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  rating numeric(2,1) not null check (rating between 0.5 and 5 and rating * 2 = floor(rating * 2)),
  body text check (body is null or char_length(body) <= 5000),
  platform text check (platform is null or char_length(platform) <= 30),
  hours numeric(8,1) check (hours is null or hours >= 0),
  has_spoiler boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, profile_id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'achievement', 'platinum', 'review')),
  body text check (body is null or char_length(body) <= 2000),
  image_url text check (image_url is null or image_url ~ '^https://'),
  group_id uuid references public.groups (id) on delete cascade,
  game_id uuid references public.games (id) on delete set null,
  achievement_id uuid references public.achievements (id) on delete set null,
  review_id uuid references public.reviews (id) on delete set null,
  repost_of uuid references public.posts (id) on delete set null,
  platform text,
  created_at timestamptz not null default now(),
  check (kind <> 'text' or body is not null or image_url is not null or repost_of is not null)
);
create index posts_created on public.posts (created_at desc);
create index posts_group on public.posts (group_id, created_at desc);

create table public.likes (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'review')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, target_type, target_id)
);
create index likes_target on public.likes (target_type, target_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'review')),
  target_id uuid not null,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index comments_target on public.comments (target_type, target_id, created_at);

create table public.saves (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, post_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'review', 'comment', 'group_message', 'profile')),
  target_id uuid not null,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

create table public.diary_pins (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  item_key text not null check (char_length(item_key) <= 80),
  created_at timestamptz not null default now(),
  primary key (profile_id, item_key)
);

-- ===== funções auxiliares =====
create or replace function public.cfg(k text) returns text
language sql stable security definer set search_path = public as $$ select value from public.app_config where key = k $$;

create or replace function public.my_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where user_id = auth.uid() limit 1;
$$;

create or replace function public.pname(pid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(display_name, ''), username) from public.profiles where id = pid;
$$;

create or replace function public.puser(pid uuid) returns text
language sql stable security definer set search_path = public as $$ select username from public.profiles where id = pid; $$;

create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friendships where status = 'accepted'
    and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a)));
$$;

create or replace function public.allows_messages(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select allow_messages from public.profiles where id = pid), false);
$$;

create or replace function public.can_see_activity(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = pid and ((p.is_public and p.show_activity) or p.user_id = auth.uid()));
$$;

create or replace function public.group_role(gid uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.group_members where group_id = gid and profile_id = public.my_profile_id();
$$;

create or replace function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.group_role(gid) is not null; $$;

create or replace function public.is_public_group(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select visibility = 'public' from public.groups where id = gid), false);
$$;

create or replace function public.tier_for(pct numeric) returns text
language sql stable security definer set search_path = public as $$
  select case
    when pct is null then 'bronze'
    when pct > public.cfg('trophy_bronze_above')::numeric then 'bronze'
    when pct >= public.cfg('trophy_silver_min')::numeric then 'silver'
    else 'gold' end;
$$;

-- ===== views de troféus (tier calculado pela raridade) =====
create or replace view public.achievement_rarity as
select a.id as achievement_id, a.game_id,
  coalesce(a.global_percent, s.site_pct) as percent,
  case when a.global_percent is not null then 'platform' when s.site_pct is not null then 'site' else 'unknown' end as percent_source,
  public.tier_for(coalesce(a.global_percent, s.site_pct)) as tier
from public.achievements a
left join lateral (
  select round(100.0 * (select count(*) from public.profile_achievements pa where pa.achievement_id = a.id) / nullif(o.n, 0), 2) as site_pct
  from (select count(*) as n from public.profile_games pg where pg.game_id = a.game_id) o
  where o.n >= public.cfg('site_percent_min_sample')::int
) s on true;

-- Platina: 100% das conquistas do jogo base, só se a lista do jogo estiver completa
create or replace view public.profile_platinums_raw as
with totals as (
  select a.game_id, count(*) as total from public.achievements a
  where (not a.is_dlc or public.cfg('dlc_counts_for_platinum') = 'true') group by a.game_id
), got as (
  select pa.profile_id, a.game_id, count(*) as got, max(pa.unlocked_at) as last_at
  from public.profile_achievements pa join public.achievements a on a.id = pa.achievement_id
  where (not a.is_dlc or public.cfg('dlc_counts_for_platinum') = 'true') group by pa.profile_id, a.game_id
)
select g.profile_id, g.game_id, g.last_at as earned_at
from got g join totals t on t.game_id = g.game_id join public.games gm on gm.id = g.game_id
where gm.achievements_complete and t.total > 0 and g.got >= t.total;
revoke all on public.profile_platinums_raw from anon, authenticated;

create or replace view public.profile_platinums as
select r.profile_id, r.game_id, r.earned_at
from public.profile_platinums_raw r join public.profiles p on p.id = r.profile_id
where (p.is_public and p.show_achievements) or p.user_id = auth.uid();

create or replace view public.profile_stats as
select x.*, 1 + floor(x.points / public.cfg('level_step')::numeric)::int as level
from (
  select p.id as profile_id, p.show_in_rankings,
    coalesce(a.bronze, 0)::int as bronze, coalesce(a.silver, 0)::int as silver, coalesce(a.gold, 0)::int as gold,
    coalesce(pl.n, 0)::int as platinum,
    (coalesce(a.bronze, 0) * public.cfg('points_bronze')::int + coalesce(a.silver, 0) * public.cfg('points_silver')::int
     + coalesce(a.gold, 0) * public.cfg('points_gold')::int + coalesce(pl.n, 0) * public.cfg('points_platinum')::int)::int as points
  from public.profiles p
  left join (
    select t.profile_id, count(*) filter (where t.tier = 'bronze') as bronze, count(*) filter (where t.tier = 'silver') as silver,
           count(*) filter (where t.tier = 'gold') as gold
    from (select pa.profile_id, r.tier from public.profile_achievements pa join public.achievement_rarity r on r.achievement_id = pa.achievement_id) t
    group by t.profile_id
  ) a on a.profile_id = p.id
  left join (select profile_id, count(*) as n from public.profile_platinums_raw group by profile_id) pl on pl.profile_id = p.id
  where (p.is_public and p.show_achievements) or p.user_id = auth.uid()
) x;

create or replace view public.game_stats as
select g.id as game_id, g.title, g.cover_url, g.description, g.is_demo, g.created_at,
  (select round(avg(r.rating), 2) from public.reviews r where r.game_id = g.id) as avg_rating,
  (select count(*) from public.reviews r where r.game_id = g.id)::int as review_count,
  coalesce((select array_agg(distinct pg.platform) from public.profile_games pg where pg.game_id = g.id), '{}'::text[]) as platforms
from public.games g;

grant select on public.achievement_rarity, public.profile_platinums, public.profile_stats, public.game_stats to anon, authenticated;

-- ===== RLS =====
alter table public.app_config enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.notifications enable row level security;
alter table public.messages enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_messages enable row level security;
alter table public.reviews enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.saves enable row level security;
alter table public.reports enable row level security;
alter table public.diary_pins enable row level security;

create policy "config: leitura" on public.app_config for select using (true);

create policy "friendships: ver as minhas" on public.friendships for select
  using (requester_id = public.my_profile_id() or addressee_id = public.my_profile_id());
create policy "friendships: pedir" on public.friendships for insert to authenticated
  with check (requester_id = public.my_profile_id() and status = 'pending' and not public.is_blocked(requester_id, addressee_id));
create policy "friendships: responder" on public.friendships for update to authenticated
  using (addressee_id = public.my_profile_id()) with check (addressee_id = public.my_profile_id() and status in ('accepted', 'declined'));
create policy "friendships: remover" on public.friendships for delete to authenticated
  using (requester_id = public.my_profile_id() or addressee_id = public.my_profile_id());

create policy "blocks: ver os meus" on public.blocks for select using (blocker_id = public.my_profile_id());
create policy "blocks: bloquear" on public.blocks for insert to authenticated with check (blocker_id = public.my_profile_id());
create policy "blocks: desbloquear" on public.blocks for delete to authenticated using (blocker_id = public.my_profile_id());

create policy "notifications: ver" on public.notifications for select using (profile_id = public.my_profile_id());
create policy "notifications: marcar lida" on public.notifications for update to authenticated
  using (profile_id = public.my_profile_id()) with check (profile_id = public.my_profile_id());
create policy "notifications: apagar" on public.notifications for delete to authenticated using (profile_id = public.my_profile_id());

create policy "messages: ver as minhas" on public.messages for select
  using (sender_id = public.my_profile_id() or recipient_id = public.my_profile_id());
create policy "messages: enviar a amigos" on public.messages for insert to authenticated
  with check (sender_id = public.my_profile_id() and public.are_friends(sender_id, recipient_id)
    and not public.is_blocked(sender_id, recipient_id) and public.allows_messages(recipient_id));
create policy "messages: marcar lida" on public.messages for update to authenticated
  using (recipient_id = public.my_profile_id()) with check (recipient_id = public.my_profile_id());

create policy "groups: leitura" on public.groups for select using (true);
create policy "groups: admin edita" on public.groups for update to authenticated
  using (public.group_role(id) = 'admin') with check (public.group_role(id) = 'admin');
create policy "groups: admin encerra" on public.groups for delete to authenticated using (public.group_role(id) = 'admin');

create policy "group_members: leitura" on public.group_members for select
  using (public.is_group_member(group_id) or public.is_public_group(group_id));

create policy "group_invites: leitura" on public.group_invites for select
  using (profile_id = public.my_profile_id() or public.group_role(group_id) in ('admin', 'moderator'));

create policy "group_messages: leitura" on public.group_messages for select using (public.is_group_member(group_id));
create policy "group_messages: enviar" on public.group_messages for insert to authenticated
  with check (sender_id = public.my_profile_id() and public.is_group_member(group_id));
create policy "group_messages: apagar" on public.group_messages for delete to authenticated
  using (sender_id = public.my_profile_id() or public.group_role(group_id) in ('admin', 'moderator'));

create policy "reviews: leitura" on public.reviews for select
  using (profile_id = public.my_profile_id() or (public.can_see_activity(profile_id) and not public.is_blocked(profile_id, public.my_profile_id())));
create policy "reviews: criar" on public.reviews for insert to authenticated with check (profile_id = public.my_profile_id());
create policy "reviews: editar" on public.reviews for update to authenticated
  using (profile_id = public.my_profile_id()) with check (profile_id = public.my_profile_id());
create policy "reviews: apagar" on public.reviews for delete to authenticated using (profile_id = public.my_profile_id());

create policy "posts: leitura" on public.posts for select using (
  author_id = public.my_profile_id()
  or (group_id is null and public.can_see_activity(author_id) and not public.is_blocked(author_id, public.my_profile_id()))
  or (group_id is not null and (public.is_group_member(group_id) or public.is_public_group(group_id))
      and not public.is_blocked(author_id, public.my_profile_id())));
create policy "posts: criar" on public.posts for insert to authenticated
  with check (author_id = public.my_profile_id() and (group_id is null or public.is_group_member(group_id)));
create policy "posts: apagar" on public.posts for delete to authenticated
  using (author_id = public.my_profile_id() or (group_id is not null and public.group_role(group_id) in ('admin', 'moderator')));

create policy "likes: leitura" on public.likes for select using (
  case target_type when 'post' then exists (select 1 from public.posts p where p.id = target_id)
  else exists (select 1 from public.reviews r where r.id = target_id) end);
create policy "likes: curtir" on public.likes for insert to authenticated with check (
  profile_id = public.my_profile_id() and
  case target_type when 'post' then exists (select 1 from public.posts p where p.id = target_id)
  else exists (select 1 from public.reviews r where r.id = target_id) end);
create policy "likes: descurtir" on public.likes for delete to authenticated using (profile_id = public.my_profile_id());

create policy "comments: leitura" on public.comments for select using (
  case target_type when 'post' then exists (select 1 from public.posts p where p.id = target_id)
  else exists (select 1 from public.reviews r where r.id = target_id) end);
create policy "comments: comentar" on public.comments for insert to authenticated with check (
  author_id = public.my_profile_id() and
  case target_type when 'post' then exists (select 1 from public.posts p where p.id = target_id)
  else exists (select 1 from public.reviews r where r.id = target_id) end);
create policy "comments: apagar" on public.comments for delete to authenticated using (author_id = public.my_profile_id());

create policy "saves: meus" on public.saves for all to authenticated
  using (profile_id = public.my_profile_id()) with check (profile_id = public.my_profile_id());

create policy "reports: denunciar" on public.reports for insert to authenticated with check (reporter_id = public.my_profile_id());

create policy "pins: leitura" on public.diary_pins for select
  using (exists (select 1 from public.profiles p where p.id = profile_id and (p.is_public or p.user_id = auth.uid())));
create policy "pins: dono escreve" on public.diary_pins for all to authenticated
  using (profile_id = public.my_profile_id()) with check (profile_id = public.my_profile_id());

-- ===== notificações e regras (triggers) =====
create or replace function public.notify(p_to uuid, p_pref text, p_type text, p_actor uuid, p_link text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_to is null or p_to = p_actor then return; end if;
  if p_actor is not null and public.is_blocked(p_to, p_actor) then return; end if;
  if coalesce((select notif_prefs ->> p_pref from public.profiles where id = p_to), 'true') = 'false' then return; end if;
  insert into public.notifications (profile_id, type, actor_id, link, text) values (p_to, p_type, p_actor, p_link, p_text);
end $$;

create or replace function public.trg_friendship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.addressee_id, 'friend', 'friend_request', new.requester_id, '/amigos',
      public.pname(new.requester_id) || ' enviou uma solicitação de amizade');
  elsif new.status = 'accepted' and old.status <> 'accepted' then
    perform public.notify(new.requester_id, 'friend', 'friend_accepted', new.addressee_id, '/u/' || public.puser(new.addressee_id),
      public.pname(new.addressee_id) || ' aceitou sua solicitação de amizade');
  end if;
  return new;
end $$;
create trigger friendship_notify after insert or update on public.friendships for each row execute function public.trg_friendship();

create or replace function public.guard_friendship() returns trigger language plpgsql as $$
begin
  if new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id then raise exception 'Operação inválida.'; end if;
  return new;
end $$;
create trigger friendship_guard before update on public.friendships for each row execute function public.guard_friendship();

create or replace function public.trg_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships
  where (requester_id = new.blocker_id and addressee_id = new.blocked_id) or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
  return new;
end $$;
create trigger block_cleanup after insert on public.blocks for each row execute function public.trg_block();

create or replace function public.trg_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.notifications where profile_id = new.recipient_id and type = 'message' and actor_id = new.sender_id and read_at is null) then
    perform public.notify(new.recipient_id, 'message', 'message', new.sender_id, '/mensagens/' || public.puser(new.sender_id),
      'Nova mensagem de ' || public.pname(new.sender_id));
  end if;
  return new;
end $$;
create trigger message_notify after insert on public.messages for each row execute function public.trg_message();

create or replace function public.guard_message() returns trigger language plpgsql as $$
begin
  if new.sender_id <> old.sender_id or new.recipient_id <> old.recipient_id or new.body <> old.body or new.created_at <> old.created_at then
    raise exception 'Mensagens não podem ser editadas.';
  end if;
  return new;
end $$;
create trigger message_guard before update on public.messages for each row execute function public.guard_message();

create or replace function public.trg_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; lnk text; what text;
begin
  if new.target_type = 'post' then
    select author_id into owner from public.posts where id = new.target_id; lnk := '/post/' || new.target_id; what := 'sua publicação';
  else
    select profile_id, '/jogo/' || game_id into owner, lnk from public.reviews where id = new.target_id; what := 'seu review';
  end if;
  perform public.notify(owner, 'like', 'like', new.profile_id, lnk, public.pname(new.profile_id) || ' curtiu ' || what);
  return new;
end $$;
create trigger like_notify after insert on public.likes for each row execute function public.trg_like();

create or replace function public.trg_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; lnk text; what text;
begin
  if new.target_type = 'post' then
    select author_id into owner from public.posts where id = new.target_id; lnk := '/post/' || new.target_id; what := 'sua publicação';
  else
    select profile_id, '/jogo/' || game_id into owner, lnk from public.reviews where id = new.target_id; what := 'seu review';
  end if;
  perform public.notify(owner, 'comment', 'comment', new.author_id, lnk, public.pname(new.author_id) || ' comentou em ' || what);
  return new;
end $$;
create trigger comment_notify after insert on public.comments for each row execute function public.trg_comment();

create or replace function public.touch_review() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger review_touch before update on public.reviews for each row execute function public.touch_review();

-- Só dá para compartilhar conquista, Platina ou review que realmente existam no perfil de quem publica
create or replace function public.validate_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'achievement' and not exists (select 1 from public.profile_achievements pa where pa.profile_id = new.author_id and pa.achievement_id = new.achievement_id) then
    raise exception 'Você ainda não desbloqueou essa conquista.';
  end if;
  if new.kind = 'review' and not exists (select 1 from public.reviews r where r.id = new.review_id and r.profile_id = new.author_id) then
    raise exception 'Review não encontrado.';
  end if;
  if new.kind = 'platinum' and not exists (select 1 from public.profile_platinums_raw pp where pp.profile_id = new.author_id and pp.game_id = new.game_id) then
    raise exception 'Você ainda não tem a Platina desse jogo.';
  end if;
  return new;
end $$;
create trigger post_validate before insert on public.posts for each row execute function public.validate_post();

create or replace function public.limit_pins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.diary_pins where profile_id = new.profile_id) >= 3 then raise exception 'Você pode fixar no máximo 3 itens.'; end if;
  return new;
end $$;
create trigger pins_limit before insert on public.diary_pins for each row execute function public.limit_pins();

-- ===== funções chamadas pelo site =====
create or replace function public.profile_friends(pid uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select case when f.requester_id = pid then f.addressee_id else f.requester_id end
  from public.friendships f
  where f.status = 'accepted' and (f.requester_id = pid or f.addressee_id = pid)
    and (pid = public.my_profile_id() or exists (select 1 from public.profiles p where p.id = pid and p.is_public and p.show_friends));
$$;

create or replace function public.my_conversations() returns table (partner_id uuid, last_body text, last_at timestamptz, unread bigint)
language sql stable as $$
  with me as (select public.my_profile_id() as id),
  msgs as (
    select case when m.sender_id = me.id then m.recipient_id else m.sender_id end as partner_id,
           m.body, m.created_at, m.sender_id, m.read_at, me.id as me_id
    from public.messages m, me where m.sender_id = me.id or m.recipient_id = me.id)
  select partner_id, (array_agg(body order by created_at desc))[1], max(created_at),
         count(*) filter (where sender_id <> me_id and read_at is null)
  from msgs group by partner_id order by max(created_at) desc;
$$;

create or replace function public.create_group(p_name text, p_description text, p_visibility text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_profile_id(); gid uuid;
begin
  if me is null then raise exception 'Entre na sua conta.'; end if;
  insert into public.groups (name, description, visibility, created_by)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_visibility, me) returning id into gid;
  insert into public.group_members (group_id, profile_id, role) values (gid, me, 'admin');
  return gid;
end $$;

create or replace function public.join_group(gid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_profile_id(); vis text; gname text; a record;
begin
  if me is null then raise exception 'Entre na sua conta.'; end if;
  select visibility, name into vis, gname from public.groups where id = gid;
  if vis is null then raise exception 'Grupo não encontrado.'; end if;
  if exists (select 1 from public.group_members where group_id = gid and profile_id = me) then return 'member'; end if;
  if vis = 'public' or exists (select 1 from public.group_invites where group_id = gid and profile_id = me and kind = 'invite') then
    insert into public.group_members (group_id, profile_id) values (gid, me) on conflict do nothing;
    delete from public.group_invites where group_id = gid and profile_id = me;
    return 'joined';
  end if;
  insert into public.group_invites (group_id, profile_id, kind) values (gid, me, 'request') on conflict do nothing;
  for a in select profile_id from public.group_members where group_id = gid and role in ('admin', 'moderator') loop
    perform public.notify(a.profile_id, 'group', 'group_request', me, '/grupo/' || gid, public.pname(me) || ' pediu para entrar em ' || gname);
  end loop;
  return 'requested';
end $$;

create or replace function public.respond_group_request(gid uuid, pid uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r text := public.group_role(gid); gname text;
begin
  if r is null or r = 'member' then raise exception 'Sem permissão.'; end if;
  if not exists (select 1 from public.group_invites where group_id = gid and profile_id = pid and kind = 'request') then raise exception 'Solicitação não encontrada.'; end if;
  select name into gname from public.groups where id = gid;
  delete from public.group_invites where group_id = gid and profile_id = pid;
  if accept then
    insert into public.group_members (group_id, profile_id) values (gid, pid) on conflict do nothing;
    perform public.notify(pid, 'group', 'group_accepted', public.my_profile_id(), '/grupo/' || gid, 'Você entrou em ' || gname);
  end if;
end $$;

create or replace function public.invite_to_group(gid uuid, pid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r text := public.group_role(gid); me uuid := public.my_profile_id(); gname text;
begin
  if r is null or r = 'member' then raise exception 'Sem permissão.'; end if;
  if public.is_blocked(me, pid) then raise exception 'Não foi possível convidar essa pessoa.'; end if;
  if exists (select 1 from public.group_members where group_id = gid and profile_id = pid) then raise exception 'Essa pessoa já é membro.'; end if;
  select name into gname from public.groups where id = gid;
  insert into public.group_invites (group_id, profile_id, kind, invited_by) values (gid, pid, 'invite', me)
  on conflict (group_id, profile_id) do update set kind = 'invite', invited_by = me;
  perform public.notify(pid, 'group', 'group_invite', me, '/grupos', public.pname(me) || ' convidou você para ' || gname);
end $$;

create or replace function public.respond_invite(gid uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_profile_id();
begin
  if not exists (select 1 from public.group_invites where group_id = gid and profile_id = me and kind = 'invite') then raise exception 'Convite não encontrado.'; end if;
  delete from public.group_invites where group_id = gid and profile_id = me;
  if accept then insert into public.group_members (group_id, profile_id) values (gid, me) on conflict do nothing; end if;
end $$;

create or replace function public.leave_group(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_profile_id();
begin
  if public.group_role(gid) = 'admin' and not exists (select 1 from public.group_members where group_id = gid and role = 'admin' and profile_id <> me) then
    raise exception 'Promova outro administrador antes de sair, ou encerre o grupo.';
  end if;
  delete from public.group_members where group_id = gid and profile_id = me;
end $$;

create or replace function public.set_member_role(gid uuid, pid uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_profile_id();
begin
  if public.group_role(gid) <> 'admin' then raise exception 'Só administradores podem mudar papéis.'; end if;
  if new_role not in ('admin', 'moderator', 'member') then raise exception 'Papel inválido.'; end if;
  if pid = me and new_role <> 'admin' and not exists (select 1 from public.group_members where group_id = gid and role = 'admin' and profile_id <> me) then
    raise exception 'O grupo precisa de pelo menos um administrador.';
  end if;
  update public.group_members set role = new_role where group_id = gid and profile_id = pid;
end $$;

create or replace function public.remove_member(gid uuid, pid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r text := public.group_role(gid); target text;
begin
  select role into target from public.group_members where group_id = gid and profile_id = pid;
  if target is null then return; end if;
  if pid = public.my_profile_id() then raise exception 'Use "Sair do grupo".'; end if;
  if not (r = 'admin' or (r = 'moderator' and target = 'member')) then raise exception 'Sem permissão.'; end if;
  delete from public.group_members where group_id = gid and profile_id = pid;
end $$;

-- Adaptador de DEMONSTRAÇÃO: gera jogos e conquistas FICTÍCIOS para plataformas sem integração real
create or replace function public.connect_demo_platform(p_platform text) returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.my_profile_id(); plat text; gid uuid; aid uuid; gi int; k int; n int := 0;
  gtitles text[]; pcts numeric[] := array[62.0, 35.5, 18.2, 7.4, 2.1];
  atitles text[] := array['Primeiros passos', 'Explorador', 'Veterano', 'Lenda', 'Mestre absoluto'];
  unlock_count int;
begin
  if me is null then raise exception 'Entre na sua conta.'; end if;
  if p_platform not in ('playstation', 'xbox', 'nintendo', 'googleplay', 'epic', 'retroachievements') then raise exception 'Plataforma inválida.'; end if;
  plat := case p_platform when 'googleplay' then 'mobile' when 'epic' then 'pc' when 'retroachievements' then 'retro' else p_platform end;
  gtitles := array['Demo ' || p_platform || ': Vale Carmesim', 'Demo ' || p_platform || ': Rota Orbital'];

  delete from public.linked_accounts where profile_id = me and platform = p_platform and is_demo;
  insert into public.linked_accounts (profile_id, platform, username, is_demo) values (me, p_platform, 'conta-demo', true);

  for gi in 1..2 loop
    insert into public.games (title, is_demo, description, achievements_complete)
    values (gtitles[gi], true, 'Jogo fictício gerado pelo adaptador de demonstração.', true) on conflict ((lower(title))) do nothing;
    select id into gid from public.games where lower(title) = lower(gtitles[gi]);
    insert into public.profile_games (profile_id, game_id, platform, status, hours, source, last_played_at)
    values (me, gid, plat, case when gi = 1 then 'completed'::game_status else 'playing'::game_status end, 12.5 * gi, 'demo', current_date - gi)
    on conflict (profile_id, game_id) do nothing;
    unlock_count := case when gi = 1 then 5 else 3 end;
    for k in 1..5 loop
      insert into public.achievements (game_id, title, description, platform, global_percent)
      values (gid, atitles[k], 'Conquista fictícia de demonstração.', p_platform, pcts[k]) on conflict (game_id, title) do nothing;
      select id into aid from public.achievements where game_id = gid and title = atitles[k];
      if k <= unlock_count then
        insert into public.profile_achievements (profile_id, achievement_id, unlocked_at)
        values (me, aid, current_date - (gi * 10 - k * 2)) on conflict do nothing;
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end $$;

-- ===== tempo real =====
do $$ begin alter publication supabase_realtime add table public.messages; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.group_messages; exception when others then null; end $$;

-- Quem tem amizade ou pedido comigo pode ter o perfil carregado mesmo se for privado
create policy "profiles: amigos e pedidos" on public.profiles for select using (
  exists (select 1 from public.friendships f
    where (f.requester_id = public.my_profile_id() and f.addressee_id = profiles.id)
       or (f.addressee_id = public.my_profile_id() and f.requester_id = profiles.id)));
