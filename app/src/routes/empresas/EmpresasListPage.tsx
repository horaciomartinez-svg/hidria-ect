import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useOnline } from '../../lib/online';
import { useCompaniesList } from '../../features/empresas/hooks';
import {
  CICLOS_VIDA,
  CICLO_LABEL,
  COMPANY_CREATE_ROLES,
  GIROS,
  GIRO_LABEL,
} from '../../features/empresas/types';
import { CicloBadge, EstadoNotice, GiroTexto } from './shared';

/**
 * M1 — Lista de empresas (F1-03b).
 *
 * Consumo PostgREST directo (`companies`) con RLS; la UI no filtra por tenant, sólo
 * presenta lo que el servidor devuelve. Estados: carga, vacío, error, sin permiso,
 * offline (sin prometer persistencia local) y configuración incompleta.
 */
export function EmpresasListPage() {
  const { claims } = useAuth();
  const online = useOnline();
  const [search, setSearch] = useState('');
  const [giro, setGiro] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [ciclo, setCiclo] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const filters = useMemo(
    () => ({ search, giro, municipio, ciclo }),
    [search, giro, municipio, ciclo],
  );
  const { status, data, error } = useCompaniesList(filters, reloadKey);
  const canCreate = claims ? COMPANY_CREATE_ROLES.includes(claims.globalRole) : false;

  const clearFilters = () => {
    setSearch('');
    setGiro('');
    setMunicipio('');
    setCiclo('');
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
            M1 · Registro de empresas
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">Empresas</h1>
          <p className="mt-1 text-sm text-slate-600">
            Expediente maestro del Programa «Empresas Hídricamente Responsables». El acceso lo
            determina la seguridad por organización (RLS).
          </p>
        </div>
        {canCreate && (
          <Link
            to="/empresas/nueva"
            data-testid="alta-empresa"
            className="rounded-md bg-hidria-700 px-4 py-2 text-sm font-semibold text-white hover:bg-hidria-800"
          >
            Alta de empresa
          </Link>
        )}
      </header>

      <section
        className="mt-5 rounded-lg border border-line bg-panel p-4"
        aria-labelledby="filtros-titulo"
      >
        <h2 id="filtros-titulo" className="sr-only">
          Filtros de empresas
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="empresa-buscar" className="block text-xs font-medium text-slate-700">
              Buscar
            </label>
            <input
              id="empresa-buscar"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Razón social, planta o municipio"
              className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm"
              data-testid="empresa-search"
            />
          </div>
          <div>
            <label htmlFor="empresa-giro" className="block text-xs font-medium text-slate-700">
              Giro
            </label>
            <select
              id="empresa-giro"
              value={giro}
              onChange={(event) => setGiro(event.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {GIROS.map((value) => (
                <option key={value} value={value}>
                  {GIRO_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="empresa-municipio" className="block text-xs font-medium text-slate-700">
              Municipio
            </label>
            <input
              id="empresa-municipio"
              value={municipio}
              onChange={(event) => setMunicipio(event.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="empresa-ciclo" className="block text-xs font-medium text-slate-700">
              Ciclo de vida
            </label>
            <select
              id="empresa-ciclo"
              value={ciclo}
              onChange={(event) => setCiclo(event.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {CICLOS_VIDA.map((value) => (
                <option key={value} value={value}>
                  {CICLO_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Limpiar filtros
          </button>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Actualizar
          </button>
        </div>
      </section>

      <section className="mt-5" aria-live="polite">
        {!online && (
          <EstadoNotice
            kind="offline"
            title="Sin conexión"
            detail="La consulta de empresas requiere conexión. La captura offline se habilitará con los módulos de campo (M4/M6/M10); no se guardan cambios en este dispositivo."
          />
        )}

        {online && status === 'loading' && (
          <p className="text-sm text-slate-600" role="status">
            Cargando empresas…
          </p>
        )}

        {online && status === 'config' && (
          <EstadoNotice
            kind="config"
            title="Configuración incompleta"
            detail="Este despliegue no tiene configurada la conexión a Supabase."
          />
        )}

        {online && status === 'forbidden' && (
          <EstadoNotice
            kind="forbidden"
            title="No tienes permiso para ver estas empresas"
            detail="La política de seguridad por organización (RLS) ha denegado la consulta. Si necesitas acceso, solicítalo a la Coordinación SRHDS."
          />
        )}

        {online && status === 'error' && (
          <EstadoNotice
            kind="error"
            title="No fue posible cargar las empresas"
            detail={import.meta.env.DEV ? error?.message : 'Intenta de nuevo; si persiste, contacta a la Coordinación SRHDS.'}
            action={
              <button
                type="button"
                onClick={() => setReloadKey((value) => value + 1)}
                className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold"
              >
                Reintentar
              </button>
            }
          />
        )}

        {online && status === 'empty' && (
          <div data-testid="empresas-empty">
            <EstadoNotice
              kind="empty"
              title="Sin empresas registradas"
              detail={
                canCreate
                  ? 'Aún no hay empresas que coincidan con los filtros. Puedes dar de alta la primera.'
                  : 'Aún no hay empresas que coincidan con los filtros.'
              }
              action={
                canCreate ? (
                  <Link
                    to="/empresas/nueva"
                    className="rounded-md bg-hidria-700 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Alta de empresa
                  </Link>
                ) : undefined
              }
            />
          </div>
        )}

        {online && status === 'ready' && (
          <div className="overflow-x-auto rounded-lg border border-line bg-panel">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <caption className="sr-only">
                Empresas visibles para tu organización, ordenadas por razón social
              </caption>
              <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Razón social
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Planta
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Giro
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Municipio
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Organismo operador
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Ciclo de vida
                  </th>
                  <th scope="col" className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.map((company) => (
                  <tr
                    key={company.id}
                    className="border-t border-line"
                    data-testid="empresa-row"
                  >
                    <th scope="row" className="px-3 py-2 font-medium text-hidria-900">
                      {company.razon_social}
                    </th>
                    <td className="px-3 py-2 text-slate-700">{company.nombre_planta}</td>
                    <td className="px-3 py-2 text-slate-700">
                      <GiroTexto giro={company.giro} />
                    </td>
                    <td className="px-3 py-2 text-slate-700">{company.municipio}</td>
                    <td className="px-3 py-2 text-slate-700">{company.organismo_operador}</td>
                    <td className="px-3 py-2">
                      <CicloBadge ciclo={company.ciclo_vida} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={`/empresas/${company.id}`}
                        className="text-xs font-semibold text-hidria-700 underline"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
