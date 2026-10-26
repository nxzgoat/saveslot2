import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Stars } from '../components/common';
import { Cover, Empty, ErrorBox, Loading } from '../components/ui';
import { searchGameStats } from '../lib/social';
import { useAsync } from '../lib/useAsync';

export default function GamesPage() {
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [sinceDays, setSinceDays] = useState(0);
  const [sort, setSort] = useState<'recent' | 'rating' | 'reviews'>('recent');
  const res = useAsync(() => searchGameStats({ q, platform, minRating, sinceDays, sort }), [q, platform, minRating, sinceDays, sort]);

  return (
    <>
      <h1 style={{ fontSize: '2rem' }}>Jogos</h1>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar jogo" aria-label="Buscar jogo" />
      <div className="chips" style={{ marginTop: 12 }}>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Plataforma" style={{ width: 'auto' }}>
          <option value="">Todas as plataformas</option>
          {['steam', 'playstation', 'xbox', 'nintendo', 'pc', 'mobile', 'retro'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} aria-label="Nota mínima" style={{ width: 'auto' }}>
          <option value={0}>Qualquer nota</option>
          <option value={3}>Nota 3+</option>
          <option value={4}>Nota 4+</option>
          <option value={4.5}>Nota 4,5+</option>
        </select>
        <select value={sinceDays} onChange={(e) => setSinceDays(Number(e.target.value))} aria-label="Data de cadastro" style={{ width: 'auto' }}>
          <option value={0}>Qualquer data</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={365}>Último ano</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'rating' | 'reviews')} aria-label="Ordenar" style={{ width: 'auto' }}>
          <option value="recent">Mais recentes</option>
          <option value="rating">Melhor nota</option>
          <option value="reviews">Mais reviews</option>
        </select>
      </div>
      {res.loading && !res.data && <Loading />}
      {res.error && <ErrorBox message={res.error} onRetry={res.reload} />}
      {res.data && res.data.length === 0 && <Empty title="Nenhum jogo encontrado">Tente outros filtros.</Empty>}
      <div className="grid" style={{ marginTop: 12 }}>
        {(res.data ?? []).map((g) => (
          <Link key={g.game_id} to={`/jogo/${g.game_id}`} className="card pcard">
            <Cover game={g} />
            <div>
              <strong>{g.title}</strong>
              <div>{g.avg_rating != null ? <><Stars value={Number(g.avg_rating)} /> <span className="muted">({g.review_count})</span></> : <span className="muted">Sem reviews</span>}</div>
              <div className="muted">{g.platforms.join(', ')}</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
