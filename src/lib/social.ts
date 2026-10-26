import { supabase } from './supabase';
import type {
  AppNotification, DiaryItem, Friendship, Game, GameLite, GameStat, Group, GroupMember, GroupMessage, Message, Post, PostKind,
  Profile, ProfileStats, Rarity, Review, Tier,
} from './types';

type Res = PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function rows<T>(q: Res): Promise<T[]> {
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T[];
}
async function one<T>(q: Res): Promise<T | null> {
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? null) as T | null;
}
async function run(q: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const r = await q;
  if (r.error) throw new Error(r.error.message);
}
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const r = await supabase.rpc(fn, args);
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
const chunk = <T,>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const uniq = <T,>(a: (T | null | undefined)[]): T[] => [...new Set(a.filter((x): x is T => x != null))];
const clean = (q: string) => q.trim().replace(/[%_\\]/g, (m) => '\\' + m);

async function byIds<T>(table: string, col: string, ids: string[], select = '*'): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunk(ids, 100)) out.push(...(await rows<T>(supabase.from(table).select(select).in(col, part))));
  return out;
}

export const profilesByIds = (ids: string[]) => byIds<Profile>('profiles', 'id', ids);
export const gamesByIds = (ids: string[]) => byIds<GameLite>('games', 'id', ids, 'id,title,cover_url');

// ===== amizades e bloqueios =====
export const getFriendship = (me: string, other: string) =>
  one<Friendship>(
    supabase.from('friendships').select('*')
      .or(`and(requester_id.eq.${me},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${me})`).maybeSingle(),
  );
export const myFriendships = (me: string) =>
  rows<Friendship>(supabase.from('friendships').select('*').or(`requester_id.eq.${me},addressee_id.eq.${me}`).order('created_at', { ascending: false }));
export const sendFriendRequest = (me: string, other: string) => run(supabase.from('friendships').insert({ requester_id: me, addressee_id: other }));
export const respondFriendRequest = (id: string, accept: boolean) =>
  run(supabase.from('friendships').update({ status: accept ? 'accepted' : 'declined' }).eq('id', id));
export const deleteFriendship = (id: string) => run(supabase.from('friendships').delete().eq('id', id));
export const iBlocked = async (me: string, other: string) =>
  Boolean(await one(supabase.from('blocks').select('blocked_id').eq('blocker_id', me).eq('blocked_id', other).maybeSingle()));
export const myBlocks = async (me: string) => (await rows<{ blocked_id: string }>(supabase.from('blocks').select('blocked_id').eq('blocker_id', me))).map((b) => b.blocked_id);
export const blockUser = (me: string, other: string) => run(supabase.from('blocks').insert({ blocker_id: me, blocked_id: other }));
export const unblockUser = (me: string, other: string) => run(supabase.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', other));
export const friendIdsOf = (pid: string) => rpc<string[]>('profile_friends', { pid });
export const acceptedFriendIds = async (me: string) =>
  (await myFriendships(me)).filter((f) => f.status === 'accepted').map((f) => (f.requester_id === me ? f.addressee_id : f.requester_id));

// ===== mensagens privadas =====
export const myConversations = () => rows<{ partner_id: string; last_body: string; last_at: string; unread: number }>(supabase.rpc('my_conversations'));
export async function getThread(me: string, other: string): Promise<Message[]> {
  const r = await rows<Message>(
    supabase.from('messages').select('*')
      .or(`and(sender_id.eq.${me},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me})`)
      .order('created_at', { ascending: false }).limit(100),
  );
  return r.reverse();
}
export const sendMessage = (me: string, other: string, body: string) => run(supabase.from('messages').insert({ sender_id: me, recipient_id: other, body }));
export const markThreadRead = (me: string, other: string) =>
  run(supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('recipient_id', me).eq('sender_id', other).is('read_at', null));

// ===== notificações =====
export const getNotifications = (me: string) =>
  rows<AppNotification>(supabase.from('notifications').select('*').eq('profile_id', me).order('created_at', { ascending: false }).limit(60));
export async function unreadNotifications(me: string): Promise<number> {
  const r = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('profile_id', me).is('read_at', null);
  if (r.error) throw new Error(r.error.message);
  return r.count ?? 0;
}
export const markNotificationRead = (id: string) => run(supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id));
export const markAllNotificationsRead = (me: string) =>
  run(supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('profile_id', me).is('read_at', null));

