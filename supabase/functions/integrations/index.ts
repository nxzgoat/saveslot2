// deno-lint-ignore-file no-explicit-any
// Edge Function "integrations": catálogo real de jogos (IGDB) + importação PlayStation e Xbox.
// Segredos (Supabase > Edge Functions > Secrets):
//   TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET  (catálogo IGDB)
//   PSN_NPSSO                               (conta PSN de serviço; API NÃO oficial)
//   OPENXBL_API_KEY                         (xbl.io; API NÃO oficial de terceiros)
// Desligue "Verify JWT" desta função: a verificação de login é feita aqui dentro.
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
const chunk = <T,>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
const day = (s?: string | null) => (s ? String(s).slice(0, 10) : null);
const httpsOrNull = (u: unknown) => (typeof u === 'string' && u.startsWith('https://') ? u : null);

// ===================== catálogo (IGDB) =====================
let tokenCache: { token: string; exp: number } | null = null;
async function igdbToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const id = Deno.env.get('TWITCH_CLIENT_ID');
  const secret = Deno.env.get('TWITCH_CLIENT_SECRET');
  if (!id || !secret) throw new UserError('O catálogo de jogos ainda não foi configurado no servidor (faltam TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET).', 500);
  const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`, { method: 'POST' });
  if (!res.ok) throw new UserError(`A Twitch recusou as credenciais do catálogo (erro ${res.status}).`, 502);
  const j = await res.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}
async function igdb(body: string): Promise<any[]> {
  const token = await igdbToken();
  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: { 'Client-ID': Deno.env.get('TWITCH_CLIENT_ID')!, Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body,
  });
  if (res.status === 429) throw new UserError('O catálogo está ocupado. Tente de novo em instantes.', 429);
  if (!res.ok) throw new UserError(`O catálogo respondeu com erro ${res.status}.`, 502);
  return await res.json();
}
const FIELDS = 'fields name,summary,first_release_date,cover.image_id,platforms.name,total_rating,total_rating_count;';
const cover = (id: string) => `https://images.igdb.com/igdb/image/upload/t_cover_big/${id}.jpg`;

function toItem(g: any) {
  return {
    igdb_id: g.id as number,
    title: String(g.name).trim().slice(0, 120),
    cover_url: cover(g.cover.image_id),
    description: g.summary ? String(g.summary).slice(0, 1500) : null,
    release_date: g.first_release_date ? new Date(g.first_release_date * 1000).toISOString().slice(0, 10) : null,
    platform_names: (g.platforms ?? []).map((p: any) => p.name).filter(Boolean).slice(0, 12),
    igdb_rating: g.total_rating ? Math.round(g.total_rating * 10) / 10 : null,
    igdb_rating_count: g.total_rating_count ?? 0,
  };
}

