import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Empty, ErrorBox, Loading } from '../components/ui';
import { errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';
import { deleteFriendship, myBlocks, myFriendships, profilesByIds, respondFriendRequest, unblockUser } from '../lib/social';
import { useToast } from '../lib/toast';
import type { Friendship, Profile } from '../lib/types';
import { useAsync } from '../lib/useAsync';

export default function Friends() {
  const { profile } = useAuth();
  const toast = useToast();
  const data = useAsync(async () => {
    if (!profile) return null;
    const [fr, blocks] = await Promise.all([myFriendships(profile.id), myBlocks(profile.id)]);
    const other = (f: Friendship) => (f.requester_id === profile.id ? f.addressee_id : f.requester_id);
    const profs = await profilesByIds([...new Set([...fr.map(other), ...blocks])]);
    return { fr, blocks, profs, other };
  }, [profile?.id]);

  if (!profile) return <Empty title="Entre para ver seus amigos"><Link to="/entrar">Fazer login</Link></Empty>;
  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorBox message={data.error} onRetry={data.reload} />;
  if (!data.data) return null;
  const { fr, blocks, profs, other } = data.data;
  const prof = (id: string): Profile | undefined => profs.find((p) => p.id === id);

  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      toast(ok);
      data.reload();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };
  const Person = ({ id, children }: { id: string; children: ReactNode }) => {
    const p = prof(id);
    return (
      <div className="row">
        <Avatar name={p?.display_name || p?.username || '?'} url={p?.avatar_url ?? null} size={40} />
        <div className="grow">{p ? <Link to={`/u/${p.username}`}><strong>{p.display_name || p.username}</strong> <span className="muted">@{p.username}</span></Link> : <span className="muted">Perfil indisponível</span>}</div>
        {children}
      </div>
    );
  };

  const incoming = fr.filter((f) => f.status === 'pending' && f.addressee_id === profile.id);
  const sent = fr.filter((f) => f.status === 'pending' && f.requester_id === profile.id);
  const friends = fr.filter((f) => f.status === 'accepted');

  return (
    <div className="narrow">
      <h1 style={{ fontSize: '2rem' }}>Amigos</h1>
      <p className="muted">Para achar pessoas, use a <Link to="/buscar">busca</Link>.</p>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2>Solicitações recebidas ({incoming.length})</h2>
        {incoming.length === 0 && <p className="muted">Nenhuma solicitação.</p>}
        {incoming.map((f) => (
          <Person key={f.id} id={other(f)}>
            <button className="btn primary" onClick={() => void act(() => respondFriendRequest(f.id, true), 'Amizade aceita.')}>Aceitar</button>
            <button className="btn" onClick={() => void act(() => respondFriendRequest(f.id, false), 'Solicitação recusada.')}>Recusar</button>
          </Person>
        ))}
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2>Solicitações enviadas ({sent.length})</h2>
        {sent.length === 0 && <p className="muted">Nenhuma solicitação pendente.</p>}
        {sent.map((f) => (
          <Person key={f.id} id={other(f)}>
            <button className="btn" onClick={() => void act(() => deleteFriendship(f.id), 'Solicitação cancelada.')}>Cancelar</button>
          </Person>
        ))}
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2>Meus amigos ({friends.length})</h2>
        {friends.length === 0 && <p className="muted">Você ainda não tem amigos adicionados.</p>}
        {friends.map((f) => {
          const p = prof(other(f));
          return (
            <Person key={f.id} id={other(f)}>
              {p && <Link className="btn" to={`/mensagens/${p.username}`}>Mensagem</Link>}
              <button className="btn danger" onClick={() => { if (window.confirm('Remover amizade?')) void act(() => deleteFriendship(f.id), 'Amizade removida.'); }}>Remover</button>
            </Person>
          );
        })}
      </section>

      <section className="card">
        <h2>Bloqueados ({blocks.length})</h2>
        {blocks.length === 0 && <p className="muted">Você não bloqueou ninguém.</p>}
        {blocks.map((id) => (
          <Person key={id} id={id}>
            <button className="btn" onClick={() => void act(() => unblockUser(profile.id, id), 'Usuário desbloqueado.')}>Desbloquear</button>
          </Person>
        ))}
      </section>
    </div>
  );
}
