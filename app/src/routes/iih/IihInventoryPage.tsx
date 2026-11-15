import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useOnline } from '../../lib/online';
import {
  IihApiError,
  createIihAsset,
  importIihXlsx,
  updateIihAsset,
  type IihImportResult,
} from '../../features/iih/api';
import { useIihInventory } from '../../features/iih/hooks';
import {
  CRITICIDAD_LABEL,
  CRITICIDAD_VALUES,
  ESTADOS_FISICOS,
  ESTADO_FISICO_LABEL,
  INTERVENCION_LABEL,
  INTERVENCION_VALUES,
  MANTENIMIENTO_LABEL,
  MANTENIMIENTO_VALUES,
  OPERA_LABEL,
  OPERA_VALUES,
  PRIORIDAD_LABEL,
  PRIORIDAD_VALUES,
  SUFICIENCIA_LABEL,
  SUFICIENCIA_VALUES,
  assetToInput,
  computeSummary,
  emptyAssetInput,
  sanitizeText,
  validateAssetInput,
  validateXlsxFile,
  type FieldError,
  type IihAsset,
  type IihAssetInput,
} from '../../features/iih/types';

function describeError(error: unknown, fallback: string): string {
  if (error instanceof IihApiError) {
    if (import.meta.env.DEV && error.code) return `${error.message} (código ${error.code})`;
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const inputClass =
  'mt-1 w-full rounded-md border border-line px-3 py-2 text-sm disabled:bg-slate-50';

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: FieldError;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-medium text-slate-700">
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-semaforo-crit">*</span>}
        {required && <span className="sr-only"> (obligatorio)</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-[11px] text-semaforo-crit">
          {error.message}
        </p>
      )}
    </div>
  );
}

