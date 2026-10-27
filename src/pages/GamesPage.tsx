import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Stars } from '../components/common';
import { Cover, Empty, ErrorBox, Loading } from '../components/ui';
import { catalogSync } from '../lib/api';
import { GAMES_PAGE_SIZE, searchGameStats } from '../lib/social';
import { useAsync } from '../lib/useAsync';

type Sort = 'popular' | 'recent' | 'rating' | 'reviews';

export default function GamesPage() {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [sinceDays, setSinceDays] = useState(0);
  const [sort, setSort] = useState<Sort>('popular');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setQ(input.trim()); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [input]);

  // 1) pede ao servidor para trazer jogos reais do catálogo (IGDB); 2) lê o que está no banco
  const res = useAsync(async () => {
    const catalogError = await catalogSync(q.length >= 2 ? { action: 'catalog_search', q } : { action: 'catalog_popular', page });
    const list = await searchGameStats({ q, platform, minRating, sinceDays, sort, page });
    return { list, catalogError };
  }, [q, platform, minRating, sinceDays, sort, page]);

  const list = res.data?.list ?? [];
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };

  return (
    <>
      <h1 style={{ fontSize: '2rem' }}>Jogos</h1>
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Buscar jogo pelo nome" aria-label="Buscar jogo" />
      <div className="chips" style={{ marginTop: 12 }}>
        <select value={platform} onChange={(e) => reset(setPlatform)(e.target.value)} aria-label="Plataforma" style={{ width: 'auto' }}>
          <option value="">Plataformas dos jogadores</option>
          {['steam', 'playstation', 'xbox', 'nintendo', 'pc', 'mobile', 'retro'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={minRating} onChange={(e) => reset(setMinRating)(Number(e.target.value))} aria-label="Nota mínima dos reviews" style={{ width: 'auto' }}>
          <option value={0}>Qualquer nota</option>
          <option value={3}>Nota 3+</option>
          <option value={4}>Nota 4+</option>
          <option value={4.5}>Nota 4,5+</option>
        </select>
        <select value={sinceDays} onChange={(e) => reset(setSinceDays)(Number(e.target.value))} aria-label="Lançamento" style={{ width: 'auto' }}>
          <option value={0}>Qualquer lançamento</option>
          <option value={365}>Lançados no último ano</option>
          <option value={1825}>Últimos 5 anos</option>
        </select>
        <select value={sort} onChange={(e) => reset(setSort)(e.target.value as Sort)} aria-label="Ordenar" style={{ width: 'auto' }}>
          <option value="popular">Mais populares</option>
          <option value="recent">Lançamento mais recente</option>
          <option value="rating">Melhor nota dos reviews</option>
          <option value="reviews">Mais reviews</option>
        </select>
      </div>

      {res.data?.catalogError && (
        <p className="notice" role="status" style={{ borderRadius: 8, marginTop: 12 }}>
          O catálogo online não respondeu ({res.data.catalogError}). Mostrando só os jogos que já estão salvos no site.
        </p>
      )}
      {res.loading && !res.data && <Loading label="Buscando jogos..." />}
      {res.error && <ErrorBox message={res.error} onRetry={res.reload} />}
      {res.data && list.length === 0 && (
        <Empty title="Nenhum jogo encontrado">{q ? 'Tente outro nome ou limpe os filtros.' : 'O catálogo ainda está vazio. Confira se a função "integrations" e as chaves do IGDB estão configuradas (veja o README).'}</Empty>
      )}
      <div className="grid games-grid" style={{ marginTop: 12 }}>
        {list.map((g) => (
          <Link key={g.game_id} to={`/jogo/${g.game_id}`} className="card game-tile">
            <Cover game={g} />
            <div>
              <strong>{g.title}</strong>
              <div className="muted">{g.release_date ? new Date(`${g.release_date}T00:00:00`).getFullYear() : 'Sem data'}</div>
              <div>{g.avg_rating != null ? <><Stars value={Number(g.avg_rating)} /> <span className="muted">({g.review_count})</span></> : <span className="muted">Sem reviews</span>}</div>
            </div>
          </Link>
        ))}
      </div>
      <div className="actions" style={{ justifyContent: 'center', marginTop: 16 }}>
        <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
        <span className="muted" style={{ alignSelf: 'center' }}>Página {page + 1}</span>
        <button className="btn" disabled={list.length < GAMES_PAGE_SIZE} onClick={() => setPage(page + 1)}>Próxima</button>
      </div>
      <p className="muted" style={{ textAlign: 'center', marginTop: 16 }}>Dados e imagens dos jogos: <a href="https://www.igdb.com" target="_blank" rel="noopener noreferrer">IGDB.com</a></p>
    </>
  );
}
