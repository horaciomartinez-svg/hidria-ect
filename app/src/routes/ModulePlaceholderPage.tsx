import { Link } from 'react-router-dom';
import type { ModuleDef } from './registry';

/**
 * Placeholder de módulo (F1-02): declara qué contrato consumirá la pantalla real.
 * No simula datos ni reglas: la pantalla se implementa en la tarea del módulo.
 */
export function ModulePlaceholderPage({ module }: { module: ModuleDef }) {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
        {module.id} · Fase prevista {module.phase}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">
        {module.title}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{module.summary}</p>

      <div className="mt-6 rounded-lg border border-line bg-panel p-5 shadow-card">
        <h2 className="text-sm font-semibold text-hidria-900">Contrato que consumirá</h2>
        <p className="mt-1 break-words font-mono text-xs text-slate-600">{module.contract}</p>
        <p className="mt-3 text-xs text-slate-500">
          El cliente consume el contrato documentado en <code>docs/04</code>; no define
          endpoints ni reglas propias. La autorización efectiva está en RLS y en las Edge
          Functions.
        </p>
      </div>

      <div className="mt-6 rounded-lg border border-dashed border-line p-5" role="note">
        <p className="text-sm font-medium text-hidria-900">Pantalla en construcción</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Esta ruta es parte del shell entregado en F1-02: navegación, sesión, layout y tema
          ya funcionan. La pantalla funcional de {module.short} se implementa en la tarea del
          módulo ({module.phase}).
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-4 text-sm font-semibold">
        <Link className="text-hidria-700 underline" to="/">
          Volver al panel
        </Link>
        <Link className="text-hidria-700 underline" to="/sincronizacion">
          Estado de sincronización
        </Link>
      </div>
    </div>
  );
}
