import { useEffect, useState } from 'react';
import { useOnline } from '../../lib/online';
import {
  IihApiError,
  getIihDiagnostic,
  listAssetTypes,
  listIihAssets,
  listIihDiagnostics,
  listStages,
  type IihDiagnostic,
} from './api';
import type { IihAsset, IihAssetType, IihStage } from './types';

export type IihStatus =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'offline'
  | 'forbidden'
  | 'config'
  | 'error';

function statusFromError(error: IihApiError): IihStatus {
  if (error.kind === 'forbidden' || error.kind === 'auth') return 'forbidden';
  if (error.kind === 'config') return 'config';
  return 'error';
}

export interface IihListState {
  status: IihStatus;
  data: IihDiagnostic[];
  error: IihApiError | null;
}

export function useIihDiagnostics(userId: string | undefined, reloadKey = 0): IihListState {
  const online = useOnline();
  const [state, setState] = useState<IihListState>({ status: 'loading', data: [], error: null });
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
    void listIihDiagnostics(userId)
      .then((data) => {
        if (!active) return;
        setState({ status: data.length === 0 ? 'empty' : 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const apiError =
          error instanceof IihApiError
            ? error
            : new IihApiError('unknown', 'No fue posible cargar los diagnósticos.');
        setState({ status: statusFromError(apiError), data: [], error: apiError });
      });
    return () => {
      active = false;
    };
  }, [userId, online, reloadKey]);
  return state;
}

export interface IihInventoryState {
  status: IihStatus;
  diagnostic: IihDiagnostic | null;
  stages: IihStage[];
  types: IihAssetType[];
  assets: IihAsset[];
  error: IihApiError | null;
}

export function useIihInventory(
  diagnosticId: string | undefined,
  userId: string | undefined,
  reloadKey = 0,
): IihInventoryState {
  const online = useOnline();
  const [state, setState] = useState<IihInventoryState>({
    status: 'loading',
    diagnostic: null,
    stages: [],
    types: [],
    assets: [],
    error: null,
  });
  useEffect(() => {
    if (!diagnosticId || !userId) {
      setState({ status: 'empty', diagnostic: null, stages: [], types: [], assets: [], error: null });
      return;
    }
    if (!online) {
      setState((previous) => ({ ...previous, status: 'offline' }));
      return;
    }
    let active = true;
    setState((previous) => ({ ...previous, status: 'loading', error: null }));
    void Promise.all([
      getIihDiagnostic(diagnosticId, userId),
      listStages(),
      listAssetTypes(),
      listIihAssets(diagnosticId),
    ])
      .then(([diagnostic, stages, types, assets]) => {
        if (!active) return;
        if (!diagnostic) {
          setState({ status: 'empty', diagnostic: null, stages: [], types: [], assets: [], error: null });
          return;
        }
        setState({ status: 'ready', diagnostic, stages, types, assets, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const apiError =
          error instanceof IihApiError
            ? error
            : new IihApiError('unknown', 'No fue posible cargar el inventario IIH.');
        setState({
          status: statusFromError(apiError),
          diagnostic: null,
          stages: [],
          types: [],
          assets: [],
          error: apiError,
        });
      });
    return () => {
      active = false;
    };
  }, [diagnosticId, userId, online, reloadKey]);
  return state;
}
