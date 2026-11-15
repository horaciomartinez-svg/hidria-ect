import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useOnline } from '../../lib/online';
import { useIvohList } from '../../features/ivoh/hooks';
import { canCapture, formatScore } from '../../features/ivoh/types';

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
      data-ivoh-state={kind}
    >
      <p className="text-sm font-semibold">{title}</p>
      {detail && <p className="mt-1 text-xs leading-relaxed">{detail}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** M8 — selector de diagnóstico para el IVOH. */
export function IvohListPage() {
  const { claims } = useAuth();
  const online = useOnline();
  const { status, data, error } = useIvohList(claims?.sub);

  if (!online) {
    return (
      <Notice
        kind="offline"
        title="Sin conexión"
        detail="El IVOH requiere conexión para cargar factores/evaluaciones y guardar borradores vía EF-06. No se promete captura offline en F1 (Dexie/F2)."
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
        title="No tienes permiso para ver el IVOH"
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
    <div className="mx-auto max-w-5xl" data-testid="ivoh-list-page">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
          M8 · Motor IVOH
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">IVOH</h1>
        <p className="mt-1 text-sm text-slate-600">
          Índice de Valor de Optimización Hídrica: 6 factores con rúbrica y evidencia. El total y el
          semáforo los calcula el servidor; la validación R4 desbloquea el gate F6.
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
          {data.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-line bg-panel p-4"
              data-testid="ivoh-diagnostic-row"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {row.company_name ?? 'Empresa sin nombre'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Diagnóstico {row.folio ?? row.id.slice(0, 8)} · Fase actual {row.fase_actual} ·
                    Versión IVOH {row.version_number ?? '—'} · Rol: {row.diagnosticRole ?? 'sin membresía'}
                  </p>
                  <p className="mt-2 text-xs text-slate-600">
                    {row.ivoh_actual !== null && row.ivoh_actual !== undefined ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] text-semaforo-ok">
                        IVOH oficial {formatScore(row.ivoh_actual)}
                      </span>
                    ) : (
                      <span className="rounded bg-surface px-2 py-0.5 text-[11px]">
                        IVOH pendiente de R4
                      </span>
                    )}
                  </p>
                </div>
                <Link
                  to={`/ivoh/${row.id}`}
                  className="rounded-md bg-hidria-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-hidria-800"
                  data-testid="ivoh-open"
                >
                  {canCapture(row.diagnosticRole) ? 'Abrir captura' : 'Ver IVOH'}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
