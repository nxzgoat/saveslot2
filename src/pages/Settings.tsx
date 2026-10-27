import { useEffect, useState, type FormEvent } from 'react';
import { useCelebrate } from '../components/Celebrate';
import { applyTheme, getTheme, type Theme } from '../lib/theme';
import { isMuted, setMuted } from '../lib/trophy';
import { connectDemo, newTrophies, snapshotTrophies } from '../lib/social';
import { Link } from 'react-router-dom';
import { Avatar, Cover, Empty, ErrorBox, Loading } from '../components/ui';
import {
  addLink, catalogSync, createGame, errMsg, getLibrary, getLinks, removeLibraryEntry, removeLink,
  saveLibraryEntry, searchGames, syncPsn, syncSteam, syncXbox, updateProfile, uploadMedia,
  type SyncResult,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { LINK_PLATFORMS, PLATFORMS, STATUS, type Game, type LibraryEntry, type LinkedAccount, type Platform, type Profile, type Status } from '../lib/types';
import { useAsync } from '../lib/useAsync';

type Tab = 'perfil' | 'jogos' | 'conectar' | 'links' | 'privacidade' | 'preferencias' | 'conta';
const TABS: [Tab, string][] = [['perfil', 'Perfil'], ['jogos', 'Jogos'], ['conectar', 'Contas conectadas'], ['links', 'Links'], ['privacidade', 'Privacidade'], ['preferencias', 'Preferências'], ['conta', 'Conta']];

export default function Settings() {
  const { profile, session, refresh } = useAuth();
  const [tab, setTab] = useState<Tab>('perfil');

  if (!profile || !session) {
    return (
      <Empty title="Não foi possível carregar seu perfil">
        <button className="btn" onClick={() => void refresh()}>Tentar de novo</button>
      </Empty>
    );
  }

  return (
    <>
      <h1 style={{ fontSize: '2rem' }}>Configurações</h1>
      <p className="muted">Só você pode editar estas informações. <Link to={`/u/${profile.username}`}>Ver perfil público</Link></p>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'perfil' && <ProfileTab profile={profile} userId={session.user.id} onSaved={refresh} />}
      {tab === 'jogos' && <GamesTab profile={profile} userId={session.user.id} />}
      {tab === 'conectar' && <ConnectTab profile={profile} />}
      {tab === 'links' && <LinksTab profile={profile} />}
      {tab === 'privacidade' && <PrivacyTab profile={profile} onSaved={refresh} />}
      {tab === 'preferencias' && <PrefsTab profile={profile} onSaved={refresh} />}
      {tab === 'conta' && <AccountTab email={session.user.email ?? ''} />}
    </>
  );
}

