import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useOnline } from '../../lib/online';
import {
  CatApiError,
  saveCatAnswer,
  submitCat,
  validateCatR2,
} from '../../features/cat/api';
import { useCatForm } from '../../features/cat/hooks';
import {
  CAT_ESTADO_LABEL,
  CAT_SECTIONS,
  SECTION_LABEL,
  answerFromResponse,
  canCapture,
  canValidateR2,
  computeProgress,
  emptyAnswer,
  isAnswered,
  isApplicable,
  optionLabel,
  type AnswerState,
  type CatItem,
  type CatResponse,
} from '../../features/cat/types';

function describeError(error: unknown, fallback: string): string {
  if (error instanceof CatApiError) {
    if (import.meta.env.DEV && error.code) return `${error.message} (código ${error.code})`;
    return error.message;
  }
  return fallback;
}

function validateLabelForMissing(codes: string[]): string {
  const shown = codes.slice(0, 8).join(', ');
  return codes.length > 8 ? `${shown} y ${codes.length - 8} más` : shown;
}

/**
 * M4 — captura del CAT A1-v1 (F1-07a).
 *
 * Borrador por PostgREST (`cat_responses`, RLS por membresía; sin tocar `cat_estado`);
 * submit/validate-r2 por EF-04. El gate F3 se muestra bloqueado hasta `validado_r2`.
 */
