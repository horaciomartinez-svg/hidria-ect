import { useEffect, useState } from 'react';
import { useOnline } from '../../lib/online';
import { ChecklistApiError, listChecklistItems } from './api';
import type { ChecklistItem } from './types';

export type ChecklistStatus =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'offline'
  | 'forbidden'
  | 'config'
  | 'error';

export interface ChecklistState {
  status: ChecklistStatus;
  data: ChecklistItem[];
  error: ChecklistApiError | null;
}

function statusFromError(error: ChecklistApiError): ChecklistStatus {
  if (error.kind === 'forbidden' || error.kind === 'auth') return 'forbidden';
  if (error.kind === 'config') return 'config';
  return 'error';
}

/** Checklist visible por RLS; sin caché offline (el shell sigue offline-first, M3 requiere red). */
export function useChecklist(userId: string | undefined, reloadKey = 0): ChecklistState {
  const online = useOnline();
  const [state, setState] = useState<ChecklistState>({
    status: 'loading',
    data: [],
    error: null,
  });

  useEffect(() => {
    if (!userId) {
      setState({ status: 'empty', data: [], error: null });
      return;
    }
    if (!online) {
      setState({ status: 'offline', data: [], error: null });
      return;
    }
    let active = true;
    setState({ status: 'loading', data: [], error: null });
    void listChecklistItems(userId)
      .then((data) => {
        if (!active) return;
        setState({ status: data.length === 0 ? 'empty' : 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const apiError =
          error instanceof ChecklistApiError
            ? error
            : new ChecklistApiError('unknown', 'No fue posible cargar el checklist.');
        setState({ status: statusFromError(apiError), data: [], error: apiError });
      });
    return () => {
      active = false;
    };
  }, [userId, online, reloadKey]);

  return state;
}
