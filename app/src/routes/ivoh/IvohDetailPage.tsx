import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useOnline } from '../../lib/online';
import {
  IvohApiError,
  factorPayload,
  saveIvohScores,
  validateIvohR4,
} from '../../features/ivoh/api';
import { useIvohContext } from '../../features/ivoh/hooks';
import {
  EVIDENCE_TYPES,
  EVIDENCE_TYPE_LABEL,
  FACTOR_CODES,
  UUID_RE,
  canCapture,
  canValidateR4,
  draftFromEvaluation,
  emptyDraft,
  evidenceLabel,
  formatScore,
  rubricForPuntaje,
  sanitizeText,
  serieEntries,
  validScore,
  validateDraft,
  weightLabel,
  type FactorCode,
  type FactorDraft,
  type IvohEvidence,
} from '../../features/ivoh/types';

const inputClass =
  'w-full rounded-md border border-line px-3 py-2 text-sm disabled:bg-slate-50';

function RadialChart({
  values,
  label,
}: {
  values: Array<{ factor: FactorCode; puntaje: number }>;
  label: string;
}) {
  const size = 240;
  const center = size / 2;
  const radius = 82;
  const angleFor = (index: number): number => -Math.PI / 2 + (index * 2 * Math.PI) / FACTOR_CODES.length;
  const point = (index: number, value: number): { x: number; y: number } => {
    const ratio = Math.max(0, Math.min(10, value)) / 10;
    const angle = angleFor(index);
    return { x: center + Math.cos(angle) * radius * ratio, y: center + Math.sin(angle) * radius * ratio };
  };
  const points = FACTOR_CODES.map((factor, index) => {
    const value = values.find((entry) => entry.factor === factor)?.puntaje ?? 0;
    return point(index, value);
  });
  const polygon = points.map((entry) => `${entry.x.toFixed(1)},${entry.y.toFixed(1)}`).join(' ');
  const titleId = 'ivoh-radial-title';
  const descId = 'ivoh-radial-desc';

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-64 w-64"
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      data-testid="ivoh-radial"
    >
      <title id={titleId}>Radial del IVOH por factor</title>
      <desc id={descId}>
        {`${label}. Puntajes: ${FACTOR_CODES.map((factor) => {
          const value = values.find((entry) => entry.factor === factor)?.puntaje;
          return `${factor}=${value ?? 'sin dato'}`;
        }).join(', ')}.`}
      </desc>
      {[0.25, 0.5, 0.75, 1].map((ratio) => (
        <circle
          key={ratio}
          cx={center}
          cy={center}
          r={radius * ratio}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth="0.75"
        />
      ))}
      {FACTOR_CODES.map((factor, index) => {
        const outer = point(index, 10);
        return (
          <line
            key={factor}
            x1={center}
            y1={center}
            x2={outer.x}
            y2={outer.y}
            stroke="#cbd5e1"
            strokeWidth="0.75"
          />
        );
      })}
      <polygon points={polygon} fill="rgba(13,92,99,0.22)" stroke="#0d5c63" strokeWidth="1.5" />
      {FACTOR_CODES.map((factor, index) => {
        const outer = point(index, 10);
        return (
          <text
            key={factor}
            x={outer.x}
            y={outer.y - 6}
            textAnchor="middle"
            className="fill-slate-600 text-[9px]"
          >
            {factor}
          </text>
        );
      })}
      <circle cx={center} cy={center} r="2" fill="#0d5c63" />
    </svg>
  );
}