/** M5 — inventario IIH de un diagnóstico: resumen, filtros, alta/edición e importación XLSX. */
export function IihInventoryPage() {
  const { diagnosticId } = useParams();
  const { claims } = useAuth();
  const online = useOnline();
  const [reloadKey, setReloadKey] = useState(0);
  const { status, diagnostic, stages, types, assets, error } = useIihInventory(
    diagnosticId,
    claims?.sub,
    reloadKey,
  );
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [verificadoFilter, setVerificadoFilter] = useState('');
  const [editing, setEditing] = useState<IihAsset | 'new' | null>(null);
  const [form, setForm] = useState<IihAssetInput>(emptyAssetInput());
  const [formErrors, setFormErrors] = useState<FieldError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const [importing, setImporting] = useState(false);
  const [importPhase, setImportPhase] = useState<'idle' | 'uploading' | 'importing'>('idle');
  const [importResult, setImportResult] = useState<IihImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const role = diagnostic?.diagnosticRole ?? null;
  const canWrite = role === 'coordinador' || role === 'equipo';
  const stageOrder = stages.map((stage) => stage.code);
  const summary = useMemo(() => computeSummary(assets, stageOrder), [assets, stageOrder]);
  const typeById = useMemo(() => new Map(types.map((type) => [type.id, type])), [types]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (stageFilter && asset.stage_code !== stageFilter) return false;
      if (typeFilter && String(asset.asset_type_id) !== typeFilter) return false;
      if (estadoFilter && asset.estado_fisico !== estadoFilter) return false;
      if (verificadoFilter === 'si' && !asset.verificado_v1) return false;
      if (verificadoFilter === 'no' && asset.verificado_v1) return false;
      if (term.length > 0) {
        const haystack = `${asset.folio} ${asset.tag} ${asset.ubicacion} ${asset.asset_type_name ?? ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [assets, search, stageFilter, typeFilter, estadoFilter, verificadoFilter]);

  const errorFor = (field: keyof IihAssetInput): FieldError | undefined =>
    formErrors.find((item) => item.field === field);

  const openNew = () => {
    setEditing('new');
    setForm(emptyAssetInput(stages[0]?.code ?? 'CAP'));
    setFormErrors([]);
    setFormError(null);
    window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'start' }));
  };

  const openEdit = (asset: IihAsset) => {
    setEditing(asset);
    setForm(assetToInput(asset));
    setFormErrors([]);
    setFormError(null);
    window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'start' }));
  };

  const setField = <K extends keyof IihAssetInput>(field: K, value: IihAssetInput[K]) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!diagnosticId || !diagnostic || !canWrite) return;
    const validation = validateAssetInput(form);
    setFormErrors(validation);
    setFormError(null);
    if (validation.length > 0) {
      window.requestAnimationFrame(() => {
        const first = document.getElementById(`iih-${validation[0].field}`);
        first?.scrollIntoView({ block: 'center' });
        first?.focus();
      });
      return;
    }
    setSaving(true);
    try {
      if (editing === 'new') {
        await createIihAsset(diagnosticId, diagnostic.organization_id, form);
        setNotice('Activo creado. El folio lo asignó el servidor.');
      } else if (editing) {
        await updateIihAsset(editing.id, form);
        setNotice(`Activo ${editing.folio} actualizado.`);
      }
      setEditing(null);
      setReloadKey((key) => key + 1);
    } catch (failure: unknown) {
      setFormError(describeError(failure, 'No fue posible guardar el activo.'));
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (file: File | undefined) => {
    if (!file || !diagnosticId) return;
    setImportError(null);
    setImportResult(null);
    setNotice(null);
    const validation = await validateXlsxFile(file);
    if (!validation.ok) {
      setImportError(validation.message ?? 'Archivo no válido.');
      return;
    }
    setImporting(true);
    setImportPhase('uploading');
    try {
      setImportPhase('importing');
      const result = await importIihXlsx(diagnosticId, file);
      setImportResult(result);
      setNotice(
        `Importación IIH: ${result.filas_ok} fila(s) válida(s), ${result.filas_rechazadas.length} rechazada(s).`,
      );
      setReloadKey((key) => key + 1);
    } catch (failure: unknown) {
      setImportError(describeError(failure, 'No fue posible importar el archivo.'));
    } finally {
      setImporting(false);
      setImportPhase('idle');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (!online) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-900" role="status">
        <p className="text-sm font-semibold">Sin conexión</p>
        <p className="mt-1 text-xs">
          El inventario IIH requiere conexión para cargar catálogos, guardar activos e importar. No
          se promete captura offline en F1 (Dexie/F2).
        </p>
      </div>
    );
  }
  if (status === 'loading') {
    return (
      <p className="text-sm text-slate-600" role="status">
        Cargando inventario IIH…
      </p>
    );
  }
  if (status === 'config' || status === 'forbidden' || status === 'error' || status === 'empty' || !diagnostic) {
    return (
      <div className="rounded-lg border border-line bg-panel p-5" role="alert">
        <p className="text-sm font-semibold text-slate-900">
          {status === 'forbidden'
            ? 'No tienes permiso para ver este inventario'
            : status === 'config'
              ? 'Configuración incompleta'
              : status === 'error'
                ? 'No fue posible cargar el inventario'
                : 'Este diagnóstico no existe para ti'}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {import.meta.env.DEV
            ? error?.message
            : 'La política de seguridad por diagnóstico (RLS) o la configuración del despliegue impiden la consulta.'}
        </p>
        <Link className="mt-3 inline-block text-xs font-semibold text-hidria-700 underline" to="/iih">
          Volver al listado
        </Link>
      </div>
    );
  }

  const typesForStage = types.filter((type) => !form.stage_code || type.stage_code === form.stage_code);
  const stageName = (code: string) => stages.find((stage) => stage.code === code)?.nombre ?? code;

  return (
    <div className="mx-auto max-w-6xl" data-testid="iih-inventory-page">
      <Link to="/iih" className="text-xs font-semibold text-hidria-700 underline">
        ← Volver al listado
      </Link>
      <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
            M5 · Inventario de Infraestructura Hidráulica
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">
            {diagnostic.company_name ?? 'Diagnóstico'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Folio {diagnostic.folio ?? diagnostic.id.slice(0, 8)} · Rol en el diagnóstico:{' '}
            {role ?? 'sin membresía'}
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={openNew}
            className="rounded-md bg-hidria-700 px-4 py-2 text-sm font-semibold text-white hover:bg-hidria-800"
            data-testid="iih-new"
          >
            Nuevo activo
          </button>
        )}
      </header>

      <section
        className="mt-4 grid gap-3 sm:grid-cols-3"
        aria-label="Resumen del inventario"
        data-testid="iih-summary"
      >
        <div className="rounded-lg border border-line bg-panel p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Activos</p>
          <p className="mt-1 text-2xl font-semibold text-hidria-900">{summary.total}</p>
        </div>
        <div className="rounded-lg border border-line bg-panel p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Verificados en V1</p>
          <p className="mt-1 text-2xl font-semibold text-hidria-900">
            {summary.verificados}/{summary.total}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-panel p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Criticidad alta</p>
          <p className="mt-1 text-2xl font-semibold text-hidria-900">{summary.criticidadAlta}</p>
        </div>
        <ul className="flex flex-wrap gap-2 sm:col-span-3" aria-label="Activos por etapa">
          {summary.porEtapa.map((entry) => (
            <li
              key={entry.stage_code}
              className="rounded bg-surface px-2 py-1 text-[11px] text-slate-600"
            >
              {entry.stage_code}: {entry.total} ({entry.verificados} V1)
            </li>
          ))}
        </ul>
      </section>

      {notice && (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-semaforo-ok"
          role="status"
          data-testid="iih-notice"
        >
          {notice}
        </p>
      )}

      <section
        className="mt-4 rounded-lg border border-line bg-panel p-4"
        aria-labelledby="iih-import-title"
        data-testid="iih-import"
      >
        <h2 id="iih-import-title" className="text-sm font-semibold text-hidria-900">
          Importar plantilla XLSX (EF-09, kind=IIH)
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Estructura oficial con hojas «1. Captación» a «6. Evacuación», encabezados en la fila 7 y
          datos desde la fila 8. La UI valida extensión/MIME/ZIP y tamaño (≤ 10 MB); la estructura,
          columnas, límite de 500 filas y errores por fila los valida EF-09.
        </p>
        {canWrite ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label
              htmlFor="iih-file"
              className={`cursor-pointer rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-slate-700 ${
                importing ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              {importing
                ? importPhase === 'uploading'
                  ? 'Subiendo archivo…'
                  : 'Importando…'
                : 'Seleccionar archivo XLSX'}
            </label>
            <input
              ref={fileRef}
              id="iih-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={importing}
              data-testid="iih-file"
              onChange={(event) => void handleImport(event.target.files?.[0])}
            />
            <span aria-live="polite" className="text-xs text-slate-500" data-testid="iih-import-status">
              {importing ? 'Procesando importación…' : importResult ? 'Importación completada' : ''}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            Sólo coordinación/equipo del diagnóstico pueden importar (RLS/EF-09).
          </p>
        )}
        {importError && (
          <p
            className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-semaforo-crit"
            role="alert"
            data-testid="iih-import-error"
          >
            {importError}
          </p>
        )}
        {importResult && (
          <div className="mt-3 text-xs text-slate-700" data-testid="iih-import-result">
            <p>
              Filas válidas: {importResult.filas_ok} · Rechazadas: {importResult.filas_rechazadas.length}
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

      <section className="mt-4" aria-labelledby="iih-filters-title">
        <h2 id="iih-filters-title" className="sr-only">
          Filtros del inventario
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="iih-search" className="block text-xs font-medium text-slate-700">
              Buscar
            </label>
            <input
              id="iih-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Folio, TAG o ubicación"
              className={inputClass}
              data-testid="iih-search"
            />
          </div>
          <div>
            <label htmlFor="iih-stage" className="block text-xs font-medium text-slate-700">
              Etapa
            </label>
            <select
              id="iih-stage"
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              className={inputClass}
              data-testid="iih-filter-stage"
            >
              <option value="">Todas</option>
              {stages.map((stage) => (
                <option key={stage.code} value={stage.code}>
                  {stage.code} · {stage.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="iih-type" className="block text-xs font-medium text-slate-700">
              Tipo de activo
            </label>
            <select
              id="iih-type"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className={inputClass}
            >
              <option value="">Todos</option>
              {types
                .filter((type) => !stageFilter || type.stage_code === stageFilter)
                .map((type) => (
                  <option key={type.id} value={String(type.id)}>
                    {type.code} · {type.nombre}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="iih-verificado" className="block text-xs font-medium text-slate-700">
              Verificación V1
            </label>
            <select
              id="iih-verificado"
              value={verificadoFilter}
              onChange={(event) => setVerificadoFilter(event.target.value)}
              className={inputClass}
            >
              <option value="">Todos</option>
              <option value="si">Verificados</option>
              <option value="no">Sin verificar</option>
            </select>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="iih-estado" className="block text-xs font-medium text-slate-700">
              Estado físico
            </label>
            <select
              id="iih-estado"
              value={estadoFilter}
              onChange={(event) => setEstadoFilter(event.target.value)}
              className="mt-1 rounded-md border border-line px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {ESTADOS_FISICOS.map((estado) => (
                <option key={estado} value={estado}>
                  {ESTADO_FISICO_LABEL[estado]}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-4 text-xs text-slate-500" aria-live="polite">
            {filtered.length} de {assets.length} activos
          </p>
        </div>
      </section>

      <section className="mt-4 overflow-x-auto rounded-lg border border-line bg-panel">
        {assets.length === 0 ? (
          <div className="p-5 text-sm text-slate-600" data-testid="iih-empty">
            Sin activos registrados. {canWrite ? 'Crea el primero o importa la plantilla XLSX.' : ''}
          </div>
        ) : (
          <table className="w-full min-w-[64rem] text-left text-sm">
            <caption className="sr-only">Inventario de activos IIH</caption>
            <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Folio</th>
                <th scope="col" className="px-3 py-2 font-medium">Etapa</th>
                <th scope="col" className="px-3 py-2 font-medium">Tipo</th>
                <th scope="col" className="px-3 py-2 font-medium">TAG / ubicación</th>
                <th scope="col" className="px-3 py-2 font-medium">Capacidad</th>
                <th scope="col" className="px-3 py-2 font-medium">Estado</th>
                <th scope="col" className="px-3 py-2 font-medium">Opera</th>
                <th scope="col" className="px-3 py-2 font-medium">Criticidad</th>
                <th scope="col" className="px-3 py-2 font-medium">V1</th>
                {canWrite && <th scope="col" className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset) => (
                <tr key={asset.id} className="border-t border-line" data-testid="iih-row">
                  <th scope="row" className="px-3 py-2 font-mono text-xs font-semibold text-hidria-900">
                    {asset.folio}
                  </th>
                  <td className="px-3 py-2 text-slate-700">{stageName(asset.stage_code)}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {asset.asset_type_name ?? typeById.get(asset.asset_type_id)?.nombre ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {asset.tag} · {asset.ubicacion}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {asset.capacidad ?? '—'} {asset.capacidad_unidad ?? ''}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{ESTADO_FISICO_LABEL[asset.estado_fisico]}</td>
                  <td className="px-3 py-2 text-slate-700">{OPERA_LABEL[asset.opera]}</td>
                  <td className="px-3 py-2 text-slate-700">{CRITICIDAD_LABEL[asset.criticidad]}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        asset.verificado_v1
                          ? 'bg-emerald-100 text-semaforo-ok'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                      data-testid={`iih-v1-${asset.folio}`}
                    >
                      {asset.verificado_v1 ? 'Sí' : 'No'}
                    </span>
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(asset)}
                        className="text-xs font-semibold text-hidria-700 underline"
                        data-testid={`iih-edit-${asset.folio}`}
                      >
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {assets.length > 0 && filtered.length === 0 && (
          <p className="p-4 text-xs text-slate-500" role="status">
            Ningún activo coincide con los filtros.
          </p>
        )}
      </section>

      {canWrite && editing && (
        <div
          ref={formRef}
          className="mt-6 rounded-lg border border-line bg-panel p-5"
          data-testid="iih-form"
        >
          <h2 className="text-sm font-semibold text-hidria-900">
            {editing === 'new' ? 'Nuevo activo IIH' : `Editar ${editing.folio}`}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            El folio y la organización los asigna el servidor. La verificación V1 alimenta el gate de
            fase; el gate nunca se salta desde la UI.
          </p>
          {formError && (
            <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-semaforo-crit">
              {formError}
            </p>
          )}
          <form className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => void submitForm(event)} noValidate>
            <Field id="iih-stage_code" label="Etapa" required error={errorFor('stage_code')}>
              <select
                id="iih-stage_code"
                value={form.stage_code}
                aria-invalid={errorFor('stage_code') ? true : undefined}
                onChange={(event) => {
                  setField('stage_code', event.target.value);
                  setField('asset_type_id', null);
                }}
                className={inputClass}
              >
                {stages.map((stage) => (
                  <option key={stage.code} value={stage.code}>
                    {stage.code} · {stage.nombre}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="iih-asset_type_id" label="Tipo de activo" required error={errorFor('asset_type_id')}>
              <select
                id="iih-asset_type_id"
                value={form.asset_type_id === null ? '' : String(form.asset_type_id)}
                aria-invalid={errorFor('asset_type_id') ? true : undefined}
                onChange={(event) =>
                  setField('asset_type_id', event.target.value === '' ? null : Number(event.target.value))
                }
                className={inputClass}
              >
                <option value="">Selecciona…</option>
                {typesForStage.map((type) => (
                  <option key={type.id} value={String(type.id)}>
                    {type.code} · {type.nombre}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="iih-tag" label="TAG interno" required error={errorFor('tag')}>
              <input
                id="iih-tag"
                value={form.tag}
                aria-invalid={errorFor('tag') ? true : undefined}
                onChange={(event) => setField('tag', event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field id="iih-ubicacion" label="Ubicación (layout/plano)" required error={errorFor('ubicacion')}>
              <input
                id="iih-ubicacion"
                value={form.ubicacion}
                aria-invalid={errorFor('ubicacion') ? true : undefined}
                onChange={(event) => setField('ubicacion', event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field id="iih-capacidad" label="Capacidad" error={errorFor('capacidad')}>
              <input
                id="iih-capacidad"
                value={form.capacidad ?? ''}
                aria-invalid={errorFor('capacidad') ? true : undefined}
                onChange={(event) => setField('capacidad', event.target.value || null)}
                className={inputClass}
              />
            </Field>
            <Field id="iih-capacidad_unidad" label="Unidad de capacidad">
              <input
                id="iih-capacidad_unidad"
                value={form.capacidad_unidad ?? ''}
                onChange={(event) => setField('capacidad_unidad', event.target.value || null)}
                className={inputClass}
                placeholder="m³, L/s, kW…"
              />
            </Field>
            <Field id="iih-estado_fisico" label="Estado físico" required>
              <select
                id="iih-estado_fisico"
                value={form.estado_fisico}
                onChange={(event) => setField('estado_fisico', event.target.value as IihAssetInput['estado_fisico'])}
                className={inputClass}
              >
                {ESTADOS_FISICOS.map((estado) => (
                  <option key={estado} value={estado}>
                    {ESTADO_FISICO_LABEL[estado]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="iih-opera" label="¿Opera?" required>
              <select
                id="iih-opera"
                value={form.opera}
                onChange={(event) => setField('opera', event.target.value as IihAssetInput['opera'])}
                className={inputClass}
              >
                {OPERA_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {OPERA_LABEL[value]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="iih-criticidad" label="Criticidad" required>
              <select
                id="iih-criticidad"
                value={form.criticidad}
                onChange={(event) => setField('criticidad', event.target.value as IihAssetInput['criticidad'])}
                className={inputClass}
              >
                {CRITICIDAD_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {CRITICIDAD_LABEL[value]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="iih-intervencion" label="Intervención" required>
              <select
                id="iih-intervencion"
                value={form.intervencion}
                onChange={(event) => setField('intervencion', event.target.value as IihAssetInput['intervencion'])}
                className={inputClass}
              >
                {INTERVENCION_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {INTERVENCION_LABEL[value]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="iih-prioridad" label="Prioridad" required>
              <select
                id="iih-prioridad"
                value={form.prioridad}
                onChange={(event) => setField('prioridad', event.target.value as IihAssetInput['prioridad'])}
                className={inputClass}
              >
                {PRIORIDAD_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {PRIORIDAD_LABEL[value]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="iih-suficiencia" label="Suficiencia">
              <select
                id="iih-suficiencia"
                value={form.suficiencia ?? ''}
                onChange={(event) =>
                  setField('suficiencia', event.target.value === '' ? null : (event.target.value as IihAssetInput['suficiencia']))
                }
                className={inputClass}
              >
                <option value="">—</option>
                {SUFICIENCIA_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {SUFICIENCIA_LABEL[value]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="iih-mantenimiento_tipo" label="Mantenimiento">
              <select
                id="iih-mantenimiento_tipo"
                value={form.mantenimiento_tipo ?? ''}
                onChange={(event) =>
                  setField('mantenimiento_tipo', event.target.value === '' ? null : (event.target.value as IihAssetInput['mantenimiento_tipo']))
                }
                className={inputClass}
              >
                <option value="">—</option>
                {MANTENIMIENTO_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {MANTENIMIENTO_LABEL[value]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="iih-anio_instalacion" label="Año de instalación" error={errorFor('anio_instalacion')}>
              <input
                id="iih-anio_instalacion"
                inputMode="numeric"
                value={form.anio_instalacion ?? ''}
                aria-invalid={errorFor('anio_instalacion') ? true : undefined}
                onChange={(event) =>
                  setField('anio_instalacion', event.target.value === '' ? null : Number(event.target.value))
                }
                className={inputClass}
              />
            </Field>
            <Field id="iih-observaciones" label="Observaciones">
              <textarea
                id="iih-observaciones"
                rows={2}
                value={form.observaciones ?? ''}
                onChange={(event) => setField('observaciones', event.target.value || null)}
                className={inputClass}
              />
            </Field>
            <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
              <input
                id="iih-verificado_v1"
                type="checkbox"
                checked={form.verificado_v1}
                onChange={(event) => setField('verificado_v1', event.target.checked)}
                data-testid="iih-verificado"
              />
              <label htmlFor="iih-verificado_v1" className="text-xs text-slate-700">
                Verificado en V1 (alimenta el gate de fase; no lo salta)
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-hidria-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                data-testid="iih-save"
              >
                {saving ? 'Guardando…' : editing === 'new' ? 'Crear activo' : 'Guardar cambios'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
