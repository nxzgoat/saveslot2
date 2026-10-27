import { createContext, useCallback, useContext, useState, type CSSProperties, type ReactNode } from 'react';
import { playTierSound, TIER_NAME } from '../lib/trophy';
import type { Tier } from '../lib/types';
import { TrophyIcon } from './Trophy';

type Fn = (tier: Tier, title: string) => void;
const Ctx = createContext<Fn>(() => undefined);
const PARTICLES: Record<Tier, number> = { bronze: 4, silver: 8, gold: 14, platinum: 32 };

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<{ tier: Tier; title: string; key: number } | null>(null);
  const celebrate = useCallback<Fn>((tier, title) => {
    const key = Date.now();
    setItem({ tier, title, key });
    playTierSound(tier);
    setTimeout(() => setItem((cur) => (cur && cur.key === key ? null : cur)), tier === 'platinum' ? 5000 : 3000);
  }, []);
  return (
    <Ctx.Provider value={celebrate}>
      {children}
      {item && (
        <div key={item.key} className={`celebrate ${item.tier}`} role="status" aria-live="polite">
          <div className="celebrate-card">
            <TrophyIcon tier={item.tier} size={item.tier === 'platinum' ? 104 : 44} />
            <div>
              <strong>{TIER_NAME[item.tier]}</strong>
              <div>{item.title}</div>
              <small className="muted">Troféu do Saveslot, não oficial</small>
            </div>
            {Array.from({ length: PARTICLES[item.tier] }, (_, i) => (
              <span
                key={i}
                className="spark"
                style={{ '--a': `${(360 / PARTICLES[item.tier]) * i}deg`, '--d': `${60 + (i % 4) * 22}px`, '--t': `${(i % 5) * 60}ms` } as CSSProperties}
              />
            ))}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useCelebrate = () => useContext(Ctx);
