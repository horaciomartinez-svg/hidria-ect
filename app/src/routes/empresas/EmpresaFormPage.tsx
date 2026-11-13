import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useOnline } from '../../lib/online';
import {
  EmpresaApiError,
  createCompany,
  updateCompany,
} from '../../features/empresas/api';
import { useCompany } from '../../features/empresas/hooks';
import {
  CICLOS_VIDA,
  CICLO_LABEL,
  COMPANY_CREATE_ROLES,
  COMPANY_WRITE_ROLES,
  GIROS,
  GIRO_LABEL,
  companyToInput,
  emptyCompanyInput,
  type CompanyInput,
} from '../../features/empresas/types';
import {
  normalizeCompanyInput,
  validateCompanyInput,
  type FieldError,
} from '../../features/empresas/validation';
import { EstadoNotice } from './shared';

type Mode = 'create' | 'edit';

function FieldShell({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: FieldError;
  children: ReactNode;
}) {
  return (
    <div className="sm:col-span-1">
      <label htmlFor={id} className="block text-xs font-medium text-slate-700">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-semaforo-crit">
            *
          </span>
        )}
        {required && <span className="sr-only"> (obligatorio)</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-[11px] leading-relaxed text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-[11px] font-medium text-semaforo-crit"
        >
          {error.message}
        </p>
      )}
    </div>
  );
}

const inputClass =
  'mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-slate-900 disabled:opacity-60';

/**
 * M1 — Alta/edición de empresa (F1-03b).
 *
 * PostgREST directo con RLS; `organization_id` se toma de la sesión (nunca del formulario).
 * La validación de cliente complementa (no sustituye) los CHECK del servidor.
 */
