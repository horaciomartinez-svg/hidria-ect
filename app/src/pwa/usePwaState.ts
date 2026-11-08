import { useSyncExternalStore } from 'react';
import { getPwaSnapshot, subscribePwa, type PwaState } from './register';

/** Estado reactivo del service worker (actualización disponible / listo offline). */
export function usePwaState(): PwaState {
  return useSyncExternalStore(subscribePwa, getPwaSnapshot, getPwaSnapshot);
}