// ===== grupos =====
export const listGroups = (q: string) => {
  let query = supabase.from('groups').select('*').order('created_at', { ascending: false }).limit(30);
  if (q.trim()) query = query.ilike('name', `%${clean(q)}%`);
  return rows<Group>(query);
};
export const getGroup = (id: string) => one<Group>(supabase.from('groups').select('*').eq('id', id).maybeSingle());
export const myMemberships = (me: string) => rows<GroupMember>(supabase.from('group_members').select('*').eq('profile_id', me));
export const groupMembers = (gid: string) => rows<GroupMember>(supabase.from('group_members').select('*').eq('group_id', gid).order('joined_at'));
export const myGroupInvites = (me: string) =>
  rows<{ group_id: string; kind: 'invite' | 'request'; group: { id: string; name: string } | null }>(
    supabase.from('group_invites').select('group_id, kind, group:groups(id,name)').eq('profile_id', me),
  );
export const groupRequests = (gid: string) =>
  rows<{ profile_id: string; kind: string }>(supabase.from('group_invites').select('profile_id, kind').eq('group_id', gid).eq('kind', 'request'));
export const createGroup = (name: string, description: string, visibility: 'public' | 'private') =>
  rpc<string>('create_group', { p_name: name, p_description: description, p_visibility: visibility });
export const joinGroup = (gid: string) => rpc<'member' | 'joined' | 'requested'>('join_group', { gid });
export const respondGroupRequest = (gid: string, pid: string, accept: boolean) => rpc<void>('respond_group_request', { gid, pid, accept });
export const inviteToGroup = (gid: string, pid: string) => rpc<void>('invite_to_group', { gid, pid });
export const respondInvite = (gid: string, accept: boolean) => rpc<void>('respond_invite', { gid, accept });
export const leaveGroup = (gid: string) => rpc<void>('leave_group', { gid });
export const setMemberRole = (gid: string, pid: string, newRole: string) => rpc<void>('set_member_role', { gid, pid, new_role: newRole });
export const removeMember = (gid: string, pid: string) => rpc<void>('remove_member', { gid, pid });
export const updateGroup = (id: string, patch: Partial<Group>) => run(supabase.from('groups').update(patch).eq('id', id));
export const deleteGroup = (id: string) => run(supabase.from('groups').delete().eq('id', id));
export async function getGroupMessages(gid: string): Promise<GroupMessage[]> {
  const r = await rows<GroupMessage>(supabase.from('group_messages').select('*').eq('group_id', gid).order('created_at', { ascending: false }).limit(100));
  return r.reverse();
}
export const sendGroupMessage = (gid: string, me: string, body: string) => run(supabase.from('group_messages').insert({ group_id: gid, sender_id: me, body }));
export const deleteGroupMessage = (id: string) => run(supabase.from('group_messages').delete().eq('id', id));

// ===== posts, curtidas, comentários =====
export interface PostFilter {
  groupId?: string | null;
  authorIds?: string[];
  kind?: string;
  platform?: string;
  gameId?: string;
  authorId?: string;
  hashtag?: string;
  since?: string;
  limit?: number;
}
export function listPosts(f: PostFilter): Promise<Post[]> {
  let q = supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(f.limit ?? 20);
  if (f.groupId === null) q = q.is('group_id', null);
  else if (f.groupId) q = q.eq('group_id', f.groupId);
  if (f.authorIds) q = q.in('author_id', f.authorIds.length ? f.authorIds : ['00000000-0000-0000-0000-000000000000']);
  if (f.authorId) q = q.eq('author_id', f.authorId);
  if (f.kind) q = q.eq('kind', f.kind);
  if (f.platform) q = q.eq('platform', f.platform);
  if (f.gameId) q = q.eq('game_id', f.gameId);
  if (f.hashtag) q = q.ilike('body', `%#${clean(f.hashtag)}%`);
  if (f.since) q = q.gte('created_at', f.since);
  return rows<Post>(q);
}
export const getPost = (id: string) => one<Post>(supabase.from('posts').select('*').eq('id', id).maybeSingle());

