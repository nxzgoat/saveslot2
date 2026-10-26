import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Comments } from '../components/PostCard';
import PostCard from '../components/PostCard';
import { fmtDay, RarityLine, ReviewText, Section, Stars } from '../components/common';
import { TrophyIcon } from '../components/Trophy';
import { Avatar, Cover, DemoBadge, Empty, ErrorBox, Loading } from '../components/ui';
import { errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  createPost, deleteReview, gamePlatinumPlayers, getEngagement, getGameAchievements, getGameStat, getReviews, hydratePosts, listPosts,
  profilesByIds, report, saveReview, setLike,
} from '../lib/social';
import { useToast } from '../lib/toast';
import { PLATFORMS, type Review } from '../lib/types';
import { useAsync } from '../lib/useAsync';

const RATINGS = Array.from({ length: 10 }, (_, i) => (i + 1) / 2);

function ReviewForm({ gameId, meId, mine, onSaved }: { gameId: string; meId: string; mine: Review | null; onSaved: () => void }) {
  const toast = useToast();
  const [rating, setRating] = useState(mine ? Number(mine.rating) : 4);
  const [text, setText] = useState(mine?.body ?? '');
  const [platform, setPlatform] = useState(mine?.platform ?? '');
  const [hours, setHours] = useState(mine?.hours != null ? String(mine.hours) : '');
  const [spoiler, setSpoiler] = useState(mine?.has_spoiler ?? false);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const h = hours === '' ? null : Number(hours);
    if (h !== null && (!Number.isFinite(h) || h < 0)) return toast('Horas inválidas.', 'error');
    setBusy(true);
    try {
      const saved = await saveReview({ game_id: gameId, profile_id: meId, rating, body: text.trim() || null, platform: platform || null, hours: h, has_spoiler: spoiler });
      if (share && saved) await createPost({ author_id: meId, kind: 'review', review_id: saved.id, game_id: gameId, platform: platform || null });
      toast(mine ? 'Review atualizado.' : 'Review publicado.');
      onSaved();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <label htmlFor="rt">Nota</label>
      <select id="rt" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
        {RATINGS.map((r) => <option key={r} value={r}>{String(r).replace('.', ',')} de 5</option>)}
      </select>
      <label htmlFor="pf">Plataforma ou versão jogada</label>
      <select id="pf" value={platform} onChange={(e) => setPlatform(e.target.value)}>
        <option value="">Não informar</option>
        {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <label htmlFor="hr">Horas jogadas (opcional)</label>
      <input id="hr" type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
      <label htmlFor="rv">Seu review ({text.length}/5000)</label>
      <textarea id="rv" value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} />
      <label className="check"><input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} /> Este review contém spoilers</label>
      <label className="check"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Compartilhar no feed</label>
      <p><button className="btn primary" disabled={busy}>{busy ? 'Salvando...' : mine ? 'Atualizar review' : 'Publicar review'}</button></p>
    </form>
  );
}

