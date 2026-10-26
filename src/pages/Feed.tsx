import { useState } from 'react';
import { Link } from 'react-router-dom';
import Composer from '../components/Composer';
import PostCard from '../components/PostCard';
import { Empty, ErrorBox, Loading } from '../components/ui';
import { useAuth } from '../lib/auth';
import { acceptedFriendIds, hydratePosts, listPosts } from '../lib/social';
import { useAsync } from '../lib/useAsync';

type Tab = 'para-voce' | 'amigos' | 'em-alta';
const TABS: [Tab, string][] = [['para-voce', 'Para você'], ['amigos', 'Amigos'], ['em-alta', 'Em alta']];
const PLATFORM_OPTIONS = ['steam', 'playstation', 'xbox', 'nintendo', 'pc', 'mobile', 'retro', 'epic', 'googleplay'];

export default function Feed() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('para-voce');
  const [kind, setKind] = useState('');
  const [platform, setPlatform] = useState('');
  const [limit, setLimit] = useState(20);

  const feed = useAsync(async () => {
    const me = profile?.id ?? null;
    let authorIds: string[] | undefined;
    if (tab === 'amigos') {
      if (!me) return [];
      authorIds = [me, ...(await acceptedFriendIds(me))];
    }
    const since = tab === 'em-alta' ? new Date(Date.now() - 7 * 864e5).toISOString() : undefined;
    const posts = await listPosts({ groupId: null, authorIds, kind: kind || undefined, platform: platform || undefined, since, limit: tab === 'em-alta' ? 100 : limit });
    const views = await hydratePosts(posts, me);
    return tab === 'em-alta' ? views.sort((a, b) => b.likes + b.comments * 2 - (a.likes + a.comments * 2)).slice(0, limit) : views;
  }, [tab, kind, platform, limit, profile?.id]);

  return (
    <div className="narrow">
      <h1 style={{ fontSize: '2rem' }}>Feed</h1>
      <Composer onPosted={feed.reload} />
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setLimit(20); }}>{label}</button>)}
      </div>
      <div className="chips">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo de atividade" style={{ width: 'auto' }}>
          <option value="">Todos os tipos</option>
          <option value="text">Publicações</option>
          <option value="achievement">Conquistas</option>
          <option value="platinum">Platinas</option>
          <option value="review">Reviews</option>
        </select>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Plataforma" style={{ width: 'auto' }}>
          <option value="">Todas as plataformas</option>
          {PLATFORM_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {tab === 'amigos' && !profile && <Empty title="Entre para ver seus amigos"><Link to="/entrar">Fazer login</Link></Empty>}
      {feed.loading && !feed.data && <Loading label="Carregando o feed..." />}
      {feed.error && <ErrorBox message={feed.error} onRetry={feed.reload} />}
      {feed.data && feed.data.length === 0 && !(tab === 'amigos' && !profile) && (
        <Empty title="Nada por aqui ainda">{tab === 'amigos' ? 'Adicione amigos em Pessoas para ver o que eles publicam.' : 'Seja o primeiro a publicar.'}</Empty>
      )}
      <div style={{ display: 'grid', gap: 14 }}>
        {(feed.data ?? []).map((p) => <PostCard key={p.id} post={p} meId={profile?.id ?? null} onChange={feed.reload} />)}
      </div>
      {feed.data && feed.data.length >= limit && <p style={{ textAlign: 'center' }}><button className="btn" onClick={() => setLimit(limit + 20)}>Carregar mais</button></p>}
    </div>
  );
}