function ProfileTab({ profile, userId, onSaved }: { profile: Profile; userId: string; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState(profile.display_name ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [loc, setLoc] = useState(profile.location ?? '');
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (name.length > 40) return toast('O nome de exibição aceita até 40 caracteres.', 'error');
    if (bio.length > 500) return toast('A bio aceita até 500 caracteres.', 'error');
    setBusy(true);
    try {
      await updateProfile(profile.id, { display_name: name.trim() || null, bio: bio.trim() || null, location: loc.trim() || null });
      await onSaved();
      toast('Perfil salvo.');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const upload = async (kind: 'avatar' | 'banner', file: File | undefined) => {
    if (!file) return;
    try {
      const url = await uploadMedia(userId, kind, file);
      await updateProfile(profile.id, kind === 'avatar' ? { avatar_url: url } : { banner_url: url });
      await onSaved();
      toast(kind === 'avatar' ? 'Avatar atualizado.' : 'Banner atualizado.');
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  return (
    <form className="card" onSubmit={save} style={{ maxWidth: 560 }}>
      <div className="row">
        <Avatar name={profile.display_name || profile.username} url={profile.avatar_url} size={64} />
        <div className="grow">
          <label htmlFor="av">Avatar (PNG, JPG ou WebP, até 2 MB)</label>
          <input id="av" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void upload('avatar', e.target.files?.[0])} />
        </div>
      </div>
      <label htmlFor="bn">Banner (PNG, JPG ou WebP, até 2 MB)</label>
      <input id="bn" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void upload('banner', e.target.files?.[0])} />
      <label htmlFor="dn">Nome de exibição</label>
      <input id="dn" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      <label htmlFor="loc">Localização (opcional)</label>
      <input id="loc" value={loc} maxLength={60} onChange={(e) => setLoc(e.target.value)} />
      <label htmlFor="bio">Bio ({bio.length}/500)</label>
      <textarea id="bio" value={bio} maxLength={500} onChange={(e) => setBio(e.target.value)} />
      <p><button className="btn primary" disabled={busy}>{busy ? 'Salvando...' : 'Salvar perfil'}</button></p>
    </form>
  );
}

function GamesTab({ profile, userId }: { profile: Profile; userId: string }) {
  const toast = useToast();
  const lib = useAsync(() => getLibrary(profile.id), [profile.id]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Game[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      (q.trim().length >= 3 ? catalogSync({ action: 'catalog_search', q }) : Promise.resolve(null))
        .then(() => searchGames(q))
        .then((r) => alive && setResults(r))
        .catch((e) => alive && toast(errMsg(e), 'error'))
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const owned = new Set((lib.data ?? []).map((e) => e.game_id));

  const add = async (game: Game) => {
    try {
      await saveLibraryEntry(profile.id, game.id, { platform: 'pc', status: 'backlog', hours: null, rating: null, is_favorite: false, last_played_at: null });
      toast(`${game.title} adicionado.`);
      setQ('');
      lib.reload();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const createAndAdd = async () => {
    try {
      await add(await createGame(q, userId));
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const exact = results.some((g) => g.title.toLowerCase() === q.trim().toLowerCase());

  return (
    <>
      <section className="card">
        <h2>Adicionar jogo</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite o nome do jogo" aria-label="Buscar jogo" />
        {searching && <Loading label="Buscando..." />}
        {results.map((g) => (
          <div className="row" key={g.id}>
            <Cover game={g} />
            <strong className="grow">{g.title}</strong>
            <button className="btn" disabled={owned.has(g.id)} onClick={() => void add(g)}>{owned.has(g.id) ? 'Já na biblioteca' : 'Adicionar'}</button>
          </div>
        ))}
        {!searching && q.trim().length >= 2 && !exact && (
          <p><button className="btn" onClick={() => void createAndAdd()}>Cadastrar "{q.trim()}" e adicionar</button></p>
        )}
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Minha biblioteca</h2>
        {lib.loading && <Loading />}
        {lib.error && <ErrorBox message={lib.error} onRetry={lib.reload} />}
        {lib.data && lib.data.length === 0 && <Empty title="Sua biblioteca está vazia">Busque um jogo acima para começar.</Empty>}
        {(lib.data ?? []).map((e) => <GameRow key={e.game_id} entry={e} profileId={profile.id} onChange={lib.reload} />)}
      </section>
    </>
  );
}

function GameRow({ entry, profileId, onChange }: { entry: LibraryEntry; profileId: string; onChange: () => void }) {
  const toast = useToast();
  const [platform, setPlatform] = useState<Platform>(entry.platform);
  const [status, setStatus] = useState<Status>(entry.status);
  const [hours, setHours] = useState(entry.hours == null ? '' : String(entry.hours));
  const [rating, setRating] = useState(entry.rating == null ? '' : String(entry.rating));
  const [fav, setFav] = useState(entry.is_favorite);
  const [last, setLast] = useState(entry.last_played_at ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const h = hours === '' ? null : Number(hours);
    const r = rating === '' ? null : Number(rating);
    if (h !== null && (!Number.isFinite(h) || h < 0 || h > 99999)) return toast('Horas inválidas.', 'error');
    if (r !== null && (!Number.isInteger(r) || r < 1 || r > 10)) return toast('A nota vai de 1 a 10.', 'error');
    setBusy(true);
    try {
      await saveLibraryEntry(profileId, entry.game_id, { platform, status, hours: h, rating: r, is_favorite: fav, last_played_at: last || null });
      toast(`${entry.game.title} salvo.`);
      onChange();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remover ${entry.game.title} da biblioteca?`)) return;
    try {
      await removeLibraryEntry(profileId, entry.game_id);
      toast('Jogo removido.');
      onChange();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  return (
    <div className="edit-row">
      <div className="row" style={{ border: 0, padding: 0 }}>
        <Cover game={entry.game} />
        <strong>{entry.game.title}</strong>
      </div>
      <div>
        <label>Plataforma</label>
        <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
          {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label>Horas</label>
        <input type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
      </div>
      <div className="edit-actions">
        <div style={{ width: 90 }}>
          <label>Nota (1-10)</label>
          <input type="number" min="1" max="10" value={rating} onChange={(e) => setRating(e.target.value)} />
        </div>
        <div style={{ width: 160 }}>
          <label>Última vez</label>
          <input type="date" value={last} onChange={(e) => setLast(e.target.value)} />
        </div>
        <label className="check" style={{ margin: '14px 0 0' }}>
          <input type="checkbox" checked={fav} onChange={(e) => setFav(e.target.checked)} /> Favorito
        </label>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>Salvar</button>
        <button className="btn danger" onClick={() => void remove()}>Remover</button>
      </div>
    </div>
  );
}

function LinksTab({ profile }: { profile: Profile }) {
  const toast = useToast();
  const links = useAsync(() => getLinks(profile.id), [profile.id]);
  const [platform, setPlatform] = useState(LINK_PLATFORMS[0]);
  const [username, setUsername] = useState('');
  const [url, setUrl] = useState('');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() && !url.trim()) return toast('Informe um usuário ou um link.', 'error');
    if (url.trim() && !/^https?:\/\//.test(url.trim())) return toast('O link precisa começar com http:// ou https://', 'error');
    try {
      await addLink(profile.id, platform, username.trim(), url.trim());
      setUsername('');
      setUrl('');
      toast('Link adicionado.');
      links.reload();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const del = async (id: string) => {
    try {
      await removeLink(id);
      toast('Link removido.');
      links.reload();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  return (
    <div className="settings" style={{ maxWidth: 560 }}>
      <form className="card" onSubmit={add}>
        <h2>Adicionar link</h2>
        <label htmlFor="lp">Plataforma</label>
        <select id="lp" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          {LINK_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label htmlFor="lu">Usuário</label>
        <input id="lu" value={username} maxLength={60} onChange={(e) => setUsername(e.target.value)} />
        <label htmlFor="ll">Link do perfil (opcional)</label>
        <input id="ll" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        <p><button className="btn primary">Adicionar</button></p>
      </form>
      <section className="card">
        <h2>Seus links</h2>
        {links.loading && <Loading />}
        {links.error && <ErrorBox message={links.error} onRetry={links.reload} />}
        {links.data && links.data.length === 0 && <p className="muted">Nenhum link ainda.</p>}
        {(links.data ?? []).map((l) => (
          <div className="row" key={l.id}>
            <span className="tag">{l.platform}</span>
            <span className="grow">{l.username || l.url}</span>
            <button className="btn danger" onClick={() => void del(l.id)}>Remover</button>
          </div>
        ))}
      </section>
    </div>
  );
}

function PrivacyTab({ profile, onSaved }: { profile: Profile; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [pub, setPub] = useState(profile.is_public);
  const [lib, setLib] = useState(profile.show_library);
  const [ach, setAch] = useState(profile.show_achievements);
  const [act, setAct] = useState(profile.show_activity);
  const [fr, setFr] = useState(profile.show_friends);
  const [msg, setMsg] = useState(profile.allow_messages);
  const [rank, setRank] = useState(profile.show_in_rankings);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateProfile(profile.id, { is_public: pub, show_library: lib, show_achievements: ach, show_activity: act, show_friends: fr, allow_messages: msg, show_in_rankings: rank });
      await onSaved();
      toast('Privacidade salva.');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={save} style={{ maxWidth: 560 }}>
      <label className="check"><input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} />
        <span>Perfil público. Desligado, ninguém além de você encontra ou abre o perfil.</span></label>
      <label className="check"><input type="checkbox" checked={lib} onChange={(e) => setLib(e.target.checked)} />
        <span>Mostrar biblioteca de jogos, horas e estatísticas.</span></label>
      <label className="check"><input type="checkbox" checked={ach} onChange={(e) => setAch(e.target.checked)} />
        <span>Mostrar conquistas e troféus.</span></label>
      <label className="check"><input type="checkbox" checked={act} onChange={(e) => setAct(e.target.checked)} />
        <span>Mostrar reviews e publicações do Diário gamer.</span></label>
      <label className="check"><input type="checkbox" checked={fr} onChange={(e) => setFr(e.target.checked)} />
        <span>Mostrar minha lista de amigos.</span></label>
      <label className="check"><input type="checkbox" checked={msg} onChange={(e) => setMsg(e.target.checked)} />
        <span>Permitir mensagens de amigos.</span></label>
      <label className="check"><input type="checkbox" checked={rank} onChange={(e) => setRank(e.target.checked)} />
        <span>Aparecer nos rankings.</span></label>
      <p><button className="btn primary" disabled={busy}>{busy ? 'Salvando...' : 'Salvar privacidade'}</button></p>
    </form>
  );
}

function AccountTab({ email }: { email: string }) {
  const toast = useToast();
  const { signOut } = useAuth();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  const change = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast('A senha precisa ter pelo menos 8 caracteres.', 'error');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast(error.message, 'error');
    setPw('');
    toast('Senha atualizada.');
  };

  return (
    <div className="settings" style={{ maxWidth: 560 }}>
      <form className="card" onSubmit={change}>
        <p>Conta: <strong>{email}</strong></p>
        <label htmlFor="np">Nova senha</label>
        <input id="np" type="password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        <p><button className="btn primary" disabled={busy || !pw}>Trocar senha</button></p>
      </form>
      <div className="card">
        <button className="btn" onClick={() => void signOut()}>Sair da conta</button>
      </div>
    </div>
  );
}

const DEMO_PLATFORMS: [string, string][] = [['googleplay', 'Google Play Games'], ['epic', 'Epic Games'], ['retroachievements', 'RetroAchievements']];

interface RealPlatformProps {
  platform: 'steam' | 'playstation' | 'xbox';
  label: string;
  badge: string;
  inputLabel: string;
  placeholder: string;
  hint: string;
  sync: (value?: string) => Promise<SyncResult>;
  links: LinkedAccount[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => Promise<void> | void;
  profileId: string;
}

function RealPlatform(p: RealPlatformProps) {
  const toast = useToast();
  const [input, setInput] = useState('');
  const link = p.links.find((l) => l.platform === p.platform && l.external_id);

  const run = async (value?: string) => {
    p.setBusy(true);
    try {
      const r = await p.sync(value);
      toast(`${p.label}: ${r.imported} jogos novos, ${r.updated} atualizados, conquistas de ${r.achievementGames} jogo(s).`);
      if (r.remaining > 0) toast(`Ainda faltam ${r.remaining} item(ns) desta conta. Clique em Sincronizar de novo em 1 minuto.`);
      setInput('');
      await p.onDone();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      p.setBusy(false);
    }
  };
  const disconnect = async () => {
    if (!link || !window.confirm(`Desvincular ${p.label}? Os jogos e conquistas já importados continuam no perfil.`)) return;
    try {
      await removeLink(link.id);
      toast('Conta desvinculada.');
      await p.onDone();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  return (
    <section className="card">
      <h2>{p.label} <span className="tag">{p.badge}</span></h2>
      {link ? (
        <>
          <p>Conectada como <strong>{link.username || link.external_id}</strong>.</p>
          <p className="muted">Última sincronização: {link.last_synced_at ? new Date(link.last_synced_at).toLocaleString('pt-BR') : '—'}. Jogos cadastrados à mão não são alterados.</p>
          <div className="actions">
            <button className="btn primary" disabled={p.busy} onClick={() => void run()}>{p.busy ? 'Sincronizando...' : 'Sincronizar agora'}</button>
            <button className="btn danger" disabled={p.busy} onClick={() => void disconnect()}>Desvincular</button>
          </div>
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) void run(input.trim()); }}>
          <p className="muted">{p.hint}</p>
          <label htmlFor={`in-${p.platform}`}>{p.inputLabel}</label>
          <input id={`in-${p.platform}`} value={input} onChange={(e) => setInput(e.target.value)} placeholder={p.placeholder} />
          <p><button className="btn primary" disabled={p.busy || !input.trim()}>{p.busy ? 'Importando...' : 'Conectar e importar'}</button></p>
        </form>
      )}
    </section>
  );
}

function ConnectTab({ profile }: { profile: Profile }) {
  const toast = useToast();
  const celebrate = useCelebrate();
  const links = useAsync(() => getLinks(profile.id), [profile.id]);
  const [busy, setBusy] = useState(false);
  const all = links.data ?? [];

  // tira uma "foto" dos troféus antes de sincronizar e comemora o que for novo
  const withCelebration = (fn: (v?: string) => Promise<SyncResult>) => async (v?: string) => {
    const before = await snapshotTrophies(profile.id).catch(() => null);
    const r = await fn(v);
    if (before) {
      const list = await newTrophies(profile.id, before).catch(() => []);
      list.forEach((t, i) => setTimeout(() => celebrate(t.tier, t.title), i * 3300));
    }
    return r;
  };

  const demo = async (platform: string) => {
    setBusy(true);
    try {
      const before = await snapshotTrophies(profile.id).catch(() => null);
      const n = await connectDemo(platform);
      toast(`Conta de demonstração conectada (${n} conquistas simuladas).`);
      links.reload();
      if (before) (await newTrophies(profile.id, before).catch(() => [])).forEach((t, i) => setTimeout(() => celebrate(t.tier, t.title), i * 3300));
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  const removeDemo = async (id: string) => {
    try {
      await removeLink(id);
      links.reload();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const common = { links: all, busy, setBusy, onDone: () => links.reload(), profileId: profile.id };
  return (
    <div className="settings" style={{ maxWidth: 560 }}>
      {links.error && <ErrorBox message={links.error} onRetry={links.reload} />}
      <RealPlatform {...common} platform="steam" label="Steam" badge="integração oficial" sync={withCelebration(syncSteam)}
        inputLabel="Link do seu perfil na Steam (ou o ID de 17 números)" placeholder="https://steamcommunity.com/id/seu-nome"
        hint='Na Steam, deixe o perfil e "Detalhes do jogo" como Público. Traz jogos, horas jogadas e conquistas.' />
      <RealPlatform {...common} platform="playstation" label="PlayStation" badge="API não oficial" sync={withCelebration(syncPsn)}
        inputLabel="Seu ID na PlayStation (Online ID)" placeholder="seu_online_id"
        hint='Traz jogos e troféus (sem horas jogadas). Nas configurações de privacidade da PlayStation, deixe os troféus visíveis para "Qualquer pessoa". Você não precisa informar senha nem código.' />
      <RealPlatform {...common} platform="xbox" label="Xbox" badge="serviço de terceiros" sync={withCelebration(syncXbox)}
        inputLabel="Seu gamertag" placeholder="SeuGamertag"
        hint="Traz jogos e conquistas (sem horas jogadas). Deixe o perfil e o histórico de jogos visíveis para todos nas configurações de privacidade do Xbox." />

      <section className="card">
        <h2>Nintendo Switch <span className="tag">indisponível</span></h2>
        <p className="muted">A Nintendo não oferece uma forma pública de ler jogos, horas e conquistas de uma conta. As ferramentas da comunidade dependem de tokens de sessão que arriscam a conta e nem entregam o histórico completo. Por isso não existe conexão automática: adicione seus jogos de Switch pela aba Jogos, escolhendo no catálogo real.</p>
      </section>

      <section className="card">
        <h2>Outras plataformas <span className="tag">demonstração</span></h2>
        <p className="muted">Sem integração real ainda. O botão gera jogos e conquistas <strong>simulados</strong>, marcados como tal e escondidos da lista de jogos, só para testar o site.</p>
        {DEMO_PLATFORMS.map(([id, label]) => {
          const link = all.find((l) => l.platform === id && l.is_demo);
          return (
            <div className="row" key={id}>
              <span className="grow">{label}{link && <span className="tag"> conectada (demo)</span>}</span>
              {link ? <button className="btn danger" disabled={busy} onClick={() => void removeDemo(link.id)}>Desvincular</button> : <button className="btn" disabled={busy} onClick={() => void demo(id)}>Conectar (demo)</button>}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function PrefsTab({ profile, onSaved }: { profile: Profile; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [mute, setMute] = useState(isMuted());
  const [prefs, setPrefs] = useState<Record<string, boolean>>({ friend: true, message: true, group: true, like: true, comment: true, ...profile.notif_prefs });
  const LABELS: [string, string][] = [['friend', 'Solicitações e aceites de amizade'], ['message', 'Mensagens'], ['group', 'Convites e pedidos de grupos'], ['like', 'Curtidas'], ['comment', 'Comentários']];

  const save = async () => {
    try {
      await updateProfile(profile.id, { notif_prefs: prefs });
      await onSaved();
      toast('Preferências salvas.');
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  return (
    <div className="settings" style={{ maxWidth: 560 }}>
      <section className="card">
        <h2>Aparência e sons</h2>
        <label htmlFor="th">Tema</label>
        <select id="th" value={theme} onChange={(e) => { const t = e.target.value as Theme; setTheme(t); applyTheme(t); }}>
          <option value="dark">Escuro (padrão)</option>
          <option value="light">Claro</option>
        </select>
        <label className="check"><input type="checkbox" checked={mute} onChange={(e) => { setMute(e.target.checked); setMuted(e.target.checked); }} /> Silenciar os sons de troféus</label>
      </section>
      <section className="card">
        <h2>Notificações</h2>
        {LABELS.map(([k, l]) => (
          <label className="check" key={k}><input type="checkbox" checked={prefs[k] !== false} onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })} /> {l}</label>
        ))}
        <p><button className="btn primary" onClick={() => void save()}>Salvar notificações</button></p>
      </section>
    </div>
  );
}