export interface NewPost {
  author_id: string;
  kind?: PostKind;
  body?: string | null;
  image_url?: string | null;
  group_id?: string | null;
  game_id?: string | null;
  achievement_id?: string | null;
  review_id?: string | null;
  repost_of?: string | null;
  platform?: string | null;
}
export const createPost = (p: NewPost) => run(supabase.from('posts').insert({ kind: 'text', ...p }));
export const deletePost = (id: string) => run(supabase.from('posts').delete().eq('id', id));
export const repost = (me: string, original: Post) =>
  createPost({ author_id: me, repost_of: original.repost_of ?? original.id, body: null });

export async function setLike(me: string, type: 'post' | 'review', id: string, on: boolean) {
  if (on) await run(supabase.from('likes').insert({ profile_id: me, target_type: type, target_id: id }));
  else await run(supabase.from('likes').delete().eq('profile_id', me).eq('target_type', type).eq('target_id', id));
}
export async function setSave(me: string, postId: string, on: boolean) {
  if (on) await run(supabase.from('saves').insert({ profile_id: me, post_id: postId }));
  else await run(supabase.from('saves').delete().eq('profile_id', me).eq('post_id', postId));
}
export interface CommentView { id: string; body: string; created_at: string; author_id: string; author: Profile | null }
export async function getComments(type: 'post' | 'review', id: string): Promise<CommentView[]> {
  const list = await rows<{ id: string; body: string; created_at: string; author_id: string }>(
    supabase.from('comments').select('*').eq('target_type', type).eq('target_id', id).order('created_at').limit(100),
  );
  const authors = await profilesByIds(uniq(list.map((c) => c.author_id)));
  return list.map((c) => ({ ...c, author: authors.find((a) => a.id === c.author_id) ?? null }));
}
export const addComment = (me: string, type: 'post' | 'review', id: string, body: string) =>
  run(supabase.from('comments').insert({ author_id: me, target_type: type, target_id: id, body }));
export const deleteComment = (id: string) => run(supabase.from('comments').delete().eq('id', id));
export const report = (me: string, type: string, id: string, reason: string) =>
  run(supabase.from('reports').insert({ reporter_id: me, target_type: type, target_id: id, reason: reason || null }));

export async function getEngagement(type: 'post' | 'review', ids: string[], me: string | null) {
  const likes = new Map<string, number>();
  const comments = new Map<string, number>();
  const liked = new Set<string>();
  const saved = new Set<string>();
  for (const part of chunk(ids, 100)) {
    const [l, c] = await Promise.all([
      rows<{ target_id: string; profile_id: string }>(supabase.from('likes').select('target_id, profile_id').eq('target_type', type).in('target_id', part)),
      rows<{ target_id: string }>(supabase.from('comments').select('target_id').eq('target_type', type).in('target_id', part)),
    ]);
    l.forEach((x) => {
      likes.set(x.target_id, (likes.get(x.target_id) ?? 0) + 1);
      if (x.profile_id === me) liked.add(x.target_id);
    });
    c.forEach((x) => comments.set(x.target_id, (comments.get(x.target_id) ?? 0) + 1));
    if (type === 'post' && me) {
      (await rows<{ post_id: string }>(supabase.from('saves').select('post_id').eq('profile_id', me).in('post_id', part))).forEach((s) => saved.add(s.post_id));
    }
  }
  return { likes, comments, liked, saved };
}

