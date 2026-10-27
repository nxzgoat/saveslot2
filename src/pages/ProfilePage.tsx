import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Diary from '../components/Diary';
import FriendButton from '../components/FriendButton';
import { TrophyIcon } from '../components/Trophy';
import { Avatar, Cover, DemoBadge, Empty, ErrorBox, Loading, ProfileCard } from '../components/ui';
import { getLibrary, getLinks, getProfile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { friendIdsOf, getProfileStats, profilesByIds } from '../lib/social';
import { TIER_SHORT } from '../lib/trophy';
import { PLATFORMS, STATUS, type LibraryEntry, type LinkedAccount, type Status, type Tier } from '../lib/types';
import { useAsync } from '../lib/useAsync';

type Tab = 'geral' | 'diario' | 'biblioteca' | 'amigos';
const fmtDate = (s: string | null) => (s ? new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR') : '—');

export default function ProfilePage() {
  const { username = '' } = useParams();
  const { profile: me } = useAuth();
  const [tab, setTab] = useState<Tab>('geral');
  const [filter, setFilter] = useState<Status | 'all'>('all');

  const prof = useAsync(() => getProfile(username), [username]);
  const p = prof.data ?? null;
  const lib = useAsync(() => (p ? getLibrary(p.id) : Promise.resolve([] as LibraryEntry[])), [p?.id]);
  const links = useAsync(() => (p ? getLinks(p.id) : Promise.resolve([] as LinkedAccount[])), [p?.id]);
  const stats = useAsync(() => (p ? getProfileStats(p.id) : Promise.resolve(null)), [p?.id]);
  const friends = useAsync(async () => (p && tab === 'amigos' ? profilesByIds(await friendIdsOf(p.id)) : []), [p?.id, tab]);

  if (prof.loading) return <Loading label="Carregando perfil..." />;
  if (prof.error) return <ErrorBox message={prof.error} onRetry={prof.reload} />;
  if (!p) {
    return (
      <>
        <Empty title="Perfil não encontrado">Esse usuário não existe ou o perfil é privado.</Empty>
        <p style={{ textAlign: 'center' }}><Link className="btn" to="/buscar">Buscar outros jogadores</Link></p>
      </>
    );
  }

  const owner = me?.id === p.id;
  const name = p.display_name || p.username;
  const libVisible = p.show_library || owner;
  const achVisible = p.show_achievements || owner;
  const games = lib.data ?? [];
  const totalHours = games.reduce((s, g) => s + (g.hours ?? 0), 0);
  const shown = filter === 'all' ? games : games.filter((g) => g.status === filter);
  const favorites = games.filter((g) => g.is_favorite);
  const playing = games.filter((g) => g.status === 'playing').slice(0, 4);
  const st = stats.data;
  const connected = (links.data ?? []).filter((l) => l.external_id || l.is_demo);

  return (
    <>
      <div className="banner" style={p.banner_url ? { backgroundImage: `url(${p.banner_url})` } : undefined} />
      <div className="phead">
        <Avatar name={name} url={p.avatar_url} size={96} />
        <div className="meta">
          <h1>{name} {p.is_demo && <DemoBadge />}</h1>
          <div className="muted">@{p.username}{p.location ? ` · ${p.location}` : ''} · no Saveslot desde {new Date(p.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</div>
        </div>
        {owner ? <Link className="btn" to="/configuracoes">Editar perfil</Link> : me && !p.is_demo && <FriendButton me={me} other={p} />}
      </div>

      <div className="tabs" role="tablist">
        {([['geral', 'Visão geral'], ['diario', 'Diário gamer'], ['biblioteca', 'Biblioteca'], ['amigos', 'Amigos']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'geral' && (
        <>
          {p.is_demo && <p className="muted">Perfil de demonstração: todos os dados são fictícios.</p>}
          {st && (
            <section className="card trophies" aria-label="Resumo de troféus do Saveslot">
              {(['bronze', 'silver', 'gold', 'platinum'] as Tier[]).map((t) => (
                <div key={t} className="trophy-count"><TrophyIcon tier={t} size={34} /><strong>{st[t]}</strong><span className="muted">{TIER_SHORT[t]}</span></div>
              ))}
              <div className="trophy-count"><strong style={{ fontSize: '1.6rem' }}>{st.points}</strong><span className="muted">pontos · nível {st.level}</span></div>
            </section>
          )}
          {libVisible && !lib.loading && !lib.error && (
            <div className="stats">
              <div className="card stat"><strong>{games.length}</strong>jogos na biblioteca</div>
              <div className="card stat"><strong>{totalHours.toFixed(1)}</strong>horas registradas</div>
              <div className="card stat"><strong>{games.filter((g) => g.status === 'completed').length}</strong>zerados</div>
            </div>
          )}
          <div className="grid">
            <section className="card">
              <h2>Sobre</h2>
              {p.bio ? <p>{p.bio}</p> : <p className="muted">{owner ? 'Você ainda não escreveu uma bio.' : 'Sem bio.'}</p>}
            </section>
            <section className="card">
              <h2>Plataformas e links</h2>
              {links.loading && <Loading />}
              {links.error && <p className="err">{links.error}</p>}
              {links.data && links.data.length === 0 && <p className="muted">Nenhum link adicionado.</p>}
              {(links.data ?? []).map((l) => (
                <div key={l.id} className="row">
                  <span className="tag">{l.platform}</span>
                  {l.url ? <a href={l.url} target="_blank" rel="noopener noreferrer nofollow">{l.username || l.url}</a> : <span>{l.username}</span>}
                  {l.is_demo && <span className="muted">dados simulados</span>}
                  {l.external_id && !l.verified && <span className="muted">não verificada</span>}
                </div>
              ))}
              {connected.length > 0 && <p className="muted">{connected.length} conta(s) conectada(s)</p>}
            </section>
          </div>
          {libVisible && playing.length > 0 && (
            <section style={{ marginTop: 20 }}>
              <h2>Jogando agora</h2>
              <div className="grid">
                {playing.map((g) => (
                  <Link to={`/jogo/${g.game_id}`} className="card row" key={g.game_id}>
                    <Cover game={g.game} />
                    <div className="grow"><strong>{g.game.title}</strong><div className="muted">{PLATFORMS[g.platform]} · {g.hours ?? 0} h</div></div>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {libVisible && favorites.length > 0 && (
            <section style={{ marginTop: 20 }}>
              <h2>Jogos favoritos</h2>
              <div className="grid">
                {favorites.map((g) => (
                  <Link to={`/jogo/${g.game_id}`} className="card row" key={g.game_id}>
                    <Cover game={g.game} />
                    <div className="grow"><strong>{g.game.title}</strong><div className="muted">{PLATFORMS[g.platform]}</div></div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {tab === 'diario' && <Diary profile={p} owner={owner} showAchievements={achVisible} showActivity={p.show_activity || owner} />}

      {tab === 'biblioteca' && (
        !libVisible ? <Empty title="Biblioteca privada">Este jogador escolheu não mostrar a biblioteca.</Empty>
        : lib.loading ? <Loading />
        : lib.error ? <ErrorBox message={lib.error} onRetry={lib.reload} />
        : (
          <>
            <div className="chips">
              {(['all', 'playing', 'completed', 'backlog', 'dropped'] as const).map((s) => (
                <button key={s} aria-pressed={filter === s} onClick={() => setFilter(s)}>{s === 'all' ? 'Todos' : STATUS[s]}</button>
              ))}
            </div>
            {shown.length === 0 ? (
              <Empty title="Nenhum jogo aqui">{owner ? 'Adicione jogos em Configurações.' : 'Esse jogador ainda não adicionou jogos nessa categoria.'}</Empty>
            ) : (
              <div className="card">
                {shown.map((g) => (
                  <div className="row" key={g.game_id}>
                    <Cover game={g.game} />
                    <div className="grow">
                      <Link to={`/jogo/${g.game_id}`}><strong>{g.game.title}</strong></Link>
                      <div className="muted">{PLATFORMS[g.platform]} · última vez em {fmtDate(g.last_played_at)}</div>
                    </div>
                    <span className={`tag ${g.status}`}>{STATUS[g.status]}</span>
                    <div style={{ textAlign: 'right', minWidth: 70 }}>
                      <div>{g.hours == null ? '—' : `${g.hours} h`}</div>
                      <div className="muted">{g.rating == null ? 'sem nota' : `nota ${g.rating}/10`}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )
      )}

      {tab === 'amigos' && (
        friends.loading && !friends.data ? <Loading />
        : friends.error ? <ErrorBox message={friends.error} onRetry={friends.reload} />
        : (friends.data ?? []).length === 0 ? <Empty title="Nenhum amigo para mostrar">{p.show_friends || owner ? 'Ainda não há amizades.' : 'Este jogador escolheu ocultar a lista de amigos.'}</Empty>
        : <div className="grid">{(friends.data ?? []).map((f) => <ProfileCard key={f.id} p={f} />)}</div>
      )}
    </>
  );
}
