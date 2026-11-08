import { useEffect, useState } from 'react';

/**
 * Estado de conectividad del navegador (`online`/`offline`).
 *
 * Es sólo señalización de UI: los gates de la metodología **nunca** se validan
 * sin conexión (`docs/04` §6.4; TEAM.md §5). La validación real la decide la EF.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