export function EmpresaFormPage({ mode }: { mode: Mode }) {
  const { claims } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();
  const params = useParams();
  const companyId = params.companyId;
  const isEdit = mode === 'edit';

  const companyState = useCompany(isEdit ? companyId : undefined);
  const [input, setInput] = useState<CompanyInput>(emptyCompanyInput);
  const [initialized, setInitialized] = useState(!isEdit);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<EmpresaApiError | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEdit && companyState.status === 'ready' && companyState.data && !initialized) {
      setInput(companyToInput(companyState.data));
      setInitialized(true);
    }
  }, [isEdit, companyState.status, companyState.data, initialized]);

  const canWrite = claims ? COMPANY_WRITE_ROLES.includes(claims.globalRole) : false;
  const canCreate = claims ? COMPANY_CREATE_ROLES.includes(claims.globalRole) : false;
  /** Alta para los 3 roles de escritura: F1-03a (#36) ya garantiza SELECT del creador. */
  const allowed = isEdit ? canWrite : canCreate;
  /** Sólo coordinación/administración cambian la etapa del ciclo de vida (regla de negocio). */
  const canEditCiclo =
    claims?.globalRole === 'admin_institucional' || claims?.globalRole === 'coordinador_srhds';

  useEffect(() => {
    // Al cambiar de empresa (o de modo), se reinicia el formulario y la carga inicial.
    setInitialized(!isEdit);
    setInput(emptyCompanyInput());
    setErrors([]);
    setSubmitError(null);
  }, [companyId, isEdit]);

  const errorFor = (field: keyof CompanyInput): FieldError | undefined =>
    errors.find((item) => item.field === field);

  const setField = <K extends keyof CompanyInput>(field: K, value: CompanyInput[K]) => {
    setInput((previous) => ({ ...previous, [field]: value }));
  };

  const onNumberChange = (
    field: 'lat' | 'lon' | 'empleados',
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const raw = event.target.value.trim();
    setField(field, raw === '' ? null : Number(raw));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    const validation = validateCompanyInput(input);
    setErrors(validation);
    if (validation.length > 0) {
      window.requestAnimationFrame(() => {
        summaryRef.current?.focus();
        const first = document.getElementById(`empresa-${validation[0].field}`);
        first?.scrollIntoView({ block: 'center' });
      });
      return;
    }
    if (!online || !claims) return;

    setSubmitting(true);
    try {
      const saved =
        isEdit && companyId
          ? await updateCompany(companyId, input)
          : await createCompany(normalizeCompanyInput(input), claims.organizationId);
      navigate(`/empresas/${saved.id}`, { replace: true });
    } catch (error: unknown) {
      setSubmitError(
        error instanceof EmpresaApiError
          ? error
          : new EmpresaApiError('unknown', 'No fue posible guardar la empresa.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!allowed) {
    return (
      <EstadoNotice
        kind="forbidden"
        title={
          isEdit ? 'Tu rol no permite editar empresas' : 'Tu rol no permite dar de alta empresas'
        }
        detail={
          isEdit
            ? 'La escritura de empresas está limitada por política de seguridad a los roles institucionales autorizados. Si necesitas operar este módulo, solicítalo a la Coordinación SRHDS.'
            : 'El alta de empresas está limitada por política de seguridad a los roles institucionales autorizados. Si necesitas operar este módulo, solicítalo a la Coordinación SRHDS.'
        }
        action={
          <Link className="text-xs font-semibold text-hidria-700 underline" to="/empresas">
            Volver al listado
          </Link>
        }
      />
    );
  }

  if (isEdit && companyState.status === 'loading') {
    return (
      <p className="text-sm text-slate-600" role="status">
        Cargando empresa…
      </p>
    );
  }

  if (isEdit && (companyState.status === 'config' || companyState.status === 'error')) {
    return (
      <EstadoNotice
        kind={companyState.status === 'config' ? 'config' : 'error'}
        title="No fue posible cargar la empresa"
        detail={
          import.meta.env.DEV
            ? companyState.error?.message
            : 'Intenta de nuevo; si persiste, contacta a la Coordinación SRHDS.'
        }
        action={
          <Link className="text-xs font-semibold text-hidria-700 underline" to="/empresas">
            Volver al listado
          </Link>
        }
      />
    );
  }

  if (isEdit && (companyState.status === 'forbidden' || companyState.status === 'empty')) {
    return (
      <EstadoNotice
        kind={companyState.status === 'forbidden' ? 'forbidden' : 'error'}
        title={
          companyState.status === 'forbidden'
            ? 'No tienes permiso para editar esta empresa'
            : 'La empresa no existe'
        }
        detail={
          companyState.status === 'forbidden'
            ? 'La política de seguridad por organización (RLS) ha denegado el acceso.'
            : 'Puede haber sido eliminada o el enlace no es correcto.'
        }
        action={
          <Link className="text-xs font-semibold text-hidria-700 underline" to="/empresas">
            Volver al listado
          </Link>
        }
      />
    );
  }

  const fieldProps = (
    field: keyof CompanyInput,
    options: { required?: boolean; hint?: boolean } = {},
  ) => ({
    id: `empresa-${field}`,
    name: field,
    required: options.required ? true : undefined,
    'aria-required': options.required ? true : undefined,
    'aria-invalid': errorFor(field) ? true : undefined,
    'aria-describedby':
      [
        options.hint ? `empresa-${field}-hint` : null,
        errorFor(field) ? `empresa-${field}-error` : null,
      ]
        .filter(Boolean)
        .join(' ') || undefined,
    disabled: submitting,
    className: inputClass,
  });

  return (
    <div className="mx-auto max-w-4xl">
      <header>
        <Link to="/empresas" className="text-xs font-semibold text-hidria-700 underline">
          ← Volver al listado
        </Link>
        <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-hidria-600">
          M1 · Registro de empresas
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-hidria-900">
          {isEdit ? 'Editar empresa' : 'Alta de empresa'}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Los campos con <span aria-hidden="true">*</span> son obligatorios. La organización se
          toma de tu sesión; el identificador y las fechas los asigna el servidor.
        </p>
      </header>

      {!online && (
        <div className="mt-4">
          <EstadoNotice
            kind="offline"
            title="Sin conexión: no es posible guardar"
            detail="El alta y la edición requieren conexión. No se encolan cambios ni se guardan en este dispositivo (la captura offline llegará con M4/M6/M10)."
          />
        </div>
      )}

      {submitError && (
        <div className="mt-4">
          <EstadoNotice
            kind={submitError.kind === 'forbidden' ? 'forbidden' : 'error'}
            title="No se pudo guardar la empresa"
            detail={
              import.meta.env.DEV
                ? submitError.code
                  ? `${submitError.message} (código ${submitError.code})`
                  : submitError.message
                : 'No fue posible guardar la empresa. Revisa los datos e inténtalo de nuevo; si persiste, contacta a la Coordinación SRHDS.'
            }
          />
        </div>
      )}

      {errors.length > 0 && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          data-testid="empresa-error-summary"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-semaforo-crit"
        >
          <p className="font-semibold">Revisa {errors.length} campo(s) antes de continuar:</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {errors.map((item) => (
              <li key={item.field}>
                <a className="underline" href={`#empresa-${item.field}`}>
                  {item.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        className="mt-5 space-y-6"
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        data-testid="empresa-form"
      >
        <fieldset className="rounded-lg border border-line bg-panel p-5">
          <legend className="px-1 text-sm font-semibold text-hidria-900">
            Identificación de la empresa
          </legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <FieldShell
              id="empresa-razon_social"
              label="Razón social"
              required
              error={errorFor('razon_social')}
            >
              <input
                {...fieldProps('razon_social', { required: true })}
                value={input.razon_social}
                onChange={(event) => setField('razon_social', event.target.value)}
                autoComplete="organization"
                data-testid="empresa-field-razon_social"
              />
            </FieldShell>
            <FieldShell
              id="empresa-nombre_planta"
              label="Nombre de la planta"
              required
              error={errorFor('nombre_planta')}
            >
              <input
                {...fieldProps('nombre_planta', { required: true })}
                value={input.nombre_planta}
                onChange={(event) => setField('nombre_planta', event.target.value)}
                data-testid="empresa-field-nombre_planta"
              />
            </FieldShell>
            <FieldShell id="empresa-giro" label="Giro industrial" required error={errorFor('giro')}>
              <select
                {...fieldProps('giro', { required: true })}
                value={input.giro}
                onChange={(event) => setField('giro', event.target.value as CompanyInput['giro'])}
                data-testid="empresa-field-giro"
              >
                {GIROS.map((value) => (
                  <option key={value} value={value}>
                    {GIRO_LABEL[value]}
                  </option>
                ))}
              </select>
            </FieldShell>
            <FieldShell
              id="empresa-ciclo_vida"
              label="Ciclo de vida"
              hint={
                canEditCiclo
                  ? 'Etapa acordada con la empresa; el cambio de etapa se documenta en el expediente.'
                  : 'Sólo coordinación o administración institucional pueden cambiar la etapa; RLS/EF del servidor es la autoridad.'
              }
              error={errorFor('ciclo_vida')}
            >
              <select
                {...fieldProps('ciclo_vida', { hint: true })}
                disabled={submitting || !canEditCiclo}
                value={input.ciclo_vida}
                onChange={(event) =>
                  setField('ciclo_vida', event.target.value as CompanyInput['ciclo_vida'])
                }
                data-testid="empresa-field-ciclo_vida"
              >
                {CICLOS_VIDA.map((value) => (
                  <option key={value} value={value}>
                    {CICLO_LABEL[value]}
                  </option>
                ))}
              </select>
            </FieldShell>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-line bg-panel p-5">
          <legend className="px-1 text-sm font-semibold text-hidria-900">
            Domicilio y contexto hídrico
          </legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <FieldShell id="empresa-calle" label="Calle y número" required error={errorFor('calle')}>
              <input
                {...fieldProps('calle', { required: true })}
                data-testid="empresa-field-calle"
                value={input.calle}
                onChange={(event) => setField('calle', event.target.value)}
                autoComplete="street-address"
              />
            </FieldShell>
            <FieldShell
              id="empresa-colonia_parque"
              label="Colonia o parque industrial"
              required
              error={errorFor('colonia_parque')}
            >
              <input
                {...fieldProps('colonia_parque', { required: true })}
                data-testid="empresa-field-colonia_parque"
                value={input.colonia_parque}
                onChange={(event) => setField('colonia_parque', event.target.value)}
              />
            </FieldShell>
            <FieldShell
              id="empresa-cp"
              label="Código postal"
              required
              error={errorFor('cp')}
            >
              <input
                {...fieldProps('cp', { required: true })}
                data-testid="empresa-field-cp"
                value={input.cp}
                onChange={(event) => setField('cp', event.target.value)}
                inputMode="numeric"
                autoComplete="postal-code"
              />
            </FieldShell>
            <FieldShell id="empresa-municipio" label="Municipio" required error={errorFor('municipio')}>
              <input
                {...fieldProps('municipio', { required: true })}
                value={input.municipio}
                onChange={(event) => setField('municipio', event.target.value)}
                autoComplete="address-level2"
                data-testid="empresa-field-municipio"
              />
            </FieldShell>
            <FieldShell
              id="empresa-organismo_operador"
              label="Organismo operador de agua y alcantarillado"
              required
              error={errorFor('organismo_operador')}
              hint="COMAPA, JAD u otro. Se usa para el contexto del municipio."
            >
              <input
                {...fieldProps('organismo_operador', { required: true, hint: true })}
                value={input.organismo_operador}
                onChange={(event) => setField('organismo_operador', event.target.value)}
                data-testid="empresa-field-organismo_operador"
              />
            </FieldShell>
            <div className="grid grid-cols-2 gap-3">
              <FieldShell id="empresa-lat" label="Latitud" error={errorFor('lat')}>
                <input
                  {...fieldProps('lat')}
                  type="number"
                  step="0.000001"
                  min={-90}
                  max={90}
                  value={input.lat ?? ''}
                  onChange={(event) => onNumberChange('lat', event)}
                />
              </FieldShell>
              <FieldShell id="empresa-lon" label="Longitud" error={errorFor('lon')}>
                <input
                  {...fieldProps('lon')}
                  type="number"
                  step="0.000001"
                  min={-180}
                  max={180}
                  value={input.lon ?? ''}
                  onChange={(event) => onNumberChange('lon', event)}
                />
              </FieldShell>
            </div>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-line bg-panel p-5">
          <legend className="px-1 text-sm font-semibold text-hidria-900">
            Operación
          </legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <FieldShell id="empresa-empleados" label="Número de empleados" error={errorFor('empleados')}>
              <input
                {...fieldProps('empleados')}
                type="number"
                min={0}
                step={1}
                value={input.empleados ?? ''}
                onChange={(event) => onNumberChange('empleados', event)}
              />
            </FieldShell>
            <FieldShell id="empresa-turnos" label="Turnos" error={errorFor('turnos')}>
              <input
                {...fieldProps('turnos')}
                value={input.turnos ?? ''}
                onChange={(event) =>
                  setField('turnos', event.target.value === '' ? null : event.target.value)
                }
                placeholder="p. ej. 2 turnos de 12 h"
              />
            </FieldShell>
            <FieldShell
              id="empresa-unidad_produccion"
              label="Unidad de producción principal"
              error={errorFor('unidad_produccion')}
            >
              <input
                {...fieldProps('unidad_produccion')}
                value={input.unidad_produccion ?? ''}
                onChange={(event) =>
                  setField(
                    'unidad_produccion',
                    event.target.value === '' ? null : event.target.value,
                  )
                }
                placeholder="piezas, ton, kWh, litros"
              />
            </FieldShell>
            <div className="sm:col-span-2 rounded-md border border-dashed border-line p-3 text-[11px] leading-relaxed text-slate-500">
              <p className="font-medium text-slate-700">Contraparte designada</p>
              <p className="mt-1">
                {isEdit && input.contraparte_user_id
                  ? `Asignada por la coordinación; no se edita en este formulario (referencia ${input.contraparte_user_id}).`
                  : 'Se asigna desde el directorio institucional por la coordinación. Este formulario no acepta un UUID libre: la validación de existencia, organización y rol se implementará en el servidor (F1-03a) junto con el selector de usuarios.'}
              </p>
            </div>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!online || submitting}
            className="rounded-md bg-hidria-700 px-4 py-2 text-sm font-semibold text-white hover:bg-hidria-800 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="empresa-submit"
          >
            {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Dar de alta'}
          </button>
          <Link
            to={isEdit && companyId ? `/empresas/${companyId}` : '/empresas'}
            className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Cancelar
          </Link>
          {!online && (
            <p className="text-xs text-semaforo-warn" role="note">
              Requiere conexión
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
