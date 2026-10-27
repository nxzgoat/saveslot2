import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Section } from '../components/common';
import { Empty, ErrorBox, Loading } from '../components/ui';
import { errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';
import { createGroup, joinGroup, listGroups, myGroupInvites, myMemberships, respondInvite } from '../lib/social';
import { useToast } from '../lib/toast';
import type { Group } from '../lib/types';
import { useAsync } from '../lib/useAsync';

type Tab = 'descobrir' | 'meus' | 'convites';

function GroupCard({ g, status, onJoin }: { g: Group; status: 'member' | 'invited' | 'requested' | 'none'; onJoin: () => void }) {
  return (
    <div className="card">
      <div className="group-cover" style={g.cover_url ? { backgroundImage: `url(${g.cover_url})` } : undefined} />
      <h2 style={{ marginTop: 10 }}><Link to={`/grupo/${g.id}`}>{g.name}</Link> <span className="tag">{g.visibility === 'public' ? 'Público' : 'Privado'}</span></h2>
      <p className="clamp">{g.description ?? 'Sem descrição.'}</p>
      {status === 'member' && <Link className="btn" to={`/grupo/${g.id}`}>Abrir</Link>}
      {status === 'invited' && <button className="btn primary" onClick={onJoin}>Aceitar convite</button>}
      {status === 'requested' && <span className="tag">Solicitação enviada</span>}
      {status === 'none' && <button className="btn primary" onClick={onJoin}>{g.visibility === 'public' ? 'Entrar' : 'Pedir para entrar'}</button>}
    </div>
  );
}

export default function Groups() {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('descobrir');
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [vis, setVis] = useState<'public' | 'private'>('public');
  const [busy, setBusy] = useState(false);

  const groups = useAsync(() => listGroups(q), [q]);
  const mem = useAsync(() => (profile ? myMemberships(profile.id) : Promise.resolve([])), [profile?.id]);
  const inv = useAsync(() => (profile ? myGroupInvites(profile.id) : Promise.resolve([])), [profile?.id]);

  const memberOf = new Set((mem.data ?? []).map((m) => m.group_id));
  const invited = new Set((inv.data ?? []).filter((i) => i.kind === 'invite').map((i) => i.group_id));
  const requested = new Set((inv.data ?? []).filter((i) => i.kind === 'request').map((i) => i.group_id));
  const statusOf = (id: string) => (memberOf.has(id) ? 'member' : invited.has(id) ? 'invited' : requested.has(id) ? 'requested' : 'none') as 'member' | 'invited' | 'requested' | 'none';

  const reloadAll = () => { groups.reload(); mem.reload(); inv.reload(); };
  const join = async (g: Group) => {
    if (!profile) return toast('Entre na sua conta para participar.', 'error');
    try {
      const r = await joinGroup(g.id);
      toast(r === 'requested' ? 'Solicitação enviada aos administradores.' : 'Você entrou no grupo.');
      reloadAll();
      if (r === 'joined') navigate(`/grupo/${g.id}`);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await createGroup(name, desc, vis);
      toast('Grupo criado.');
      navigate(`/grupo/${id}`);
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  const answer = async (gid: string, accept: boolean) => {
    try {
      await respondInvite(gid, accept);
      toast(accept ? 'Você entrou no grupo.' : 'Convite recusado.');
      reloadAll();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const mine = (groups.data ?? []).filter((g) => memberOf.has(g.id));
  const shown = tab === 'meus' ? mine : groups.data ?? [];

  return (
    <>
      <h1 style={{ fontSize: '2rem' }}>Grupos</h1>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'descobrir'} onClick={() => setTab('descobrir')}>Descobrir</button>
        <button role="tab" aria-selected={tab === 'meus'} onClick={() => setTab('meus')}>Meus grupos</button>
        <button role="tab" aria-selected={tab === 'convites'} onClick={() => setTab('convites')}>Convites e pedidos ({(inv.data ?? []).length})</button>
      </div>

      {tab === 'convites' ? (
        <>
          {inv.data && inv.data.length === 0 && <Empty title="Nenhum convite ou pedido pendente" />}
          {(inv.data ?? []).map((i) => (
            <div className="card row" key={i.group_id}>
              <div className="grow"><strong>{i.group?.name}</strong><div className="muted">{i.kind === 'invite' ? 'Convite recebido' : 'Seu pedido aguarda aprovação'}</div></div>
              {i.kind === 'invite' && (<><button className="btn primary" onClick={() => void answer(i.group_id, true)}>Aceitar</button><button className="btn" onClick={() => void answer(i.group_id, false)}>Recusar</button></>)}
            </div>
          ))}
        </>
      ) : (
        <>
          {tab === 'descobrir' && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar grupo" aria-label="Buscar grupo" />}
          {groups.loading && !groups.data && <Loading />}
          {groups.error && <ErrorBox message={groups.error} onRetry={groups.reload} />}
          {groups.data && shown.length === 0 && <Empty title={tab === 'meus' ? 'Você ainda não participa de nenhum grupo' : 'Nenhum grupo encontrado'}>Crie o primeiro abaixo.</Empty>}
          <div className="grid" style={{ marginTop: 12 }}>{shown.map((g) => <GroupCard key={g.id} g={g} status={statusOf(g.id)} onJoin={() => void (statusOf(g.id) === 'invited' ? answer(g.id, true) : join(g))} />)}</div>
        </>
      )}

      <div style={{ marginTop: 24 }}>
        <Section title="Criar grupo">
          {profile ? (
            <form onSubmit={create}>
              <label htmlFor="gn">Nome (3 a 60 caracteres)</label>
              <input id="gn" value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={60} required />
              <label htmlFor="gd">Descrição</label>
              <textarea id="gd" value={desc} maxLength={500} onChange={(e) => setDesc(e.target.value)} />
              <label htmlFor="gv">Visibilidade</label>
              <select id="gv" value={vis} onChange={(e) => setVis(e.target.value as 'public' | 'private')}>
                <option value="public">Público: qualquer pessoa entra</option>
                <option value="private">Privado: só por convite ou aprovação</option>
              </select>
              <p><button className="btn primary" disabled={busy}>{busy ? 'Criando...' : 'Criar grupo'}</button></p>
            </form>
          ) : (
            <p className="muted"><Link to="/entrar">Entre</Link> para criar um grupo.</p>
          )}
        </Section>
      </div>
    </>
  );
}
