import { supabase } from './supabase';
import type { Game, LibraryEntry, LinkedAccount, Platform, Profile, Status, UnlockedAchievement } from './types';

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export const normalizeUsername = (s: string) => s.trim().toLowerCase();
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export async function searchProfiles(q: string): Promise<Profile[]> {
  const term = normalizeUsername(q).replace(/[^a-z0-9_]/g, '').replace(/_/g, '\\_');
  let query = supabase.from('profiles').select('*').order('username').limit(24);
  if (term) query = query.ilike('username', `%${term}%`);
  return check(await query) as Profile[];
}

export async function recentProfiles(): Promise<Profile[]> {
  return check(await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(8)) as Profile[];
}

export async function getProfile(username: string): Promise<Profile | null> {
  const res = await supabase.from('profiles').select('*').eq('username', normalizeUsername(username)).maybeSingle();
  return check(res) as Profile | null;
}

export async function usernameTaken(username: string): Promise<boolean> {
  const res = await supabase.from('profiles').select('id').eq('username', username).maybeSingle();
  return Boolean(check(res));
}

export async function getLibrary(profileId: string): Promise<LibraryEntry[]> {
  const res = await supabase
    .from('profile_games')
    .select('*, game:games(id,title,cover_url)')
    .eq('profile_id', profileId)
    .order('hours', { ascending: false, nullsFirst: false });
  return check(res) as unknown as LibraryEntry[];
}

export async function getAchievements(profileId: string): Promise<UnlockedAchievement[]> {
  const res = await supabase
    .from('profile_achievements')
    .select('unlocked_at, achievement:achievements(id,title,description,game:games(title))')
    .eq('profile_id', profileId)
    .order('unlocked_at', { ascending: false });
  return check(res) as unknown as UnlockedAchievement[];
}

export async function getLinks(profileId: string): Promise<LinkedAccount[]> {
  return check(await supabase.from('linked_accounts').select('*').eq('profile_id', profileId).order('created_at')) as LinkedAccount[];
}

export async function updateProfile(id: string, patch: Partial<Profile>): Promise<void> {
  check(await supabase.from('profiles').update(patch).eq('id', id));
}

export async function uploadMedia(userId: string, kind: 'avatar' | 'banner' | 'post' | 'group', file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Use uma imagem PNG, JPG ou WebP.');
  if (file.size > 2 * 1024 * 1024) throw new Error('A imagem deve ter até 2 MB.');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}

export async function searchGames(q: string): Promise<Game[]> {
  const term = q.trim().replace(/[%_\\]/g, (m) => '\\' + m);
  return check(await supabase.from('games').select('id,title,cover_url').eq('is_demo', false).ilike('title', `%${term}%`).order('title').limit(8)) as Game[];
}

export async function createGame(title: string, userId: string): Promise<Game> {
  const res = await supabase.from('games').insert({ title: title.trim(), created_by: userId }).select('id,title,cover_url').single();
  return check(res) as Game;
}

export interface LibraryInput {
  platform: Platform;
  status: Status;
  hours: number | null;
  rating: number | null;
  is_favorite: boolean;
  last_played_at: string | null;
}

export async function saveLibraryEntry(profileId: string, gameId: string, input: LibraryInput): Promise<void> {
  check(await supabase.from('profile_games').upsert({ profile_id: profileId, game_id: gameId, ...input }));
}

export async function removeLibraryEntry(profileId: string, gameId: string): Promise<void> {
  check(await supabase.from('profile_games').delete().eq('profile_id', profileId).eq('game_id', gameId));
}

export async function addLink(profileId: string, platform: string, username: string, url: string): Promise<void> {
  check(await supabase.from('linked_accounts').insert({ profile_id: profileId, platform, username: username || null, url: url || null }));
}

export async function removeLink(id: string): Promise<void> {
  check(await supabase.from('linked_accounts').delete().eq('id', id));
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado.');

export interface SyncResult {
  imported: number;
  updated: number;
  persona: string | null;
  achievementGames: number;
  remaining: number;
  failed?: number;
  rateLimited?: boolean;
}

async function invokeFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = 'Não foi possível falar com o servidor. Confira se a função foi publicada no Supabase.';
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const j = await ctx.json();
        if (j?.error) msg = String(j.error);
      } catch {
        /* resposta sem JSON */
      }
    }
    throw new Error(msg);
  }
  return data as T;
}

export interface SyncOptions { retry?: boolean; continue?: boolean }
export const syncSteam = (steam?: string, o: SyncOptions = {}) => invokeFn<SyncResult>('sync-steam', { ...(steam ? { steam } : {}), ...o });
export const syncPsn = (onlineId?: string, o: SyncOptions = {}) => invokeFn<SyncResult>('integrations', { action: 'psn', ...(onlineId ? { id: onlineId } : {}), ...o });
export const syncXbox = (gamertag?: string, o: SyncOptions = {}) => invokeFn<SyncResult>('integrations', { action: 'xbox', ...(gamertag ? { id: gamertag } : {}), ...o });

/** Procura capas e dados reais (IGDB) para os jogos da sua biblioteca, até 20 por chamada. */
export const catalogEnrich = () => invokeFn<{ checked: number; matched: number; remaining: number; rateLimited: boolean }>('integrations', { action: 'catalog_enrich' });

/** Traz jogos reais do catálogo (IGDB) para o banco do site. Silencioso em caso de falha: o site continua com o que já tem. */
export async function catalogSync(req: { action: 'catalog_search'; q: string } | { action: 'catalog_popular'; page: number }): Promise<string | null> {
  try {
    await invokeFn<{ saved: number }>('integrations', req);
    return null;
  } catch (e) {
    return errMsg(e);
  }
}
