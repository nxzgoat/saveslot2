import { Link } from 'react-router-dom';
import { errMsg } from '../lib/api';
import { blockUser, deleteFriendship, getFriendship, iBlocked, report, respondFriendRequest, sendFriendRequest, unblockUser } from '../lib/social';
import { useToast } from '../lib/toast';
import type { Profile } from '../lib/types';
import { useAsync } from '../lib/useAsync';

export default function FriendButton({ me, other }: { me: Profile; other: Profile }) {
  const toast = useToast();
  const rel = useAsync(async () => ({ f: await getFriendship(me.id, other.id), blocked: await iBlocked(me.id, other.id) }), [me.id, other.id]);

  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      toast(ok);
      rel.reload();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };
  const doReport = async () => {
    const reason = window.prompt('Por que você está denunciando este perfil? (opcional)');
    if (reason === null) return;
    await act(() => report(me.id, 'profile', other.id, reason), 'Denúncia enviada.');
  };

  if (rel.loading && !rel.data) return null;
  if (rel.error) return <p className="err">{rel.error}</p>;
  const f = rel.data?.f ?? null;
  const blocked = rel.data?.blocked ?? false;
  const iAsked = f?.requester_id === me.id;

  return (
    <div className="actions">
      {blocked ? (
        <button className="btn" onClick={() => void act(() => unblockUser(me.id, other.id), 'Usuário desbloqueado.')}>Desbloquear</button>
      ) : (
        <>
          {!f && <button className="btn primary" onClick={() => void act(() => sendFriendRequest(me.id, other.id), 'Solicitação enviada.')}>Adicionar amigo</button>}
          {f?.status === 'pending' && iAsked && <button className="btn" onClick={() => void act(() => deleteFriendship(f.id), 'Solicitação cancelada.')}>Cancelar solicitação</button>}
          {f?.status === 'pending' && !iAsked && (
            <>
              <button className="btn primary" onClick={() => void act(() => respondFriendRequest(f.id, true), 'Agora vocês são amigos.')}>Aceitar</button>
              <button className="btn" onClick={() => void act(() => respondFriendRequest(f.id, false), 'Solicitação recusada.')}>Recusar</button>
            </>
          )}
          {f?.status === 'declined' && iAsked && <span className="tag">Solicitação recusada</span>}
          {f?.status === 'declined' && !iAsked && <button className="btn" onClick={() => void act(() => deleteFriendship(f.id), 'Registro removido.')}>Limpar recusa</button>}
          {f?.status === 'accepted' && (
            <>
              <Link className="btn" to={`/mensagens/${other.username}`}>Mensagem</Link>
              <button className="btn" onClick={() => { if (window.confirm('Remover amizade?')) void act(() => deleteFriendship(f.id), 'Amizade removida.'); }}>Remover amigo</button>
            </>
          )}
          <button className="link" onClick={() => { if (window.confirm(`Bloquear @${other.username}?`)) void act(() => blockUser(me.id, other.id), 'Usuário bloqueado.'); }}>Bloquear</button>
        </>
      )}
      <button className="link" onClick={() => void doReport()}>Denunciar</button>
    </div>
  );
}