async function saveCatalog(admin: SupabaseClient, list: any[]): Promise<number> {
  const seen = new Set<string>();
  const items = list
    .filter((g) => g?.name && g?.cover?.image_id)
    .map(toItem)
    .filter((i) => {
      const k = i.title.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  if (!items.length) return 0;

  // jogos já cadastrados (por Steam/PSN/Xbox ou à mão) com o mesmo título ganham o igdb_id
  for (const part of chunk(items, 100)) {
    const data = must(await admin.from('games').select('id, title').is('igdb_id', null).in('title', part.map((i) => i.title)));
    for (const g of data ?? []) {
      const it = part.find((x) => x.title === g.title);
      if (it) await admin.from('games').update({ igdb_id: it.igdb_id }).eq('id', g.id);
    }
  }
  for (const part of chunk(items, 100)) {
    const { error } = await admin.from('games').upsert(part, { onConflict: 'igdb_id' });
    if (error) for (const it of part) await admin.from('games').upsert(it, { onConflict: 'igdb_id' }); // ignora falhas individuais (ex.: título repetido)
  }
  return items.length;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[™®©]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Procura no IGDB os jogos da biblioteca de quem chamou que ainda estão sem capa/dados reais (até 20 por vez)
async function catalogEnrich(admin: SupabaseClient, profileId: string) {
  const lib = must(await admin.from('profile_games').select('game_id').eq('profile_id', profileId).limit(3000)) as { game_id: string }[];
  const todo: { id: string; title: string }[] = [];
  for (const part of chunk(lib.map((l) => l.game_id), 150)) {
    const data = must(await admin.from('games').select('id, title').in('id', part).is('igdb_id', null).is('igdb_checked_at', null).eq('is_demo', false)) as { id: string; title: string }[];
    todo.push(...data);
  }
  const batch = todo.slice(0, 20);
  let matched = 0;
  let stopped = false;
  for (const g of batch) {
    try {
      const term = g.title.replace(/["\\;]/g, ' ').trim().slice(0, 80);
      const list = await igdb(`search "${term}"; ${FIELDS} where cover != null & version_parent = null; limit 8;`);
      const n = norm(g.title);
      let hit = list.find((x) => x?.name && x?.cover?.image_id && norm(x.name) === n);
      if (!hit) {
        // parecido: um nome contém o outro e têm tamanho semelhante (ex.: "Hades" e "Hades Edition")
        hit = list.find((x) => {
          if (!x?.name || !x?.cover?.image_id) return false;
          const m = norm(x.name);
          const [a, b] = m.length < n.length ? [m, n] : [n, m];
          return a.length > 3 && b.includes(a) && a.length / b.length >= 0.6;
        });
      }
      if (hit) {
        const it = toItem(hit);
        const { error } = await admin.from('games').update({
          igdb_id: it.igdb_id, cover_url: it.cover_url, description: it.description, release_date: it.release_date,
          platform_names: it.platform_names, igdb_rating: it.igdb_rating, igdb_rating_count: it.igdb_rating_count,
        }).eq('id', g.id);
        if (error) await admin.from('games').update({ cover_url: it.cover_url }).eq('id', g.id); // igdb_id já usado por outro registro
        matched++;
      }
    } catch (e) {
      if (e instanceof UserError && e.status === 429) { stopped = true; break; }
      console.error('enrich', g.title, e);
    }
    await admin.from('games').update({ igdb_checked_at: new Date().toISOString() }).eq('id', g.id);
    await sleep(260); // limite do IGDB: 4 pedidos por segundo
  }
  return { checked: batch.length, matched, remaining: Math.max(0, todo.length - batch.length), rateLimited: stopped };
}

async function catalogSearch(admin: SupabaseClient, q: string) {
  const term = q.replace(/["\\;]/g, ' ').trim().slice(0, 80);
  if (term.length < 2) throw new UserError('Digite pelo menos 2 letras.');
  const list = await igdb(`search "${term}"; ${FIELDS} where cover != null & version_parent = null; limit 20;`);
  return { saved: await saveCatalog(admin, list) };
}

async function catalogPopular(admin: SupabaseClient, page: number) {
  const p = Math.max(0, Math.min(9, Math.floor(page || 0)));
  const key = `catalog_popular_${p}`;
  const last = must(await admin.from('app_config').select('value').eq('key', key).maybeSingle()) as { value: string } | null;
  if (last && Date.now() - new Date(last.value).getTime() < 24 * 3600 * 1000) return { saved: 0, cached: true };
  const list = await igdb(`${FIELDS} where cover != null & total_rating_count > 100 & version_parent = null; sort total_rating_count desc; limit 40; offset ${p * 40};`);
  const saved = await saveCatalog(admin, list);
  await admin.from('app_config').upsert({ key, value: new Date().toISOString() });
  return { saved, cached: false };
}

// ===================== utilitários de importação =====================
interface ImportGame { ext: string; title: string; cover: string | null; status: string; hours: number | null; last: string | null }
interface ImportAch { api: string; title: string; description: string | null; icon: string | null; percent: number | null; dlc: boolean; unlocked: boolean; unlockedAt: string | null }

async function ensureGame(admin: SupabaseClient, rawTitle: string, img: string | null): Promise<string | null> {
  const title = rawTitle.replace(/[™®]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!title) return null;
  const ex = await admin.from('games').select('id, cover_url').eq('title', title).limit(1);
  if (ex.data?.[0]) {
    if (!ex.data[0].cover_url && img) await admin.from('games').update({ cover_url: img }).eq('id', ex.data[0].id);
    return ex.data[0].id as string;
  }
  const ins = await admin.from('games').insert({ title, cover_url: img }).select('id').single();
  if (ins.data) return ins.data.id as string;
  const esc = title.replace(/[%_\\]/g, (m) => '\\' + m);
  const again = await admin.from('games').select('id').ilike('title', esc).limit(1);
  return (again.data?.[0]?.id as string) ?? null;
}

async function saveGames(admin: SupabaseClient, profileId: string, platform: string, source: string, items: ImportGame[]) {
  const ids = new Map<string, string>();
  for (const group of chunk(items, 6)) {
    await Promise.all(group.map(async (it) => {
      const gid = await ensureGame(admin, it.title, httpsOrNull(it.cover));
      if (gid) ids.set(it.ext, gid);
    }));
  }
  const current = new Map<string, { source: string; external_id: string | null }>();
  for (const part of chunk([...ids.values()], 150)) {
    const data = must(await admin.from('profile_games').select('game_id, source, external_id').eq('profile_id', profileId).in('game_id', part));
    for (const c of data ?? []) current.set(c.game_id as string, { source: c.source as string, external_id: c.external_id as string | null });
  }
  const fresh: Record<string, unknown>[] = [];
  const upd: Record<string, unknown>[] = [];
  for (const it of items) {
    const gid = ids.get(it.ext);
    if (!gid) continue;
    const ext = `${platform}:${it.ext}`;
    const cur = current.get(gid);
    if (!cur) fresh.push({ profile_id: profileId, game_id: gid, platform, status: it.status, hours: it.hours, last_played_at: it.last, source, external_id: ext });
    else if (cur.source === source) upd.push({ profile_id: profileId, game_id: gid, last_played_at: it.last, external_id: ext });
    else if (!cur.external_id) upd.push({ profile_id: profileId, game_id: gid, external_id: ext });
  }
  for (const part of chunk(fresh, 200)) must(await admin.from('profile_games').upsert(part, { onConflict: 'profile_id,game_id' }));
  for (const part of chunk(upd, 200)) must(await admin.from('profile_games').upsert(part, { onConflict: 'profile_id,game_id' }));
  return { imported: fresh.length, updated: upd.length };
}

async function saveAchievements(admin: SupabaseClient, profileId: string, gameId: string, platform: string, list: ImportAch[]) {
  const done = async () => {
    await admin.from('profile_games').update({ achievements_synced_at: new Date().toISOString() }).eq('profile_id', profileId).eq('game_id', gameId);
  };
  if (!list.length) return await done();
  const seenTitles = new Map<string, number>();
  const uniqueTitle = (t: string) => {
    const base = t.slice(0, 190);
    const k = base.toLowerCase();
    const n = (seenTitles.get(k) ?? 0) + 1;
    seenTitles.set(k, n);
    return n > 1 ? `${base} (${n})` : base;
  };
  const defs = list.map((a) => ({
    game_id: gameId, api_name: a.api, title: uniqueTitle(a.title), description: a.description, platform,
    icon_url: httpsOrNull(a.icon), global_percent: a.percent != null && Number.isFinite(a.percent) ? Math.min(100, Math.max(0, Math.round(a.percent * 100) / 100)) : null, is_dlc: a.dlc,
  }));
  for (const part of chunk(defs, 200)) must(await admin.from('achievements').upsert(part, { onConflict: 'game_id,api_name' }));
  const rows = must(await admin.from('achievements').select('id, api_name').eq('game_id', gameId).not('api_name', 'is', null)) as { id: string; api_name: string }[];
  const idBy = new Map(rows.map((r) => [r.api_name, r.id]));
  const got = list.filter((a) => a.unlocked && idBy.has(a.api)).map((a) => ({ profile_id: profileId, achievement_id: idBy.get(a.api)!, unlocked_at: a.unlockedAt }));
  for (const part of chunk(got, 200)) must(await admin.from('profile_achievements').upsert(part, { onConflict: 'profile_id,achievement_id' }));
  await admin.from('games').update({ achievements_complete: true }).eq('id', gameId);
  await done();
}

async function getLink(admin: SupabaseClient, profileId: string, platform: string) {
  const r = await admin.from('linked_accounts').select('id, username, external_id, last_synced_at').eq('profile_id', profileId).eq('platform', platform).not('external_id', 'is', null).maybeSingle();
  return r.data as { id: string; username: string | null; external_id: string; last_synced_at: string | null } | null;
}
async function saveLink(admin: SupabaseClient, profileId: string, platform: string, existing: { id: string } | null, username: string, externalId: string) {
  const link = { platform, username, url: null, external_id: externalId, verified: false, last_synced_at: new Date().toISOString() };
  if (existing) must(await admin.from('linked_accounts').update(link).eq('id', existing.id));
  else must(await admin.from('linked_accounts').insert({ profile_id: profileId, ...link }));
}
async function resetIncomplete(admin: SupabaseClient, profileId: string, prefix: string) {
  const mine = must(await admin.from('profile_games').select('game_id').eq('profile_id', profileId).like('external_id', `${prefix}:%`).not('achievements_synced_at', 'is', null)) as { game_id: string }[];
  for (const part of chunk(mine.map((m) => m.game_id), 150)) {
    const bad = must(await admin.from('games').select('id').in('id', part).eq('achievements_complete', false)) as { id: string }[];
    if (bad.length) await admin.from('profile_games').update({ achievements_synced_at: null }).eq('profile_id', profileId).in('game_id', bad.map((g) => g.id));
  }
}
function cooldown(link: { external_id: string; last_synced_at: string | null } | null, sameAccount: boolean) {
  if (link?.last_synced_at && sameAccount && Date.now() - new Date(link.last_synced_at).getTime() < 60_000) {
    throw new UserError('Você sincronizou há pouco. Espere 1 minuto para tentar de novo.', 429);
  }
}

// ===================== PlayStation (API NÃO oficial, via psn-api) =====================
async function syncPsn(admin: SupabaseClient, profileId: string, body: any) {
  const npsso = Deno.env.get('PSN_NPSSO');
  if (!npsso) throw new UserError('A integração com a PlayStation ainda não foi configurada no servidor (falta PSN_NPSSO).', 500);
  const link = await getLink(admin, profileId, 'playstation');
  const onlineId = (typeof body.id === 'string' && body.id.trim()) || link?.username || '';
  if (!onlineId) throw new UserError('Informe seu ID da PlayStation (Online ID).');
  if (body.retry === true) await resetIncomplete(admin, profileId, 'playstation');
  cooldown(link, !body.continue && (!body.id || body.id.trim().toLowerCase() === (link?.username ?? '').toLowerCase()));

  let psn: any;
  try {
    psn = await import('npm:psn-api');
  } catch (e) {
    console.error(e);
    throw new UserError('Não foi possível carregar a biblioteca da PlayStation no servidor.', 500);
  }
  let authorization: { accessToken: string };
  try {
    const code = await psn.exchangeNpssoForCode(npsso);
    const tok = await psn.exchangeCodeForAccessToken(code);
    authorization = { accessToken: tok.accessToken };
  } catch (e) {
    console.error('psn auth', e);
    throw new UserError('O login do servidor na PlayStation falhou. O código NPSSO pode ter expirado (dura cerca de 2 meses).', 502);
  }

  const search = await psn.makeUniversalSearch(authorization, onlineId, 'SocialAllAccounts').catch(() => null);
  const results: any[] = search?.domainResponses?.[0]?.results ?? [];
  const hit = results.find((r) => String(r?.socialMetadata?.onlineId ?? '').toLowerCase() === onlineId.toLowerCase());
  if (!hit) throw new UserError('Não encontramos esse ID na PlayStation Network. Confira a grafia.', 404);
  const accountId: string = hit.socialMetadata.accountId;

  const titles: any[] = [];
  try {
    let offset = 0;
    for (let i = 0; i < 6; i++) {
      const r = await psn.getUserTitles(authorization, accountId, { limit: 100, offset });
      titles.push(...(r.trophyTitles ?? []));
      if (r.nextOffset == null) break;
      offset = r.nextOffset;
    }
  } catch (e) {
    console.error('psn titles', e);
    throw new UserError('Não consegui ler os troféus. Na PlayStation, deixe os troféus visíveis para "Qualquer pessoa" nas configurações de privacidade e tente de novo.', 403);
  }

  const known = must(await admin.from('profile_games').select('game_id, external_id, achievements_synced_at').eq('profile_id', profileId).like('external_id', 'playstation:%')) as { game_id: string; external_id: string; achievements_synced_at: string | null }[];
  const knownExt = new Map(known.map((k) => [k.external_id.slice('playstation:'.length), k]));
  const extOf = (t: any) => `${t.npCommunicationId}|${t.npServiceName ?? 'trophy'}`;

  const fresh: ImportGame[] = titles.filter((t) => !knownExt.has(extOf(t))).slice(0, 40).map((t) => ({
    ext: extOf(t), title: String(t.trophyTitleName ?? ''), cover: t.trophyTitleIconUrl ?? null,
    status: Number(t.progress) >= 100 ? 'completed' : Number(t.earnedTrophies?.bronze ?? t.earnedTrophies ?? 0) > 0 || Number(t.progress) > 0 ? 'playing' : 'backlog',
    hours: null, last: day(t.lastUpdatedDateTime),
  }));
  const saved = await saveGames(admin, profileId, 'playstation', 'psn', fresh);

  // conquistas: até 8 jogos por vez (novos ou com troféus atualizados desde a última importação)
  const all = must(await admin.from('profile_games').select('game_id, external_id, achievements_synced_at').eq('profile_id', profileId).like('external_id', 'playstation:%')) as typeof known;
  const byExt = new Map(titles.map((t) => [extOf(t), t]));
  const todo = all
    .map((r) => ({ r, t: byExt.get(r.external_id.slice('playstation:'.length)) }))
    .filter((x) => x.t && (!x.r.achievements_synced_at || new Date(x.t.lastUpdatedDateTime ?? 0).getTime() > new Date(x.r.achievements_synced_at).getTime()))
    .sort((a, b) => (a.r.achievements_synced_at ? 1 : 0) - (b.r.achievements_synced_at ? 1 : 0));
  const batch = todo.slice(0, 15);
  for (const { r, t } of batch) {
    try {
      const opts = { npServiceName: t.npServiceName };
      const [defs, mine] = await Promise.all([
        psn.getTitleTrophies(authorization, t.npCommunicationId, 'all', opts),
        psn.getUserTrophiesEarnedForTitle(authorization, accountId, t.npCommunicationId, 'all', opts),
      ]);
      const mineMap = new Map<number, any>((mine.trophies ?? []).map((m: any) => [m.trophyId, m]));
      const list: ImportAch[] = (defs.trophies ?? []).map((d: any) => {
        const m = mineMap.get(d.trophyId);
        return {
          api: `psn:${d.trophyId}`, title: String(d.trophyName || `Troféu ${d.trophyId}`), description: d.trophyDetail ?? null, icon: d.trophyIconUrl ?? null,
          percent: m?.trophyEarnedRate != null ? Number(m.trophyEarnedRate) : null,
          dlc: String(d.trophyGroupId ?? m?.trophyGroupId ?? 'default') !== 'default',
          unlocked: Boolean(m?.earned), unlockedAt: day(m?.earnedDateTime),
        };
      });
      await saveAchievements(admin, profileId, r.game_id, 'playstation', list);
    } catch (e) {
      console.error('psn troféus', t?.npCommunicationId, e);
      await admin.from('profile_games').update({ achievements_synced_at: new Date().toISOString() }).eq('profile_id', profileId).eq('game_id', r.game_id);
    }
  }
  await saveLink(admin, profileId, 'playstation', link, onlineId, accountId);
  return { ...saved, persona: onlineId, achievementGames: batch.length, remaining: Math.max(0, todo.length - batch.length) + Math.max(0, titles.length - knownExt.size - fresh.length) };
}

// ===================== Xbox (OpenXBL, serviço NÃO oficial de terceiros) =====================
async function xbl(path: string): Promise<any> {
  const key = Deno.env.get('OPENXBL_API_KEY');
  if (!key) throw new UserError('A integração com o Xbox ainda não foi configurada no servidor (falta OPENXBL_API_KEY).', 500);
  const res = await fetch(`https://xbl.io/api/v2${path}`, { headers: { 'X-Authorization': key, Accept: 'application/json' } });
  if (res.status === 429) throw new UserError('O limite de pedidos do serviço do Xbox foi atingido (150 por hora no plano grátis). Tente de novo mais tarde.', 429);
  if (!res.ok) throw new UserError(`O serviço do Xbox respondeu com erro ${res.status}.`, 502);
  return await res.json();
}

async function syncXbox(admin: SupabaseClient, profileId: string, body: any) {
  const link = await getLink(admin, profileId, 'xbox');
  const gamertag = (typeof body.id === 'string' && body.id.trim()) || link?.username || '';
  if (!gamertag) throw new UserError('Informe seu gamertag do Xbox.');
  if (body.retry === true) await resetIncomplete(admin, profileId, 'xbox');
  cooldown(link, !body.continue && (!body.id || body.id.trim().toLowerCase() === (link?.username ?? '').toLowerCase()));

  let xuid = link && link.username?.toLowerCase() === gamertag.toLowerCase() ? link.external_id : '';
  let tag = gamertag;
  if (!xuid) {
    const s = await xbl(`/search/${encodeURIComponent(gamertag)}`);
    const people: any[] = s?.people ?? s?.profileUsers ?? [];
    const hit = people.find((p) => String(p?.gamertag ?? '').toLowerCase() === gamertag.toLowerCase()) ?? people[0];
    if (!hit) throw new UserError('Não encontramos esse gamertag no Xbox.', 404);
    xuid = String(hit.xuid);
    tag = String(hit.gamertag ?? gamertag);
  }

  const res = await xbl(`/achievements/player/${xuid}`);
  const titles: any[] = res?.titles ?? [];
  if (!titles.length) throw new UserError('Não encontramos jogos nesse perfil. No Xbox, deixe o perfil e o histórico de jogos visíveis para todos e tente de novo.', 403);

  const known = must(await admin.from('profile_games').select('game_id, external_id, achievements_synced_at').eq('profile_id', profileId).like('external_id', 'xbox:%')) as { game_id: string; external_id: string; achievements_synced_at: string | null }[];
  const knownExt = new Map(known.map((k) => [k.external_id.slice('xbox:'.length), k]));
  const extOf = (t: any) => String(t.titleId);

  const fresh: ImportGame[] = titles.filter((t) => t.titleId && t.name && !knownExt.has(extOf(t))).slice(0, 40).map((t) => ({
    ext: extOf(t), title: String(t.name), cover: t.displayImage ?? null,
    status: Number(t.achievement?.progressPercentage) >= 100 ? 'completed' : 'playing', hours: null, last: day(t.titleHistory?.lastTimePlayed),
  }));
  const saved = await saveGames(admin, profileId, 'xbox', 'xbox', fresh);

  const all = must(await admin.from('profile_games').select('game_id, external_id, achievements_synced_at').eq('profile_id', profileId).like('external_id', 'xbox:%')) as typeof known;
  const byExt = new Map(titles.map((t) => [extOf(t), t]));
  const todo = all
    .map((r) => ({ r, t: byExt.get(r.external_id.slice('xbox:'.length)) }))
    .filter((x) => x.t && Number(x.t.achievement?.totalAchievements ?? 0) > 0 && !x.r.achievements_synced_at);
  const batch = todo.slice(0, 6); // plano grátis: 150 pedidos por hora para o site todo
  for (const { r, t } of batch) {
    try {
      const d = await xbl(`/achievements/player/${xuid}/title/${t.titleId}`);
      const list: ImportAch[] = (d?.achievements ?? []).map((a: any) => ({
        api: `xbox:${a.id}`, title: String(a.name || `Conquista ${a.id}`), description: a.description ?? a.lockedDescription ?? null,
        icon: a.mediaAssets?.find((m: any) => m?.url)?.url ?? null,
        percent: a.rarity?.currentPercentage != null ? Number(a.rarity.currentPercentage) : null, dlc: false,
        unlocked: String(a.progressState).toLowerCase() === 'achieved', unlockedAt: day(a.progression?.timeUnlocked),
      }));
      await saveAchievements(admin, profileId, r.game_id, 'xbox', list);
    } catch (e) {
      if (e instanceof UserError && e.status === 429) throw e;
      console.error('xbox conquistas', t?.titleId, e);
      await admin.from('profile_games').update({ achievements_synced_at: new Date().toISOString() }).eq('profile_id', profileId).eq('game_id', r.game_id);
    }
  }
  await saveLink(admin, profileId, 'xbox', link, tag, xuid);
  return { ...saved, persona: tag, achievementGames: batch.length, remaining: Math.max(0, todo.length - batch.length) };
}

// ===================== roteador =====================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (req.method !== 'POST') throw new UserError('Método não permitido.', 405);
    const body = await req.json().catch(() => ({}));
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    if (body.action === 'catalog_popular') return json(await catalogPopular(admin, Number(body.page)));

    const auth = req.headers.get('Authorization');
    if (!auth) throw new UserError('Entre na sua conta para continuar.', 401);
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: u, error: uerr } = await userClient.auth.getUser();
    if (uerr || !u.user) throw new UserError('Sessão inválida. Entre de novo.', 401);

    if (body.action === 'catalog_search') return json(await catalogSearch(admin, String(body.q ?? '')));

    const profile = must(await admin.from('profiles').select('id').eq('user_id', u.user.id).maybeSingle()) as { id: string } | null;
    if (!profile) throw new UserError('Perfil não encontrado.', 404);
    if (body.action === 'catalog_enrich') return json(await catalogEnrich(admin, profile.id));
    if (body.action === 'psn') return json(await syncPsn(admin, profile.id, body));
    if (body.action === 'xbox') return json(await syncXbox(admin, profile.id, body));
    throw new UserError('Ação desconhecida.');
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Erro inesperado. Tente de novo.' }, 500);
  }
});
