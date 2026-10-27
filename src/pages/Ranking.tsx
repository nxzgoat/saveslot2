import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TrophyIcon } from '../components/Trophy';
import { Avatar, Empty, ErrorBox, Loading } from '../components/ui';
import { useAuth } from '../lib/auth';
import { acceptedFriendIds, getRanking } from '../lib/social';
import { TROPHY_NOTE } from '../lib/trophy';
import { useAsync } from '../lib/useAsync';

export default function Ranking() {
  const { profile } = useAuth();
  const [scope, setScope] = useState<'global' | 'amigos'>('global');
  const res = useAsync(async () => {
    const all = await getRanking(100);
    if (scope === 'global') return all.slice(0, 50);
    if (!profile) return [];
    const ids = new Set([profile.id, ...(await acceptedFriendIds(profile.id))]);
    return all.filter((r) => ids.has(r.profile_id));
  }, [scope, profile?.id]);

  return (
    <div className="narrow">
      <h1 style={{ fontSize: '2rem' }}>Ranking</h1>
      <p className="muted">Pontos por troféu do Saveslot (Bronze 1, Prata 3, Ouro 10, Platina 50). {TROPHY_NOTE} Só aparecem perfis públicos que aceitam participar.</p>
      <div className="chips">
        <button aria-pressed={scope === 'global'} onClick={() => setScope('global')}>Global</button>
        <button aria-pressed={scope === 'amigos'} onClick={() => setScope('amigos')}>Entre amigos</button>
      </div>
      {scope === 'amigos' && !profile && <Empty title="Entre para ver o ranking entre amigos"><Link to="/entrar">Fazer login</Link></Empty>}
      {res.loading && !res.data && <Loading />}
      {res.error && <ErrorBox message={res.error} onRetry={res.reload} />}
      {res.data && res.data.length === 0 && !(scope === 'amigos' && !profile) && <Empty title="Ninguém no ranking ainda">Conecte uma conta ou importe conquistas para pontuar.</Empty>}
      <div className="card">
        {(res.data ?? []).map((r, i) => (
          <Link key={r.profile_id} to={`/u/${r.profile!.username}`} className="row">
            <strong style={{ width: 28 }}>{i + 1}</strong>
            <Avatar name={r.profile!.display_name || r.profile!.username} url={r.profile!.avatar_url} size={36} />
            <div className="grow"><strong>{r.profile!.display_name || r.profile!.username}</strong> <span className="muted">nível {r.level}</span></div>
            <span className="rank-trophies" aria-label={`${r.bronze} bronze, ${r.silver} prata, ${r.gold} ouro, ${r.platinum} platina`}>
              <TrophyIcon tier="bronze" size={16} /> {r.bronze} <TrophyIcon tier="silver" size={16} /> {r.silver} <TrophyIcon tier="gold" size={16} /> {r.gold} <TrophyIcon tier="platinum" size={16} /> {r.platinum}
            </span>
            <strong style={{ minWidth: 60, textAlign: 'right' }}>{r.points} pts</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}
