import type { Platform } from '../lib/types';

/**
 * Contrato para integrações futuras (Steam, PSN, Xbox...).
 * NENHUMA está implementada: hoje os jogos e horas são cadastrados manualmente.
 * Cada provedor deve rodar no servidor (Edge Function), nunca no navegador,
 * porque usa chaves secretas.
 */
export interface SyncedGame {
  externalId: string;
  title: string;
  platform: Platform;
  hours: number | null;
  coverUrl: string | null;
  achievementsUnlocked?: number;
  achievementsTotal?: number;
  lastPlayedAt?: string | null;
}

export interface PlatformProvider {
  id: Platform;
  label: string;
  fetchLibrary(externalAccountId: string): Promise<SyncedGame[]>;
}

export const providers: PlatformProvider[] = [];
