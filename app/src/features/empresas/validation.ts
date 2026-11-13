import { CICLOS_VIDA, GIROS, type CompanyInput } from './types';

/** Error de validación de un campo (para resumen accesible y `aria-invalid`). */
export interface FieldError {
  field: keyof CompanyInput;
  message: string;
}

const REQUIRED: Array<[keyof CompanyInput, string]> = [
  ['razon_social', 'La razón social es obligatoria.'],
  ['nombre_planta', 'El nombre de la planta es obligatorio.'],
  ['giro', 'Selecciona el giro industrial.'],
  ['calle', 'La calle es obligatoria.'],
  ['colonia_parque', 'La colonia o parque industrial es obligatorio.'],
  ['cp', 'El código postal es obligatorio.'],
  ['municipio', 'El municipio es obligatorio (alimenta el factor F2).'],
  ['organismo_operador', 'El organismo operador es obligatorio.'],
];

const MAX_LENGTH: Array<[keyof CompanyInput, number]> = [
  ['razon_social', 200],
  ['nombre_planta', 200],
  ['calle', 200],
  ['colonia_parque', 200],
  ['municipio', 120],
  ['organismo_operador', 120],
  ['turnos', 120],
  ['unidad_produccion', 120],
];

/**
 * Validación de cliente de los campos de `companies` (docs/01 §4.1). No sustituye a las
 * restricciones del servidor (CHECK/RLS): sólo evita enviar formularios incompletos.
 */
export function validateCompanyInput(input: CompanyInput): FieldError[] {
  const errors: FieldError[] = [];

  for (const [field, message] of REQUIRED) {
    const value = input[field];
    const empty =
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim().length === 0);
    if (empty) errors.push({ field, message });
  }

  for (const [field, max] of MAX_LENGTH) {
    const value = input[field];
    if (typeof value === 'string' && value.trim().length > max) {
      errors.push({ field, message: `Máximo ${max} caracteres.` });
    }
  }

  if (!GIROS.includes(input.giro)) {
    errors.push({ field: 'giro', message: 'Giro no válido.' });
  }
  if (!CICLOS_VIDA.includes(input.ciclo_vida)) {
    errors.push({ field: 'ciclo_vida', message: 'Ciclo de vida no válido.' });
  }
  if (input.cp.trim().length > 0 && !/^\d{5}$/.test(input.cp.trim())) {
    errors.push({ field: 'cp', message: 'El código postal debe tener 5 dígitos.' });
  }
  if (input.lat !== null && (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90)) {
    errors.push({ field: 'lat', message: 'La latitud debe ser un número entre -90 y 90.' });
  }
  if (input.lon !== null && (!Number.isFinite(input.lon) || input.lon < -180 || input.lon > 180)) {
    errors.push({ field: 'lon', message: 'La longitud debe ser un número entre -180 y 180.' });
  }
  if (
    input.empleados !== null &&
    (!Number.isInteger(input.empleados) || input.empleados < 0)
  ) {
    errors.push({ field: 'empleados', message: 'Los empleados deben ser un entero ≥ 0.' });
  }
  if (
    input.contraparte_user_id !== null &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.contraparte_user_id,
    )
  ) {
    errors.push({
      field: 'contraparte_user_id',
      message: 'La contraparte debe ser un UUID de usuario válido (se asigna desde la coordinación).',
    });
  }

  return errors;
}

/** Normaliza el formulario: recorta textos y convierte vacíos opcionales a `null`. */
export function normalizeCompanyInput(input: CompanyInput): CompanyInput {
  const optionalText = (value: string | null): string | null =>
    value === null || value.trim().length === 0 ? null : value.trim();
  return {
    ...input,
    razon_social: input.razon_social.trim(),
    nombre_planta: input.nombre_planta.trim(),
    calle: input.calle.trim(),
    colonia_parque: input.colonia_parque.trim(),
    cp: input.cp.trim(),
    municipio: input.municipio.trim(),
    organismo_operador: input.organismo_operador.trim(),
    turnos: optionalText(input.turnos),
    unidad_produccion: optionalText(input.unidad_produccion),
    contraparte_user_id: optionalText(input.contraparte_user_id),
  };
}
