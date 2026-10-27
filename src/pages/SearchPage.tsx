import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Stars } from '../components/common';
import PostCard from '../components/PostCard';
import { Cover, Empty, ErrorBox, Loading, ProfileCard } from '../components/ui';
import { catalogSync, searchProfiles } from '../lib/api';
import { useAuth } from '../lib/auth';
import { hydratePosts, listGroups, listPosts, searchGameStats } from '../lib/social';
import { useAsync } from '../lib/useAsync';

type T = 'pessoas' | 'jogos' | 'grupos' | 'hashtags';
const TABS: [T, string][] = [['pessoas', 'Pessoas'], ['jogos', 'Jogos'], ['grupos', 'Grupos'], ['hashtags', 'Hashtags']];

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const { profile } = useAuth();
  const q = params.get('q') ?? '';
  const t = (params.get('t') as T) || 'pessoas';
  const [input, setInput] = useState(q);

  useEffect(() => {
    setInput(q);
  }, [q]);
  useEffect(() => {
    if (input === q) return;
    const id = setTimeout(() => setParams({ t, ...(input ? { q: input } : {}) }, { replace: true }), 300);
    return () => clearTimeout(id);
  }, [input, q, t, setParams]);

  const res = useAsync(async () => {
    if (t === 'pessoas') return { kind: 'pessoas' as const, data: await searchProfiles(q) };
    if (t === 'jogos') {
      if (q.trim().length >= 2 && profile) await catalogSync({ action: 'catalog_search', q });
      return { kind: 'jogos' as const, data: await searchGameStats({ q }) };
    }
    if (t === 'grupos') return { kind: 'grupos' as const, data: await listGroups(q) };
    const tag = q.replace(/^#/, '').trim();
    if (!tag) return { kind: 'hashtags' as const, data: [] };
    return { kind: 'hashtags' as const, data: await hydratePosts(await listPosts({ hashtag: tag, groupId: null, limit: 30 }), profile?.id ?? null) };
  }, [q, t, profile?.id]);

  const d = res.data;
  const empty = d && d.data.length === 0;

  return (
    <>
      <h1 style={{ fontSize: '2rem' }}>Busca</h1>
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t === 'hashtags' ? 'Hashtag, sem o #' : 'Digite para buscar'} aria-label="Buscar" autoFocus />
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={t === k} onClick={() => setParams({ t: k, ...(q ? { q } : {}) })}>{l}</button>)}
      </div>
      {res.loading && !res.data && <Loading label="Buscando..." />}
      {res.error && <ErrorBox message={res.error} onRetry={res.reload} />}
      {empty && <Empty title={q ? `Nada encontrado para "${q}"` : t === 'hashtags' ? 'Digite uma hashtag' : 'Nada por aqui ainda'}>{q ? 'Confira a grafia ou tente outro termo.' : ''}</Empty>}
      {d?.kind === 'pessoas' && <div className="grid">{d.data.map((p) => <ProfileCard key={p.id} p={p} />)}</div>}
      {d?.kind === 'jogos' && (
        <div className="grid">
          {d.data.map((g) => (
            <Link key={g.game_id} to={`/jogo/${g.game_id}`} className="card pcard">
              <Cover game={g} />
              <div><strong>{g.title}</strong><div>{g.avg_rating != null ? <Stars value={Number(g.avg_rating)} /> : <span className="muted">Sem reviews</span>}</div></div>
            </Link>
          ))}
        </div>
      )}
      {d?.kind === 'grupos' && (
        <div className="grid">
          {d.data.map((g) => (
            <Link key={g.id} to={`/grupo/${g.id}`} className="card">
              <strong>{g.name}</strong> <span className="tag">{g.visibility === 'public' ? 'Público' : 'Privado'}</span>
              <p className="clamp">{g.description}</p>
            </Link>
          ))}
        </div>
      )}
      {d?.kind === 'hashtags' && <div className="narrow" style={{ display: 'grid', gap: 14 }}>{d.data.map((p) => <PostCard key={p.id} post={p} meId={profile?.id ?? null} onChange={res.reload} />)}</div>}
    </>
  );
}