export interface AchInfo { id: string; title: string; description: string | null; platform: string | null; rarity: Rarity | null }
export interface PostView extends Post {
  author: Profile | null;
  game: GameLite | null;
  group: { id: string; name: string } | null;
  achievement: AchInfo | null;
  review: Review | null;
  original: { post: Post; author: Profile | null } | null;
  likes: number;
  liked: boolean;
  comments: number;
  saved: boolean;
}

export async function rarityByIds(ids: string[]): Promise<Map<string, Rarity>> {
  const list = await byIds<Rarity>('achievement_rarity', 'achievement_id', ids, 'achievement_id, percent, percent_source, tier');
  return new Map(list.map((r) => [r.achievement_id, r]));
}

export async function hydratePosts(posts: Post[], me: string | null): Promise<PostView[]> {
  if (!posts.length) return [];
  const originalIds = uniq(posts.map((p) => p.repost_of));
  const originals = await byIds<Post>('posts', 'id', originalIds);
  const [authors, games, groups, achs, revs, eng] = await Promise.all([
    profilesByIds(uniq([...posts, ...originals].map((p) => p.author_id))),
    gamesByIds(uniq(posts.map((p) => p.game_id))),
    byIds<{ id: string; name: string }>('groups', 'id', uniq(posts.map((p) => p.group_id)), 'id,name'),
    byIds<{ id: string; title: string; description: string | null; platform: string | null }>('achievements', 'id', uniq(posts.map((p) => p.achievement_id)), 'id,title,description,platform'),
    byIds<Review>('reviews', 'id', uniq(posts.map((p) => p.review_id))),
    getEngagement('post', posts.map((p) => p.id), me),
  ]);
  const rarity = await rarityByIds(achs.map((a) => a.id));
  return posts.map((p) => {
    const a = achs.find((x) => x.id === p.achievement_id);
    const o = originals.find((x) => x.id === p.repost_of);
    return {
      ...p,
      author: authors.find((x) => x.id === p.author_id) ?? null,
      game: games.find((g) => g.id === p.game_id) ?? null,
      group: groups.find((g) => g.id === p.group_id) ?? null,
      achievement: a ? { ...a, rarity: rarity.get(a.id) ?? null } : null,
      review: revs.find((r) => r.id === p.review_id) ?? null,
      original: o ? { post: o, author: authors.find((x) => x.id === o.author_id) ?? null } : null,
      likes: eng.likes.get(p.id) ?? 0,
      liked: eng.liked.has(p.id),
      comments: eng.comments.get(p.id) ?? 0,
      saved: eng.saved.has(p.id),
    };
  });
}

// ===== jogos e reviews =====
export interface GameFilter { q?: string; platform?: string; minRating?: number; sinceDays?: number; sort?: 'recent' | 'rating' | 'reviews' }
export function searchGameStats(f: GameFilter): Promise<GameStat[]> {
  let q = supabase.from('game_stats').select('*').limit(40);
  if (f.q?.trim()) q = q.ilike('title', `%${clean(f.q)}%`);
  if (f.platform) q = q.contains('platforms', [f.platform]);
  if (f.minRating) q = q.gte('avg_rating', f.minRating);
  if (f.sinceDays) q = q.gte('created_at', new Date(Date.now() - f.sinceDays * 864e5).toISOString());
  if (f.sort === 'rating') q = q.order('avg_rating', { ascending: false, nullsFirst: false });
  else if (f.sort === 'reviews') q = q.order('review_count', { ascending: false });
  else q = q.order('created_at', { ascending: false });
  return rows<GameStat>(q);
}
export const getGameStat = (id: string) => one<GameStat>(supabase.from('game_stats').select('*').eq('game_id', id).maybeSingle());
export const getReviews = (gameId: string) =>
  rows<Review>(supabase.from('reviews').select('*').eq('game_id', gameId).order('updated_at', { ascending: false }).limit(50));
