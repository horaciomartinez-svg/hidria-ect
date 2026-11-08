import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { GLOBAL_ROLE_LABEL } from '../lib/auth/claims';
import { useOnline } from '../lib/online';
import { modulesForRole } from './registry';

function PhaseBadge({ phase }: { phase: 'F1' | 'F2' | 'F3' }) {
  const tone =
    phase === 'F1'
      ? 'bg-hidria-100 text-hidria-800'
      : phase === 'F2'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-slate-200 text-slate-700';
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>
      {phase}
    </span>
  );
}

/** Panel de inicio del shell (F1-02). No muestra cifras: los indicadores llegan con M2/M13. */
export function PanelPage() {
  const { claims, profile } = useAuth();
  const online = useOnline();
  const role = claims?.globalRole ?? null;
  const modules = modulesForRole(role);
  const greetingName = profile?.fullName ?? claims?.email ?? 'sesión activa';

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
            Panel de inicio
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">
            Hola, {greetingName}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {profile?.organizationName ?? 'Organización del Programa'} ·{' '}
            {role ? GLOBAL_ROLE_LABEL[role] : 'rol no reconocido'}
          </p>
        </div>
        <p
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            online ? 'bg-emerald-50 text-semaforo-ok' : 'bg-amber-50 text-semaforo-warn'
          }`}
          data-connection={online ? 'online' : 'offline'}
        >
          {online ? 'En línea' : 'Sin conexión'}
        </p>
      </header>

      <section
        className="mt-6 rounded-lg border border-line bg-panel p-5 shadow-card"
        aria-labelledby="sesion-titulo"
      >
        <h2 id="sesion-titulo" className="text-sm font-semibold text-hidria-900">
          Sesión verificada
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Los datos provienen del token emitido por Supabase Auth con los claims de HIDRIA
          (ADR-005). La autorización efectiva la aplican RLS y las Edge Functions.
        </p>
        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="uppercase tracking-wide text-slate-500">Usuario</dt>
            <dd className="mt-0.5 break-all font-mono text-slate-800">
              {claims?.sub ? `${claims.sub.slice(0, 8)}…` : '—'}
            </dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-slate-500">Rol institucional</dt>
            <dd className="mt-0.5 text-slate-800">{role ? GLOBAL_ROLE_LABEL[role] : '—'}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-slate-500">Organización</dt>
            <dd className="mt-0.5 break-all font-mono text-slate-800">
              {claims?.organizationId ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-slate-500">Rol por diagnóstico</dt>
            <dd className="mt-0.5 text-slate-800">Se resuelve en servidor (docs/04 §2.1)</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8" aria-labelledby="modulos-titulo">
        <div className="flex items-end justify-between gap-3">
          <h2 id="modulos-titulo" className="text-lg font-semibold text-hidria-900">
            Módulos disponibles
          </h2>
          <p className="text-xs text-slate-500">{modules.length} de 13 según tu rol</p>
        </div>
        {modules.length === 0 ? (
          <p className="mt-3 rounded-lg border border-line bg-panel p-4 text-sm text-slate-600">
            Tu sesión no tiene un rol institucional reconocido en el token. Contacta a la
            Coordinación SRHDS para que se asigne el perfil correspondiente.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((module) => (
              <li key={module.id}>
                <Link
                  to={module.path}
                  className="flex h-full flex-col rounded-lg border border-line bg-panel p-4 shadow-card hover:border-hidria-200"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-slate-400">{module.id}</span>
                    <PhaseBadge phase={module.phase} />
                  </span>
                  <span className="mt-1 text-sm font-semibold text-hidria-900">
                    {module.title}
                  </span>
                  <span className="mt-1 text-xs leading-relaxed text-slate-600">
                    {module.summary}
                  </span>
                  <span className="mt-2 break-words font-mono text-[10px] text-slate-400">
                    {module.contract}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-lg border border-dashed border-line p-5" aria-labelledby="siguiente-titulo">
        <h2 id="siguiente-titulo" className="text-sm font-semibold text-hidria-900">
          Qué sigue en el shell
        </h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-600">
          <li>PWA instalable, service worker y aviso de versión nueva (F1-02b).</li>
          <li>Diagnósticos, Kanban y capturas reales llegan en las tareas M1/M2/M11.</li>
          <li>Cola offline de captura (Dexie) en las tareas de M4/M6/M10.</li>
        </ul>
      </section>
    </div>
  );
}
