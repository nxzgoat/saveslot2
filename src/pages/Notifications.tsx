import { Link, useNavigate } from 'react-router-dom';
import { fmtDateTime } from '../components/common';
import { Empty, ErrorBox, Loading } from '../components/ui';
import { errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../lib/social';
import { useToast } from '../lib/toast';
import type { AppNotification } from '../lib/types';
import { useAsync } from '../lib/useAsync';

export default function Notifications() {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const list = useAsync(() => (profile ? getNotifications(profile.id) : Promise.resolve([])), [profile?.id]);

  if (!profile) return <Empty title="Entre para ver seus avisos"><Link to="/entrar">Fazer login</Link></Empty>;

  const open = async (n: AppNotification) => {
    try {
      if (!n.read_at) await markNotificationRead(n.id);
    } catch {
      /* segue para o link mesmo assim */
    }
    if (n.link) navigate(n.link);
    else list.reload();
  };
  const readAll = async () => {
    try {
      await markAllNotificationsRead(profile.id);
      list.reload();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  return (
    <div className="narrow">
      <div className="row" style={{ border: 0 }}>
        <h1 className="grow" style={{ fontSize: '2rem', margin: 0 }}>Notificações</h1>
        <button className="btn" onClick={() => void readAll()}>Marcar tudo como lido</button>
      </div>
      <p className="muted">Escolha o que receber em Configurações, aba Preferências.</p>
      {list.loading && !list.data && <Loading />}
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.data && list.data.length === 0 && <Empty title="Nenhuma notificação">Quando alguém pedir amizade, mandar mensagem, curtir ou comentar, aparece aqui.</Empty>}
      <div className="card">
        {(list.data ?? []).map((n) => (
          <button key={n.id} className={`row notif ${n.read_at ? '' : 'unread'}`} onClick={() => void open(n)}>
            <div className="grow" style={{ textAlign: 'left' }}>{n.text}<div className="muted">{fmtDateTime(n.created_at)}</div></div>
            {!n.read_at && <span className="count" aria-label="não lida">novo</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