export const saveReview = (r: { game_id: string; profile_id: string; rating: number; body: string | null; platform: string | null; hours: number | null; has_spoiler: boolean }) =>
  one<Review>(supabase.from('reviews').upsert(r, { onConflict: 'game_id,profile_id' }).select('*').single());
export const deleteReview = (id: string) => run(supabase.from('reviews').delete().eq('id', id));

export interface GameAchievement { id: string; title: string; description: string | null; platform: string | null; is_dlc: boolean; rarity: Rarity | null; unlocked_at: string | null; unlocked: boolean }
export async function getGameAchievements(gameId: string, me: string | null): Promise<GameAchievement[]> {
  const list = await rows<{ id: string; title: string; description: string | null; platform: string | null; is_dlc: boolean }>(
    supabase.from('achievements').select('id,title,description,platform,is_dlc').eq('game_id', gameId).order('title'),
  );
  const rar = await rarityByIds(list.map((a) => a.id));
  const mine: { achievement_id: string; unlocked_at: string | null }[] = [];
  if (me) {
    for (const part of chunk(list.map((a) => a.id), 100)) {
      mine.push(...(await rows<{ achievement_id: string; unlocked_at: string | null }>(
        supabase.from('profile_achievements').select('achievement_id, unlocked_at').eq('profile_id', me).in('achievement_id', part),
      )));
    }
  }
  const mineMap = new Map(mine.map((m) => [m.achievement_id, m]));
  return list
    .map((a) => ({ ...a, rarity: rar.get(a.id) ?? null, unlocked: mineMap.has(a.id), unlocked_at: mineMap.get(a.id)?.unlocked_at ?? null }))
    .sort((a, b) => (b.rarity?.percent ?? 101) - (a.rarity?.percent ?? 101));
}
export const gamePlatinumPlayers = async (gameId: string) => {
  const list = await rows<{ profile_id: string; earned_at: string | null }>(supabase.from('profile_platinums').select('profile_id, earned_at').eq('game_id', gameId).limit(24));
  const profs = await profilesByIds(list.map((l) => l.profile_id));
  return list.map((l) => ({ ...l, profile: profs.find((p) => p.id === l.profile_id) ?? null }));
};

// ===== perfil: estatísticas, Diário gamer, ranking =====
export const getProfileStats = (pid: string) => one<ProfileStats>(supabase.from('profile_stats').select('*').eq('profile_id', pid).maybeSingle());
export async function getRanking(limit = 50) {
  const stats = await rows<ProfileStats>(supabase.from('profile_stats').select('*').eq('show_in_rankings', true).order('points', { ascending: false }).limit(limit));
  const profs = await profilesByIds(stats.map((s) => s.profile_id));
  return stats.map((s) => ({ ...s, profile: profs.find((p) => p.id === s.profile_id) ?? null })).filter((s) => s.profile && s.profile.is_public);
}

