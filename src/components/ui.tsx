import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Game, Profile } from '../lib/types';

const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const initials = (s: string) => s.replace(/[^a-zA-Z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export function Avatar({ name, url, size = 48 }: { name: string; url: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: size * 0.38 };
  if (url && !broken) return <img className="avatar" style={style} src={url} alt="" onError={() => setBroken(true)} />;
  return (
    <span className="avatar" style={{ ...style, background: `hsl(${hue(name)} 35% 28%)` }} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Cover({ game }: { game: Pick<Game, 'title' | 'cover_url'> }) {
  const [broken, setBroken] = useState(false);
  if (game.cover_url && !broken) return <img className="cover" src={game.cover_url} alt="" onError={() => setBroken(true)} />;
  const h = hue(game.title);
  return (
    <span className="cover" style={{ background: `linear-gradient(145deg, hsl(${h} 40% 30%), hsl(${(h + 50) % 360} 35% 16%))` }} aria-hidden>
      {initials(game.title)}
    </span>
  );
}

export function DemoBadge() {
  return <span className="badge" title="Dados fictícios de demonstração">Demo</span>;
}

export function ProfileCard({ p }: { p: Profile }) {
  const name = p.display_name || p.username;
  return (
    <Link to={`/u/${p.username}`} className="card pcard">
      <Avatar name={name} url={p.avatar_url} size={52} />
      <div>
        <strong>{name}</strong> {p.is_demo && <DemoBadge />}
        <div className="muted">@{p.username}</div>
        {p.bio && <p className="clamp">{p.bio}</p>}
      </div>
    </Link>
  );
}

export const Loading = ({ label = 'Carregando...' }: { label?: string }) => (
  <div className="state" role="status"><span className="spinner" /> {label}</div>
);

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state error" role="alert">
      <p>Algo deu errado: {message}</p>
      {onRetry && <button className="btn" onClick={onRetry}>Tentar de novo</button>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}
