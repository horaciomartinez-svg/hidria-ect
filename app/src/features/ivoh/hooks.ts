import { useEffect, useState } from 'react';
import { useOnline } from '../../lib/online';
import {
  IvohApiError,
  getIvohContext,
  listIvohDiagnostics,
  type IvohContextData,
} from './api';
import type { IvohListRow } from './types';

export type IvohStatus =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'offline'
  | 'forbidden'
  | 'config'
  | 'error';

function statusFromError(error: IvohApiError): IvohStatus {
  if (error.kind === 'forbidden' || error.kind === 'auth') return 'forbidden';
  if (error.kind === 'config') return 'config';
  return 'error';
}

export interface IvohListState {
  status: IvohStatus;
  data: IvohListRow[];
  error: IvohApiError | null;
}

export function useIvohList(userId: string | undefined, reloadKey = 0): IvohListState {
  const online = useOnline();
  const [state, setState] = useState<IvohListState>({ status: 'loading', data: [], error: null });
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
    void listIvohDiagnostics(userId)
      .then((data) => {
        if (!active) return;
        setState({ status: data.length === 0 ? 'empty' : 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const apiError =
          error instanceof IvohApiError
            ? error
            : new IvohApiError('unknown', 'No fue posible cargar los diagnósticos.');
        setState({ status: statusFromError(apiError), data: [], error: apiError });
      });
    return () => {
      active = false;
    };
  }, [userId, online, reloadKey]);
  return state;
}

export interface IvohContextState {
  status: IvohStatus;
  data: IvohContextData | null;
  error: IvohApiError | null;
}

export function useIvohContext(
  diagnosticId: string | undefined,
  userId: string | undefined,
  reloadKey = 0,
): IvohContextState {
  const online = useOnline();
  const [state, setState] = useState<IvohContextState>({ status: 'loading', data: null, error: null });
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
    void getIvohContext(diagnosticId, userId)
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
          error instanceof IvohApiError
            ? error
            : new IvohApiError('unknown', 'No fue posible cargar el IVOH.');
        setState({ status: statusFromError(apiError), data: null, error: apiError });
      });
    return () => {
      active = false;
    };
  }, [diagnosticId, userId, online, reloadKey]);
  return state;
}