export async function getDiary(pid: string): Promise<DiaryItem[]> {
  const [ach, plat, revs] = await Promise.all([
    rows<{ unlocked_at: string; achievement: { id: string; title: string; description: string | null; platform: string | null; game: GameLite } | null }>(
      supabase.from('profile_achievements')
        .select('unlocked_at, achievement:achievements(id,title,description,platform,game:games(id,title,cover_url))')
        .eq('profile_id', pid).not('unlocked_at', 'is', null).order('unlocked_at', { ascending: false }).limit(300),
    ),
    rows<{ game_id: string; earned_at: string | null }>(supabase.from('profile_platinums').select('game_id, earned_at').eq('profile_id', pid)),
    rows<Review & { game: GameLite | null }>(supabase.from('reviews').select('*, game:games(id,title,cover_url)').eq('profile_id', pid).order('updated_at', { ascending: false }).limit(200)),
  ]);
  const rar = await rarityByIds(uniq(ach.map((a) => a.achievement?.id)));
  const platGames = await gamesByIds(plat.map((p) => p.game_id));
  const items: DiaryItem[] = [];
  for (const a of ach) {
    if (!a.achievement) continue;
    const r = rar.get(a.achievement.id);
    items.push({
      key: `achievement:${a.achievement.id}`, type: 'achievement', at: a.unlocked_at, platform: a.achievement.platform, game: a.achievement.game,
      title: a.achievement.title, text: a.achievement.description, tier: r?.tier ?? 'bronze', percent: r?.percent ?? null,
      percentSource: r?.percent_source ?? 'unknown', achievementId: a.achievement.id,
    });
  }
  for (const p of plat) {
    const g = platGames.find((x) => x.id === p.game_id);
    if (!g || !p.earned_at) continue;
    items.push({ key: `platinum:${p.game_id}`, type: 'platinum', at: p.earned_at, platform: null, game: g, title: `Platina em ${g.title}`, text: 'Todas as conquistas do jogo base desbloqueadas.', tier: 'platinum' });
  }
  for (const r of revs) {
    if (!r.game) continue;
    items.push({
      key: `review:${r.id}`, type: 'review', at: r.updated_at, platform: r.platform, game: r.game, title: `Review de ${r.game.title}`, text: r.body,
      rating: Number(r.rating), hasSpoiler: r.has_spoiler, hours: r.hours, reviewId: r.id,
    });
  }
  const prio = { platinum: 0, achievement: 1, review: 2 } as const;
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime() || prio[a.type] - prio[b.type]);
}
export const getPins = async (pid: string) => (await rows<{ item_key: string }>(supabase.from('diary_pins').select('item_key').eq('profile_id', pid).order('created_at'))).map((p) => p.item_key);
export const pinItem = (pid: string, key: string) => run(supabase.from('diary_pins').insert({ profile_id: pid, item_key: key }));
export const unpinItem = (pid: string, key: string) => run(supabase.from('diary_pins').delete().eq('profile_id', pid).eq('item_key', key));

// ===== conexão de contas (demonstração) e celebração de troféus =====
export const connectDemo = (platform: string) => rpc<number>('connect_demo_platform', { p_platform: platform });

export async function snapshotTrophies(pid: string) {
  const [ach, plat] = await Promise.all([
    rows<{ achievement_id: string }>(supabase.from('profile_achievements').select('achievement_id').eq('profile_id', pid).limit(5000)),
    rows<{ game_id: string }>(supabase.from('profile_platinums').select('game_id').eq('profile_id', pid)),
  ]);
  return { ach: new Set(ach.map((a) => a.achievement_id)), plat: new Set(plat.map((p) => p.game_id)) };
}
export type TrophySnapshot = Awaited<ReturnType<typeof snapshotTrophies>>;

/** Compara antes/depois e devolve o que merece comemoração (Platinas novas e a melhor conquista nova). */
export async function newTrophies(pid: string, before: TrophySnapshot): Promise<{ tier: Tier; title: string }[]> {
  const after = await snapshotTrophies(pid);
  const out: { tier: Tier; title: string }[] = [];
  const newPlat = [...after.plat].filter((g) => !before.plat.has(g));
  if (newPlat.length) {
    const games = await gamesByIds(newPlat);
    games.forEach((g) => out.push({ tier: 'platinum', title: `Platina em ${g.title}` }));
  }
  const newAch = [...after.ach].filter((a) => !before.ach.has(a));
  if (newAch.length) {
    const rar = await rarityByIds(newAch.slice(0, 200));
    const order: Tier[] = ['gold', 'silver', 'bronze'];
    for (const t of order) {
      const hit = newAch.find((id) => (rar.get(id)?.tier ?? 'bronze') === t);
      if (hit) {
        const a = await byIds<{ title: string }>('achievements', 'id', [hit], 'title');
        out.push({ tier: t, title: `${newAch.length} nova(s) conquista(s). Destaque: ${a[0]?.title ?? ''}` });
        break;
      }
    }
  }
  return out;
}

export type { Game };
