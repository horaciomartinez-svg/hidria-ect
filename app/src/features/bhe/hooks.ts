import { useEffect, useState } from 'react';
import { useOnline } from '../../lib/online';
import {
  BheApiError,
  getBheContext,
  listBheDiagnostics,
  type BheContextData,
} from './api';
import type { BheListRow } from './types';

export type BheStatus =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'offline'
  | 'forbidden'
  | 'config'
  | 'error';

function statusFromError(error: BheApiError): BheStatus {
  if (error.kind === 'forbidden' || error.kind === 'auth') return 'forbidden';
  if (error.kind === 'config') return 'config';
  return 'error';
}

export interface BheListState {
  status: BheStatus;
  data: BheListRow[];
  error: BheApiError | null;
}

export function useBheList(userId: string | undefined, reloadKey = 0): BheListState {
  const online = useOnline();
  const [state, setState] = useState<BheListState>({ status: 'loading', data: [], error: null });
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
    void listBheDiagnostics(userId)
      .then((data) => {
        if (!active) return;
        setState({ status: data.length === 0 ? 'empty' : 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const apiError =
          error instanceof BheApiError
            ? error
            : new BheApiError('unknown', 'No fue posible cargar los balances.');
        setState({ status: statusFromError(apiError), data: [], error: apiError });
      });
    return () => {
      active = false;
    };
  }, [userId, online, reloadKey]);
  return state;
}

export interface BheContextState {
  status: BheStatus;
  data: BheContextData | null;
  error: BheApiError | null;
}

export function useBheContext(
  diagnosticId: string | undefined,
  userId: string | undefined,
  reloadKey = 0,
): BheContextState {
  const online = useOnline();
  const [state, setState] = useState<BheContextState>({ status: 'loading', data: null, error: null });
  useEffect(() => {
    if (!diagnosticId || !userId) {
      setState({ status: 'empty', data: null, error: null });
      return;
    }
    if (!online) {
      setState((previous) => ({ ...previous, status: 'offline' }));
      return;
    }
    let active = true;
    setState((previous) => ({ ...previous, status: 'loading', error: null }));
    void getBheContext(diagnosticId, userId)
      .then((data) => {
        if (!active) return;
        if (!data) {
          setState({ status: 'empty', data: null, error: null });
          return;
        }
        setState({ status: 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const apiError =
          error instanceof BheApiError
            ? error
            : new BheApiError('unknown', 'No fue posible cargar el balance.');
        setState({ status: statusFromError(apiError), data: null, error: apiError });
      });
    return () => {
      active = false;
    };
  }, [diagnosticId, userId, online, reloadKey]);
  return state;
}
