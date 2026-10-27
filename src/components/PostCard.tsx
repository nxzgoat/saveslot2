import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { addComment, deleteComment, deletePost, getComments, repost, report, setLike, setSave, type CommentView, type PostView } from '../lib/social';
import { errMsg } from '../lib/api';
import { useToast } from '../lib/toast';
import { useAsync } from '../lib/useAsync';
import { fmtDateTime, fmtDay, RarityLine, Rich, ReviewText, Stars } from './common';
import { TrophyIcon } from './Trophy';
import { Avatar, Cover, Loading } from './ui';

function Comments({ type, id, meId, onCount }: { type: 'post' | 'review'; id: string; meId: string | null; onCount: (n: number) => void }) {
  const toast = useToast();
  const list = useAsync(async () => {
    const c = await getComments(type, id);
    onCount(c.length);
    return c;
  }, [type, id]);
  const [text, setText] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!meId || !text.trim()) return;
    try {
      await addComment(meId, type, id, text.trim());
      setText('');
      list.reload();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };
  const remove = async (c: CommentView) => {
    try {
      await deleteComment(c.id);
      list.reload();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  return (
    <div className="comments">
      {list.loading && !list.data && <Loading />}
      {list.error && <p className="err">{list.error}</p>}
      {(list.data ?? []).map((c) => (
        <div className="row" key={c.id} style={{ alignItems: 'flex-start' }}>
          <Avatar name={c.author?.display_name || c.author?.username || '?'} url={c.author?.avatar_url ?? null} size={28} />
          <div className="grow">
            <Link to={`/u/${c.author?.username ?? ''}`}><strong>{c.author?.display_name || c.author?.username}</strong></Link>{' '}
            <span className="muted">{fmtDateTime(c.created_at)}</span>
            <Rich text={c.body} />
          </div>
          {c.author_id === meId && <button className="link" onClick={() => void remove(c)}>Apagar</button>}
        </div>
      ))}
      {meId ? (
        <form onSubmit={submit} className="row" style={{ border: 0 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Escreva um comentário" aria-label="Comentário" />
          <button className="btn" disabled={!text.trim()}>Comentar</button>
        </form>
      ) : (
        <p className="muted"><Link to="/entrar">Entre</Link> para comentar.</p>
      )}
    </div>
  );
}

export default function PostCard({ post, meId, canModerate, onChange, expanded }: { post: PostView; meId: string | null; canModerate?: boolean; onChange: () => void; expanded?: boolean }) {
  const toast = useToast();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [saved, setSaved] = useState(post.saved);
  const [open, setOpen] = useState(Boolean(expanded));
  const [commentCount, setCommentCount] = useState(post.comments);
  const name = post.author?.display_name || post.author?.username || 'Usuário';
  const needLogin = () => {
    toast('Entre na sua conta para interagir.', 'error');
    return false;
  };

  const like = async () => {
    if (!meId) return void needLogin();
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      await setLike(meId, 'post', post.id, next);
    } catch (err) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      toast(errMsg(err), 'error');
    }
  };
  const save = async () => {
    if (!meId) return void needLogin();
    try {
      await setSave(meId, post.id, !saved);
      setSaved(!saved);
      toast(saved ? 'Removido dos salvos.' : 'Publicação salva.');
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };
  const doRepost = async () => {
    if (!meId) return void needLogin();
    try {
      await repost(meId, post);
      toast('Repostado no seu perfil.');
      onChange();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };
  const doReport = async () => {
    if (!meId) return void needLogin();
    const reason = window.prompt('Por que você está denunciando? (opcional)');
    if (reason === null) return;
    try {
      await report(meId, 'post', post.id, reason);
      toast('Denúncia enviada. Obrigado.');
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };
  const remove = async () => {
    if (!window.confirm('Apagar esta publicação?')) return;
    try {
      await deletePost(post.id);
      toast('Publicação apagada.');
      onChange();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${import.meta.env.BASE_URL}post/${post.id}`);
      toast('Link copiado.');
    } catch {
      toast('Não foi possível copiar o link.', 'error');
    }
  };

  const isPlat = post.kind === 'platinum';
  return (
    <article className={`card post ${isPlat ? 'post-platinum' : ''}`} id={`post-${post.id}`}>
      <header className="row" style={{ border: 0, padding: 0 }}>
        <Avatar name={name} url={post.author?.avatar_url ?? null} size={40} />
        <div className="grow">
          <Link to={`/u/${post.author?.username ?? ''}`}><strong>{name}</strong></Link>{' '}
          <span className="muted">@{post.author?.username} · <Link to={`/post/${post.id}`}>{fmtDateTime(post.created_at)}</Link></span>
          {post.group && <div className="muted">em <Link to={`/grupo/${post.group.id}`}>{post.group.name}</Link></div>}
          {post.original && <div className="muted">repostou</div>}
        </div>
      </header>

      {post.body && <Rich text={post.body} />}
      {post.image_url && <img className="post-img" src={post.image_url} alt="Imagem da publicação" loading="lazy" />}

      {post.original && (
        <div className="embed">
          <strong>{post.original.author?.display_name || post.original.author?.username}</strong>{' '}
          <span className="muted">@{post.original.author?.username}</span>
          {post.original.post.body && <Rich text={post.original.post.body} />}
          {post.original.post.image_url && <img className="post-img" src={post.original.post.image_url} alt="Imagem da publicação original" loading="lazy" />}
          <Link to={`/post/${post.original.post.id}`}>Ver original</Link>
        </div>
      )}

      {(post.kind === 'achievement' || isPlat) && post.game && (
        <div className="embed game-embed">
          <Cover game={post.game} />
          <div className="grow">
            {post.achievement ? (
              <>
                <strong>{post.achievement.title}</strong>
                {post.achievement.description && <div className="muted">{post.achievement.description}</div>}
                <RarityLine rarity={post.achievement.rarity} />
              </>
            ) : (
              <>
                <strong>Platina conquistada!</strong>
                <div className="muted">100% das conquistas do jogo base.</div>
              </>
            )}
            <div className="muted">
              <Link to={`/jogo/${post.game.id}`}>{post.game.title}</Link>
              {post.platform && ` · ${post.platform}`}
            </div>
          </div>
          <TrophyIcon tier={isPlat ? 'platinum' : (post.achievement?.rarity?.tier ?? 'bronze')} size={isPlat ? 56 : 40} />
        </div>
      )}

      {post.kind === 'review' && post.review && post.game && (
        <div className="embed game-embed">
          <Cover game={post.game} />
          <div className="grow">
            <Link to={`/jogo/${post.game.id}`}><strong>{post.game.title}</strong></Link> <Stars value={Number(post.review.rating)} />
            <div className="muted">{post.review.platform ?? ''}{post.review.hours != null ? ` · ${post.review.hours} h` : ''} · {fmtDay(post.review.updated_at)}</div>
            <ReviewText text={post.review.body} spoiler={post.review.has_spoiler} />
            <Link to={`/jogo/${post.game.id}`}>Ler review completo</Link>
          </div>
        </div>
      )}

      <footer className="actions post-actions">
        <button className="btn" aria-pressed={liked} onClick={() => void like()}>{liked ? '♥' : '♡'} {likes}</button>
        <button className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>Comentários {commentCount}</button>
        <button className="btn" onClick={() => void doRepost()}>Repostar</button>
        <button className="btn" aria-pressed={saved} onClick={() => void save()}>{saved ? 'Salvo' : 'Salvar'}</button>
        <button className="btn" onClick={() => void copyLink()}>Copiar link</button>
        <button className="link" onClick={() => void doReport()}>Denunciar</button>
        {(post.author_id === meId || canModerate) && <button className="link" onClick={() => void remove()}>Apagar</button>}
      </footer>
      {open && <Comments type="post" id={post.id} meId={meId} onCount={setCommentCount} />}
    </article>
  );
}

export { Comments };
