import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useOnline } from '../../lib/online';
import {
  ChecklistApiError,
  transitionChecklistItem,
  uploadAndMarkReceived,
} from '../../features/checklist/api';
import { useChecklist } from '../../features/checklist/hooks';
import {
  ESTADO_LABEL,
  ITEM_LABEL,
  availableTransitions,
  isFileAllowed,
  type ChecklistEstado,
  type ChecklistItem,
  type TransitionOption,
} from '../../features/checklist/types';

function EstadoBadge({ estado }: { estado: ChecklistEstado }) {
  const tone =
    estado === 'validado_r1'
      ? 'bg-emerald-100 text-semaforo-ok'
      : estado === 'revisado'
        ? 'bg-hidria-50 text-hidria-700'
        : estado === 'recibido'
          ? 'bg-sky-100 text-sky-800'
          : 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {ESTADO_LABEL[estado]}
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
  action?: ReactNode;
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
      data-checklist-state={kind}
    >
      <p className="text-sm font-semibold">{title}</p>
      {detail && <p className="mt-1 text-xs leading-relaxed">{detail}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function describeError(error: unknown): string {
  if (error instanceof ChecklistApiError) {
    if (import.meta.env.DEV && error.code) {
      return `${error.message} (código ${error.code})`;
    }
    return error.message;
  }
  return 'No fue posible completar la operación. Intenta de nuevo.';
}

/**
 * M3 — Checklist documental (F1-06a).
 *
 * Estados TD-2 visibles por rol (`project_members.role`); **las transiciones se envían por
 * EF-03** y la carga por EF-08 (presign → PUT R2 → register). RLS/EF-03/TD-2 son la
 * autoridad: la UI sólo muestra acciones y nunca hace UPDATE directo del checklist.
 */
export function ChecklistPage() {
  const { claims } = useAuth();
  const online = useOnline();
  const [reloadKey, setReloadKey] = useState(0);
  const { status, data, error } = useChecklist(claims?.sub, reloadKey);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [itemError, setItemError] = useState<{ itemId: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<ChecklistItem | null>(null);
  const [noteText, setNoteText] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: ChecklistItem[] }>();
    for (const item of data) {
      const label = item.diagnostic?.company_name
        ? `${item.diagnostic.company_name} · ${item.diagnostic.folio ?? 'sin folio'}`
        : `Diagnóstico ${item.diagnostic_id.slice(0, 8)}…`;
      const entry = map.get(item.diagnostic_id) ?? { label, items: [] };
      entry.items.push(item);
      map.set(item.diagnostic_id, entry);
    }
    return Array.from(map.entries());
  }, [data]);

  const runTransition = async (
    item: ChecklistItem,
    option: TransitionOption,
    solicitudNota?: string,
  ) => {
    setBusyItem(item.id);
    setItemError(null);
    setNotice(null);
    try {
      await transitionChecklistItem(item.id, {
        to: option.to,
        documentId: item.document_id,
        solicitudNota: solicitudNota ?? null,
      });
      setNotice(`Ítem «${ITEM_LABEL[item.item_code]}» actualizado a «${ESTADO_LABEL[option.to]}».`);
      setNoteFor(null);
      setNoteText('');
      setReloadKey((key) => key + 1);
    } catch (transitionError: unknown) {
      setItemError({ itemId: item.id, message: describeError(transitionError) });
    } finally {
      setBusyItem(null);
    }
  };

  const handleFile = async (item: ChecklistItem, file: File | undefined) => {
    if (!file) return;
    const validation = isFileAllowed(file);
    if (validation) {
      setItemError({ itemId: item.id, message: validation });
      return;
    }
    setBusyItem(item.id);
    setItemError(null);
    setNotice(null);
    try {
      await uploadAndMarkReceived(item, file);
      setNotice(
        `Documento «${file.name}» cargado y ítem «${ITEM_LABEL[item.item_code]}» marcado como recibido.`,
      );
      setReloadKey((key) => key + 1);
    } catch (uploadError: unknown) {
      setItemError({ itemId: item.id, message: describeError(uploadError) });
    } finally {
      setBusyItem(null);
    }
  };

  const openNote = (item: ChecklistItem) => {
    setNoteFor(item);
    setNoteText('');
    window.requestAnimationFrame(() => noteRef.current?.focus());
  };

  const disabled = !online || busyItem !== null;

  return (
    <div className="mx-auto max-w-6xl" data-testid="checklist-page">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
          M3 · Checklist documental
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">
          Lista de cotejo documental
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Estados: no recibido → recibido → revisado → validado en R1. Las transiciones se
          registran por EF-03 y la autorización efectiva es TD-2/RLS; esta pantalla sólo muestra
          las acciones disponibles para tu rol.
        </p>
      </header>

      {!online && (
        <div className="mt-4">
          <Notice
            kind="offline"
            title="Sin conexión"
            detail="El checklist requiere conexión para cargar documentos y registrar transiciones. La cola offline de campo se habilitará con los módulos M4/M6/M10."
          />
        </div>
      )}

      {notice && (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-semaforo-ok"
          role="status"
          data-testid="checklist-notice"
        >
          {notice}
        </p>
      )}

      {online && status === 'loading' && (
        <p className="mt-4 text-sm text-slate-600" role="status">
          Cargando checklist…
        </p>
      )}

      {online && status === 'config' && (
        <div className="mt-4">
          <Notice
            kind="config"
            title="Configuración incompleta"
            detail="Este despliegue no tiene configurada la conexión a Supabase."
          />
        </div>
      )}

      {online && status === 'forbidden' && (
        <div className="mt-4">
          <Notice
            kind="forbidden"
            title="No tienes permiso para ver este checklist"
            detail="La política de seguridad por diagnóstico (RLS) ha denegado la consulta. Si necesitas acceso, solicítalo a la Coordinación SRHDS."
          />
        </div>
      )}

      {online && status === 'error' && (
        <div className="mt-4">
          <Notice
            kind="error"
            title="No fue posible cargar el checklist"
            detail={import.meta.env.DEV ? error?.message : 'Intenta de nuevo; si persiste, contacta a la Coordinación SRHDS.'}
            action={
              <button
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
                className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold"
              >
                Reintentar
              </button>
            }
          />
        </div>
      )}

      {online && status === 'empty' && (
        <div className="mt-4" data-testid="checklist-empty">
          <Notice
            kind="empty"
            title="Sin ítems de checklist visibles"
            detail="No hay ítems de lista de cotejo para tus diagnósticos, o aún no se ha generado el checklist del expediente."
            action={
              <Link className="text-xs font-semibold text-hidria-700 underline" to="/kanban">
                Ir al tablero de diagnósticos
              </Link>
            }
          />
        </div>
      )}

      {online && status === 'ready' && (
        <div className="mt-6 space-y-8">
          {groups.map(([diagnosticId, group]) => (
            <section key={diagnosticId} aria-labelledby={`checklist-${diagnosticId}`}>
              <h2
                id={`checklist-${diagnosticId}`}
                className="text-sm font-semibold text-hidria-900"
              >
                {group.label}
              </h2>
              <ul className="mt-2 space-y-3">
                {group.items.map((item) => {
                  const transitions = availableTransitions(item.diagnosticRole, item);
                  const noteOpen = noteFor?.id === item.id;
                  const canAttach =
                    item.diagnosticRole === 'empresa' && item.estado === 'no_recibido';
                  return (
                    <li
                      key={item.id}
                      className="rounded-lg border border-line bg-panel p-4"
                      data-testid={`checklist-item-${item.item_code}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {ITEM_LABEL[item.item_code]}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <EstadoBadge estado={item.estado} />
                            <span
                              data-testid={`checklist-state-${item.item_code}`}
                              className="sr-only"
                            >
                              {ESTADO_LABEL[item.estado]}
                            </span>
                            <span>
                              {item.document_id
                                ? `Documento adjunto (${item.document_id.slice(0, 8)}…)`
                                : 'Sin documento adjunto'}
                            </span>
                          </p>
                          {item.solicitud_nota && (
                            <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                              <span className="font-semibold">Solicitud del equipo: </span>
                              {item.solicitud_nota}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {canAttach && (
                            <>
                              <label
                                htmlFor={`checklist-file-${item.id}`}
                                className={`cursor-pointer rounded-md bg-hidria-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-hidria-800 ${
                                  disabled ? 'pointer-events-none opacity-50' : ''
                                }`}
                              >
                                {busyItem === item.id ? 'Cargando…' : 'Adjuntar documento'}
                              </label>
                              <input
                                id={`checklist-file-${item.id}`}
                                type="file"
                                className="sr-only"
                                disabled={disabled}
                                data-testid={`checklist-upload-${item.item_code}`}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.target.value = '';
                                  void handleFile(item, file);
                                }}
                              />
                            </>
                          )}
                          {transitions
                            .filter((option) => !(canAttach && option.to === 'recibido'))
                            .map((option) => {
                              const needsMissingDocument =
                                option.requiresDocument && !item.document_id;
                              return (
                                <button
                                  key={`${item.id}-${option.to}`}
                                  type="button"
                                  disabled={disabled || needsMissingDocument}
                                  title={
                                    needsMissingDocument
                                      ? 'Requiere un documento adjunto en el ítem'
                                      : undefined
                                  }
                                  onClick={() => {
                                    if (option.requiresNote) {
                                      openNote(item);
                                      return;
                                    }
                                    void runTransition(item, option);
                                  }}
                                  className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  data-testid={`checklist-transition-${option.to}-${item.item_code}`}
                                >
                                  {busyItem === item.id ? 'Guardando…' : option.label}
                                </button>
                              );
                            })}
                          {item.diagnosticRole === null && (
                            <span className="text-[11px] text-slate-500">
                              Sólo lectura: no eres miembro de este diagnóstico.
                            </span>
                          )}
                        </div>
                      </div>

                      {noteOpen && (
                        <div className="mt-3 rounded-md border border-line p-3">
                          <label
                            htmlFor={`checklist-note-${item.id}`}
                            className="block text-xs font-medium text-slate-700"
                          >
                            Nota de solicitud (obligatoria)
                          </label>
                          <textarea
                            id={`checklist-note-${item.id}`}
                            ref={noteRef}
                            rows={2}
                            value={noteText}
                            onChange={(event) => setNoteText(event.target.value)}
                            className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
                            data-testid={`checklist-note-${item.item_code}`}
                          />
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={disabled || noteText.trim().length === 0}
                              onClick={() => {
                                const option = transitions.find(
                                  (candidate) => candidate.requiresNote,
                                );
                                if (option) {
                                  void runTransition(item, option, noteText.trim());
                                }
                              }}
                              className="rounded-md bg-hidria-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              data-testid={`checklist-note-submit-${item.item_code}`}
                            >
                              Enviar solicitud
                            </button>
                            <button
                              type="button"
                              onClick={() => setNoteFor(null)}
                              className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-slate-700"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      {itemError?.itemId === item.id && (
                        <p
                          role="alert"
                          className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-semaforo-crit"
                          data-testid={`checklist-item-error-${item.item_code}`}
                        >
                          {itemError.message}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
