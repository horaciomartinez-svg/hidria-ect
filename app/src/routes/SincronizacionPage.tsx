import { useOnline } from '../lib/online';

/**
 * Estado de sincronización offline (F1-02).
 *
 * Muestra el contrato que regirá la cola (`docs/04` §6) sin simular operaciones: la
 * cola Dexie y el motor LWW se habilitan en las tareas de captura offline (M4/M6/M10).
 * Regla dura visible: los gates EF-01…EF-07, EF-10 y EF-12 **nunca** se encolan.
 */
export function SincronizacionPage() {
  const online = useOnline();

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
        Transversal · Offline-first
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">
        Estado de sincronización
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        La captura en campo se guarda primero en el dispositivo y se sincroniza con
        <code> Idempotency-Key</code> por operación. Las validaciones de la metodología
        requieren conexión y no se encolan.
      </p>

      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-panel p-4">
          <dt className="text-xs uppercase tracking-wide text-slate-500">Conectividad</dt>
          <dd
            className={`mt-1 text-sm font-semibold ${online ? 'text-semaforo-ok' : 'text-semaforo-warn'}`}
            data-connection={online ? 'online' : 'offline'}
          >
            {online ? 'En línea' : 'Sin conexión'}
          </dd>
        </div>
        <div className="rounded-lg border border-line bg-panel p-4">
          <dt className="text-xs uppercase tracking-wide text-slate-500">Operaciones en cola</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-700">0</dd>
          <dd className="mt-1 text-[11px] text-slate-500">
            Cola Dexie <code>ops_queue</code> habilitada en M4/M6/M10.
          </dd>
        </div>
        <div className="rounded-lg border border-line bg-panel p-4">
          <dt className="text-xs uppercase tracking-wide text-slate-500">Conflictos por campo</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-700">0</dd>
          <dd className="mt-1 text-[11px] text-slate-500">
            LWW por campo; un conflicto se muestra, nunca se pisa en silencio.
          </dd>
        </div>
      </dl>

      <section className="mt-8 rounded-lg border border-line bg-panel p-5" aria-labelledby="gates-titulo">
        <h2 id="gates-titulo" className="text-sm font-semibold text-hidria-900">
          Operaciones que requieren conexión (no encolables)
        </h2>
        <ul className="mt-2 grid gap-1 font-mono text-[11px] text-slate-600 sm:grid-cols-2">
          <li>EF-01 diagnostics/advance-phase</li>
          <li>EF-02 logbook/close</li>
          <li>EF-03 checklist/transition</li>
          <li>EF-04 cat/submit · validate-r2</li>
          <li>EF-05 balances/validate-r3</li>
          <li>EF-06 ivoh/score · validate-r4</li>
          <li>EF-07 diagnostics/emit-report</li>
          <li>EF-10 samples/dictamen</li>
          <li>EF-12 diagnostics/reprogram-milestone</li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          Un gate validado sin conexión sería indistinguible de un gate forzado
          (<code>docs/04</code> §6.4; TEAM.md §5 y §15).
        </p>
      </section>
    </div>
  );
}
