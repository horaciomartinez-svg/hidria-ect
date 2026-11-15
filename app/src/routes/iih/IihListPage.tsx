import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useOnline } from '../../lib/online';
import { useIihDiagnostics } from '../../features/iih/hooks';

function Notice({
  kind,
  title,
  detail,
  action,
}: {
  kind: 'offline' | 'forbidden' | 'error' | 'config' | 'empty';
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  const tone =
    kind === 'offline'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : kind === 'forbidden' || kind === 'config'
        ? 'border-red-200 bg-red-50 text-semaforo-crit'
        : 'border-line bg-panel text-slate-700';
  return (
    <div
      className={`rounded-lg border p-5 ${tone}`}
      role={kind === 'error' || kind === 'forbidden' || kind === 'config' ? 'alert' : 'status'}
      aria-live="polite"
      data-iih-state={kind}
    >
      <p className="text-sm font-semibold">{title}</p>
      {detail && <p className="mt-1 text-xs leading-relaxed">{detail}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** M5 — selector de diagnóstico para el inventario IIH. */
export function IihListPage() {
  const { claims } = useAuth();
  const online = useOnline();
  const { status, data, error } = useIihDiagnostics(claims?.sub);

  if (!online) {
    return (
      <Notice
        kind="offline"
        title="Sin conexión"
        detail="El inventario IIH requiere conexión para cargar activos y catálogos. La captura offline de campo (Dexie) se habilitará en F2."
      />
    );
  }
  if (status === 'loading') {
    return (
      <p className="text-sm text-slate-600" role="status">
        Cargando diagnósticos…
      </p>
    );
  }
  if (status === 'config') {
    return (
      <Notice
        kind="config"
        title="Configuración incompleta"
        detail="Este despliegue no tiene configurada la conexión a Supabase."
      />
    );
  }
  if (status === 'forbidden') {
    return (
      <Notice
        kind="forbidden"
        title="No tienes permiso para ver diagnósticos"
        detail="La política de seguridad por diagnóstico (RLS) ha denegado la consulta."
      />
    );
  }
  if (status === 'error') {
    return (
      <Notice
        kind="error"
        title="No fue posible cargar los diagnósticos"
        detail={import.meta.env.DEV ? error?.message : 'Intenta de nuevo más tarde.'}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl" data-testid="iih-list-page">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
          M5 · Inventario de Infraestructura Hidráulica
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">IIH</h1>
        <p className="mt-1 text-sm text-slate-600">
          Activos de las 6 etapas (CAP, ALM, TRA, DIS, USO, EVA) con folio asignado por el servidor.
          Alta/edición bajo RLS; importación de la plantilla oficial por EF-09.
        </p>
      </header>

      {status === 'empty' ? (
        <div className="mt-5">
          <Notice
            kind="empty"
            title="Sin diagnósticos visibles"
            detail="No eres miembro de ningún diagnóstico o aún no hay expedientes."
            action={
              <Link className="text-xs font-semibold text-hidria-700 underline" to="/kanban">
                Ir al tablero de diagnósticos
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {data.map((diagnostic) => (
            <li
              key={diagnostic.id}
              className="rounded-lg border border-line bg-panel p-4"
              data-testid="iih-diagnostic-row"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {diagnostic.company_name ?? 'Empresa sin nombre'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Diagnóstico {diagnostic.folio ?? diagnostic.id.slice(0, 8)} · Rol:{' '}
                    {diagnostic.diagnosticRole ?? 'sin membresía'}
                  </p>
                </div>
                <Link
                  to={`/iih/${diagnostic.id}`}
                  className="rounded-md bg-hidria-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-hidria-800"
                  data-testid="iih-open"
                >
                  Abrir inventario
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
