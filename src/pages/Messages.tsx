import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, Empty, ErrorBox, Loading } from '../components/ui';
import { fmtDateTime } from '../components/common';
import { errMsg, getProfile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { getThread, markThreadRead, myConversations, profilesByIds, sendMessage } from '../lib/social';
import { useLive } from '../lib/useLive';
import type { Profile } from '../lib/types';
import { useAsync } from '../lib/useAsync';

function Thread({ me, other, onRead }: { me: Profile; other: Profile; onRead: () => void }) {
  const thread = useAsync(async () => {
    const t = await getThread(me.id, other.id);
    if (t.some((m) => m.recipient_id === me.id && !m.read_at)) {
      await markThreadRead(me.id, other.id);
      onRead();
    }
    return t;
  }, [me.id, other.id]);
  useLive('messages', `recipient_id=eq.${me.id}`, thread.reload, 6000);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [thread.data?.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await sendMessage(me.id, other.id, text.trim());
      setText('');
      thread.reload();
    } catch (err) {
      setError(`Falha ao enviar: ${errMsg(err)}. Sua mensagem continua na caixa para tentar de novo.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="thread card">
      <header className="row" style={{ padding: '0 0 10px' }}>
        <Avatar name={other.display_name || other.username} url={other.avatar_url} size={36} />
        <Link to={`/u/${other.username}`} className="grow"><strong>{other.display_name || other.username}</strong> <span className="muted">@{other.username}</span></Link>
      </header>
      <div className="msgs" aria-live="polite">
        {thread.loading && !thread.data && <Loading />}
        {thread.error && <ErrorBox message={thread.error} onRetry={thread.reload} />}
        {thread.data && thread.data.length === 0 && <Empty title="Nenhuma mensagem ainda">Diga oi para começar a conversa.</Empty>}
        {(thread.data ?? []).map((m) => (
          <div key={m.id} className={`msg ${m.sender_id === me.id ? 'mine' : ''}`}>
            <div>{m.body}</div>
            <small className="muted">{fmtDateTime(m.created_at)}{m.sender_id === me.id ? (m.read_at ? ' · lida' : ' · enviada') : ''}</small>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <form onSubmit={send} className="row" style={{ border: 0 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Escreva uma mensagem" aria-label="Mensagem" />
        <button className="btn primary" disabled={busy || !text.trim()}>{busy ? 'Enviando...' : 'Enviar'}</button>
      </form>
    </div>
  );
}

export default function Messages() {
  const { username } = useParams();
  const { profile } = useAuth();
  const list = useAsync(async () => {
    if (!profile) return [];
    const c = await myConversations();
    const profs = await profilesByIds(c.map((x) => x.partner_id));
    return c.map((x) => ({ ...x, profile: profs.find((p) => p.id === x.partner_id) }));
  }, [profile?.id]);
  useLive('messages', profile ? `recipient_id=eq.${profile.id}` : undefined, list.reload, 15000);
  const other = useAsync(() => (username ? getProfile(username) : Promise.resolve(null)), [username]);

  if (!profile) return <Empty title="Entre para ver suas mensagens"><Link to="/entrar">Fazer login</Link></Empty>;

  return (
    <div className={`messages ${username ? 'has-thread' : ''}`}>
      <aside className="card convs">
        <h2>Conversas</h2>
        {list.loading && !list.data && <Loading />}
        {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
        {list.data && list.data.length === 0 && <p className="muted">Nenhuma conversa. Escolha um amigo em <Link to="/amigos">Amigos</Link>.</p>}
        {(list.data ?? []).map((c) => (
          <Link key={c.partner_id} to={`/mensagens/${c.profile?.username ?? ''}`} className={`row conv ${c.profile?.username === username ? 'active' : ''}`}>
            <Avatar name={c.profile?.display_name || c.profile?.username || '?'} url={c.profile?.avatar_url ?? null} size={36} />
            <div className="grow">
              <strong>{c.profile?.display_name || c.profile?.username || 'Usuário'}</strong>
              <div className="muted clamp">{c.last_body}</div>
            </div>
            {c.unread > 0 && <span className="count" aria-label={`${c.unread} não lidas`}>{c.unread}</span>}
          </Link>
        ))}
      </aside>
      <section className="pane">
        {!username && <Empty title="Selecione uma conversa">Só é possível conversar com amigos.</Empty>}
        {username && other.loading && <Loading />}
        {username && other.data === null && !other.loading && <Empty title="Usuário não encontrado" />}
        {username && other.data && <Thread key={other.data.id} me={profile} other={other.data} onRead={list.reload} />}
        {username && <p className="muted"><Link to="/mensagens">← Todas as conversas</Link></p>}
      </section>
    </div>
  );
}
