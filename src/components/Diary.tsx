import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { errMsg } from '../lib/api';
import { createPost, getDiary, getPins, pinItem, unpinItem } from '../lib/social';
import { useToast } from '../lib/toast';
import { TROPHY_NOTE } from '../lib/trophy';
import type { DiaryItem, Profile } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { fmtDay, RarityLine, ReviewText, Stars } from './common';
import { TierBadge, TrophyIcon } from './Trophy';
import { Cover, Empty, ErrorBox, Loading } from './ui';

type Filter = 'all' | 'achievement' | 'platinum' | 'review';
const LABEL: Record<Filter, string> = { all: 'Tudo', achievement: 'Conquistas', platinum: 'Platinas', review: 'Reviews' };

function DiaryCard({ item, owner, pinned, canPin, onPin, onShared, profileId }: {
  item: DiaryItem; owner: boolean; pinned: boolean; canPin: boolean; onPin: () => void; onShared: () => void; profileId: string;
}) {
  const toast = useToast();
  const [sharing, setSharing] = useState(false);
  const [comment, setComment] = useState('');

  const share = async () => {
    try {
      await createPost({
        author_id: profileId,
        kind: item.type,
        body: comment.trim() || null,
        game_id: item.game.id,
        achievement_id: item.achievementId ?? null,
        review_id: item.reviewId ?? null,
        platform: item.platform,
      });
      toast('Publicado no feed.');
      setSharing(false);
      setComment('');
      onShared();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  return (
    <article className={`card diary diary-${item.type} ${item.type === 'platinum' ? 'post-platinum' : ''}`}>
      <div className="row" style={{ border: 0, padding: 0, alignItems: 'flex-start' }}>
        <Cover game={item.game} />
        <div className="grow">
          <div className="muted">
            {item.type === 'review' ? 'Review' : item.type === 'platinum' ? 'Platina' : 'Conquista'} · {fmtDay(item.at)}
            {item.platform ? ` · ${item.platform}` : ''}
          </div>
          <strong>{item.title}</strong>
          {item.type === 'review' ? (
            <>
              <div><Stars value={item.rating ?? 0} /> {item.hours != null && <span className="muted">· {item.hours} h</span>}</div>
              <ReviewText text={item.text} spoiler={Boolean(item.hasSpoiler)} />
            </>
          ) : (
            <>
              {item.text && <div className="muted">{item.text}</div>}
              {item.type === 'achievement' && <RarityLine rarity={item.tier ? { achievement_id: '', percent: item.percent ?? null, percent_source: (item.percentSource as 'platform' | 'site' | 'unknown') ?? 'unknown', tier: item.tier } : null} />}
            </>
          )}
          <div className="muted"><Link to={`/jogo/${item.game.id}`}>{item.game.title}</Link></div>
        </div>
        {item.tier && <TrophyIcon tier={item.tier} size={item.type === 'platinum' ? 56 : 38} />}
      </div>
      {owner && (
        <div className="actions" style={{ marginTop: 8 }}>
          <button className="btn" onClick={onPin} disabled={!pinned && !canPin}>{pinned ? 'Desafixar' : 'Fixar no topo'}</button>
          <button className="btn" onClick={() => setSharing(!sharing)}>Compartilhar no feed</button>
        </div>
      )}
      {sharing && (
        <div style={{ marginTop: 8 }}>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comentário opcional" maxLength={2000} aria-label="Comentário opcional" />
          <button className="btn primary" onClick={() => void share()}>Publicar</button>
        </div>
      )}
    </article>
  );
}

export default function Diary({ profile, owner, showAchievements, showActivity }: { profile: Profile; owner: boolean; showAchievements: boolean; showActivity: boolean }) {
  const toast = useToast();
  const diary = useAsync(() => getDiary(profile.id), [profile.id]);
  const pins = useAsync(() => getPins(profile.id), [profile.id]);
  const [filter, setFilter] = useState<Filter>('all');
  const [platform, setPlatform] = useState('');

  const items = diary.data ?? [];
  const pinnedKeys = pins.data ?? [];
  const platforms = useMemo(() => [...new Set(items.map((i) => i.platform).filter((p): p is string => Boolean(p)))].sort(), [items]);
  const visible = items.filter((i) => (filter === 'all' || i.type === filter) && (!platform || i.platform === platform));
  const pinned = pinnedKeys.map((k) => items.find((i) => i.key === k)).filter((i): i is DiaryItem => Boolean(i));
  const rest = visible.filter((i) => !pinnedKeys.includes(i.key));

  const togglePin = async (key: string) => {
    try {
      if (pinnedKeys.includes(key)) await unpinItem(profile.id, key);
      else await pinItem(profile.id, key);
      pins.reload();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  if (!showAchievements && !showActivity && !owner) return <Empty title="Diário privado">Este jogador escolheu não mostrar a atividade.</Empty>;
  if (diary.loading && !diary.data) return <Loading />;
  if (diary.error) return <ErrorBox message={diary.error} onRetry={diary.reload} />;

  return (
    <>
      <p className="muted">Conquistas e reviews na mesma linha do tempo. {TROPHY_NOTE}</p>
      <div className="chips">
        {(Object.keys(LABEL) as Filter[]).map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{LABEL[f]}</button>
        ))}
        {platforms.length > 0 && (
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Plataforma" style={{ width: 'auto' }}>
            <option value="">Todas as plataformas</option>
            {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>
      {pinned.length > 0 && (
        <section aria-label="Itens fixados">
          <h2>Fixados</h2>
          {pinned.map((i) => (
            <DiaryCard key={i.key} item={i} owner={owner} pinned canPin profileId={profile.id} onPin={() => void togglePin(i.key)} onShared={() => undefined} />
          ))}
        </section>
      )}
      {rest.length === 0 && pinned.length === 0 ? (
        <Empty title="Nada por aqui ainda">
          {owner ? 'Conecte uma conta em Configurações ou escreva um review na página de um jogo.' : 'Nenhuma atividade nesse filtro.'}
        </Empty>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {rest.map((i) => (
            <DiaryCard key={i.key} item={i} owner={owner} pinned={false} canPin={pinnedKeys.length < 3} profileId={profile.id} onPin={() => void togglePin(i.key)} onShared={() => undefined} />
          ))}
        </div>
      )}
      <p className="muted" style={{ marginTop: 12 }}>
        Troféus: <TierBadge tier="bronze" /> comum · <TierBadge tier="silver" /> intermediário · <TierBadge tier="gold" /> raro · <TierBadge tier="platinum" /> 100% do jogo base
      </p>
    </>
  );
}
