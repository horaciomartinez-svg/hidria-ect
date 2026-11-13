import { Link, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useOnline } from '../../lib/online';
import { useCompany } from '../../features/empresas/hooks';
import { COMPANY_WRITE_ROLES } from '../../features/empresas/types';
import { CicloBadge, EstadoNotice, GiroTexto } from './shared';

function Dato({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value === null || value === undefined || value === '' ? '—' : value}</dd>
    </div>
  );
}

function fecha(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-MX');
}

/** M1 — Detalle de empresa (F1-03b). */
export function EmpresaDetailPage() {
  const { companyId } = useParams();
  const { claims } = useAuth();
  const online = useOnline();
  const state = useCompany(companyId);
  const canWrite = claims ? COMPANY_WRITE_ROLES.includes(claims.globalRole) : false;

  if (!online) {
    return (
      <EstadoNotice
        kind="offline"
        title="Sin conexión"
        detail="El detalle de la empresa requiere conexión. La captura offline se habilitará con los módulos de campo (M4/M6/M10)."
        action={
          <Link className="text-xs font-semibold text-hidria-700 underline" to="/empresas">
            Volver al listado
          </Link>
        }
      />
    );
  }

  if (state.status === 'loading') {
    return (
      <p className="text-sm text-slate-600" role="status">
        Cargando empresa…
      </p>
    );
  }

  if (state.status === 'forbidden') {
    return (
      <EstadoNotice
        kind="forbidden"
        title="No tienes permiso para ver esta empresa"
        detail="La política de seguridad por organización (RLS) ha denegado el acceso."
        action={
          <Link className="text-xs font-semibold text-hidria-700 underline" to="/empresas">
            Volver al listado
          </Link>
        }
      />
    );
  }

  if (state.status === 'config' || state.status === 'error') {
    return (
      <EstadoNotice
        kind={state.status === 'config' ? 'config' : 'error'}
        title="No fue posible cargar la empresa"
        detail={import.meta.env.DEV ? state.error?.message : 'Intenta de nuevo; si persiste, contacta a la Coordinación SRHDS.'}
        action={
          <Link className="text-xs font-semibold text-hidria-700 underline" to="/empresas">
            Volver al listado
          </Link>
        }
      />
    );
  }

  if (state.status === 'empty' || !state.data) {
    return (
      <EstadoNotice
        kind="empty"
        title="La empresa no existe"
        detail="Puede haber sido eliminada, pertenecer a otra organización o el enlace no ser correcto."
        action={
          <Link className="text-xs font-semibold text-hidria-700 underline" to="/empresas">
            Volver al listado
          </Link>
        }
      />
    );
  }

  const company = state.data;

  return (
    <div className="mx-auto max-w-4xl" data-testid="empresa-detail">
      <Link to="/empresas" className="text-xs font-semibold text-hidria-700 underline">
        ← Volver al listado
      </Link>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
            M1 · Empresa atendida
          </p>
          <h1
            className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900"
            data-testid="empresa-titulo"
          >
            {company.razon_social}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {company.nombre_planta} · {company.municipio} · <GiroTexto giro={company.giro} />
          </p>
          <p className="mt-2">
            <CicloBadge ciclo={company.ciclo_vida} />
          </p>
        </div>
        {canWrite && (
          <Link
            to={`/empresas/${company.id}/editar`}
            className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Editar empresa
          </Link>
        )}
      </header>

      <section
        className="mt-5 rounded-lg border border-line bg-panel p-5"
        aria-labelledby="datos-titulo"
      >
        <h2 id="datos-titulo" className="text-sm font-semibold text-hidria-900">
          Datos del expediente
        </h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dato label="Razón social" value={company.razon_social} />
          <Dato label="Nombre de planta" value={company.nombre_planta} />
          <Dato label="Giro industrial" value={<GiroTexto giro={company.giro} />} />
          <Dato label="Calle y número" value={company.calle} />
          <Dato label="Colonia / parque industrial" value={company.colonia_parque} />
          <Dato label="Código postal" value={company.cp} />
          <Dato label="Municipio" value={company.municipio} />
          <Dato label="Organismo operador" value={company.organismo_operador} />
          <Dato
            label="Coordenadas"
            value={
              company.lat !== null && company.lon !== null
                ? `${company.lat}, ${company.lon}`
                : null
            }
          />
          <Dato label="Empleados" value={company.empleados} />
          <Dato label="Turnos" value={company.turnos} />
          <Dato label="Unidad de producción" value={company.unidad_produccion} />
          <Dato label="Contraparte designada" value={company.contraparte_user_id} />
          <Dato label="Ciclo de vida" value={<CicloBadge ciclo={company.ciclo_vida} />} />
          <Dato label="Alta" value={fecha(company.created_at)} />
          <Dato label="Última actualización" value={fecha(company.updated_at)} />
        </dl>
      </section>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        El acceso a este expediente lo determina la seguridad por organización (RLS) de Supabase;
        el cliente no filtra ni decide la visibilidad. Los diagnósticos de la empresa se gestionan
        en M2.
      </p>
    </div>
  );
}
