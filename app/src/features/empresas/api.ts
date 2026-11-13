import { supabase } from '../../lib/supabase';
import type { Company, CompanyInput } from './types';
import { normalizeCompanyInput } from './validation';

/**
 * Capa de datos M1 — PostgREST directo con RLS (sin EF en F1-03).
 *
 * No se inventan endpoints: se usan las operaciones estándar de PostgREST sobre
 * `public.companies`; la autorización (tenant + rol + ownership) la aplica RLS en servidor.
 */
export type EmpresaErrorKind =
  | 'config'
  | 'offline'
  | 'auth'
  | 'forbidden'
  | 'validation'
  | 'conflict'
  | 'network'
  | 'unknown';

export class EmpresaApiError extends Error {
  readonly kind: EmpresaErrorKind;
  readonly code?: string;

  constructor(kind: EmpresaErrorKind, message: string, code?: string) {
    super(message);
    this.name = 'EmpresaApiError';
    this.kind = kind;
    this.code = code;
  }
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

const FORBIDDEN_CODES = new Set(['42501', 'PGRST301']);
const VALIDATION_CODES = new Set(['23502', '23503', '23514', '22P02']);
const CONFLICT_CODES = new Set(['23505', '40001', '40P01']);

export function mapPostgrestError(error: PostgrestLikeError | null): EmpresaApiError {
  const code = error?.code;
  const message = error?.message ?? 'Error de datos.';
  if (code && FORBIDDEN_CODES.has(code)) {
    return new EmpresaApiError(
      'forbidden',
      'No tienes permiso para acceder a estas empresas (política de seguridad por organización).',
      code,
    );
  }
  if (code && VALIDATION_CODES.has(code)) {
    return new EmpresaApiError('validation', 'Los datos enviados no son válidos.', code);
  }
  if (code && CONFLICT_CODES.has(code)) {
    return new EmpresaApiError('conflict', 'El registro ya existe o está en uso.', code);
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return new EmpresaApiError('network', 'No fue posible contactar el servidor de HIDRIA.', code);
  }
  if (/jwt|token/i.test(message)) {
    return new EmpresaApiError('auth', 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.', code);
  }
  return new EmpresaApiError('unknown', 'No fue posible completar la operación.', code);
}

function client() {
  if (!supabase) {
    throw new EmpresaApiError(
      'config',
      'La configuración de Supabase está incompleta en este despliegue.',
    );
  }
  return supabase;
}

export interface CompanyFilters {
  search?: string;
  giro?: string;
  municipio?: string;
  ciclo?: string;
}

/**
 * Sanea un término de búsqueda para la sintaxis `or(...)` de PostgREST. Se eliminan los
 * delimitadores de la gramática (`,()`) y los caracteres de control/escape que podrían
 * romperla (`"`, `\`, `:`, comodines); los valores unicode se conservan.
 */
function sanitizeTerm(term: string): string {
  return term.replace(/[,()*%"\\:]/g, ' ').trim();
}

export async function listCompanies(filters: CompanyFilters = {}): Promise<Company[]> {
  const db = client();
  let query = db.from('companies').select('*').order('razon_social', { ascending: true });

  if (filters.giro) query = query.eq('giro', filters.giro);
  if (filters.ciclo) query = query.eq('ciclo_vida', filters.ciclo);
  if (filters.municipio && filters.municipio.trim().length > 0) {
    query = query.ilike('municipio', `%${filters.municipio.trim()}%`);
  }
  const term = sanitizeTerm(filters.search ?? '');
  if (term.length > 0) {
    query = query.or(
      `razon_social.ilike.%${term}%,nombre_planta.ilike.%${term}%,municipio.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw mapPostgrestError(error);
  return (data ?? []) as Company[];
}

export async function getCompany(id: string): Promise<Company | null> {
  const db = client();
  const { data, error } = await db.from('companies').select('*').eq('id', id).maybeSingle();
  if (error) throw mapPostgrestError(error);
  return (data as Company | null) ?? null;
}

/** Alta: `organization_id` se toma de la sesión (claim), nunca del formulario. */
export async function createCompany(
  input: CompanyInput,
  organizationId: string,
): Promise<Company> {
  const db = client();
  const payload = { ...normalizeCompanyInput(input), organization_id: organizationId };
  const { data, error } = await db.from('companies').insert(payload).select('*').single();
  if (error) throw mapPostgrestError(error);
  return data as Company;
}

/** Edición: RLS filtra la fila; 0 filas actualizadas ⇒ sin permiso o empresa ajena. */
export async function updateCompany(id: string, input: CompanyInput): Promise<Company> {
  const db = client();
  const payload = normalizeCompanyInput(input);
  const { data, error } = await db
    .from('companies')
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw mapPostgrestError(error);
  if (!data) {
    throw new EmpresaApiError(
      'forbidden',
      'No se pudo actualizar la empresa: no existe o no tienes permiso sobre ella.',
    );
  }
  return data as Company;
}
