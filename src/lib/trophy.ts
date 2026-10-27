import type { Tier } from './types';

export const TIERS: Tier[] = ['bronze', 'silver', 'gold', 'platinum'];
export const TIER_SHORT: Record<Tier, string> = { bronze: 'Bronze', silver: 'Prata', gold: 'Ouro', platinum: 'Platina' };
export const TIER_NAME: Record<Tier, string> = {
  bronze: 'Moeda de Bronze',
  silver: 'Emblema de Prata',
  gold: 'Insígnia de Ouro',
  platinum: 'Estrela Radiante',
};
export const TROPHY_NOTE = 'Troféu do Saveslot, calculado pela raridade. Não é um troféu oficial da plataforma.';

const MUTE_KEY = 'saveslot-mute';
export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
export function setMuted(v: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, v ? '1' : '0');
  } catch {
    /* armazenamento indisponível */
  }
}

// Sons gerados no navegador (osciladores): originais, sem arquivos de terceiros.
const NOTES: Record<Tier, number[]> = {
  bronze: [523],
  silver: [523, 659],
  gold: [523, 659, 784],
  platinum: [523, 659, 784, 1047, 1319],
};
export function playTierSound(tier: Tier) {
  if (isMuted()) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    NOTES[tier].forEach((f, i) => {
      const t = ctx.currentTime + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tier === 'platinum' ? 'triangle' : 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.45);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* sem áudio disponível */
  }
}