function ReviewItem({ review, name, avatar, username, meId, likes, liked, comments, onChange }: {
  review: Review; name: string; avatar: string | null; username: string; meId: string | null; likes: number; liked: boolean; comments: number; onChange: () => void;
}) {
  const toast = useToast();
  const [isLiked, setLiked] = useState(liked);
  const [count, setCount] = useState(likes);
  const [open, setOpen] = useState(false);
  const [cc, setCc] = useState(comments);

  const like = async () => {
    if (!meId) return toast('Entre na sua conta para curtir.', 'error');
    const next = !isLiked;
    setLiked(next);
    setCount((n) => n + (next ? 1 : -1));
    try {
      await setLike(meId, 'review', review.id, next);
    } catch (err) {
      setLiked(!next);
      setCount((n) => n + (next ? -1 : 1));
      toast(errMsg(err), 'error');
    }
  };
  const doReport = async () => {
    if (!meId) return toast('Entre na sua conta para denunciar.', 'error');
    const reason = window.prompt('Por que você está denunciando? (opcional)');
    if (reason === null) return;
    try {
      await report(meId, 'review', review.id, reason);
      toast('Denúncia enviada.');
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };
  const remove = async () => {
    if (!window.confirm('Excluir seu review?')) return;
    try {
      await deleteReview(review.id);
      toast('Review excluído.');
      onChange();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  return (
    <article className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ border: 0, padding: 0 }}>
        <Avatar name={name} url={avatar} size={36} />
        <div className="grow">
          <Link to={`/u/${username}`}><strong>{name}</strong></Link> <Stars value={Number(review.rating)} />
          <div className="muted">{review.platform ? `${PLATFORMS[review.platform as keyof typeof PLATFORMS] ?? review.platform} · ` : ''}{review.hours != null ? `${review.hours} h · ` : ''}{fmtDay(review.updated_at)}</div>
        </div>
      </div>
      <ReviewText text={review.body} spoiler={review.has_spoiler} />
      <div className="actions">
        <button className="btn" aria-pressed={isLiked} onClick={() => void like()}>{isLiked ? '♥' : '♡'} {count}</button>
        <button className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>Comentários {cc}</button>
        <button className="link" onClick={() => void doReport()}>Denunciar</button>
        {review.profile_id === meId && <button className="link" onClick={() => void remove()}>Excluir</button>}
      </div>
      {open && <Comments type="review" id={review.id} meId={meId} onCount={setCc} />}
    </article>
  );
}

export default function GamePage() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const me = profile?.id ?? null;
  const game = useAsync(() => getGameStat(id), [id]);
  const ach = useAsync(() => getGameAchievements(id, me), [id, me]);
  const plats = useAsync(() => gamePlatinumPlayers(id), [id]);
  const revs = useAsync(async () => {
    const list = await getReviews(id);
    const [authors, eng] = await Promise.all([profilesByIds(list.map((r) => r.profile_id)), getEngagement('review', list.map((r) => r.id), me)]);
    return { list, authors, eng };
  }, [id, me]);
  const feed = useAsync(async () => hydratePosts(await listPosts({ gameId: id, groupId: null, limit: 10 }), me), [id, me]);

  if (game.loading) return <Loading />;
  if (game.error) return <ErrorBox message={game.error} onRetry={game.reload} />;
  const g = game.data;
  if (!g) return <Empty title="Jogo não encontrado"><Link to="/jogos">Ver todos os jogos</Link></Empty>;

  const achs = ach.data ?? [];
  const unlocked = achs.filter((a) => a.unlocked).length;
  const mine = revs.data?.list.find((r) => r.profile_id === me) ?? null;

  return (
    <>
      <div className="card row" style={{ alignItems: 'flex-start' }}>
        <Cover game={g} />
        <div className="grow">
          <h1 style={{ fontSize: '2rem', margin: 0 }}>{g.title} {g.is_demo && <DemoBadge />}</h1>
          <p className="muted">{g.description ?? 'Sem descrição cadastrada.'}</p>
          <div>{g.avg_rating != null ? <><Stars value={Number(g.avg_rating)} /> <span className="muted">média de {String(g.avg_rating).replace('.', ',')} em {g.review_count} review(s)</span></> : <span className="muted">Ainda sem reviews.</span>}</div>
          <div className="muted">Plataformas: {g.platforms.length ? g.platforms.join(', ') : 'não informadas'}</div>
        </div>
      </div>

      <Section title="Conquistas e raridade">
        {ach.loading && !ach.data && <Loading />}
        {ach.error && <ErrorBox message={ach.error} onRetry={ach.reload} />}
        {ach.data && achs.length === 0 && <p className="muted">Nenhuma conquista cadastrada para este jogo.</p>}
        {achs.length > 0 && me && <p className="muted">Seu progresso: {unlocked} de {achs.length} ({Math.round((unlocked / achs.length) * 100)}%)</p>}
        {achs.map((a) => (
          <div className="row" key={a.id} style={{ opacity: me && !a.unlocked ? 0.6 : 1 }}>
            <TrophyIcon tier={a.rarity?.tier ?? 'bronze'} size={30} />
            <div className="grow">
              <strong>{a.title}</strong>{a.is_dlc && <span className="tag"> DLC</span>}
              <div className="muted">{a.description}</div>
              <RarityLine rarity={a.rarity} />
            </div>
            {a.unlocked && <span className="tag completed">Desbloqueada{a.unlocked_at ? ` em ${fmtDay(a.unlocked_at)}` : ''}</span>}
          </div>
        ))}
      </Section>

      <Section title="Quem concluiu (Platina)">
        {plats.data && plats.data.length === 0 && <p className="muted">Ninguém ainda, ou os perfis são privados.</p>}
        <div className="chips">
          {(plats.data ?? []).map((p) => p.profile && (
            <Link key={p.profile_id} to={`/u/${p.profile.username}`} className="card row" style={{ padding: 8 }}>
              <Avatar name={p.profile.display_name || p.profile.username} url={p.profile.avatar_url} size={28} /> @{p.profile.username}
            </Link>
          ))}
        </div>
      </Section>

      <Section title={mine ? 'Seu review' : 'Escrever review'}>
        {me ? <ReviewForm key={mine?.updated_at ?? 'new'} gameId={id} meId={me} mine={mine} onSaved={() => { revs.reload(); game.reload(); }} /> : <p className="muted"><Link to="/entrar">Entre</Link> para escrever um review.</p>}
      </Section>

      <Section title="Reviews">
        {revs.loading && !revs.data && <Loading />}
        {revs.error && <ErrorBox message={revs.error} onRetry={revs.reload} />}
        {revs.data && revs.data.list.length === 0 && <Empty title="Ainda não há reviews">Seja o primeiro.</Empty>}
        {revs.data?.list.map((r) => {
          const a = revs.data!.authors.find((x) => x.id === r.profile_id);
          return (
            <ReviewItem
              key={r.id} review={r} name={a?.display_name || a?.username || 'Usuário'} avatar={a?.avatar_url ?? null} username={a?.username ?? ''}
              meId={me} likes={revs.data!.eng.likes.get(r.id) ?? 0} liked={revs.data!.eng.liked.has(r.id)} comments={revs.data!.eng.comments.get(r.id) ?? 0}
              onChange={() => { revs.reload(); game.reload(); }}
            />
          );
        })}
      </Section>

      <Section title="Atividade sobre este jogo">
        {feed.data && feed.data.length === 0 && <p className="muted">Nenhuma publicação sobre este jogo ainda.</p>}
        <div style={{ display: 'grid', gap: 12 }}>{(feed.data ?? []).map((p) => <PostCard key={p.id} post={p} meId={me} onChange={feed.reload} />)}</div>
      </Section>
    </>
  );
}
