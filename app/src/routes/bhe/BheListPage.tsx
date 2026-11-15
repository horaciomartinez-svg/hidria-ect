import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useOnline } from '../../lib/online';
import { useBheList } from '../../features/bhe/hooks';
import {
  BHE_ESTADO_LABEL,
  canCapture,
  formatNumber,
  formatPct,
  gapTone,
} from '../../features/bhe/types';

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
      data-bhe-state={kind}
    >
      <p className="text-sm font-semibold">{title}</p>
      {detail && <p className="mt-1 text-xs leading-relaxed">{detail}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function GapBadge({ value }: { value: string | number | null | undefined }) {
  const tone = gapTone(value);
  const classes =
    tone === 'warn'
      ? 'bg-red-100 text-semaforo-crit'
      : tone === 'ok'
        ? 'bg-emerald-100 text-semaforo-ok'
        : 'bg-slate-100 text-slate-600';
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${classes}`}>
      {tone === 'missing' ? 'Pendiente' : formatPct(value)}
    </span>
  );
}

/** M6 — selector de diagnóstico para el BHE. */
export function BheListPage() {
  const { claims } = useAuth();
  const online = useOnline();
  const { status, data, error } = useBheList(claims?.sub);

  if (!online) {
    return (
      <Notice
        kind="offline"
        title="Sin conexión"
        detail="El BHE requiere conexión para cargar el balance y guardar captura. No se promete captura offline en F1 (Dexie/F2)."
      />
    );
  }
  if (status === 'loading') {
    return (
      <p className="text-sm text-slate-600" role="status">
        Cargando balances…
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
        title="No tienes permiso para ver balances"
        detail="La política de seguridad por diagnóstico (RLS) ha denegado la consulta."
      />
    );
  }
  if (status === 'error') {
    return (
      <Notice
        kind="error"
        title="No fue posible cargar los balances"
        detail={import.meta.env.DEV ? error?.message : 'Intenta de nuevo más tarde.'}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl" data-testid="bhe-list-page">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
          M6 · Balance Hídrico Enriquecido
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">BHE</h1>
        <p className="mt-1 text-sm text-slate-600">
          12 meses de flujos por diagnóstico. La brecha la calcula el servidor; la validación R3
          (regla &gt; 10 %) se realiza con EF-05 y desbloquea el gate F5.
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
              data-testid="bhe-diagnostic-row"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {row.company_name ?? 'Empresa sin nombre'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Diagnóstico {row.folio ?? row.id.slice(0, 8)} · Fase actual {row.fase_actual} ·
                    Rol: {row.diagnosticRole ?? 'sin membresía'}
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    {row.balance ? (
                      <>
                        <span className="rounded bg-surface px-2 py-0.5 text-[11px]">
                          {BHE_ESTADO_LABEL[row.balance.estado]} · v{row.balance.version} ·{' '}
                          {row.balance.periodo_anio}
                        </span>
                        <span>Brecha máx. mes:</span>
                        <GapBadge value={row.summary?.brecha_max_mes_pct} />
                        <span>Captura: {row.summary?.meses_con_captura ?? 0}/12</span>
                      </>
                    ) : (
                      <span className="rounded bg-surface px-2 py-0.5 text-[11px]">
                        Sin balance
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/bhe/${row.id}`}
                    className="rounded-md bg-hidria-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-hidria-800"
                    data-testid="bhe-open"
                  >
                    {canCapture(row.diagnosticRole) ? 'Abrir captura' : 'Ver balance'}
                  </Link>
                  {canCapture(row.diagnosticRole) && row.summary?.tiene_datos && (
                    <span className="text-[11px] text-slate-500">
                      {formatNumber(row.summary.brecha_anual_pct)} % anual
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
