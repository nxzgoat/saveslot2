import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Composer from '../components/Composer';
import PostCard from '../components/PostCard';
import { fmtDateTime } from '../components/common';
import { Avatar, Empty, ErrorBox, Loading } from '../components/ui';
import { errMsg, getProfile, uploadMedia } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  deleteGroup, deleteGroupMessage, getGroup, getGroupMessages, groupMembers, groupRequests, hydratePosts, inviteToGroup, joinGroup, leaveGroup,
  listPosts, profilesByIds, removeMember, report, respondGroupRequest, sendGroupMessage, setMemberRole, updateGroup,
} from '../lib/social';
import { useToast } from '../lib/toast';
import type { Group, GroupRole, Profile } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { useLive } from '../lib/useLive';

type Tab = 'mural' | 'chat' | 'membros' | 'gerenciar';
const ROLE: Record<GroupRole, string> = { admin: 'Administrador', moderator: 'Moderador', member: 'Membro' };

function GroupChat({ gid, me, profs, canModerate }: { gid: string; me: Profile; profs: Profile[]; canModerate: boolean }) {
  const toast = useToast();
  const msgs = useAsync(() => getGroupMessages(gid), [gid]);
  useLive('group_messages', `group_id=eq.${gid}`, msgs.reload, 5000);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [msgs.data?.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setError('');
    try {
      await sendGroupMessage(gid, me.id, text.trim());
      setText('');
      msgs.reload();
    } catch (err) {
      setError(`Falha ao enviar: ${errMsg(err)}`);
    }
  };
  const doReport = async (id: string) => {
    const reason = window.prompt('Por que você está denunciando? (opcional)');
    if (reason === null) return;
    try {
      await report(me.id, 'group_message', id, reason);
      toast('Denúncia enviada.');
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  return (
    <div className="thread card">
      <div className="msgs" aria-live="polite">
        {msgs.loading && !msgs.data && <Loading />}
        {msgs.error && <ErrorBox message={msgs.error} onRetry={msgs.reload} />}
        {msgs.data && msgs.data.length === 0 && <Empty title="Chat vazio">Mande a primeira mensagem.</Empty>}
        {(msgs.data ?? []).map((m) => {
          const a = profs.find((p) => p.id === m.sender_id);
          return (
            <div key={m.id} className={`msg ${m.sender_id === me.id ? 'mine' : ''}`}>
              <small><strong>{a?.display_name || a?.username || 'Usuário'}</strong> <span className="muted">{fmtDateTime(m.created_at)}</span></small>
              <div>{m.body}</div>
              <small>
                {m.sender_id !== me.id && <button className="link" onClick={() => void doReport(m.id)}>Denunciar</button>}
                {(m.sender_id === me.id || canModerate) && <button className="link" onClick={() => void deleteGroupMessage(m.id).then(msgs.reload).catch((err) => toast(errMsg(err), 'error'))}>Apagar</button>}
              </small>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <form onSubmit={send} className="row" style={{ border: 0 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Mensagem para o grupo" aria-label="Mensagem para o grupo" />
        <button className="btn primary" disabled={!text.trim()}>Enviar</button>
      </form>
    </div>
  );
}

function Manage({ group, role, userId, reqs, profs, onChanged }: { group: Group; role: GroupRole; userId: string; reqs: { profile_id: string }[]; profs: Profile[]; onChanged: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(group.name);
  const [desc, setDesc] = useState(group.description ?? '');
  const [vis, setVis] = useState(group.visibility);
  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      toast(ok);
      onChanged();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };
  const cover = async (file: File | undefined) => {
    if (!file) return;
    await act(async () => updateGroup(group.id, { cover_url: await uploadMedia(userId, 'group', file) }), 'Capa atualizada.');
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="card">
        <h2>Pedidos de entrada ({reqs.length})</h2>
        {reqs.length === 0 && <p className="muted">Nenhum pedido pendente.</p>}
        {reqs.map((r) => {
          const p = profs.find((x) => x.id === r.profile_id);
          return (
            <div className="row" key={r.profile_id}>
              <span className="grow">{p ? `@${p.username}` : 'Usuário'}</span>
              <button className="btn primary" onClick={() => void act(() => respondGroupRequest(group.id, r.profile_id, true), 'Pedido aceito.')}>Aceitar</button>
              <button className="btn" onClick={() => void act(() => respondGroupRequest(group.id, r.profile_id, false), 'Pedido recusado.')}>Recusar</button>
            </div>
          );
        })}
      </section>
      {role === 'admin' && (
        <>
          <form className="card" onSubmit={(e) => { e.preventDefault(); void act(() => updateGroup(group.id, { name: name.trim(), description: desc.trim() || null, visibility: vis }), 'Grupo atualizado.'); }}>
            <h2>Editar grupo</h2>
            <label htmlFor="en">Nome</label>
            <input id="en" value={name} minLength={3} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <label htmlFor="ed">Descrição</label>
            <textarea id="ed" value={desc} maxLength={500} onChange={(e) => setDesc(e.target.value)} />
            <label htmlFor="ev">Visibilidade</label>
            <select id="ev" value={vis} onChange={(e) => setVis(e.target.value as 'public' | 'private')}>
              <option value="public">Público</option>
              <option value="private">Privado</option>
            </select>
            <label htmlFor="ec">Capa (PNG, JPG ou WebP, até 2 MB)</label>
            <input id="ec" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void cover(e.target.files?.[0])} />
            <p><button className="btn primary">Salvar</button></p>
          </form>
          <section className="card">
            <h2>Encerrar grupo</h2>
            <p className="muted">Apaga o grupo, o mural e o chat. Não dá para desfazer.</p>
            <button className="btn danger" onClick={() => { if (window.confirm(`Encerrar "${group.name}" para sempre?`)) void deleteGroup(group.id).then(() => { toast('Grupo encerrado.'); navigate('/grupos'); }).catch((err) => toast(errMsg(err), 'error')); }}>Encerrar grupo</button>
          </section>
        </>
      )}
    </div>
  );
}

export default function GroupPage() {
  const { id = '' } = useParams();
  const { profile, session } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('mural');
  const [invUser, setInvUser] = useState('');
  const group = useAsync(() => getGroup(id), [id]);
  const members = useAsync(() => groupMembers(id), [id]);
  const myRole = (members.data ?? []).find((m) => m.profile_id === profile?.id)?.role ?? null;
  const isStaff = myRole === 'admin' || myRole === 'moderator';
  const profs = useAsync(() => profilesByIds((members.data ?? []).map((m) => m.profile_id)), [members.data?.length]);
  const posts = useAsync(async () => hydratePosts(await listPosts({ groupId: id, limit: 30 }), profile?.id ?? null), [id, profile?.id]);
  const reqs = useAsync(() => (isStaff ? groupRequests(id) : Promise.resolve([])), [id, isStaff]);
  const reqProfs = useAsync(() => profilesByIds((reqs.data ?? []).map((r) => r.profile_id)), [reqs.data?.length]);

  if (group.loading) return <Loading />;
  if (group.error) return <ErrorBox message={group.error} onRetry={group.reload} />;
  const g = group.data;
  if (!g) return <Empty title="Grupo não encontrado"><Link to="/grupos">Ver grupos</Link></Empty>;

  const reloadAll = () => { group.reload(); members.reload(); reqs.reload(); posts.reload(); };
  const act = async (fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    try {
      await fn();
      toast(ok);
      if (after) after();
      else reloadAll();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };
  const invite = async (e: FormEvent) => {
    e.preventDefault();
    const u = await getProfile(invUser.replace('@', '')).catch(() => null);
    if (!u) return toast('Não encontramos esse usuário.', 'error');
    await act(() => inviteToGroup(g.id, u.id), 'Convite enviado.');
    setInvUser('');
  };

  const restricted = g.visibility === 'private' && !myRole;
  const tabs: [Tab, string][] = [['mural', 'Mural'], ...(myRole ? [['chat', 'Chat'] as [Tab, string]] : []), ['membros', 'Membros'], ...(isStaff ? [['gerenciar', 'Gerenciar'] as [Tab, string]] : [])];

  return (
    <>
      <div className="card">
        <div className="group-cover big" style={g.cover_url ? { backgroundImage: `url(${g.cover_url})` } : undefined} />
        <div className="row" style={{ border: 0, alignItems: 'flex-start' }}>
          <div className="grow">
            <h1 style={{ fontSize: '2rem', margin: '10px 0 0' }}>{g.name} <span className="tag">{g.visibility === 'public' ? 'Público' : 'Privado'}</span></h1>
            <p className="muted">{g.description}</p>
            {myRole && <span className="tag completed">Você é {ROLE[myRole].toLowerCase()}</span>}
          </div>
          {profile && !myRole && <button className="btn primary" onClick={() => void act(async () => { const r = await joinGroup(g.id); if (r === 'requested') toast('Solicitação enviada.'); }, 'Feito.')}>{g.visibility === 'public' ? 'Entrar' : 'Pedir para entrar'}</button>}
          {myRole && <button className="btn" onClick={() => { if (window.confirm('Sair do grupo?')) void act(() => leaveGroup(g.id), 'Você saiu do grupo.', () => navigate('/grupos')); }}>Sair do grupo</button>}
        </div>
      </div>

      {restricted ? (
        <Empty title="Grupo privado">O conteúdo só fica visível para membros. {profile ? 'Peça para entrar acima.' : <Link to="/entrar">Entre para pedir acesso.</Link>}</Empty>
      ) : (
        <>
          <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>

          {tab === 'mural' && (
            <div className="narrow">
              {myRole ? <Composer groupId={g.id} onPosted={posts.reload} /> : <p className="muted">Entre no grupo para publicar.</p>}
              {posts.loading && !posts.data && <Loading />}
              {posts.error && <ErrorBox message={posts.error} onRetry={posts.reload} />}
              {posts.data && posts.data.length === 0 && <Empty title="O mural está vazio">Publique algo para o grupo.</Empty>}
              <div style={{ display: 'grid', gap: 14 }}>{(posts.data ?? []).map((p) => <PostCard key={p.id} post={p} meId={profile?.id ?? null} canModerate={isStaff} onChange={posts.reload} />)}</div>
            </div>
          )}

          {tab === 'chat' && profile && myRole && <GroupChat gid={g.id} me={profile} profs={profs.data ?? []} canModerate={isStaff} />}

          {tab === 'membros' && (
            <>
              {isStaff && (
                <form className="card row" onSubmit={invite} style={{ marginBottom: 12 }}>
                  <input value={invUser} onChange={(e) => setInvUser(e.target.value)} placeholder="Convidar pelo @usuário" aria-label="Convidar pelo @usuário" />
                  <button className="btn primary" disabled={!invUser.trim()}>Convidar</button>
                </form>
              )}
              <div className="card">
                {members.loading && !members.data && <Loading />}
                {(members.data ?? []).map((m) => {
                  const p = (profs.data ?? []).find((x) => x.id === m.profile_id);
                  return (
                    <div className="row" key={m.profile_id}>
                      <Avatar name={p?.display_name || p?.username || '?'} url={p?.avatar_url ?? null} size={36} />
                      <div className="grow">{p ? <Link to={`/u/${p.username}`}><strong>{p.display_name || p.username}</strong></Link> : 'Usuário'} <span className="tag">{ROLE[m.role]}</span></div>
                      {myRole === 'admin' && m.profile_id !== profile?.id && (
                        <select value={m.role} aria-label="Papel" style={{ width: 'auto' }} onChange={(e) => void act(() => setMemberRole(g.id, m.profile_id, e.target.value), 'Papel atualizado.')}>
                          <option value="member">Membro</option><option value="moderator">Moderador</option><option value="admin">Administrador</option>
                        </select>
                      )}
                      {m.profile_id !== profile?.id && (myRole === 'admin' || (myRole === 'moderator' && m.role === 'member')) && (
                        <button className="btn danger" onClick={() => { if (window.confirm('Remover do grupo?')) void act(() => removeMember(g.id, m.profile_id), 'Membro removido.'); }}>Remover</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'gerenciar' && myRole && session && (
            <Manage group={g} role={myRole} userId={session.user.id} reqs={reqs.data ?? []} profs={reqProfs.data ?? []} onChanged={reloadAll} />
          )}
        </>
      )}
    </>
  );
}
