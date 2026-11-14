import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useOnline } from '../../lib/online';
import { useCatDiagnostics } from '../../features/cat/hooks';
import {
  CAT_ESTADO_LABEL,
  canCapture,
  canValidateR2,
  type CatEstado,
} from '../../features/cat/types';

function EstadoBadge({ estado }: { estado: CatEstado }) {
  const tone =
    estado === 'validado_r2'
      ? 'bg-emerald-100 text-semaforo-ok'
      : estado === 'en_revision'
        ? 'bg-sky-100 text-sky-800'
        : estado === 'en_captura'
          ? 'bg-hidria-50 text-hidria-700'
          : 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {CAT_ESTADO_LABEL[estado]}
    </span>
  );
}

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
      data-cat-state={kind}
    >
      <p className="text-sm font-semibold">{title}</p>
      {detail && <p className="mt-1 text-xs leading-relaxed">{detail}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/**
 * M4 — CAT: selector de diagnóstico visible por RLS.
 *
 * El detalle/captura vive en `/cat/:diagnosticId`; aquí sólo se listan expedientes y su
 * `cat_estado` (la captura y el gate se realizan en EF-04/RLS).
 */
export function CatListPage() {
  const { claims } = useAuth();
  const online = useOnline();
  const { status, data, error } = useCatDiagnostics(claims?.sub);

  if (!online) {
    return (
      <Notice
        kind="offline"
        title="Sin conexión"
        detail="El CAT requiere conexión para cargar el banco y guardar respuestas. La captura offline (Dexie) se habilitará en F2; no se promete persistencia local."
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
    <div className="mx-auto max-w-5xl" data-testid="cat-list-page">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
          M4 · Cuestionario de Análisis Técnico (CAT)
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">CAT</h1>
        <p className="mt-1 text-sm text-slate-600">
          Banco A1-v1 (47 preguntas, secciones A–H). Captura por diagnóstico; la validación en R2
          la realiza el equipo del diagnóstico (EF-04) y es la que desbloquea el gate de fase.
        </p>
      </header>

      {status === 'empty' ? (
        <div className="mt-5">
          <Notice
            kind="empty"
            title="Sin diagnósticos visibles"
            detail="No eres miembro de ningún diagnóstico o aún no hay expedientes. Consulta el tablero de diagnósticos o solicita acceso a la Coordinación SRHDS."
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
              data-testid="cat-diagnostic-row"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {diagnostic.company_name ?? 'Empresa sin nombre'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Diagnóstico {diagnostic.folio ?? diagnostic.id.slice(0, 8)} · Rol en el
                    diagnóstico: {diagnostic.diagnosticRole ?? 'sin membresía'}
                  </p>
                  <p className="mt-2">
                    <EstadoBadge estado={diagnostic.cat_estado} />
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canCapture(diagnostic.diagnosticRole) ? (
                    <Link
                      to={`/cat/${diagnostic.id}`}
                      className="rounded-md bg-hidria-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-hidria-800"
                      data-testid="cat-open"
                    >
                      {diagnostic.cat_estado === 'validado_r2' ? 'Ver CAT validado' : 'Abrir CAT'}
                    </Link>
                  ) : (
                    <Link
                      to={`/cat/${diagnostic.id}`}
                      className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      Ver CAT
                    </Link>
                  )}
                  {canValidateR2(diagnostic.diagnosticRole) &&
                    diagnostic.cat_estado === 'en_revision' && (
                      <span className="text-[11px] font-medium text-semaforo-warn">
                        Pendiente de validar en R2
                      </span>
                    )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
