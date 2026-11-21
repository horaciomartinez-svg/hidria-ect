import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useOnline } from '../../lib/online';
import {
  LogbookApiError,
  addAgreement,
  addFinding,
  addParticipant,
  attachEvidenceDocument,
  closeLogbookEntry,
  deleteAgreement,
  deleteFinding,
  removeParticipant,
  signLogbookParticipant,
  submitLogbookReview,
  updateAgendaRow,
  updateLogbookEntry,
  uploadEvidenceDocument,
} from '../../features/logbook/api';
import { useBitacoraEntry } from '../../features/logbook/hooks';
import {
  AGENDA_ESTADOS,
  AGENDA_ESTADO_LABEL,
  ESTADO_LABEL,
  MODALIDADES,
  MODALIDAD_LABEL,
  canSign,
  canWrite,
  formatDate,
  formatDateTime,
  formatTime,
  sanitizeText,
  type AgendaEstado,
  type EntryHeaderInput,
  type LogbookAgendaRow,
  type LogbookEvidence,
  type Modalidad,
} from '../../features/logbook/types';

const inputClass = 'w-full rounded-md border border-line px-3 py-2 text-sm disabled:bg-slate-50';

function Notice({
  kind,
  title,
  detail,
}: {
  kind: 'offline' | 'forbidden' | 'error' | 'config' | 'empty';
  title: string;
  detail?: string;
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
      data-logbook-state={kind}
    >
      <p className="text-sm font-semibold">{title}</p>
      {detail && <p className="mt-1 text-xs leading-relaxed">{detail}</p>}
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
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${tone}`} data-testid="bitacora-estado">
      {ESTADO_LABEL[estado]}
    </span>
  );
}

export function BitacoraEntryPage() {
  const { entryId } = useParams();
  const { claims } = useAuth();
  const online = useOnline();
  const [reloadKey, setReloadKey] = useState(0);
  const { status, data, error } = useBitacoraEntry(entryId, claims?.sub, reloadKey);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<LogbookApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [closeReason, setCloseReason] = useState('');
  const [headerEditing, setHeaderEditing] = useState(false);
  const [headerForm, setHeaderForm] = useState<EntryHeaderInput | null>(null);
  const [participantForm, setParticipantForm] = useState({
    nombre: '',
    cargo: '',
    institucion: '',
    contacto: '',
  });
  const [findingForm, setFindingForm] = useState({ tema: '', texto: '' });
  const [agreementForm, setAgreementForm] = useState({
    compromiso: '',
    responsable: '',
    fecha: '',
    seguimiento: '',
  });
  const [agendaDraft, setAgendaDraft] = useState<Record<number, LogbookAgendaRow>>({});
  const [agendaSaving, setAgendaSaving] = useState<number | null>(null);

  const entry = data?.entry ?? null;
  const diagnostic = data?.diagnostic ?? null;
  const template = data?.template ?? null;
  const role = diagnostic?.diagnosticRole ?? null;
  const writable = canWrite(role);
  const closed = entry?.estado === 'cerrada';
  const readOnly = !writable || closed;
  const canSubmit = writable && entry?.estado === 'abierta';
  const canClose = writable && entry?.estado === 'en_revision';

  useEffect(() => {
    if (!entry) return;
    setHeaderForm({
      fecha: entry.fecha,
      horario_inicio: formatTime(entry.horario_inicio),
      horario_fin: entry.horario_fin ? formatTime(entry.horario_fin) : null,
      responsable_sesion: entry.responsable_sesion,
      modalidad: entry.modalidad,
      lugar: entry.lugar,
    });
  }, [entry]);

  useEffect(() => {
    if (!data) return;
    const next: Record<number, LogbookAgendaRow> = {};
    for (const row of data.agenda) next[row.no] = { ...row };
    setAgendaDraft(next);
  }, [data]);

  const requiredFirmaCount = useMemo(() => {
    const raw = template?.asistentes_requeridos ?? '';
    return raw
      .split('·')
      .map((part) => part.trim())
      .filter((part) => part.length > 0).length;
  }, [template?.asistentes_requeridos]);

  const evidenceRows = data?.evidence ?? [];
  const missingEvidence = evidenceRows.filter((row) => row.obligatorio && !row.document_id).length;

  const reload = () => setReloadKey((value) => value + 1);

  const runAction = async (label: string, action: () => Promise<unknown>, success: string) => {
    setBusy(label);
    setActionError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      reload();
    } catch (failure: unknown) {
      setActionError(
        failure instanceof LogbookApiError
          ? failure
          : new LogbookApiError('unknown', 'No fue posible completar la acción.'),
      );
    } finally {
      setBusy(null);
    }
  };

  const saveHeader = async () => {
    if (!entry || !headerForm) return;
    await runAction(
      'header',
      () => updateLogbookEntry(entry.id, headerForm),
      'Datos de la ficha actualizados.',
    );
    setHeaderEditing(false);
  };

  const saveAgenda = async (no: number) => {
    if (!entry) return;
    const row = agendaDraft[no];
    if (!row) return;
    setAgendaSaving(no);
    setActionError(null);
    try {
      await updateAgendaRow(entry.id, no, {
        responsable: row.responsable,
        resultado: row.resultado,
        estado: row.estado,
      });
      setNotice('Agenda actualizada.');
      reload();
    } catch (failure: unknown) {
      setActionError(
        failure instanceof LogbookApiError
          ? failure
          : new LogbookApiError('unknown', 'No fue posible guardar la agenda.'),
      );
    } finally {
      setAgendaSaving(null);
    }
  };

  const handleEvidenceUpload = async (evidence: LogbookEvidence, file: File | undefined) => {
    if (!file || !diagnostic) return;
    setBusy(`evidence-${evidence.id}`);
    setActionError(null);
    try {
      const documentId = await uploadEvidenceDocument(diagnostic.id, file);
      await attachEvidenceDocument(evidence.id, documentId);
      setNotice(`Evidencia "${evidence.item}" adjuntada.`);
      reload();
    } catch (failure: unknown) {
      setActionError(
        failure instanceof LogbookApiError
          ? failure
          : new LogbookApiError('unknown', 'No fue posible adjuntar la evidencia.'),
      );
    } finally {
      setBusy(null);
    }
  };

  if (!online) {
    return (
      <Notice
        kind="offline"
        title="Sin conexión"
        detail="La bitácora requiere conexión para editar y cerrar. No se promete captura offline en F1 (Dexie/F2)."
      />
    );
  }
  if (status === 'loading') {
    return (
      <p className="text-sm text-slate-600" role="status">
        Cargando ficha…
      </p>
    );
  }
  if (status === 'config' || status === 'forbidden' || status === 'error' || status === 'empty' || !entry || !diagnostic) {
    return (
      <div className="rounded-lg border border-line bg-panel p-5" role="alert">
        <p className="text-sm font-semibold text-slate-900">
          {status === 'forbidden'
            ? 'No tienes permiso para ver esta ficha'
            : status === 'config'
              ? 'Configuración incompleta'
              : status === 'error'
                ? 'No fue posible cargar la ficha'
                : 'Esta ficha no existe para ti'}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {import.meta.env.DEV
            ? error?.message
            : 'La política de seguridad por diagnóstico (RLS) o la configuración del despliegue impiden la consulta.'}
        </p>
        <Link className="mt-3 inline-block text-xs font-semibold text-hidria-700 underline" to="/bitacora">
          Volver a la bitácora
        </Link>
      </div>
    );
  }

  const coverage = data ? data.entry.estado === 'cerrada' : false;
  const closeHelp =
    'El servidor valida el plazo de 24 h y exige una razón de al menos 20 caracteres si el cierre es tardío.';

  return (
    <div className="mx-auto max-w-5xl" data-testid="bitacora-entry-page">
      <Link to="/bitacora" className="text-xs font-semibold text-hidria-700 underline">
        ← Volver a la bitácora
      </Link>
      <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
            M10 · Bitácora · {entry.clave}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">
            {template?.titulo ?? `Ficha ${entry.clave}`}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {diagnostic.company_name ?? 'Diagnóstico'} · {entry.folio} · Fecha {formatDate(entry.fecha)} ·{' '}
            {formatTime(entry.horario_inicio)} (CDMX)
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <EstadoBadge estado={entry.estado} />
            <span>{MODALIDAD_LABEL[entry.modalidad]}</span>
            <span>{entry.lugar ?? 'Lugar no indicado'}</span>
            <span>Responsable: {sanitizeText(entry.responsable_sesion)}</span>
            {entry.cierre_tardio && <span className="rounded bg-amber-100 px-2 py-0.5">Cierre tardío</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSubmit && (
            <button
              type="button"
              onClick={() =>
                void runAction('submit', () => submitLogbookReview(entry.id), 'Ficha enviada a revisión.')
              }
              disabled={busy !== null}
              className="rounded-md bg-hidria-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              data-testid="bitacora-submit"
            >
              {busy === 'submit' ? 'Enviando…' : 'Enviar a revisión'}
            </button>
          )}
          {writable && !closed && entry.estado !== 'cerrada' && (
            <button
              type="button"
              onClick={() => setHeaderEditing((value) => !value)}
              className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-slate-700"
              data-testid="bitacora-edit-header"
            >
              Editar datos
            </button>
          )}
        </div>
      </header>

      <section className="mt-4 rounded-lg border border-line bg-panel p-4" aria-labelledby="bitacora-gate-title" data-testid="bitacora-gate">
        <h2 id="bitacora-gate-title" className="text-sm font-semibold text-hidria-900">
          Prerrequisito de reporte · bitácora 8/8
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          {diagnostic.bitacora_cerrada && data?.p7Bitacoras
            ? 'Bitácora cerrada: las 8 claves están cubiertas y todas las fichas están cerradas.'
            : coverage
              ? 'Esta ficha está cerrada; faltan otras fichas o hay alguna abierta para cumplir 8/8.'
              : 'La bitácora aún no está completa. El gate final lo decide el servidor (p7_bitacoras/bitacora_cerrada).'}
        </p>
        {entry.cerrada_razon && (
          <p className="mt-2 text-[11px] text-slate-500">
            Razón de cierre: {sanitizeText(entry.cerrada_razon)}
          </p>
        )}
      </section>

      {actionError && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-semaforo-crit" role="alert" data-testid="bitacora-action-error">
          <p>{sanitizeText(actionError.message)}</p>
          {actionError.code && <p className="mt-1 text-[11px] text-slate-500">Código: {actionError.code}</p>}
          {actionError.code === 'VALIDATION_RAZON' && (
            <p className="mt-1 text-[11px]">Indica una razón de al menos 20 caracteres para el cierre tardío.</p>
          )}
          {actionError.code === 'VALIDATION_FIRMAS' && (
            <p className="mt-1 text-[11px]">Faltan firmas de asistentes requeridos ({requiredFirmaCount} esperadas).</p>
          )}
          {actionError.code === 'VALIDATION_AGENDA' && (
            <p className="mt-1 text-[11px]">Completa el resultado de los ítems modificados/no realizados.</p>
          )}
          {actionError.code === 'VALIDATION_EVIDENCIA' && (
            <p className="mt-1 text-[11px]">Adjunta el documento de la evidencia obligatoria.</p>
          )}
        </div>
      )}
      {notice && (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-semaforo-ok" role="status" data-testid="bitacora-entry-notice">
          {sanitizeText(notice)}
        </p>
      )}

      {headerEditing && headerForm && writable && !closed && (
        <section className="mt-4 rounded-lg border border-line bg-panel p-4" data-testid="bitacora-header-form">
          <h2 className="text-sm font-semibold text-hidria-900">Datos de la ficha</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="logbook-fecha" className="block text-xs font-medium text-slate-700">Fecha</label>
              <input id="logbook-fecha" type="date" value={headerForm.fecha} onChange={(event) => setHeaderForm({ ...headerForm, fecha: event.target.value })} className={`${inputClass} mt-1`} />
            </div>
            <div>
              <label htmlFor="logbook-hora" className="block text-xs font-medium text-slate-700">Hora inicio (CDMX)</label>
              <input id="logbook-hora" type="time" value={headerForm.horario_inicio} onChange={(event) => setHeaderForm({ ...headerForm, horario_inicio: event.target.value })} className={`${inputClass} mt-1`} />
            </div>
            <div>
              <label htmlFor="logbook-responsable" className="block text-xs font-medium text-slate-700">Responsable</label>
              <input id="logbook-responsable" value={headerForm.responsable_sesion} onChange={(event) => setHeaderForm({ ...headerForm, responsable_sesion: event.target.value })} className={`${inputClass} mt-1`} />
            </div>
            <div>
              <label htmlFor="logbook-modalidad" className="block text-xs font-medium text-slate-700">Modalidad</label>
              <select id="logbook-modalidad" value={headerForm.modalidad} onChange={(event) => setHeaderForm({ ...headerForm, modalidad: event.target.value as Modalidad })} className={`${inputClass} mt-1`}>
                {MODALIDADES.map((modalidad) => (
                  <option key={modalidad} value={modalidad}>{MODALIDAD_LABEL[modalidad]}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="logbook-lugar" className="block text-xs font-medium text-slate-700">Lugar</label>
              <input id="logbook-lugar" value={headerForm.lugar ?? ''} onChange={(event) => setHeaderForm({ ...headerForm, lugar: event.target.value || null })} className={`${inputClass} mt-1`} />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void saveHeader()} disabled={busy !== null} className="rounded-md bg-hidria-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" data-testid="bitacora-save-header">
              {busy === 'header' ? 'Guardando…' : 'Guardar datos'}
            </button>
            <button type="button" onClick={() => setHeaderEditing(false)} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-slate-700">Cancelar</button>
          </div>
        </section>
      )}

      <section className="mt-4 rounded-lg border border-line bg-panel p-4" aria-labelledby="logbook-participants-title" data-testid="bitacora-participants">
        <h2 id="logbook-participants-title" className="text-sm font-semibold text-hidria-900">
          Participantes y firmas
        </h2>
        <p className="mt-1 text-[11px] text-slate-500">
          Asistentes requeridos: {sanitizeText(template?.asistentes_requeridos ?? '—')} ({requiredFirmaCount} segmento(s)).
          La firma la registra coordinación/equipo en representación del acta; `firma_ts` es server-side.
        </p>
        <ul className="mt-2 space-y-1 text-xs">
          {data?.participants.length === 0 && <li className="text-slate-500">Sin participantes registrados.</li>}
          {data?.participants.map((participant) => (
            <li key={participant.nombre} className="flex flex-wrap items-center gap-2 border-t border-line py-1">
              <span className="font-medium text-slate-800">{sanitizeText(participant.nombre)}</span>
              <span className="text-slate-500">{sanitizeText(participant.cargo)} · {sanitizeText(participant.institucion)}</span>
              {participant.firma_ts ? (
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] text-semaforo-ok">Firmado {formatDateTime(participant.firma_ts)}</span>
              ) : (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">Sin firma</span>
              )}
              {canSign(entry) && writable && !participant.firma_ts && (
                <button
                  type="button"
                  onClick={() => void runAction(`sign-${participant.nombre}`, () => signLogbookParticipant(entry.id, participant.nombre), `Firma registrada para ${participant.nombre}.`)}
                  disabled={busy !== null}
                  className="rounded border border-line px-2 py-0.5 text-[11px] font-medium text-hidria-700 disabled:opacity-50"
                  data-testid={`bitacora-sign-${sanitizeText(participant.nombre)}`}
                >
                  Firmar
                </button>
              )}
              {writable && !closed && (
                <button
                  type="button"
                  onClick={() => void runAction(`remove-${participant.nombre}`, () => removeParticipant(entry.id, participant.nombre), 'Participante eliminado.')}
                  className="text-[11px] text-slate-500 underline"
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
        {writable && !closed && (
          <form
            className="mt-3 grid gap-2 sm:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              void runAction('add-participant', () => addParticipant(entry.id, {
                nombre: participantForm.nombre,
                cargo: participantForm.cargo,
                institucion: participantForm.institucion,
                contacto: participantForm.contacto || null,
              }), 'Participante agregado.').then(() => setParticipantForm({ nombre: '', cargo: '', institucion: '', contacto: '' }));
            }}
          >
            <input aria-label="Nombre del participante" placeholder="Nombre" value={participantForm.nombre} onChange={(event) => setParticipantForm({ ...participantForm, nombre: event.target.value })} className={inputClass} data-testid="bitacora-participant-nombre" />
            <input aria-label="Cargo" placeholder="Cargo" value={participantForm.cargo} onChange={(event) => setParticipantForm({ ...participantForm, cargo: event.target.value })} className={inputClass} />
            <input aria-label="Institución" placeholder="Institución" value={participantForm.institucion} onChange={(event) => setParticipantForm({ ...participantForm, institucion: event.target.value })} className={inputClass} />
            <button type="submit" disabled={busy !== null} className="rounded-md bg-hidria-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Agregar participante</button>
          </form>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-line bg-panel p-4" aria-labelledby="logbook-agenda-title" data-testid="bitacora-agenda">
        <h2 id="logbook-agenda-title" className="text-sm font-semibold text-hidria-900">Agenda</h2>
        <p className="mt-1 text-[11px] text-slate-500">
          Completa los resultados. `no_realizado`/`modificado` exigen resultado; el cierre valida la agenda completa.
        </p>
        <div className="mt-2 space-y-2">
          {(data?.agenda ?? []).map((row) => {
            const draft = agendaDraft[row.no] ?? row;
            return (
              <div key={row.no} className="grid gap-2 border-t border-line pt-2 sm:grid-cols-[2rem_1fr_10rem_10rem_auto]" data-testid={`bitacora-agenda-${row.no}`}>
                <span className="pt-2 text-xs font-mono text-slate-500">{row.no}</span>
                <p className="pt-1 text-xs text-slate-700">{sanitizeText(row.actividad)}</p>
                <input aria-label={`Responsable agenda ${row.no}`} placeholder="Responsable" value={draft.responsable ?? ''} disabled={readOnly} onChange={(event) => setAgendaDraft({ ...agendaDraft, [row.no]: { ...draft, responsable: event.target.value } })} className={inputClass} />
                <input aria-label={`Resultado agenda ${row.no}`} placeholder="Resultado" value={draft.resultado ?? ''} disabled={readOnly} onChange={(event) => setAgendaDraft({ ...agendaDraft, [row.no]: { ...draft, resultado: event.target.value } })} className={inputClass} data-testid={`bitacora-resultado-${row.no}`} />
                <div className="flex gap-1">
                  <select aria-label={`Estado agenda ${row.no}`} value={draft.estado} disabled={readOnly} onChange={(event) => setAgendaDraft({ ...agendaDraft, [row.no]: { ...draft, estado: event.target.value as AgendaEstado } })} className={inputClass} data-testid={`bitacora-agenda-estado-${row.no}`}>
                    {AGENDA_ESTADOS.map((estado) => <option key={estado} value={estado}>{AGENDA_ESTADO_LABEL[estado]}</option>)}
                  </select>
                  {!readOnly && (
                    <button type="button" onClick={() => void saveAgenda(row.no)} disabled={agendaSaving === row.no} className="rounded border border-line px-2 text-[11px] font-medium text-slate-700 disabled:opacity-50" data-testid={`bitacora-save-agenda-${row.no}`}>
                      {agendaSaving === row.no ? '…' : 'Guardar'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {(data?.agenda.length ?? 0) === 0 && <p className="text-xs text-slate-500">La ficha no tiene agenda (¿falta el seed de plantilla?).</p>}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-panel p-4" aria-labelledby="logbook-evidence-title" data-testid="bitacora-evidence">
        <h2 id="logbook-evidence-title" className="text-sm font-semibold text-hidria-900">Evidencia</h2>
        <p className="mt-1 text-[11px] text-slate-500">
          Evidencia obligatoria: {evidenceRows.filter((row) => row.obligatorio).length} · faltantes {missingEvidence}. El documento se sube por EF-08 y se liga a la fila.
        </p>
        <ul className="mt-2 space-y-2 text-xs">
          {evidenceRows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 border-t border-line py-1" data-testid={`bitacora-evidence-${row.id}`}>
              <span className="font-medium text-slate-800">{sanitizeText(row.item)}</span>
              {row.obligatorio && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px]">Obligatoria</span>}
              {row.document_id ? (
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] text-semaforo-ok">Documento ligado</span>
              ) : (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">Sin documento</span>
              )}
              {!readOnly && (
                <>
                  <label htmlFor={`logbook-evidence-file-${row.id}`} className="cursor-pointer rounded border border-line px-2 py-0.5 text-[11px] font-medium text-slate-700">
                    {busy === `evidence-${row.id}` ? 'Subiendo…' : row.document_id ? 'Reemplazar' : 'Adjuntar'}
                  </label>
                  <input
                    id={`logbook-evidence-file-${row.id}`}
                    type="file"
                    className="sr-only"
                    accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx"
                    onChange={(event) => void handleEvidenceUpload(row, event.target.files?.[0])}
                    data-testid={`bitacora-evidence-file-${row.id}`}
                  />
                </>
              )}
            </li>
          ))}
          {evidenceRows.length === 0 && <li className="text-xs text-slate-500">La ficha no tiene filas de evidencia (¿falta el seed de plantilla?).</li>}
        </ul>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-panel p-4" data-testid="bitacora-findings">
          <h2 className="text-sm font-semibold text-hidria-900">Hallazgos</h2>
          <ul className="mt-2 space-y-1 text-xs">
            {data?.findings.map((finding) => (
              <li key={finding.id} className="border-t border-line py-1">
                {finding.tema && <span className="font-medium">{sanitizeText(finding.tema)}: </span>}
                {sanitizeText(finding.texto)}
                {!readOnly && (
                  <button type="button" onClick={() => void runAction(`finding-${finding.id}`, () => deleteFinding(finding.id), 'Hallazgo eliminado.')} className="ml-2 text-[10px] text-slate-500 underline">Quitar</button>
                )}
              </li>
            ))}
            {data?.findings.length === 0 && <li className="text-slate-500">Sin hallazgos.</li>}
          </ul>
          {!readOnly && (
            <form className="mt-2 space-y-1" onSubmit={(event) => { event.preventDefault(); void runAction('add-finding', () => addFinding(entry.id, findingForm), 'Hallazgo agregado.').then(() => setFindingForm({ tema: '', texto: '' })); }}>
              <input aria-label="Tema del hallazgo" placeholder="Tema" value={findingForm.tema} onChange={(event) => setFindingForm({ ...findingForm, tema: event.target.value })} className={inputClass} />
              <textarea aria-label="Texto del hallazgo" rows={2} placeholder="Hallazgo" value={findingForm.texto} onChange={(event) => setFindingForm({ ...findingForm, texto: event.target.value })} className={inputClass} />
              <button type="submit" className="rounded border border-line px-2 py-1 text-[11px] font-medium text-slate-700">Agregar hallazgo</button>
            </form>
          )}
        </div>
        <div className="rounded-lg border border-line bg-panel p-4" data-testid="bitacora-agreements">
          <h2 className="text-sm font-semibold text-hidria-900">Acuerdos</h2>
          <ul className="mt-2 space-y-1 text-xs">
            {data?.agreements.map((agreement) => (
              <li key={agreement.id} className="border-t border-line py-1">
                {sanitizeText(agreement.compromiso)} · {sanitizeText(agreement.responsable)} · {formatDate(agreement.fecha)}
                {!readOnly && (
                  <button type="button" onClick={() => void runAction(`agreement-${agreement.id}`, () => deleteAgreement(agreement.id), 'Acuerdo eliminado.')} className="ml-2 text-[10px] text-slate-500 underline">Quitar</button>
                )}
              </li>
            ))}
            {data?.agreements.length === 0 && <li className="text-slate-500">Sin acuerdos.</li>}
          </ul>
          {!readOnly && (
            <form className="mt-2 space-y-1" onSubmit={(event) => { event.preventDefault(); void runAction('add-agreement', () => addAgreement(entry.id, { ...agreementForm, seguimiento: agreementForm.seguimiento || null, cerrado: false }), 'Acuerdo agregado.').then(() => setAgreementForm({ compromiso: '', responsable: '', fecha: '', seguimiento: '' })); }}>
              <input aria-label="Compromiso" placeholder="Compromiso" value={agreementForm.compromiso} onChange={(event) => setAgreementForm({ ...agreementForm, compromiso: event.target.value })} className={inputClass} />
              <div className="grid gap-1 sm:grid-cols-2">
                <input aria-label="Responsable del acuerdo" placeholder="Responsable" value={agreementForm.responsable} onChange={(event) => setAgreementForm({ ...agreementForm, responsable: event.target.value })} className={inputClass} />
                <input aria-label="Fecha del acuerdo" type="date" value={agreementForm.fecha} onChange={(event) => setAgreementForm({ ...agreementForm, fecha: event.target.value })} className={inputClass} />
              </div>
              <button type="submit" className="rounded border border-line px-2 py-1 text-[11px] font-medium text-slate-700">Agregar acuerdo</button>
            </form>
          )}
        </div>
      </section>

      {canClose && (
        <section className="mt-4 rounded-lg border border-line bg-panel p-4" data-testid="bitacora-close">
          <h2 className="text-sm font-semibold text-hidria-900">Cerrar ficha</h2>
          <p className="mt-1 text-xs text-slate-600">{closeHelp}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Faltan firmas? {requiredFirmaCount - (data?.participants.filter((participant) => participant.firma_ts).length ?? 0)} ·
            evidencia obligatoria pendiente: {missingEvidence}
          </p>
          <label htmlFor="logbook-close-reason" className="mt-2 block text-xs font-medium text-slate-700">
            Razón de cierre (obligatoria si el cierre es tardío; ≥20 caracteres)
          </label>
          <textarea id="logbook-close-reason" rows={2} value={closeReason} onChange={(event) => setCloseReason(event.target.value)} className={`${inputClass} mt-1`} data-testid="bitacora-close-reason" />
          <button
            type="button"
            onClick={() => void runAction('close', () => closeLogbookEntry(entry.id, closeReason), 'Ficha cerrada.')}
            disabled={busy !== null}
            className="mt-3 rounded-md bg-hidria-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            data-testid="bitacora-close-submit"
          >
            {busy === 'close' ? 'Cerrando…' : 'Cerrar ficha'}
          </button>
        </section>
      )}

      {(data?.changeLog.length ?? 0) > 0 && (
        <section className="mt-4 rounded-lg border border-line bg-panel p-4" aria-labelledby="logbook-history-title">
          <h2 id="logbook-history-title" className="text-sm font-semibold text-hidria-900">Control de cambios</h2>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-600">
            {data?.changeLog.map((change) => (
              <li key={change.id}>v{change.version} · {sanitizeText(change.descripcion)} · {formatDateTime(change.ts)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
