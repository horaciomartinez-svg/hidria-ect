import { useEffect, useState } from 'react';
import { useOnline } from '../../lib/online';
import {
  EmpresaApiError,
  getCompany,
  listCompanies,
  type CompanyFilters,
} from './api';
import type { Company } from './types';

export type ResourceStatus =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'offline'
  | 'forbidden'
  | 'config'
  | 'error';

export interface CompaniesListState {
  status: ResourceStatus;
  data: Company[];
  error: EmpresaApiError | null;
}

export interface CompanyState {
  status: ResourceStatus;
  data: Company | null;
  error: EmpresaApiError | null;
}

function statusFromError(error: EmpresaApiError): ResourceStatus {
  if (error.kind === 'forbidden' || error.kind === 'auth') return 'forbidden';
  if (error.kind === 'config') return 'config';
  return 'error';
}

/**
 * Lista de empresas (estados carga/vacío/error/offline). Sin caché offline: la captura
 * offline pertenece a Dexie (M4/M6/M10); aquí no se promete persistencia.
 */
export function useCompaniesList(filters: CompanyFilters, reloadKey = 0): CompaniesListState {
  const online = useOnline();
  const [state, setState] = useState<CompaniesListState>({
    status: 'loading',
    data: [],
    error: null,
  });
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    if (!online) {
      setState({ status: 'offline', data: [], error: null });
      return;
    }
    let active = true;
    setState({ status: 'loading', data: [], error: null });
    void listCompanies(filters)
      .then((data) => {
        if (!active) return;
        setState({ status: data.length === 0 ? 'empty' : 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const apiError =
          error instanceof EmpresaApiError
            ? error
            : new EmpresaApiError('unknown', 'No fue posible cargar las empresas.');
        setState({ status: statusFromError(apiError), data: [], error: apiError });
      });
    return () => {
      active = false;
    };
    // `filterKey` resume el filtro; `reloadKey` fuerza reintento.
  }, [filterKey, online, reloadKey]);

  return state;
}

/** Detalle de empresa (estados carga/inexistente/error/offline). */
export function useCompany(id: string | undefined): CompanyState {
  const online = useOnline();
  const [state, setState] = useState<CompanyState>({
    status: 'loading',
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!id) {
      setState({ status: 'empty', data: null, error: null });
      return;
    }
    if (!online) {
      setState({ status: 'offline', data: null, error: null });
      return;
    }
    let active = true;
    setState({ status: 'loading', data: null, error: null });
    void getCompany(id)
      .then((company) => {
        if (!active) return;
        setState({
          status: company ? 'ready' : 'empty',
          data: company,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const apiError =
          error instanceof EmpresaApiError
            ? error
            : new EmpresaApiError('unknown', 'No fue posible cargar la empresa.');
        setState({ status: statusFromError(apiError), data: null, error: apiError });
      });
    return () => {
      active = false;
    };
  }, [id, online]);

  return state;
}
