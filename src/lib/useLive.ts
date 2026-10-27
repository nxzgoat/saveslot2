import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

/** Atualiza em tempo real (Supabase Realtime) e, por segurança, também a cada pollMs. */
export function useLive(table: string, filter: string | undefined, onChange: () => void, pollMs = 8000) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    const name = `live-${table}-${Math.random().toString(36).slice(2)}`;
    const ch = supabase
      .channel(name)
      .on('postgres_changes', { event: 'INSERT' as const, schema: 'public', table, ...(filter ? { filter } : {}) }, () => cb.current())
      .subscribe();
    const t = setInterval(() => cb.current(), pollMs);
    return () => {
      clearInterval(t);
      void supabase.removeChannel(ch);
    };
  }, [table, filter, pollMs]);
}
