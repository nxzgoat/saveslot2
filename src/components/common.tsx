import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Rarity } from '../lib/types';
import { TierBadge } from './Trophy';

/** Transforma #hashtags e @menções em links. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(#[\p{L}\p{N}_]+|@[a-z0-9_]{3,20})/gu);
  return (
    <p className="rich">
      {parts.map((p, i) =>
        i % 2 === 0 ? p : p.startsWith('#') ? (
          <Link key={i} to={`/buscar?t=hashtags&q=${encodeURIComponent(p.slice(1))}`}>{p}</Link>
        ) : (
          <Link key={i} to={`/u/${p.slice(1)}`}>{p}</Link>
        ),
      )}
    </p>
  );
}

export function Stars({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  const label = `${String(value).replace('.', ',')} de 5 estrelas`;
  return (
    <span className="stars" role="img" aria-label={label} title={label}>
      {'★'.repeat(full)}
      {half ? '½' : ''}
      <span className="muted">{'☆'.repeat(5 - full - (half ? 1 : 0))}</span>
    </span>
  );
}

/** Texto de review: com spoiler, começa oculto até a pessoa pedir para revelar. */
export function ReviewText({ text, spoiler }: { text: string | null; spoiler: boolean }) {
  const [show, setShow] = useState(false);
  if (!text) return null;
  if (spoiler && !show) {
    return (
      <div className="spoiler">
        <span className="tag">Contém spoiler</span>{' '}
        <button className="link" onClick={() => setShow(true)}>Mostrar mesmo assim</button>
      </div>
    );
  }
  return <Rich text={text} />;
}

export const fmtDateTime = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
export const fmtDay = (s: string) => new Date(s).toLocaleDateString('pt-BR');

export function RarityLine({ rarity }: { rarity: Rarity | null }) {
  if (!rarity) return <TierBadge tier="bronze" estimated />;
  const note =
    rarity.percent == null
      ? 'raridade desconhecida'
      : rarity.percent_source === 'platform'
        ? `${String(rarity.percent).replace('.', ',')}% dos jogadores`
        : `${String(rarity.percent).replace('.', ',')}% (estimada pelo Saveslot)`;
  return (
    <span>
      <TierBadge tier={rarity.tier} /> <span className="muted">{note}</span>
    </span>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ border: 0, padding: 0, marginBottom: 8 }}>
        <h2 className="grow" style={{ margin: 0 }}>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
