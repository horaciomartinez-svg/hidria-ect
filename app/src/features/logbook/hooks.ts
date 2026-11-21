import { useEffect, useState } from 'react';
import { useOnline } from '../../lib/online';
import {
  LogbookApiError,
  getBitacoraEntry,
  getBitacoraList,
  type BitacoraEntryContext,
  type BitacoraListData,
} from './api';

export type LogbookStatus =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'offline'
  | 'forbidden'
  | 'config'
  | 'error';

function statusFromError(error: LogbookApiError): LogbookStatus {
  if (error.kind === 'forbidden' || error.kind === 'auth') return 'forbidden';
  if (error.kind === 'config') return 'config';
  return 'error';
}

export interface BitacoraListState {
  status: LogbookStatus;
  data: BitacoraListData | null;
  error: LogbookApiError | null;
}

export function useBitacoraList(userId: string | undefined, reloadKey = 0): BitacoraListState {
  const online = useOnline();
  const [state, setState] = useState<BitacoraListState>({ status: 'loading', data: null, error: null });
  useEffect(() => {
    if (!userId) {
      setState({ status: 'empty', data: null, error: null });
      return;
    }
    if (!online) {
      setState({ status: 'offline', data: null, error: null });
      return;
    }
    let active = true;
    setState({ status: 'loading', data: null, error: null });
    void getBitacoraList(userId)
      .then((data) => {
        if (!active) return;
        setState({
          status: data.diagnostics.length === 0 ? 'empty' : 'ready',
          data,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const apiError =
          error instanceof LogbookApiError
            ? error
            : new LogbookApiError('unknown', 'No fue posible cargar la bitácora.');
        setState({ status: statusFromError(apiError), data: null, error: apiError });
      });
    return () => {
      active = false;
    };
  }, [userId, online, reloadKey]);
  return state;
}

export interface BitacoraEntryState {
  status: LogbookStatus;
  data: BitacoraEntryContext | null;
  error: LogbookApiError | null;
}

export function useBitacoraEntry(
  entryId: string | undefined,
  userId: string | undefined,
  reloadKey = 0,
): BitacoraEntryState {
  const online = useOnline();
  const [state, setState] = useState<BitacoraEntryState>({ status: 'loading', data: null, error: null });
  useEffect(() => {
    if (!entryId || !userId) {
      setState({ status: 'empty', data: null, error: null });
      return;
    }
    if (!online) {
      setState((previous) => ({ ...previous, status: 'offline' }));
      return;
    }
    let active = true;
    setState((previous) => ({ ...previous, status: 'loading', error: null }));
    void getBitacoraEntry(entryId, userId)
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
          error instanceof LogbookApiError
            ? error
            : new LogbookApiError('unknown', 'No fue posible cargar la ficha.');
        setState({ status: statusFromError(apiError), data: null, error: apiError });
      });
    return () => {
      active = false;
    };
  }, [entryId, userId, online, reloadKey]);
  return state;
}