export function CatFormPage() {
  const { diagnosticId } = useParams();
  const { claims } = useAuth();
  const online = useOnline();
  const [reloadKey, setReloadKey] = useState(0);
  const { status, diagnostic, items, responses, error } = useCatForm(
    diagnosticId,
    claims?.sub,
    reloadKey,
  );

  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [responsesMap, setResponsesMap] = useState<Record<string, CatResponse>>({});
  const [initialized, setInitialized] = useState(false);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [savedItem, setSavedItem] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ itemId: string; message: string } | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialized || status !== 'ready' || items.length === 0) return;
    const map: Record<string, CatResponse> = {};
    const nextAnswers: Record<string, AnswerState> = {};
    for (const item of items) {
      const response = responses.find((candidate) => candidate.item_id === item.id);
      if (response) {
        map[item.id] = response;
        nextAnswers[item.id] = answerFromResponse(response);
      } else {
        nextAnswers[item.id] = emptyAnswer();
      }
    }
    setResponsesMap(map);
    setAnswers(nextAnswers);
    setInitialized(true);
  }, [initialized, status, items, responses]);

  const role = diagnostic?.diagnosticRole ?? null;
  const readOnly = !canCapture(role) || diagnostic?.cat_estado === 'validado_r2';
  const itemsByCode = useMemo(() => new Map(items.map((item) => [item.codigo, item])), [items]);
  const progress = useMemo(() => computeProgress(items, answers), [items, answers]);
  const state = diagnostic?.cat_estado ?? null;
  const canSubmit =
    canCapture(role) && state !== null && state !== 'en_revision' && state !== 'validado_r2';
  const canValidate = canValidateR2(role) && state === 'en_revision';

  const persist = async (item: CatItem, next: AnswerState) => {
    if (!claims || !diagnosticId || readOnly) return;
    setAnswers((previous) => ({ ...previous, [item.id]: next }));
    if (savingItem === item.id) return;
    setSavingItem(item.id);
    setSavedItem(null);
    setSaveError(null);
    try {
      const saved = await saveCatAnswer({
        diagnosticId,
        itemId: item.id,
        userId: claims.sub,
        answer: next,
        exists: Boolean(responsesMap[item.id]),
      });
      setResponsesMap((previous) => ({ ...previous, [item.id]: saved }));
      setSavedItem(item.id);
    } catch (saveFailure: unknown) {
      setSaveError({
        itemId: item.id,
        message: describeError(
          saveFailure,
          'No fue posible guardar la respuesta. Revisa tu conexión.',
        ),
      });
    } finally {
      setSavingItem(null);
    }
  };

  const updateLocal = (item: CatItem, next: AnswerState) => {
    setAnswers((previous) => ({ ...previous, [item.id]: next }));
  };

  const handleSubmit = async () => {
    if (!diagnosticId) return;
    setSubmitError(null);
    setNotice(null);
    setAttemptedSubmit(true);
    if (progress.missing.length > 0) {
      setSubmitError(
        `Faltan ${progress.missing.length} respuestas obligatorias: ${validateLabelForMissing(
          progress.missing.map((item) => item.codigo),
        )}.`,
      );
      window.requestAnimationFrame(() => {
        progressRef.current?.focus();
        const first = progress.missing[0];
        const field = first ? document.getElementById(`cat-input-${first.codigo}`) : null;
        field?.scrollIntoView({ block: 'center' });
        field?.focus();
      });
      return;
    }
    setSubmitBusy(true);
    try {
      const result = await submitCat(diagnosticId);
      setNotice(
        result.cat_estado === 'en_revision'
          ? 'CAT enviado: queda en revisión para la reunión R2. El gate F3 sigue bloqueado hasta validarlo en R2.'
          : `CAT enviado (estado: ${CAT_ESTADO_LABEL[result.cat_estado]}).`,
      );
      setReloadKey((key) => key + 1);
    } catch (failure: unknown) {
      setSubmitError(
        describeError(failure, 'No fue posible enviar el CAT. Intenta de nuevo.'),
      );
    } finally {
      setSubmitBusy(false);
    }
  };

  const handleValidateR2 = async () => {
    if (!diagnosticId) return;
    setSubmitError(null);
    setNotice(null);
    setSubmitBusy(true);
    try {
      const result = await validateCatR2(diagnosticId);
      setNotice(
        `CAT validado en R2 (estado: ${CAT_ESTADO_LABEL[result.cat_estado]}). El gate F3 queda desbloqueado.`,
      );
      setReloadKey((key) => key + 1);
    } catch (failure: unknown) {
      setSubmitError(
        describeError(failure, 'No fue posible validar el CAT en R2. Intenta de nuevo.'),
      );
    } finally {
      setSubmitBusy(false);
    }
  };

  if (!online) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-900" role="status">
        <p className="text-sm font-semibold">Sin conexión</p>
        <p className="mt-1 text-xs">
          El CAT requiere conexión para cargar el banco y guardar respuestas. No se promete
          borrador offline en F1 (la cola Dexie llega con los módulos de campo).
        </p>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <p className="text-sm text-slate-600" role="status">
        Cargando CAT…
      </p>
    );
  }

  if (status === 'config') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-semaforo-crit" role="alert">
        <p className="text-sm font-semibold">Configuración incompleta</p>
        <p className="mt-1 text-xs">Este despliegue no tiene configurada la conexión a Supabase.</p>
      </div>
    );
  }

  if (status === 'forbidden') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-semaforo-crit" role="alert">
        <p className="text-sm font-semibold">No tienes permiso para ver este CAT</p>
        <p className="mt-1 text-xs">
          La política de seguridad por diagnóstico (RLS) ha denegado el acceso.
        </p>
        <Link className="mt-3 inline-block text-xs font-semibold underline" to="/cat">
          Volver al listado
        </Link>
      </div>
    );
  }

  if (status === 'error' || status === 'empty' || !diagnostic) {
    return (
      <div className="rounded-lg border border-line bg-panel p-5" role="alert">
        <p className="text-sm font-semibold text-slate-900">
          {status === 'error' ? 'No fue posible cargar el CAT' : 'Este diagnóstico no existe para ti'}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {import.meta.env.DEV
            ? error?.message
            : 'Puede haber sido eliminado, ser de otra organización o no ser miembro del diagnóstico.'}
        </p>
        <Link className="mt-3 inline-block text-xs font-semibold text-hidria-700 underline" to="/cat">
          Volver al listado
        </Link>
      </div>
    );
  }

  const applicableBySection = CAT_SECTIONS.map((section) => ({
    section,
    items: items.filter(
      (item) => item.seccion === section && isApplicable(item, itemsByCode, answers),
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="mx-auto max-w-5xl" data-testid="cat-form-page">
      <Link to="/cat" className="text-xs font-semibold text-hidria-700 underline">
        ← Volver al listado
      </Link>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
            M4 · CAT · banco A1-v1
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">
            {diagnostic.company_name ?? 'Diagnóstico'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Folio {diagnostic.folio ?? diagnostic.id.slice(0, 8)} · Rol en el diagnóstico:{' '}
            {diagnostic.diagnosticRole ?? 'sin membresía'}
          </p>
          <p className="mt-2">
            <span
              className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${
                state === 'validado_r2'
                  ? 'bg-emerald-100 text-semaforo-ok'
                  : state === 'en_revision'
                    ? 'bg-sky-100 text-sky-800'
                    : 'bg-slate-100 text-slate-700'
              }`}
              data-testid="cat-estado"
            >
              {state ? CAT_ESTADO_LABEL[state] : 'Sin estado'}
            </span>
          </p>
        </div>
        {canSubmit && (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitBusy || savingItem !== null}
            className="rounded-md bg-hidria-700 px-4 py-2 text-sm font-semibold text-white hover:bg-hidria-800 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="cat-submit"
          >
            {submitBusy ? 'Enviando…' : 'Enviar CAT a revisión'}
          </button>
        )}
        {canValidate && (
          <button
            type="button"
            onClick={() => void handleValidateR2()}
            disabled={submitBusy}
            className="rounded-md bg-hidria-700 px-4 py-2 text-sm font-semibold text-white hover:bg-hidria-800 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="cat-validate-r2"
          >
            {submitBusy ? 'Validando…' : 'Validar CAT en R2'}
          </button>
        )}
      </header>

      <section
        className="mt-4 rounded-lg border border-line bg-panel p-4"
        aria-labelledby="cat-gate-title"
        data-testid="cat-gate"
      >
        <h2 id="cat-gate-title" className="text-sm font-semibold text-hidria-900">
          Gate R2 · fase 2 → 3
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          {state === 'validado_r2'
            ? 'CAT validado en R2: el gate de fase 2→3 está desbloqueado (TD-1 #2).'
            : state === 'en_revision'
              ? 'CAT en revisión: el equipo del diagnóstico debe validarlo en R2 para desbloquear el gate F3.'
              : 'El gate F3 permanece bloqueado hasta que el CAT esté completo y validado en R2 (TD-1 #2).'}
        </p>
        {canValidate && (
          <p className="mt-2 text-[11px] text-slate-500">
            La validación exige la ficha BIT-R2 cerrada y que las respuestas «No sé» tengan plan de
            resolución en R2 (EF-04/TD-2).
          </p>
        )}
      </section>

      <div
        className="mt-4"
        ref={progressRef}
        tabIndex={-1}
        data-testid="cat-progress"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm font-medium text-slate-800">
          Progreso: {progress.answered}/{progress.total} respuestas aplicables ({progress.percent}%)
          {progress.missing.length > 0 && (
            <span className="ml-2 text-xs font-normal text-semaforo-warn">
              Faltan {progress.missing.length}
            </span>
          )}
        </p>
        <ul className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
          {progress.bySection.map((sectionProgress) => (
            <li key={sectionProgress.section}>
              {sectionProgress.section}: {sectionProgress.answered}/{sectionProgress.total}
            </li>
          ))}
        </ul>
      </div>

      {notice && (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-semaforo-ok"
          role="status"
          data-testid="cat-notice"
        >
          {notice}
        </p>
      )}
      {submitError && (
        <p
          className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-semaforo-crit"
          role="alert"
          data-testid="cat-submit-error"
        >
          {submitError}
        </p>
      )}

      <form className="mt-6 space-y-6" onSubmit={(event) => event.preventDefault()}>
        {applicableBySection.map(({ section, items: sectionItems }) => (
          <fieldset
            key={section}
            className="rounded-lg border border-line bg-panel p-5"
            data-testid={`cat-section-${section}`}
          >
            <legend className="px-1 text-sm font-semibold text-hidria-900">
              {section} · {SECTION_LABEL[section]}
            </legend>
            <div className="mt-2 space-y-5">
              {sectionItems.map((item) => {
                const answer = answers[item.id] ?? emptyAnswer();
                const answered = isAnswered(answer);
                const missing = attemptedSubmit && !answered;
                const inputId = `cat-input-${item.codigo}`;
                const helpId = `cat-help-${item.codigo}`;
                const errorId = `cat-error-${item.codigo}`;
                const labelContent = (
                  <>
                    {item.codigo}. {item.enunciado}
                    <span aria-hidden="true" className="ml-0.5 text-semaforo-crit">
                      *
                    </span>
                    <span className="sr-only"> (obligatoria)</span>
                  </>
                );
                return (
                  <div key={item.id} data-testid={`cat-item-${item.codigo}`}>
                    {item.tipo === 'multiple' ? (
                      <p
                        id={inputId}
                        className="block text-sm font-medium text-slate-800"
                      >
                        {labelContent}
                      </p>
                    ) : (
                      <label
                        htmlFor={inputId}
                        className="block text-sm font-medium text-slate-800"
                      >
                        {labelContent}
                      </label>
                    )}
                    {item.ayuda && (
                      <p id={helpId} className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        {item.ayuda}
                        {item.admite_evidencia ? ' · admite evidencia' : ''}
                      </p>
                    )}

                    <div className="mt-1">
                      {item.tipo === 'abierta' && (
                        <textarea
                          id={inputId}
                          rows={2}
                          value={typeof answer.valor === 'string' ? answer.valor : ''}
                          disabled={readOnly || answer.no_se || answer.na}
                          aria-invalid={missing ? true : undefined}
                          aria-describedby={`${item.ayuda ? `${helpId} ` : ''}${missing ? errorId : ''}`.trim() || undefined}
                          onChange={(event) =>
                            updateLocal(item, { ...answer, valor: event.target.value })
                          }
                          onBlur={() => void persist(item, answers[item.id] ?? answer)}
                          className="w-full rounded-md border border-line px-3 py-2 text-sm disabled:bg-slate-50"
                          data-testid={`cat-input-${item.codigo}`}
                        />
                      )}
                      {item.tipo === 'breve' && (
                        <input
                          id={inputId}
                          type="text"
                          value={typeof answer.valor === 'string' ? answer.valor : ''}
                          disabled={readOnly || answer.no_se || answer.na}
                          aria-invalid={missing ? true : undefined}
                          aria-describedby={`${item.ayuda ? `${helpId} ` : ''}${missing ? errorId : ''}`.trim() || undefined}
                          onChange={(event) =>
                            updateLocal(item, { ...answer, valor: event.target.value })
                          }
                          onBlur={() => void persist(item, answers[item.id] ?? answer)}
                          className="w-full rounded-md border border-line px-3 py-2 text-sm disabled:bg-slate-50"
                          data-testid={`cat-input-${item.codigo}`}
                        />
                      )}
                      {item.tipo === 'opcion_unica' && (
                        <select
                          id={inputId}
                          value={typeof answer.valor === 'string' ? answer.valor : ''}
                          disabled={readOnly || answer.no_se || answer.na}
                          aria-invalid={missing ? true : undefined}
                          aria-describedby={`${item.ayuda ? `${helpId} ` : ''}${missing ? errorId : ''}`.trim() || undefined}
                          onChange={(event) => {
                            const next = { ...answer, valor: event.target.value };
                            void persist(item, next);
                          }}
                          className="w-full rounded-md border border-line px-3 py-2 text-sm disabled:bg-slate-50"
                          data-testid={`cat-input-${item.codigo}`}
                        >
                          <option value="">Selecciona una opción…</option>
                          {(item.opciones ?? []).map((option) => (
                            <option key={option} value={option}>
                              {optionLabel(option)}
                            </option>
                          ))}
                        </select>
                      )}
                      {item.tipo === 'multiple' && (
                        <div
                          className="flex flex-wrap gap-4"
                          role="group"
                          aria-labelledby={inputId}
                          id={inputId}
                        >
                          {(item.opciones ?? []).map((option) => {
                            const values = Array.isArray(answer.valor) ? answer.valor : [];
                            return (
                              <label key={option} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={values.includes(option)}
                                  disabled={readOnly || answer.no_se || answer.na}
                                  onChange={(event) => {
                                    const nextValues = event.target.checked
                                      ? [...values, option]
                                      : values.filter((value) => value !== option);
                                    void persist(item, { ...answer, valor: nextValues });
                                  }}
                                />
                                {optionLabel(option)}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={answer.no_se}
                          disabled={readOnly}
                          onChange={(event) => {
                            const next = {
                              ...emptyAnswer(),
                              no_se: event.target.checked,
                              na: false,
                            };
                            void persist(item, next);
                          }}
                          data-testid={`cat-nose-${item.codigo}`}
                        />
                        No sé (se canaliza a R2)
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={answer.na}
                          disabled={readOnly}
                          onChange={(event) => {
                            const next = {
                              ...emptyAnswer(),
                              na: event.target.checked,
                              no_se: false,
                            };
                            void persist(item, next);
                          }}
                          data-testid={`cat-na-${item.codigo}`}
                        />
                        No aplica
                      </label>
                      <span aria-live="polite" data-testid={`cat-save-${item.codigo}`}>
                        {savingItem === item.id
                          ? 'Guardando…'
                          : savedItem === item.id
                            ? 'Guardado'
                            : saveError?.itemId === item.id
                              ? 'Error al guardar'
                              : ''}
                      </span>
                    </div>

                    {saveError?.itemId === item.id && (
                      <p role="alert" className="mt-1 text-xs text-semaforo-crit">
                        {saveError.message}
                      </p>
                    )}
                    {missing && (
                      <p id={errorId} role="alert" className="mt-1 text-xs text-semaforo-crit">
                        Respuesta obligatoria (valor, «No sé» o «No aplica»).
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
      </form>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        El borrador se guarda bajo RLS por membresía de diagnóstico; el envío y la validación R2
        pasan por EF-04 y son la autoridad. Esta pantalla no actualiza `cat_estado` directamente.
      </p>
    </div>
  );
}
