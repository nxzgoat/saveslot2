// Edge Function: importa a biblioteca da Steam para o perfil de quem está logado.
// Segredo necessário: STEAM_API_KEY (Supabase > Edge Functions > Secrets).
// A chave da Steam fica só aqui no servidor, nunca no site.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

class UserError extends Error {
  status: number;
  constructor(msg: string, status = 400) {
    super(msg);
    this.status = status;
  }
}

const chunk = <T,>(a: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

async function steam(path: string, params: Record<string, string>) {
  const url = new URL(`https://api.steampowered.com/${path}`);
  url.searchParams.set('key', Deno.env.get('STEAM_API_KEY') ?? '');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new UserError(`A Steam respondeu com erro ${res.status}. Tente de novo em alguns minutos.`, 502);
  return await res.json();
}

async function resolveSteamId(input: string): Promise<string> {
  const s = input.trim();
  let m = s.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (m) return m[1];
  if (/^\d{17}$/.test(s)) return s;
  m = s.match(/steamcommunity\.com\/id\/([A-Za-z0-9_-]+)/);
  const vanity = m ? m[1] : /^[A-Za-z0-9_-]{2,32}$/.test(s) ? s : null;
  if (!vanity) throw new UserError('Não entendi esse link. Use o endereço do seu perfil da Steam ou o ID de 17 números.');
  const r = await steam('ISteamUser/ResolveVanityURL/v1/', { vanityurl: vanity });
  if (r?.response?.success !== 1) throw new UserError('Não encontramos esse perfil na Steam.', 404);
  return r.response.steamid as string;
}

interface SteamGame {
  appid: number;
  name?: string;
  playtime_forever?: number;
  rtime_last_played?: number;
}

const cover = (appid: number) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;

interface SteamAch { name: string; displayName?: string; description?: string; icon?: string }

// Importa definições, raridade global e conquistas desbloqueadas de UM jogo
async function importAchievements(admin: SupabaseClient, profileId: string, steamId: string, appid: number, gid: string) {
  const done = async () => {
    await admin.from('profile_games').update({ achievements_synced_at: new Date().toISOString() }).eq('profile_id', profileId).eq('game_id', gid);
  };
  try {
    const schema = await steam('ISteamUserStats/GetSchemaForGame/v2/', { appid: String(appid), l: 'brazilian' });
    const list = (schema?.game?.availableGameStats?.achievements ?? []) as SteamAch[];
    if (list.length === 0) return await done();
    const pctRes = await steam('ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/', { gameid: String(appid) }).catch(() => null);
    const pct = new Map<string, number>();
    for (const a of pctRes?.achievementpercentages?.achievements ?? []) pct.set(a.name, Number(a.percent));
    const mine = await steam('ISteamUserStats/GetPlayerAchievements/v1/', { steamid: steamId, appid: String(appid), l: 'brazilian' }).catch(() => null);
    if (!mine?.playerstats?.achievements) return await done(); // sem acesso: não marca a lista como completa

    const defs = list.map((a) => ({
      game_id: gid, api_name: a.name, title: (a.displayName || a.name).slice(0, 200), description: a.description || null,
      platform: 'steam', icon_url: a.icon || null,
      global_percent: pct.has(a.name) && Number.isFinite(pct.get(a.name)) ? Math.round(pct.get(a.name)! * 100) / 100 : null,
    }));
    for (const part of chunk(defs, 200)) must(await admin.from('achievements').upsert(part, { onConflict: 'game_id,api_name' }));
    const ids = must(await admin.from('achievements').select('id, api_name').eq('game_id', gid).not('api_name', 'is', null));
    const idByName = new Map((ids ?? []).map((r: { id: string; api_name: string }) => [r.api_name, r.id]));
    const unlocked = (mine.playerstats.achievements as { apiname: string; achieved: number; unlocktime: number }[])
      .filter((a) => a.achieved === 1 && idByName.has(a.apiname))
      .map((a) => ({
        profile_id: profileId, achievement_id: idByName.get(a.apiname)!,
        unlocked_at: a.unlocktime ? new Date(a.unlocktime * 1000).toISOString().slice(0, 10) : null,
      }));
    for (const part of chunk(unlocked, 200)) must(await admin.from('profile_achievements').upsert(part, { onConflict: 'profile_id,achievement_id' }));
    await admin.from('games').update({ achievements_complete: true }).eq('id', gid);
    await done();
  } catch (e) {
    console.error('conquistas', appid, e); // falha em um jogo não derruba a sincronização
    await done();
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (req.method !== 'POST') throw new UserError('Método não permitido.', 405);
    if (!Deno.env.get('STEAM_API_KEY')) throw new UserError('A integração com a Steam ainda não foi configurada no servidor.', 500);

    const auth = req.headers.get('Authorization');
    if (!auth) throw new UserError('Entre na sua conta para sincronizar.', 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: u, error: uerr } = await userClient.auth.getUser();
    if (uerr || !u.user) throw new UserError('Sessão inválida. Entre de novo.', 401);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const profile = must(await admin.from('profiles').select('id').eq('user_id', u.user.id).maybeSingle());
    if (!profile) throw new UserError('Perfil não encontrado.', 404);

    const body = await req.json().catch(() => ({}));
    const existingLink = must(
      await admin.from('linked_accounts').select('id, external_id, last_synced_at')
        .eq('profile_id', profile.id).eq('platform', 'steam').not('external_id', 'is', null).maybeSingle(),
    );

    let steamId: string | null = null;
    if (typeof body.steam === 'string' && body.steam.trim()) steamId = await resolveSteamId(body.steam);
    else if (existingLink?.external_id) steamId = existingLink.external_id;
    if (!steamId) throw new UserError('Informe o link ou o ID do seu perfil da Steam.');

    if (existingLink?.external_id === steamId && existingLink.last_synced_at &&
        Date.now() - new Date(existingLink.last_synced_at).getTime() < 60 * 1000) {
      throw new UserError('Você sincronizou há pouco. Espere 1 minuto para tentar de novo.', 429);
    }

    const sum = await steam('ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId });
    const player = sum?.response?.players?.[0];
    if (!player) throw new UserError('Não encontramos esse perfil na Steam.', 404);

    const owned = await steam('IPlayerService/GetOwnedGames/v1/', {
      steamid: steamId, include_appinfo: 'true', include_played_free_games: 'true', format: 'json',
    });
    let games = owned?.response?.games as SteamGame[] | undefined;
    if (!games && owned?.response?.game_count === 0) games = [];
    if (!games) {
      throw new UserError('Não consegui ler seus jogos. Na Steam, deixe o perfil e "Detalhes do jogo" como Público (Editar perfil > Configurações de privacidade) e tente de novo.', 403);
    }

    // Normaliza e remove títulos repetidos
    const seen = new Set<string>();
    const rows = games
      .filter((g) => g.name)
      .map((g) => ({ appid: g.appid, title: g.name!.trim().slice(0, 120), minutes: g.playtime_forever ?? 0, last: g.rtime_last_played ?? 0 }))
      .filter((r) => {
        const k = r.title.toLowerCase();
        if (!r.title || seen.has(k)) return false;
        seen.add(k);
        return true;
      });

    // 1) descobre quais jogos já existem no catálogo (por appid)
    const idByApp = new Map<number, string>();
    const loadIds = async () => {
      for (const part of chunk(rows, 150)) {
        const data = must(await admin.from('games').select('id, steam_appid').in('steam_appid', part.map((r) => r.appid)));
        for (const g of data ?? []) idByApp.set(g.steam_appid as number, g.id as string);
      }
    };
    await loadIds();

    // 2) jogos cadastrados à mão com o mesmo título ganham o appid
    for (const part of chunk(rows.filter((r) => !idByApp.has(r.appid)), 100)) {
      const data = must(await admin.from('games').select('id, title').is('steam_appid', null).in('title', part.map((r) => r.title)));
      for (const g of data ?? []) {
        const r = part.find((x) => x.title === g.title);
        if (!r) continue;
        const { error } = await admin.from('games').update({ steam_appid: r.appid }).eq('id', g.id);
        if (!error) idByApp.set(r.appid, g.id as string);
      }
    }

    // 3) cria os que faltam
    for (const part of chunk(rows.filter((r) => !idByApp.has(r.appid)), 100)) {
      const payload = part.map((r) => ({ title: r.title, steam_appid: r.appid, cover_url: cover(r.appid) }));
      const { error } = await admin.from('games').insert(payload);
      if (error) for (const p of payload) await admin.from('games').insert(p); // ignora falhas individuais
    }
    await loadIds();

    // 4) biblioteca do perfil: não mexe em entradas cadastradas à mão
    const gameIds = [...idByApp.values()];
    const current = new Map<string, string>();
    for (const part of chunk(gameIds, 150)) {
      const data = must(await admin.from('profile_games').select('game_id, source').eq('profile_id', profile.id).in('game_id', part));
      for (const c of data ?? []) current.set(c.game_id as string, c.source as string);
    }

    const newRows: Record<string, unknown>[] = [];
    const updRows: Record<string, unknown>[] = [];
    for (const r of rows) {
      const gid = idByApp.get(r.appid);
      if (!gid) continue;
      const hours = Math.min(99999, Math.round(r.minutes / 6) / 10);
      const last = r.last ? new Date(r.last * 1000).toISOString().slice(0, 10) : null;
      const src = current.get(gid);
      if (src === undefined) {
        newRows.push({ profile_id: profile.id, game_id: gid, platform: 'steam', status: r.minutes > 0 ? 'playing' : 'backlog', hours, last_played_at: last, source: 'steam' });
      } else if (src === 'steam') {
        updRows.push({ profile_id: profile.id, game_id: gid, hours, last_played_at: last });
      }
    }
    for (const part of chunk(newRows, 200)) must(await admin.from('profile_games').upsert(part, { onConflict: 'profile_id,game_id' }));
    for (const part of chunk(updRows, 200)) must(await admin.from('profile_games').upsert(part, { onConflict: 'profile_id,game_id' }));

    // 5) conquistas: até 12 jogos por sincronização, os mais jogados primeiro
    const pending = must(
      await admin.from('profile_games').select('game_id, hours, game:games(steam_appid)')
        .eq('profile_id', profile.id).eq('source', 'steam').is('achievements_synced_at', null).gt('hours', 0)
        .order('hours', { ascending: false }).limit(12),
    ) as unknown as { game_id: string; game: { steam_appid: number | null } | null }[];
    for (const group of chunk(pending, 4)) {
      await Promise.all(group.filter((p) => p.game?.steam_appid).map((p) => importAchievements(admin, profile.id, steamId!, p.game!.steam_appid!, p.game_id)));
    }
    const left = await admin.from('profile_games').select('game_id', { count: 'exact', head: true })
      .eq('profile_id', profile.id).eq('source', 'steam').is('achievements_synced_at', null).gt('hours', 0);

    // 6) guarda a conexão (ainda sem verificação de dono)
    const link = {
      platform: 'steam',
      username: (player.personaname as string | undefined) ?? null,
      url: (player.profileurl as string | undefined) ?? null,
      external_id: steamId,
      verified: false,
      last_synced_at: new Date().toISOString(),
    };
    if (existingLink) must(await admin.from('linked_accounts').update(link).eq('id', existingLink.id));
    else must(await admin.from('linked_accounts').insert({ profile_id: profile.id, ...link }));

    return json({ imported: newRows.length, updated: updRows.length, persona: link.username, achievementGames: pending.length, remaining: left.count ?? 0 });
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Erro inesperado ao sincronizar. Tente de novo.' }, 500);
  }
});
