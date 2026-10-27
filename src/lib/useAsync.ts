import { useCallback, useEffect, useState } from 'react';

interface State<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<State<T>>({ loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ data: s.data, loading: true }));
    fn()
      .then((data) => alive && setState({ data, loading: false }))
      .catch((e: unknown) => alive && setState({ loading: false, error: e instanceof Error ? e.message : 'Erro inesperado.' }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
