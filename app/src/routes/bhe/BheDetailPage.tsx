import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useOnline } from '../../lib/online';
import {
  BheApiError,
  createBheBalance,
  importBheXlsx,
  saveBheFlow,
  validateBheR3,
  type BheImportResult,
} from '../../features/bhe/api';
import { useBheContext } from '../../features/bhe/hooks';
import {
  BHE_ESTADO_LABEL,
  FLOW_GROUP_LABEL,
  FLOW_GROUPS,
  MONTHS,
  MONTHS_SHORT,
  UUID_RE,
  canCapture,
  canValidateR3,
  flowKey,
  formatNumber,
  formatPct,
  gapTone,
  sanitizeText,
  validMonth,
  validYear,
  type BheFlow,
} from '../../features/bhe/types';

function describeError(error: unknown, fallback: string): string {
  if (error instanceof BheApiError) {
    if (import.meta.env.DEV && error.code) return `${error.message} (código ${error.code})`;
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function gapMonths(error: unknown): Array<{ mes: number; brecha_pct: number }> {
  if (!(error instanceof BheApiError) || typeof error.details !== 'object' || error.details === null) {
    return [];
  }
  const months = (error.details as { meses?: unknown }).meses;
  if (!Array.isArray(months)) return [];
  return months
    .filter(
      (month): month is { mes: number; brecha_pct: number } =>
        typeof month === 'object' &&
        month !== null &&
        typeof (month as { mes?: unknown }).mes === 'number' &&
        typeof (month as { brecha_pct?: unknown }).brecha_pct === 'number',
    )
    .map((month) => ({ mes: month.mes, brecha_pct: month.brecha_pct }));
}

function EstadoBadge({ estado }: { estado: 'borrador' | 'en_captura' | 'validado_r3' }) {
  const tone =
    estado === 'validado_r3'
      ? 'bg-emerald-100 text-semaforo-ok'
      : estado === 'en_captura'
        ? 'bg-sky-100 text-sky-800'
        : 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {BHE_ESTADO_LABEL[estado]}
    </span>
  );
}

const inputClass =
  'w-full rounded-md border border-line px-3 py-2 text-sm disabled:bg-slate-50';

/** M6 — detalle/captura del BHE de un diagnóstico. */
export function BheDetailPage() {
  const { diagnosticId } = useParams();
  const { claims } = useAuth();
  const online = useOnline();
  const [reloadKey, setReloadKey] = useState(0);
  const { status, data, error } = useBheContext(diagnosticId, claims?.sub, reloadKey);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ key: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createYear, setCreateYear] = useState(String(new Date().getFullYear() - 1));
  const [createMonth, setCreateMonth] = useState('1');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [r3Logbook, setR3Logbook] = useState('');
  const [validateBusy, setValidateBusy] = useState(false);
  const [validateError, setValidateError] = useState<BheApiError | null>(null);
  const [validateMonths, setValidateMonths] = useState<Array<{ mes: number; brecha_pct: number }>>([]);
  const [importYear, setImportYear] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importPhase, setImportPhase] = useState<'idle' | 'uploading' | 'importing'>('idle');
  const [importResult, setImportResult] = useState<BheImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const balance = data?.balance ?? null;
  const diagnostic = data?.diagnostic ?? null;
  const summary = data?.summary ?? null;
  const catalog = data?.catalog ?? [];
  const monthly = data?.monthly ?? [];
  const role = diagnostic?.diagnosticRole ?? null;
  const writable = canCapture(role);
  const readOnly = !writable || balance?.estado === 'validado_r3';
  const canValidate = canValidateR3(role) && balance !== null && balance.estado !== 'validado_r3';

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const flow of data.flows) next[flowKey(flow.catalog_code, flow.mes)] = String(flow.volumen_m3 ?? '');
    setDraft(next);
  }, [data]);

  useEffect(() => {
    if (balance) setImportYear(String(balance.periodo_anio));
  }, [balance]);

  const flowsByKey = useMemo(() => {
    const map: Record<string, BheFlow> = {};
    for (const flow of data?.flows ?? []) map[flowKey(flow.catalog_code, flow.mes)] = flow;
    return map;
  }, [data?.flows]);

  const monthlyByMes = useMemo(() => {
    const map = new Map<number, (typeof monthly)[number]>();
    for (const row of monthly) map.set(row.mes, row);
    return map;
  }, [monthly]);

  const flowRows = useMemo(
    () =>
      FLOW_GROUPS.map((group) => ({
        group,
        flows: catalog.filter((flow) => flow.grupo === group).sort((a, b) => a.orden - b.orden),
      })).filter((group) => group.flows.length > 0),
    [catalog],
  );

  const persistCell = async (catalogCode: string, mes: number, rawValue: string) => {
    if (!balance || readOnly) return;
    const key = flowKey(catalogCode, mes);
    const numeric = rawValue.trim() === '' ? 0 : Number(rawValue);
    if (Number.isNaN(numeric) || numeric < 0) {
      setSaveError({ key, message: 'El volumen debe ser un número ≥ 0.' });
      return;
    }
    const existing = flowsByKey[key];
    if (existing && Number(existing.volumen_m3) === numeric) return;
    setSavingKey(key);
    setSavedKey(null);
    setSaveError(null);
    try {
      await saveBheFlow(balance.id, catalogCode, mes, {
        volumen_m3: numeric,
        fuente_dato: existing?.fuente_dato ?? null,
        comentario: existing?.comentario ?? null,
        metodo_estimacion: existing?.metodo_estimacion ?? null,
      });
      setSavedKey(key);
      setReloadKey((value) => value + 1);
    } catch (failure: unknown) {
      setSaveError({
        key,
        message: describeError(failure, 'No fue posible guardar el volumen.'),
      });
    } finally {
      setSavingKey(null);
    }
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!diagnosticId) return;
    setCreateError(null);
    setNotice(null);
    if (!validYear(createYear) || !validMonth(createMonth)) {
      setCreateError('Indica un año (2000–2100) y un mes de inicio (1–12) válidos.');
      return;
    }
    setCreateBusy(true);
    try {
      await createBheBalance(diagnosticId, Number(createYear), Number(createMonth));
      setNotice('Balance creado. Captura los flujos de los 12 meses.');
      setReloadKey((value) => value + 1);
    } catch (failure: unknown) {
      setCreateError(describeError(failure, 'No fue posible crear el balance.'));
    } finally {
      setCreateBusy(false);
    }
  };

  const submitValidate = async () => {
    if (!balance) return;
    setValidateError(null);
    setValidateMonths([]);
    setNotice(null);
    if (!UUID_RE.test(r3Logbook.trim())) {
      setValidateError(
        new BheApiError('validation', 'Indica el UUID de la ficha BIT-R3 cerrada.'),
      );
      document.getElementById('bhe-r3-logbook')?.focus();
      return;
    }
    setValidateBusy(true);
    try {
      const result = await validateBheR3(balance.id, r3Logbook.trim());
      setNotice(
        `BHE validado en R3. Brecha anual ${formatPct(result.brecha_anual_pct)}; brecha máxima mensual ${formatPct(
          result.brecha_max_mes_pct,
        )}. Gate F5 desbloqueado (autoridad check_phase_gate).`,
      );
      setReloadKey((value) => value + 1);
    } catch (failure: unknown) {
      const apiError =
        failure instanceof BheApiError
          ? failure
          : new BheApiError('unknown', 'No fue posible validar el balance en R3.');
      setValidateError(apiError);
      setValidateMonths(gapMonths(apiError));
    } finally {
      setValidateBusy(false);
    }
  };

  const handleImport = async (file: File | undefined) => {
    if (!file || !diagnosticId) return;
    setImportError(null);
    setImportResult(null);
    setNotice(null);
    if (!importYear || !validYear(importYear)) {
      setImportError('Indica el periodo (año, 2000–2100) de la plantilla BHE.');
      return;
    }
    if (!/\.xlsx$/i.test(file.name)) {
      setImportError('La plantilla BHE debe ser un archivo .xlsx (XLSX OOXML).');
      return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setImportError('El archivo debe pesar entre 1 byte y 10 MB.');
      return;
    }
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (head[0] !== 0x50 || head[1] !== 0x4b) {
      setImportError('El archivo no tiene formato XLSX válido (firma ZIP).');
      return;
    }
    setImportBusy(true);
    setImportPhase('uploading');
    try {
      const result = await importBheXlsx(diagnosticId, Number(importYear), file);
      setImportResult(result);
      setNotice(
        `Importación BHE: ${result.filas_ok} fila(s) válida(s), ${result.filas_rechazadas.length} rechazada(s).`,
      );
      setReloadKey((value) => value + 1);
    } catch (failure: unknown) {
      setImportError(describeError(failure, 'No fue posible importar la plantilla BHE.'));
    } finally {
      setImportBusy(false);
      setImportPhase('idle');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (!online) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-900" role="status">
        <p className="text-sm font-semibold">Sin conexión</p>
        <p className="mt-1 text-xs">
          El BHE requiere conexión para cargar el balance, guardar captura y validar en R3. No se
          promete captura offline en F1 (Dexie/F2).
        </p>
      </div>
    );
  }
  if (status === 'loading') {
    return (
      <p className="text-sm text-slate-600" role="status">
        Cargando balance…
      </p>
    );
  }
  if (status === 'config' || status === 'forbidden' || status === 'error' || status === 'empty' || !diagnostic) {
    return (
      <div className="rounded-lg border border-line bg-panel p-5" role="alert">
        <p className="text-sm font-semibold text-slate-900">
          {status === 'forbidden'
            ? 'No tienes permiso para ver este balance'
            : status === 'config'
              ? 'Configuración incompleta'
              : status === 'error'
                ? 'No fue posible cargar el balance'
                : 'Este diagnóstico no existe para ti'}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {import.meta.env.DEV
            ? error?.message
            : 'La política de seguridad por diagnóstico (RLS) o la configuración del despliegue impiden la consulta.'}
        </p>
        <Link className="mt-3 inline-block text-xs font-semibold text-hidria-700 underline" to="/bhe">
          Volver al listado
        </Link>
      </div>
    );
  }

  const gapToneValue = gapTone(summary?.brecha_max_mes_pct);
  const captureLabel =
    summary?.meses_con_captura !== null && summary?.meses_con_captura !== undefined
      ? `${summary.meses_con_captura}/12`
      : '—';

  return (
    <div className="mx-auto max-w-7xl" data-testid="bhe-detail-page">
      <Link to="/bhe" className="text-xs font-semibold text-hidria-700 underline">
        ← Volver al listado
      </Link>
      <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
            M6 · Balance Hídrico Enriquecido
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">
            {diagnostic.company_name ?? 'Diagnóstico'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Folio {diagnostic.folio ?? diagnostic.id.slice(0, 8)} · Fase actual {diagnostic.fase_actual} ·
            Rol: {role ?? 'sin membresía'}
          </p>
          {balance && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <EstadoBadge estado={balance.estado} />
              <span>
                Periodo {balance.periodo_anio} · inicio mes {balance.mes_inicio} · v{balance.version}
              </span>
              <span className="rounded bg-surface px-2 py-0.5 text-[11px]">
                {balance.fuente_origen === 'importada_excel' ? 'Importada XLSX' : 'Captura nativa'}
              </span>
            </p>
          )}
        </div>
        {balance?.estado === 'validado_r3' && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-semaforo-ok">
            Balance validado en R3 · solo lectura
          </p>
        )}
      </header>

      <section className="mt-4 rounded-lg border border-line bg-panel p-4" aria-labelledby="bhe-gate-title" data-testid="bhe-gate">
        <h2 id="bhe-gate-title" className="text-sm font-semibold text-hidria-900">
          Gate F5 · fase 4 → 5
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          {balance?.estado === 'validado_r3'
            ? 'BHE validado en R3: el gate F5 está cumplido (la autoridad final es check_phase_gate/EF-01).'
            : `Gate F5 bloqueado: se requiere BHE validado en R3 con brecha mensual ≤ 10 %. Fase actual: ${diagnostic.fase_actual}.`}
        </p>
        <p className="mt-2 text-[11px] text-slate-500">
          La UI muestra la brecha calculada por el servidor; nunca la calcula ni decide el gate.
        </p>
      </section>

      {notice && (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-semaforo-ok"
          role="status"
          data-testid="bhe-notice"
        >
          {notice}
        </p>
      )}

      {balance && (
        <section className="mt-4" aria-labelledby="bhe-summary-title" data-testid="bhe-summary">
          <h2 id="bhe-summary-title" className="sr-only">
            Resumen del balance
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-line bg-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Captura</p>
              <p className="mt-1 text-2xl font-semibold text-hidria-900">
                {captureLabel}
                {summary?.captura_completa ? ' · completa' : ' · incompleta'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {summary?.tiene_datos ? 'Con datos de flujos' : 'Sin datos de flujos'}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Brecha anual (ponderada)</p>
              <p className="mt-1 text-2xl font-semibold text-hidria-900">
                {formatPct(summary?.brecha_anual_pct)}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Brecha máxima mensual</p>
              <p className="mt-1 text-2xl font-semibold text-hidria-900">
                {formatPct(summary?.brecha_max_mes_pct)}
              </p>
              <p className="mt-1">
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                    gapToneValue === 'warn'
                      ? 'bg-red-100 text-semaforo-crit'
                      : gapToneValue === 'ok'
                        ? 'bg-emerald-100 text-semaforo-ok'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                  data-testid="bhe-gap-tone"
                >
                  {gapToneValue === 'warn'
                    ? 'No cierra (>10 %)'
                    : gapToneValue === 'ok'
                      ? 'Cierra (≤10 %)'
                      : 'Pendiente'}
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-line bg-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Meses sobre umbral</p>
              <p className="mt-1 text-2xl font-semibold text-hidria-900">
                {summary?.meses_sobre_umbral ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Umbral de brecha: 10 % mensual</p>
            </div>
          </div>
        </section>
      )}

      {!balance && diagnostic && (
        <section className="mt-4 rounded-lg border border-line bg-panel p-5" data-testid="bhe-create">
          <h2 className="text-sm font-semibold text-hidria-900">Crear balance</h2>
          <p className="mt-1 text-xs text-slate-600">
            El balance se crea en borrador; el servidor fija organización, versión y estado. El
            primer flujo lo pasa a captura.
          </p>
          {writable ? (
            <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(event) => void submitCreate(event)}>
              <div>
                <label htmlFor="bhe-create-year" className="block text-xs font-medium text-slate-700">
                  Año del periodo
                </label>
                <input
                  id="bhe-create-year"
                  inputMode="numeric"
                  value={createYear}
                  onChange={(event) => setCreateYear(event.target.value)}
                  className={`${inputClass} w-32`}
                  data-testid="bhe-create-year"
                />
              </div>
              <div>
                <label htmlFor="bhe-create-month" className="block text-xs font-medium text-slate-700">
                  Mes de inicio
                </label>
                <select
                  id="bhe-create-month"
                  value={createMonth}
                  onChange={(event) => setCreateMonth(event.target.value)}
                  className={`${inputClass} w-40`}
                  data-testid="bhe-create-month"
                >
                  {MONTHS.map((month, index) => (
                    <option key={month} value={String(index + 1)}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={createBusy}
                className="rounded-md bg-hidria-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                data-testid="bhe-create-submit"
              >
                {createBusy ? 'Creando…' : 'Crear balance'}
              </button>
            </form>
          ) : (
            <p className="mt-3 text-xs text-slate-500">
              Sólo coordinación/equipo del diagnóstico pueden crear/capturar el balance.
            </p>
          )}
          {createError && (
            <p role="alert" className="mt-3 text-xs text-semaforo-crit" data-testid="bhe-create-error">
              {createError}
            </p>
          )}
        </section>
      )}

      {balance && canValidate && (
        <section className="mt-4 rounded-lg border border-line bg-panel p-4" aria-labelledby="bhe-validate-title" data-testid="bhe-validate">
          <h2 id="bhe-validate-title" className="text-sm font-semibold text-hidria-900">
            Validar R3 (EF-05)
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Requiere ficha BIT-R3 cerrada. La brecha &gt; 10 % bloquea con mensaje canónico y el
            balance permanece editable. El servidor decide.
          </p>
          {summary && !summary.captura_completa && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900" data-testid="bhe-incomplete-warning">
              Captura incompleta ({captureLabel}). Completa los 12 meses con datos antes de validar;
              EF-05 rechazará el balance incompleto.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-0">
              <label htmlFor="bhe-r3-logbook" className="block text-xs font-medium text-slate-700">
                Ficha BIT-R3 cerrada (UUID)
              </label>
              <input
                id="bhe-r3-logbook"
                value={r3Logbook}
                onChange={(event) => setR3Logbook(event.target.value)}
                placeholder="00000000-0000-4000-8000-000000000000"
                aria-describedby="bhe-r3-help"
                aria-invalid={r3Logbook.trim().length > 0 && !UUID_RE.test(r3Logbook.trim()) ? true : undefined}
                className={`${inputClass} w-80 max-w-full`}
                data-testid="bhe-r3-logbook"
              />
              <p id="bhe-r3-help" className="mt-1 text-[11px] text-slate-500">
                Debe ser una ficha BIT-R3 cerrada del mismo diagnóstico.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void submitValidate()}
              disabled={validateBusy || !UUID_RE.test(r3Logbook.trim())}
              className="rounded-md bg-hidria-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              data-testid="bhe-validate-submit"
            >
              {validateBusy ? 'Validando…' : 'Validar BHE en R3'}
            </button>
          </div>
          {validateError && (
            <div className="mt-3" data-testid="bhe-validate-error">
              <p role="alert" className="text-sm text-semaforo-crit">
                {validateError.message}
              </p>
              {validateError.code && (
                <p className="mt-1 text-[11px] text-slate-500">Código: {validateError.code}</p>
              )}
              {validateMonths.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <p className="text-xs font-medium text-slate-700">
                    Meses sobre el umbral (calculado por EF-05):
                  </p>
                  <table className="mt-1 w-full text-left text-[11px]">
                    <caption className="sr-only">Meses con brecha mayor a 10 %</caption>
                    <thead>
                      <tr className="border-b border-line">
                        <th scope="col" className="py-1 pr-3 font-medium">Mes</th>
                        <th scope="col" className="py-1 font-medium">Brecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validateMonths.map((month) => (
                        <tr key={month.mes} className="border-t border-line">
                          <td className="py-1 pr-3">{MONTHS[month.mes - 1] ?? month.mes}</td>
                          <td className="py-1">{formatPct(month.brecha_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {writable && (!balance || balance.estado !== 'validado_r3') && (
        <section className="mt-4 rounded-lg border border-line bg-panel p-4" aria-labelledby="bhe-import-title" data-testid="bhe-import">
          <h2 id="bhe-import-title" className="text-sm font-semibold text-hidria-900">
            Importar plantilla BHE (EF-09)
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Plantilla oficial: hojas «1. Entradas», «2. Destinos del agua», «3. Reúso y calidad»
            (Parte A) y «4. Balance e indicadores»; 12 meses. La importación deja el balance en
            captura y <strong>no</strong> valida R3. Sólo XLSX (≤ 10 MB).
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="bhe-import-year" className="block text-xs font-medium text-slate-700">
                Periodo (año)
              </label>
              <input
                id="bhe-import-year"
                inputMode="numeric"
                value={importYear}
                onChange={(event) => setImportYear(event.target.value)}
                aria-invalid={importYear.length > 0 && !validYear(importYear) ? true : undefined}
                className={`${inputClass} w-32`}
                data-testid="bhe-import-year"
              />
            </div>
            <label
              htmlFor="bhe-file"
              className={`cursor-pointer rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-slate-700 ${
                importBusy ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              {importBusy
                ? importPhase === 'uploading'
                  ? 'Subiendo archivo…'
                  : 'Importando…'
                : 'Seleccionar plantilla .xlsx'}
            </label>
            <input
              ref={fileRef}
              id="bhe-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={importBusy}
              data-testid="bhe-file"
              onChange={(event) => void handleImport(event.target.files?.[0])}
            />
            <span aria-live="polite" className="text-xs text-slate-500" data-testid="bhe-import-status">
              {importBusy ? 'Procesando importación…' : importResult ? 'Importación completada' : ''}
            </span>
          </div>
          {importError && (
            <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-semaforo-crit" data-testid="bhe-import-error">
              {importError}
            </p>
          )}
          {importResult && (
            <div className="mt-3 text-xs text-slate-700" data-testid="bhe-import-result">
              <p>
                Filas válidas: {importResult.filas_ok} · Rechazadas:{' '}
                {importResult.filas_rechazadas.length}
                {importResult.periodo_anio ? ` · Periodo ${importResult.periodo_anio}` : ''}
              </p>
              {importResult.advertencias.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-amber-800">
                  {importResult.advertencias.map((warning) => (
                    <li key={sanitizeText(warning)}>{sanitizeText(warning)}</li>
                  ))}
                </ul>
              )}
              {importResult.filas_rechazadas.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <caption className="sr-only">Filas rechazadas por EF-09</caption>
                    <thead>
                      <tr className="border-b border-line">
                        <th scope="col" className="py-1 pr-3 font-medium">Fila</th>
                        <th scope="col" className="py-1 font-medium">Razón</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.filas_rechazadas.map((row) => (
                        <tr key={`${row.fila}-${sanitizeText(row.razon)}`} className="border-t border-line">
                          <td className="py-1 pr-3 font-mono">{row.fila}</td>
                          <td className="py-1">{sanitizeText(row.razon)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {balance && (
        <section className="mt-4 overflow-x-auto rounded-lg border border-line bg-panel" aria-labelledby="bhe-totals-title">
          <h2 id="bhe-totals-title" className="px-4 pt-3 text-sm font-semibold text-hidria-900">
            Totales y brecha por mes <span className="text-xs font-normal text-slate-500">(solo lectura, calculado por el servidor)</span>
          </h2>
          <table className="mt-2 w-full min-w-[70rem] text-left text-xs" data-testid="bhe-totals">
            <caption className="sr-only">Totales mensuales del balance</caption>
            <thead className="border-b border-line bg-surface text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Concepto</th>
                {MONTHS_SHORT.map((month) => (
                  <th key={month} scope="col" className="px-2 py-2 font-medium">{month}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['entradas_m3', 'Entradas'],
                ['destinos_m3', 'Destinos'],
                ['descargas_m3', 'Descargas'],
                ['perdidas_m3', 'Pérdidas'],
                ['circular_m3', 'Circular'],
                ['brecha_m3', 'Brecha m³'],
                ['brecha_pct', 'Brecha %'],
              ].map(([field, label]) => (
                <tr key={field} className="border-t border-line">
                  <th scope="row" className="px-3 py-1.5 font-medium text-slate-700">{label}</th>
                  {Array.from({ length: 12 }, (_, index) => {
                    const row = monthlyByMes.get(index + 1);
                    const value = row ? (row as unknown as Record<string, string | number | null>)[field] : null;
                    return (
                      <td key={index} className="px-2 py-1.5 text-slate-700">
                        {field === 'brecha_pct' ? formatPct(value) : formatNumber(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {balance && (
        <section className="mt-4" aria-labelledby="bhe-capture-title">
          <h2 id="bhe-capture-title" className="text-sm font-semibold text-hidria-900">
            Captura mensual por flujo (m³)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {readOnly
              ? 'Balance validado en R3 o rol de solo lectura: no se puede editar.'
              : 'Guarda al salir de cada celda. El primer flujo pasa el balance a «en captura»; el estado y la brecha los decide el servidor.'}
          </p>
          {savedKey && (
            <p className="mt-2 text-xs text-semaforo-ok" role="status" aria-live="polite" data-testid="bhe-save-status">
              Guardado
            </p>
          )}
          <div className="mt-3 space-y-4">
            {flowRows.map(({ group, flows }) => (
              <fieldset key={group} className="overflow-x-auto rounded-lg border border-line bg-panel" data-testid={`bhe-group-${group}`}>
                <legend className="px-3 pt-3 text-sm font-semibold text-hidria-900">
                  {FLOW_GROUP_LABEL[group]}
                </legend>
                <table className="mt-2 w-full min-w-[70rem] text-left text-xs">
                  <caption className="sr-only">Flujos de {FLOW_GROUP_LABEL[group]} por mes</caption>
                  <thead className="border-b border-line bg-surface text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Flujo</th>
                      {MONTHS_SHORT.map((month) => (
                        <th key={month} scope="col" className="px-1 py-2 font-medium">{month}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {flows.map((flow) => (
                      <tr key={flow.code} className="border-t border-line">
                        <th scope="row" className="min-w-48 px-3 py-2 font-medium text-slate-700">
                          {flow.nombre} <span className="font-mono text-[10px] text-slate-400">{flow.code}</span>
                        </th>
                        {Array.from({ length: 12 }, (_, index) => {
                          const mes = index + 1;
                          const key = flowKey(flow.code, mes);
                          return (
                            <td key={mes} className="px-1 py-1.5">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                aria-label={`${flow.nombre} ${MONTHS[index]}`}
                                value={draft[key] ?? ''}
                                disabled={readOnly}
                                onChange={(event) =>
                                  setDraft((previous) => ({ ...previous, [key]: event.target.value }))
                                }
                                onBlur={(event) => void persistCell(flow.code, mes, event.target.value)}
                                className="w-20 rounded border border-line px-1 py-1 text-right text-xs disabled:bg-slate-50"
                                data-testid={`bhe-flow-${flow.code}-${mes}`}
                              />
                              {savingKey === key && <span className="sr-only">Guardando</span>}
                              {saveError?.key === key && (
                                <span className="sr-only" role="alert">{saveError.message}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </fieldset>
            ))}
          </div>
          {saveError && (
            <p role="alert" className="mt-2 text-xs text-semaforo-crit" data-testid="bhe-save-error">
              {saveError.message}
            </p>
          )}
        </section>
      )}

      {balance && (balance.produccion_mensual?.length || balance.unidad_produccion || balance.dias_operacion || balance.dqo_mg_l || balance.dbo5_mg_l) && (
        <section className="mt-4 rounded-lg border border-line bg-panel p-4" aria-labelledby="bhe-meta-title">
          <h2 id="bhe-meta-title" className="text-sm font-semibold text-hidria-900">Datos del balance</h2>
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-slate-500">Unidad de producción</dt><dd>{balance.unidad_produccion ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Días de operación</dt><dd>{balance.dias_operacion ?? '—'}</dd></div>
            <div><dt className="text-slate-500">DQO / DBO₅ (mg/L)</dt><dd>{balance.dqo_mg_l ?? '—'} / {balance.dbo5_mg_l ?? '—'}</dd></div>
            {balance.validado_r3_logbook_id && (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-slate-500">Ficha R3 que validó</dt>
                <dd className="font-mono text-[11px]">{balance.validado_r3_logbook_id}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {balance?.estado === 'validado_r3' && (
        <p className="mt-4 text-xs text-slate-500">
          Balance validado en R3: captura, flujos y datos quedan inmutables en el servidor.
        </p>
      )}
    </div>
  );
}
