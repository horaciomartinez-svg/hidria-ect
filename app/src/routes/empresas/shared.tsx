import { CICLO_LABEL, GIRO_LABEL, type CicloVida, type Giro } from '../../features/empresas/types';

export function CicloBadge({ ciclo }: { ciclo: CicloVida }) {
  const tone =
    ciclo === 'ehr'
      ? 'bg-emerald-100 text-semaforo-ok'
      : ciclo === 'prospecto'
        ? 'bg-slate-100 text-slate-700'
        : 'bg-hidria-50 text-hidria-700';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {CICLO_LABEL[ciclo]}
    </span>
  );
}

export function GiroTexto({ giro }: { giro: Giro }) {
  return <>{GIRO_LABEL[giro] ?? giro}</>;
}

/** Aviso de estado no feliz (offline/permiso/error/config), accesible. */
export function EstadoNotice({
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
      : kind === 'forbidden'
        ? 'border-red-200 bg-red-50 text-semaforo-crit'
        : kind === 'config'
          ? 'border-red-200 bg-red-50 text-semaforo-crit'
          : 'border-line bg-panel text-slate-700';
  return (
    <div
      className={`rounded-lg border p-5 ${tone}`}
      role={kind === 'error' || kind === 'forbidden' || kind === 'config' ? 'alert' : 'status'}
      aria-live="polite"
      data-empresa-state={kind}
    >
      <p className="text-sm font-semibold">{title}</p>
      {detail && <p className="mt-1 text-xs leading-relaxed">{detail}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
