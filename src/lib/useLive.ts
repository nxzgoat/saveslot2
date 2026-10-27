import { useEffect, useRef } from 'react';

/** Atualiza a tela de tempos em tempos (só com a aba visível). Sem WebSocket: mais simples e sem dependência do Realtime. */
export function useLive(_table: string, _filter: string | undefined, onChange: () => void, pollMs = 8000) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') cb.current();
    }, pollMs);
    return () => clearInterval(t);
  }, [pollMs]);
}
