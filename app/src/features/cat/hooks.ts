import { useEffect, useState } from 'react';
import { useOnline } from '../../lib/online';
import {
  CatApiError,
  getCatDiagnostic,
  listCatDiagnostics,
  listCatItems,
  listCatResponses,
} from './api';
import type { CatDiagnostic, CatItem, CatResponse } from './types';

export type CatStatus =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'offline'
  | 'forbidden'
  | 'config'
  | 'error';

function statusFromError(error: CatApiError): CatStatus {
  if (error.kind === 'forbidden' || error.kind === 'auth') return 'forbidden';
  if (error.kind === 'config') return 'config';
  return 'error';
}

export interface CatListState {
  status: CatStatus;
  data: CatDiagnostic[];
  error: CatApiError | null;
}

/** Diagnósticos visibles (para elegir el CAT a capturar). */
export function useCatDiagnostics(userId: string | undefined, reloadKey = 0): CatListState {
  const online = useOnline();
  const [state, setState] = useState<CatListState>({ status: 'loading', data: [], error: null });
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
    void listCatDiagnostics(userId)
      .then((data) => {
        if (!active) return;
        setState({ status: data.length === 0 ? 'empty' : 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const apiError =
          error instanceof CatApiError
            ? error
            : new CatApiError('unknown', 'No fue posible cargar los diagnósticos.');
        setState({ status: statusFromError(apiError), data: [], error: apiError });
      });
    return () => {
      active = false;
    };
  }, [userId, online, reloadKey]);
  return state;
}

export interface CatFormState {
  status: CatStatus;
  diagnostic: CatDiagnostic | null;
  items: CatItem[];
  responses: CatResponse[];
  error: CatApiError | null;
}

/** Catálogo A1-v1 + respuestas del diagnóstico (con rol de diagnóstico). */
export function useCatForm(
  diagnosticId: string | undefined,
  userId: string | undefined,
  reloadKey = 0,
): CatFormState {
  const online = useOnline();
  const [state, setState] = useState<CatFormState>({
    status: 'loading',
    diagnostic: null,
    items: [],
    responses: [],
    error: null,
  });
  useEffect(() => {
    if (!diagnosticId || !userId) {
      setState({ status: 'empty', diagnostic: null, items: [], responses: [], error: null });
      return;
    }
    if (!online) {
      setState((previous) => ({ ...previous, status: 'offline' }));
      return;
    }
    let active = true;
    setState((previous) => ({ ...previous, status: 'loading', error: null }));
    void Promise.all([
      getCatDiagnostic(diagnosticId, userId),
      listCatItems(),
      listCatResponses(diagnosticId),
    ])
      .then(([diagnostic, items, responses]) => {
        if (!active) return;
        if (!diagnostic) {
          setState({
            status: 'empty',
            diagnostic: null,
            items: [],
            responses: [],
            error: null,
          });
          return;
        }
        setState({
          status: items.length === 0 ? 'empty' : 'ready',
          diagnostic,
          items,
          responses,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const apiError =
          error instanceof CatApiError
            ? error
            : new CatApiError('unknown', 'No fue posible cargar el CAT.');
        setState({
          status: statusFromError(apiError),
          diagnostic: null,
          items: [],
          responses: [],
          error: apiError,
        });
      });
    return () => {
      active = false;
    };
  }, [diagnosticId, userId, online, reloadKey]);
  return state;
}
