import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useOnline } from '../../lib/online';
import { createLogbookEntry } from '../../features/logbook/api';
import { useBitacoraList } from '../../features/logbook/hooks';
import {
  ESTADO_LABEL,
  LOGBOOK_KEYS,
  MODALIDADES,
  MODALIDAD_LABEL,
  canWrite,
  formatDate,
  formatTime,
  gateCoverage,
  missingKeys,
  sanitizeText,
  todayIso,
  type EntryCreateInput,
  type LogbookDiagnostic,
  type LogbookKey,
  type LogbookTemplate,
  type Modalidad,
} from '../../features/logbook/types';

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
      data-logbook-state={kind}
    >
      <p className="text-sm font-semibold">{title}</p>
      {detail && <p className="mt-1 text-xs leading-relaxed">{detail}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: 'abierta' | 'en_revision' | 'cerrada' }) {
  const tone =
    estado === 'cerrada'
      ? 'bg-emerald-100 text-semaforo-ok'
      : estado === 'en_revision'
        ? 'bg-sky-100 text-sky-800'
        : 'bg-slate-100 text-slate-700';
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {ESTADO_LABEL[estado]}
    </span>
  );
}

const inputClass = 'mt-1 w-full rounded-md border border-line px-3 py-2 text-sm';

export function BitacoraListPage() {
  const { claims } = useAuth();
  const online = useOnline();
  const [reloadKey, setReloadKey] = useState(0);
  const { status, data, error } = useBitacoraList(claims?.sub, reloadKey);
  const [createFor, setCreateFor] = useState<{ diagnostic: LogbookDiagnostic; clave: LogbookKey } | null>(null);
  const [createForm, setCreateForm] = useState<EntryCreateInput>({
    clave: 'V1',
    fecha: todayIso(),
    horario_inicio: '09:00',
    responsable_sesion: '',
    modalidad: 'presencial',
    lugar: null,
  });
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const templateByKey = useMemo(() => {
    const map = new Map<string, LogbookTemplate>();
    for (const template of data?.templates ?? []) map.set(template.clave, template);
    return map;
  }, [data?.templates]);

  const openCreate = (diagnostic: LogbookDiagnostic, clave: LogbookKey) => {
    setCreateFor({ diagnostic, clave });
    setCreateError(null);
    setNotice(null);
    setCreateForm({
      clave,
      fecha: todayIso(),
      horario_inicio: '09:00',
      responsable_sesion: '',
      modalidad: 'presencial',
      lugar: null,
    });
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!createFor) return;
    setCreateError(null);
    if (!createForm.responsable_sesion.trim()) {
      setCreateError('El responsable de la sesión es obligatorio.');
      return;
    }
    if (!createForm.fecha || !createForm.horario_inicio) {
      setCreateError('Indica fecha y hora de inicio.');
      return;
    }
    setCreateBusy(true);
    try {
      await createLogbookEntry(createFor.diagnostic.id, createForm);
      setNotice(`Ficha ${createFor.clave} creada.`);
      setCreateFor(null);
      setReloadKey((value) => value + 1);
    } catch (failure: unknown) {
      setCreateError(
        failure instanceof Error ? failure.message : 'No fue posible crear la ficha.',
      );
    } finally {
      setCreateBusy(false);
    }
  };

  if (!online) {
    return (
      <Notice
        kind="offline"
        title="Sin conexión"
        detail="La bitácora requiere conexión para cargar fichas y editar agenda/evidencia. No se promete captura offline en F1 (Dexie/F2)."
      />
    );
  }
  if (status === 'loading') {
    return (
      <p className="text-sm text-slate-600" role="status">
        Cargando bitácora…
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
        title="No tienes permiso para ver la bitácora"
        detail="La política de seguridad por diagnóstico (RLS) ha denegado la consulta."
      />
    );
  }
  if (status === 'error') {
    return (
      <Notice
        kind="error"
        title="No fue posible cargar la bitácora"
        detail={import.meta.env.DEV ? error?.message : 'Intenta de nuevo más tarde.'}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl" data-testid="bitacora-list-page">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
          M10 · Bitácora
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">Bitácora</h1>
        <p className="mt-1 text-sm text-slate-600">
          Ocho fichas (V1–V3, R1–R5) con agenda, firmas y evidencia. El cierre se valida en EF-02;
          la bitácora cerrada es prerrequisito del reporte.
        </p>
      </header>

      {notice && (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-semaforo-ok" role="status" data-testid="bitacora-notice">
          {sanitizeText(notice)}
        </p>
      )}

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
        <div className="mt-5 space-y-5">
          {(data?.diagnostics ?? []).map((diagnostic) => {
            const coverage = gateCoverage(diagnostic.entries);
            const missing = missingKeys(diagnostic.entries);
            const writable = canWrite(diagnostic.diagnosticRole);
            return (
              <section
                key={diagnostic.id}
                className="rounded-lg border border-line bg-panel p-4"
                data-testid="bitacora-diagnostic"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {diagnostic.company_name ?? 'Empresa sin nombre'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Diagnóstico {diagnostic.folio ?? diagnostic.id.slice(0, 8)} · Fase {diagnostic.fase_actual} · Rol:{' '}
                      {diagnostic.diagnosticRole ?? 'sin membresía'}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      <span
                        className={`rounded px-2 py-0.5 font-medium ${
                          diagnostic.bitacora_cerrada
                            ? 'bg-emerald-100 text-semaforo-ok'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                        data-testid={`bitacora-gate-${diagnostic.id}`}
                      >
                        {diagnostic.bitacora_cerrada ? 'Bitácora cerrada 8/8' : `Cerradas ${coverage.covered}/8`}
                      </span>
                      <span className="text-slate-500">
                        Prerrequisito de reporte: {diagnostic.p7_bitacoras ? 'cumplido' : 'pendiente'}
                      </span>
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {diagnostic.entries.length} ficha(s) · {missing.length} clave(s) por crear
                  </p>
                </div>

                <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Fichas de bitácora">
                  {LOGBOOK_KEYS.map((key) => {
                    const keyEntries = diagnostic.entries.filter((entry) => entry.clave === key);
                    const template = templateByKey.get(key);
                    if (keyEntries.length === 0) {
                      return (
                        <li key={key} className="rounded border border-dashed border-line p-3 text-xs" data-testid={`bitacora-missing-${key}`}>
                          <p className="font-semibold text-slate-700">
                            {key} · {template?.titulo ?? 'Ficha'}
                          </p>
                          <p className="mt-1 text-slate-500">Sin ficha</p>
                          {writable ? (
                            <button
                              type="button"
                              onClick={() => openCreate(diagnostic, key)}
                              className="mt-2 rounded border border-line px-2 py-1 font-medium text-hidria-700"
                              data-testid={`bitacora-create-${key}`}
                            >
                              Crear ficha
                            </button>
                          ) : null}
                        </li>
                      );
                    }
                    return (
                      <li key={key} className="rounded border border-line p-3 text-xs" data-testid={`bitacora-key-${key}`}>
                        <p className="font-semibold text-slate-700">
                          {key} · {template?.titulo ?? 'Ficha'}
                        </p>
                        <ul className="mt-1 space-y-1">
                          {keyEntries.map((entry) => (
                            <li key={entry.id} className="flex flex-wrap items-center gap-1">
                              <EstadoBadge estado={entry.estado} />
                              <Link
                                to={`/bitacora/${entry.id}`}
                                className="font-mono text-[11px] text-hidria-700 underline"
                              >
                                {entry.folio}
                              </Link>
                              <span className="text-[10px] text-slate-500">
                                {formatDate(entry.fecha)} {formatTime(entry.horario_inicio)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {createFor && (
        <div className="mt-6 rounded-lg border border-line bg-panel p-5" data-testid="bitacora-create-form">
          <h2 className="text-sm font-semibold text-hidria-900">
            Crear ficha {createFor.clave} · {createFor.diagnostic.company_name ?? 'diagnóstico'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            El folio, la organización y el estado inicial los fija el servidor. La agenda/evidencia
            iniciales se siembran desde la plantilla.
          </p>
          <form className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => void submitCreate(event)}>
            <div>
              <label htmlFor="bitacora-fecha" className="block text-xs font-medium text-slate-700">Fecha</label>
              <input
                id="bitacora-fecha"
                type="date"
                value={createForm.fecha}
                onChange={(event) => setCreateForm({ ...createForm, fecha: event.target.value })}
                className={inputClass}
                data-testid="bitacora-create-fecha"
              />
            </div>
            <div>
              <label htmlFor="bitacora-hora" className="block text-xs font-medium text-slate-700">Hora de inicio (CDMX)</label>
              <input
                id="bitacora-hora"
                type="time"
                value={createForm.horario_inicio}
                onChange={(event) => setCreateForm({ ...createForm, horario_inicio: event.target.value })}
                className={inputClass}
                data-testid="bitacora-create-hora"
              />
            </div>
            <div>
              <label htmlFor="bitacora-responsable" className="block text-xs font-medium text-slate-700">Responsable de sesión</label>
              <input
                id="bitacora-responsable"
                value={createForm.responsable_sesion}
                onChange={(event) => setCreateForm({ ...createForm, responsable_sesion: event.target.value })}
                className={inputClass}
                data-testid="bitacora-create-responsable"
              />
            </div>
            <div>
              <label htmlFor="bitacora-modalidad" className="block text-xs font-medium text-slate-700">Modalidad</label>
              <select
                id="bitacora-modalidad"
                value={createForm.modalidad}
                onChange={(event) => setCreateForm({ ...createForm, modalidad: event.target.value as Modalidad })}
                className={inputClass}
              >
                {MODALIDADES.map((modalidad) => (
                  <option key={modalidad} value={modalidad}>{MODALIDAD_LABEL[modalidad]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="bitacora-lugar" className="block text-xs font-medium text-slate-700">Lugar</label>
              <input
                id="bitacora-lugar"
                value={createForm.lugar ?? ''}
                onChange={(event) => setCreateForm({ ...createForm, lugar: event.target.value || null })}
                className={inputClass}
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={createBusy}
                className="rounded-md bg-hidria-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                data-testid="bitacora-create-submit"
              >
                {createBusy ? 'Creando…' : 'Crear ficha'}
              </button>
              <button
                type="button"
                onClick={() => setCreateFor(null)}
                className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancelar
              </button>
            </div>
          </form>
          {createError && (
            <p role="alert" className="mt-3 text-xs text-semaforo-crit" data-testid="bitacora-create-error">
              {sanitizeText(createError)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
