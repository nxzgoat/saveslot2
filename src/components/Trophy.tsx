import { useId } from 'react';
import { TIER_NAME, TIER_SHORT, TROPHY_NOTE } from '../lib/trophy';
import type { Tier } from '../lib/types';

const COLORS: Record<Tier, [string, string, string]> = {
  bronze: ['#e0a066', '#a8612a', '#7a4318'],
  silver: ['#eef2fa', '#9aa7c2', '#667490'],
  gold: ['#ffe27a', '#e0a81c', '#9a6b00'],
  platinum: ['#9fe3ff', '#a98bff', '#5a4bd1'],
};

// Ícones originais, desenhados em SVG (sem logos nem personagens de terceiros)
export function TrophyIcon({ tier, size = 28, title }: { tier: Tier; size?: number; title?: string }) {
  const id = `g${useId().replace(/:/g, '')}`;
  const [c1, c2, c3] = COLORS[tier];
  const fill = `url(#${id})`;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} role="img" aria-label={title ?? TIER_NAME[tier]} className={`trophy ${tier}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
      {tier === 'bronze' && (
        <>
          <circle cx="16" cy="16" r="13" fill={fill} stroke={c3} strokeWidth="2" />
          <circle cx="16" cy="16" r="8" fill="none" stroke="#ffffff66" strokeWidth="1.5" />
          <path d="M16 11l1.5 3.2 3.5.4-2.6 2.4.7 3.5L16 18.7l-3.1 1.8.7-3.5-2.6-2.4 3.5-.4z" fill="#ffffffb0" />
        </>
      )}
      {tier === 'silver' && (
        <>
          <path d="M16 2l11 4v9c0 7-5 12-11 15C10 27 5 22 5 15V6z" fill={fill} stroke={c3} strokeWidth="2" strokeLinejoin="round" />
          <path d="M16 8v14M10 13h12" stroke="#ffffff99" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {tier === 'gold' && (
        <>
          <path d="M12 25l-2 6 6-3 6 3-2-6z" fill={c3} />
          <path d="M16 1.5l11 6.3v12.4L16 26.5 5 20.2V7.8z" fill={fill} stroke={c3} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="16" cy="14" r="5" fill="#ffffffa0" />
        </>
      )}
      {tier === 'platinum' && (
        <polygon
          points="16,2 18.5,10 25.9,6.1 22,13.5 30,16 22,18.5 25.9,25.9 18.5,22 16,30 13.5,22 6.1,25.9 10,18.5 2,16 10,13.5 6.1,6.1 13.5,10"
          fill={fill} stroke={c3} strokeWidth="1.2" strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export function TierBadge({ tier, estimated }: { tier: Tier; estimated?: boolean }) {
  return (
    <span className={`tier tier-${tier}`} title={TROPHY_NOTE}>
      <TrophyIcon tier={tier} size={16} /> {TIER_SHORT[tier]}
      {estimated && <span className="muted"> (estimada)</span>}
    </span>
  );
}