export function IvohDetailPage() {
  const { diagnosticId } = useParams();
  const { claims } = useAuth();
  const online = useOnline();
  const [reloadKey, setReloadKey] = useState(0);
  const { status, data, error } = useIvohContext(diagnosticId, claims?.sub, reloadKey);
  const [drafts, setDrafts] = useState<Record<string, FactorDraft>>({});
  const [savingFactor, setSavingFactor] = useState<FactorCode | null>(null);
  const [savedFactor, setSavedFactor] = useState<FactorCode | null>(null);
  const [factorErrors, setFactorErrors] = useState<Partial<Record<FactorCode, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [r4Logbook, setR4Logbook] = useState('');
  const [validateBusy, setValidateBusy] = useState(false);
  const [validateError, setValidateError] = useState<IvohApiError | null>(null);

  const diagnostic = data?.diagnostic ?? null;
  const validated = data?.validated ?? false;
  const role = diagnostic?.diagnosticRole ?? null;
  const writable = canCapture(role);
  const readOnly = !writable || validated;
  const canValidate = canValidateR4(role) && !validated;
  const capture = data?.capture ?? null;
  const score = data?.score ?? null;
  const factors = data?.factors ?? [];
  const rubrics = data?.rubrics ?? [];
  const evaluations = data?.evaluations ?? [];
  const versionId = diagnostic?.index_version_id ?? null;

  const evaluationByFactor = useMemo(() => {
    const map = new Map<string, (typeof evaluations)[number]>();
    for (const evaluation of evaluations) map.set(evaluation.factor_code, evaluation);
    return map;
  }, [evaluations]);

  useEffect(() => {
    if (!data) return;
    const next: Record<string, FactorDraft> = {};
    for (const factor of FACTOR_CODES) {
      next[factor] = draftFromEvaluation(evaluationByFactor.get(factor));
    }
    setDrafts(next);
  }, [data, evaluationByFactor]);

  const factorCodes = factors.length > 0 ? factors.map((factor) => factor.factor_code) : [...FACTOR_CODES];

  const series = validated ? score?.serie_factores ?? null : capture?.serie_factores ?? null;
  const total = validated ? score?.ivoh ?? null : capture?.total ?? capture?.ivoh ?? null;
  const semaforo = validated ? score?.semaforo ?? null : capture?.semaforo ?? null;
  const semaforoLabel = validated ? score?.semaforo_label ?? null : capture?.semaforo_label ?? null;
  const factorsStored = validated ? 6 : capture?.factores_guardados ?? evaluations.length;
  const complete = validated || Boolean(capture?.completo) || evaluations.length === 6;
  const serialEntries = serieEntries(series);
  const semaforoDescription =
    data?.semaforoCatalog.find((entry) => entry.nivel === semaforo)?.descripcion ?? null;

  const updateDraft = (factor: FactorCode, next: FactorDraft) => {
    setDrafts((previous) => ({ ...previous, [factor]: next }));
    setFactorErrors((previous) => ({ ...previous, [factor]: undefined }));
  };

  const persistFactor = async (factor: FactorCode, draft: FactorDraft) => {
    if (!diagnosticId || readOnly) return;
    const invalid = validateDraft(draft);
    if (invalid) {
      setFactorErrors((previous) => ({ ...previous, [factor]: invalid }));
      return;
    }
    setSavingFactor(factor);
    setSavedFactor(null);
    setFactorErrors((previous) => ({ ...previous, [factor]: undefined }));
    try {
      await saveIvohScores(diagnosticId, [factorPayload(factor, draft)]);
      setSavedFactor(factor);
      setNotice('Borrador guardado. El total y el semáforo se publican al validar R4.');
      setReloadKey((value) => value + 1);
    } catch (failure: unknown) {
      const apiError =
        failure instanceof IvohApiError
          ? failure
          : new IvohApiError('unknown', 'No fue posible guardar el factor.');
      setFactorErrors((previous) => ({ ...previous, [factor]: apiError.message }));
    } finally {
      setSavingFactor(null);
    }
  };

  const updateAndMaybeSave = (factor: FactorCode, next: FactorDraft) => {
    updateDraft(factor, next);
    if (!readOnly && next.puntaje !== '' && next.justificacion.trim().length > 0 && next.evidencia.length > 0) {
      if (next.evidencia.every((item) => item.ref.trim().length > 0)) {
        void persistFactor(factor, next);
      }
    }
  };

  const submitValidate = async () => {
    if (!diagnosticId) return;
    setValidateError(null);
    setNotice(null);
    if (!UUID_RE.test(r4Logbook.trim())) {
      setValidateError(new IvohApiError('validation', 'Indica el UUID de la ficha BIT-R4 cerrada.'));
      document.getElementById('ivoh-r4-logbook')?.focus();
      return;
    }
    setValidateBusy(true);
    try {
      const result = await validateIvohR4(diagnosticId, r4Logbook.trim());
      setNotice(
        `IVOH validado en R4: ${formatScore(result.total)} · ${result.semaforo_label}. Gate F6 desbloqueado (autoridad check_phase_gate).`,
      );
      setReloadKey((value) => value + 1);
    } catch (failure: unknown) {
      setValidateError(
        failure instanceof IvohApiError
          ? failure
          : new IvohApiError('unknown', 'No fue posible validar el IVOH en R4.'),
      );
    } finally {
      setValidateBusy(false);
    }
  };

  if (!online) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-900" role="status">
        <p className="text-sm font-semibold">Sin conexión</p>
        <p className="mt-1 text-xs">
          El IVOH requiere conexión para cargar factores/evaluaciones y guardar borradores vía EF-06.
          No se promete captura offline en F1 (Dexie/F2).
        </p>
      </div>
    );
  }
  if (status === 'loading') {
    return (
      <p className="text-sm text-slate-600" role="status">
        Cargando IVOH…
      </p>
    );
  }
  if (status === 'config' || status === 'forbidden' || status === 'error' || status === 'empty' || !diagnostic) {
    return (
      <div className="rounded-lg border border-line bg-panel p-5" role="alert">
        <p className="text-sm font-semibold text-slate-900">
          {status === 'forbidden'
            ? 'No tienes permiso para ver este IVOH'
            : status === 'config'
              ? 'Configuración incompleta'
              : status === 'error'
                ? 'No fue posible cargar el IVOH'
                : 'Este diagnóstico no existe para ti'}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {import.meta.env.DEV
            ? error?.message
            : 'La política de seguridad por diagnóstico (RLS) o la configuración del despliegue impiden la consulta.'}
        </p>
        <Link className="mt-3 inline-block text-xs font-semibold text-hidria-700 underline" to="/ivoh">
          Volver al listado
        </Link>
      </div>
    );
  }

  const factorMeta = new Map(factors.map((factor) => [factor.factor_code, factor]));
  const gateText = validated
    ? 'IVOH validado en R4: gate F6 cumplido (la autoridad final es check_phase_gate/EF-01).'
    : `Gate F6 bloqueado: se requiere IVOH validado en R4 con los 6 factores de la versión vigente. Fase actual: ${diagnostic.fase_actual}.`;

  return (
    <div className="mx-auto max-w-6xl" data-testid="ivoh-detail-page">
      <Link to="/ivoh" className="text-xs font-semibold text-hidria-700 underline">
        ← Volver al listado
      </Link>
      <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
            M8 · Motor IVOH
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">
            {diagnostic.company_name ?? 'Diagnóstico'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Folio {diagnostic.folio ?? diagnostic.id.slice(0, 8)} · Fase actual {diagnostic.fase_actual} ·
            Versión IVOH {data?.versionNumber ?? '—'} · Rol: {role ?? 'sin membresía'}
          </p>
          <p className="mt-2 text-xs text-slate-600">
            {validated ? (
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-semaforo-ok">
                Validado en R4 · solo lectura
              </span>
            ) : (
              <span className="rounded bg-surface px-2 py-0.5">
                {factorsStored}/6 factores guardados · borrador
              </span>
            )}
          </p>
        </div>
      </header>

      <section className="mt-4 rounded-lg border border-line bg-panel p-4" aria-labelledby="ivoh-gate-title" data-testid="ivoh-gate">
        <h2 id="ivoh-gate-title" className="text-sm font-semibold text-hidria-900">
          Gate F6 · fase 5 → 6
        </h2>
        <p className="mt-1 text-xs text-slate-600">{gateText}</p>
        <p className="mt-1 text-[11px] text-slate-500">
          IVOH oficial: {formatScore(diagnostic.ivoh_actual)} · La UI no calcula el índice ni el semáforo.
        </p>
      </section>

      {notice && (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-semaforo-ok"
          role="status"
          data-testid="ivoh-notice"
        >
          {notice}
        </p>
      )}

      <section className="mt-4" aria-labelledby="ivoh-summary-title" data-testid="ivoh-summary">
        <h2 id="ivoh-summary-title" className="sr-only">
          Resultado del IVOH
        </h2>
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          <div className="rounded-lg border border-line bg-panel p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {validated ? 'IVOH oficial' : 'Total de borrador'}
            </p>
            <p className="mt-1 text-3xl font-semibold text-hidria-900" data-testid="ivoh-total">
              {formatScore(total)}
            </p>
            <p className="mt-2">
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                  semaforo === 'verde'
                    ? 'bg-emerald-100 text-semaforo-ok'
                    : semaforo === 'amarillo'
                      ? 'bg-amber-100 text-amber-800'
                      : semaforo === 'rojo'
                        ? 'bg-red-100 text-semaforo-crit'
                        : 'bg-slate-100 text-slate-600'
                }`}
                data-testid="ivoh-semaforo"
              >
                {semaforoLabel ?? 'Pendiente de R4'}
              </span>
            </p>
            {semaforoDescription && (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{semaforoDescription}</p>
            )}
            <p className="mt-2 text-[11px] text-slate-500">
              {factorsStored}/6 factores {validated ? 'validados' : 'guardados'}
              {!complete && !validated ? ' · faltan para validar' : ''}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center rounded-lg border border-line bg-panel p-4">
            {validated && serialEntries.length === 6 ? (
              <RadialChart values={serialEntries} label={`IVOH ${formatScore(score?.ivoh)} · ${semaforoLabel ?? ''}`} />
            ) : (
              <p className="text-center text-xs text-slate-500" data-testid="ivoh-radial-pending">
                El radial de 6 ejes se habilita al validar en R4 (el total/semáforo oficial se publica
                con la validación).
              </p>
            )}
            {validated && score?.por_factor && score.por_factor.length > 0 && (
              <ul className="mt-3 grid w-full gap-1 text-[11px] text-slate-600 sm:grid-cols-2">
                {score.por_factor.map((entry) => (
                  <li key={entry.factor_code}>
                    {entry.factor_code}: puntaje {entry.puntaje} · peso {weightLabel(entry.peso)} · aporte{' '}
                    {entry.aportacion}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {canValidate && (
        <section className="mt-4 rounded-lg border border-line bg-panel p-4" aria-labelledby="ivoh-r4-title" data-testid="ivoh-validate">
          <h2 id="ivoh-r4-title" className="text-sm font-semibold text-hidria-900">
            Validar R4 (EF-06)
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Requiere ficha BIT-R4 cerrada y los 6 factores con justificación/evidencia. El servidor
            calcula el total y el semáforo; el IVOH queda inmutable.
          </p>
          {!complete && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900" data-testid="ivoh-incomplete-warning">
              Faltan factores por guardar ({factorsStored}/6). Completa los 6 antes de validar; EF-06
              rechazará un IVOH incompleto.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-0">
              <label htmlFor="ivoh-r4-logbook" className="block text-xs font-medium text-slate-700">
                Ficha BIT-R4 cerrada (UUID)
              </label>
              <input
                id="ivoh-r4-logbook"
                value={r4Logbook}
                onChange={(event) => setR4Logbook(event.target.value)}
                placeholder="00000000-0000-4000-8000-000000000000"
                aria-invalid={r4Logbook.trim().length > 0 && !UUID_RE.test(r4Logbook.trim()) ? true : undefined}
                className={`${inputClass} w-80 max-w-full`}
                data-testid="ivoh-r4-logbook"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Debe ser una ficha BIT-R4 cerrada del mismo diagnóstico.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void submitValidate()}
              disabled={validateBusy || !UUID_RE.test(r4Logbook.trim())}
              className="rounded-md bg-hidria-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              data-testid="ivoh-validate-submit"
            >
              {validateBusy ? 'Validando…' : 'Validar IVOH en R4'}
            </button>
          </div>
          {validateError && (
            <div className="mt-3" role="alert" data-testid="ivoh-validate-error">
              <p className="text-sm text-semaforo-crit">{validateError.message}</p>
              {validateError.code && (
                <p className="mt-1 text-[11px] text-slate-500">Código: {validateError.code}</p>
              )}
            </div>
          )}
        </section>
      )}

      <section className="mt-4" aria-labelledby="ivoh-capture-title" data-testid="ivoh-capture">
        <h2 id="ivoh-capture-title" className="text-sm font-semibold text-hidria-900">
          Captura de factores
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {readOnly
            ? 'IVOH validado en R4 o rol de solo lectura: no se puede editar.'
            : 'El borrador se autoguarda por factor vía EF-06 cuando puntaje, justificación y ≥1 evidencia están completos. El total/semáforo no se calcula aquí.'}
        </p>
        {!versionId && (
          <p className="mt-2 text-xs text-semaforo-crit" role="alert">
            El diagnóstico no tiene versión de índice IVOH asignada.
          </p>
        )}
        <div className="mt-3 space-y-4">
          {factorCodes.map((factor) => {
            const draft = drafts[factor] ?? emptyDraft();
            const meta = factorMeta.get(factor);
            const rubric = rubricForPuntaje(rubrics, factor, draft.puntaje);
            const factorError = factorErrors[factor];
            const scoreValue = draft.puntaje;
            return (
              <fieldset
                key={factor}
                className="rounded-lg border border-line bg-panel p-4"
                data-testid={`ivoh-factor-${factor}`}
              >
                <legend className="px-1 text-sm font-semibold text-hidria-900">
                  {factor} · {meta?.nombre ?? factor}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    peso {meta ? weightLabel(meta.peso) : '—'}
                  </span>
                </legend>
                <div className="mt-2 grid gap-3 lg:grid-cols-[10rem_1fr]">
                  <div>
                    <label htmlFor={`ivoh-puntaje-${factor}`} className="block text-xs font-medium text-slate-700">
                      Puntaje (0–10, paso 0.5)
                    </label>
                    <select
                      id={`ivoh-puntaje-${factor}`}
                      value={scoreValue}
                      disabled={readOnly}
                      onChange={(event) => {
                        const next = { ...draft, puntaje: event.target.value };
                        updateDraft(factor, next);
                        if (!readOnly) void persistFactor(factor, next);
                      }}
                      className={`${inputClass} mt-1`}
                      data-testid={`ivoh-puntaje-${factor}`}
                    >
                      <option value="">Selecciona…</option>
                      {Array.from({ length: 21 }, (_, index) => (index * 0.5).toFixed(1)).map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    {scoreValue !== '' && !validScore(scoreValue) && (
                      <p className="mt-1 text-[11px] text-semaforo-crit">Puntaje inválido.</p>
                    )}
                    {rubric && (
                      <p className="mt-2 rounded bg-surface p-2 text-[11px] text-slate-600" data-testid={`ivoh-rubric-${factor}`}>
                        <strong>{sanitizeText(rubric.etiqueta)}</strong>: {sanitizeText(rubric.descripcion)}
                      </p>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label htmlFor={`ivoh-just-${factor}`} className="block text-xs font-medium text-slate-700">
                        Justificación
                      </label>
                      <textarea
                        id={`ivoh-just-${factor}`}
                        rows={2}
                        value={draft.justificacion}
                        disabled={readOnly}
                        onChange={(event) => updateDraft(factor, { ...draft, justificacion: event.target.value })}
                        onBlur={() => void persistFactor(factor, draft)}
                        className={`${inputClass} mt-1`}
                        data-testid={`ivoh-just-${factor}`}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-700">Evidencia (≥1)</p>
                      <ul className="mt-1 space-y-2">
                        {draft.evidencia.map((evidence, index) => (
                          <li key={index} className="grid gap-2 sm:grid-cols-[9rem_1fr_1fr_auto]">
                            <select
                              aria-label={`${factor} tipo de evidencia ${index + 1}`}
                              value={evidence.tipo}
                              disabled={readOnly}
                              onChange={(event) => {
                                const nextEvidence = [...draft.evidencia];
                                nextEvidence[index] = {
                                  ...evidence,
                                  tipo: event.target.value as IvohEvidence['tipo'],
                                };
                                updateAndMaybeSave(factor, { ...draft, evidencia: nextEvidence });
                              }}
                              className={inputClass}
                            >
                              {EVIDENCE_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {EVIDENCE_TYPE_LABEL[type]}
                                </option>
                              ))}
                            </select>
                            <input
                              aria-label={`${factor} referencia de evidencia ${index + 1}`}
                              value={evidence.ref}
                              disabled={readOnly}
                              placeholder="UUID/folio/referencia"
                              onChange={(event) => {
                                const nextEvidence = [...draft.evidencia];
                                nextEvidence[index] = { ...evidence, ref: event.target.value };
                                updateDraft(factor, { ...draft, evidencia: nextEvidence });
                              }}
                              onBlur={() => void persistFactor(factor, drafts[factor] ?? draft)}
                              className={inputClass}
                              data-testid={`ivoh-evidence-ref-${factor}-${index}`}
                            />
                            <input
                              aria-label={`${factor} descripción de evidencia ${index + 1}`}
                              value={evidence.descripcion ?? ''}
                              disabled={readOnly}
                              placeholder="Descripción (opcional)"
                              onChange={(event) => {
                                const nextEvidence = [...draft.evidencia];
                                nextEvidence[index] = { ...evidence, descripcion: event.target.value };
                                updateDraft(factor, { ...draft, evidencia: nextEvidence });
                              }}
                              className={inputClass}
                            />
                            <button
                              type="button"
                              disabled={readOnly}
                              onClick={() => {
                                const nextEvidence = draft.evidencia.filter((_, position) => position !== index);
                                updateAndMaybeSave(factor, { ...draft, evidencia: nextEvidence });
                              }}
                              className="rounded border border-line px-2 text-xs text-slate-600 disabled:opacity-50"
                              aria-label={`Eliminar evidencia ${index + 1} de ${factor}`}
                            >
                              Quitar
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => {
                          const nextEvidence = [
                            ...draft.evidencia,
                            { tipo: 'documento' as const, ref: '' },
                          ];
                          updateDraft(factor, { ...draft, evidencia: nextEvidence });
                        }}
                        className="mt-2 rounded border border-line px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                        data-testid={`ivoh-evidence-add-${factor}`}
                      >
                        Agregar evidencia
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={readOnly || savingFactor === factor}
                    onClick={() => void persistFactor(factor, draft)}
                    className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                    data-testid={`ivoh-save-${factor}`}
                  >
                    {savingFactor === factor ? 'Guardando…' : 'Guardar factor'}
                  </button>
                  <span aria-live="polite" className="text-xs text-slate-500" data-testid={`ivoh-status-${factor}`}>
                    {savingFactor === factor
                      ? 'Guardando…'
                      : savedFactor === factor
                        ? 'Guardado'
                        : evaluations.length > 0
                          ? 'Borrador'
                          : ''}
                  </span>
                  {factorError && (
                    <span role="alert" className="text-xs text-semaforo-crit" data-testid={`ivoh-error-${factor}`}>
                      {factorError}
                    </span>
                  )}
                </div>
                {draft.evidencia.length > 0 && (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Evidencias: {draft.evidencia.map(evidenceLabel).join(' · ')}
                  </p>
                )}
              </fieldset>
            );
          })}
        </div>
      </section>

      {evaluations.length > 0 && (
        <section className="mt-4 rounded-lg border border-line bg-panel p-4" aria-labelledby="ivoh-rubric-title">
          <h2 id="ivoh-rubric-title" className="text-sm font-semibold text-hidria-900">
            Rúbricas por factor
          </h2>
          <div className="mt-2 grid gap-2 text-[11px] text-slate-600 sm:grid-cols-2">
            {factors.map((factor) => {
              const factorRubrics = rubrics.filter((rubric) => rubric.factor_code === factor.factor_code);
              return (
                <div key={factor.factor_code}>
                  <p className="font-medium text-slate-700">{factor.factor_code} · {factor.nombre}</p>
                  <ul className="mt-1 list-inside list-disc">
                    {factorRubrics.map((rubric) => (
                      <li key={rubric.nivel_min}>
                        {rubric.nivel_min}–{rubric.nivel_max}: {sanitizeText(rubric.etiqueta)}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
