import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import type { AnswerState, CatDiagnostic, CatEstado, CatItem, CatResponse } from './types';
import { answerPayload } from './types';

/**
 * M4 — capa de datos del CAT (F1-07a).
 *
 * Lectura de banco/diagnóstico/respuestas por PostgREST (RLS decide). El **borrador** se
 * guarda en `cat_responses` bajo RLS (`cat_empresa_write`/`cat_empresa_update`); el
 * **submit/validate-r2 va por EF-04** y `diagnostics.cat_estado` nunca se actualiza desde el
 * cliente (EF-04/trigger son la autoridad).
 */
export type CatErrorKind =
  | 'config'
  | 'auth'
  | 'forbidden'
  | 'conflict'
  | 'validation'
  | 'not_found'
  | 'network'
  | 'unknown';

export class CatApiError extends Error {
  readonly kind: CatErrorKind;
  readonly code?: string;
  readonly details?: unknown;
  readonly status?: number;

  constructor(
    kind: CatErrorKind,
    message: string,
    options: { code?: string; details?: unknown; status?: number } = {},
  ) {
    super(message);
    this.name = 'CatApiError';
    this.kind = kind;
    this.code = options.code;
    this.details = options.details;
    this.status = options.status;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown; ref?: string };
}

function kindForStatus(status: number, code?: string): CatErrorKind {
  if (status === 401 || code === 'AUTH_INVALID') return 'auth';
  if (status === 403 || code === 'FORBIDDEN_ROLE' || code === 'FORBIDDEN_NOT_MEMBER') {
    return 'forbidden';
  }
  if (status === 409 || code === 'CONFLICT_STATE' || code === 'GATE_R2_FICHA') return 'conflict';
  if (status === 404 || code === 'NOT_FOUND') return 'not_found';
  if (status === 422 || (code ?? '').startsWith('VALIDATION')) return 'validation';
  return 'unknown';
}

function catError(status: number, body: unknown): CatApiError {
  const envelope = (body ?? {}) as ErrorEnvelope;
  const code = envelope.error?.code;
  const message =
    envelope.error?.message ??
    (status === 422
      ? 'El cuestionario tiene respuestas incompletas o inválidas.'
      : status === 409
        ? 'El estado del CAT no permite esta acción.'
        : status === 403
          ? 'No tienes permiso para esta acción sobre el CAT.'
          : 'No fue posible completar la operación del CAT.');
  return new CatApiError(kindForStatus(status, code), message, {
    code,
    details: envelope.error?.details,
    status,
  });
}

function postgresError(error: { code?: string; message?: string } | null): CatApiError {
  const code = error?.code;
  if (code === '42501' || code === 'PGRST301') {
    return new CatApiError(
      'forbidden',
      'No tienes permiso sobre este CAT (RLS por membresía de diagnóstico).',
      { code },
    );
  }
  return new CatApiError('unknown', 'No fue posible cargar el CAT.', { code });
}

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new CatApiError(
      'config',
      'La configuración de Supabase está incompleta en este despliegue.',
    );
  }
  return supabase;
}

/* ------------------------------------------------------------------------- */
/* Lecturas                                                                  */
/* ------------------------------------------------------------------------- */

interface RawItem {
  id: string;
  version: string;
  seccion: CatItem['seccion'];
  codigo: string;
  enunciado: string;
  tipo: CatItem['tipo'];
  opciones: string[] | null;
  ayuda: string | null;
  admite_evidencia: boolean;
  condicion: CatItem['condicion'];
  orden: number;
}

/** Banco A1-v1 (47 preguntas) en orden de sección/orden. */
export async function listCatItems(): Promise<CatItem[]> {
  const db = client();
  const { data, error } = await db
    .from('cat_items')
    .select('id, version, seccion, codigo, enunciado, tipo, opciones, ayuda, admite_evidencia, condicion, orden')
    .eq('version', 'A1-v1')
    .order('seccion', { ascending: true })
    .order('orden', { ascending: true });
  if (error) throw postgresError(error);
  return (data ?? []) as unknown as RawItem[];
}

/** Respuestas guardadas del diagnóstico. */
export async function listCatResponses(diagnosticId: string): Promise<CatResponse[]> {
  const db = client();
  const { data, error } = await db
    .from('cat_responses')
    .select('item_id, valor, no_se, na, document_id, updated_at')
    .eq('diagnostic_id', diagnosticId);
  if (error) throw postgresError(error);
  return (data ?? []) as unknown as CatResponse[];
}

interface RawDiagnostic {
  id: string;
  folio: string | null;
  cat_estado: CatEstado;
  company_id: string | null;
  companies: { razon_social: string } | { razon_social: string }[] | null;
}

function companyName(raw: RawDiagnostic): string | null {
  const company = raw.companies;
  if (!company) return null;
  const value = Array.isArray(company) ? company[0] : company;
  return value?.razon_social ?? null;
}

async function rolesForUser(userId: string): Promise<Map<string, CatDiagnostic['diagnosticRole']>> {
  const db = client();
  const { data, error } = await db
    .from('project_members')
    .select('diagnostic_id, role')
    .eq('user_id', userId);
  if (error) throw postgresError(error);
  const roles = new Map<string, CatDiagnostic['diagnosticRole']>();
  for (const row of (data ?? []) as Array<{ diagnostic_id: string; role: CatDiagnostic['diagnosticRole'] }>) {
    roles.set(row.diagnostic_id, row.role);
  }
  return roles;
}

/** Diagnósticos visibles por RLS con su estado de CAT y rol del usuario. */
export async function listCatDiagnostics(userId: string): Promise<CatDiagnostic[]> {
  const db = client();
  const { data, error } = await db
    .from('diagnostics')
    .select('id, folio, cat_estado, company_id, companies(razon_social)')
    .order('created_at', { ascending: false });
  if (error) throw postgresError(error);
  const roles = await rolesForUser(userId);
  return ((data ?? []) as unknown as RawDiagnostic[]).map((row) => ({
    id: row.id,
    folio: row.folio,
    cat_estado: row.cat_estado,
    company_id: row.company_id,
    company_name: companyName(row),
    diagnosticRole: roles.get(row.id) ?? null,
  }));
}

export async function getCatDiagnostic(
  diagnosticId: string,
  userId: string,
): Promise<CatDiagnostic | null> {
  const db = client();
  const { data, error } = await db
    .from('diagnostics')
    .select('id, folio, cat_estado, company_id, companies(razon_social)')
    .eq('id', diagnosticId)
    .maybeSingle();
  if (error) throw postgresError(error);
  if (!data) return null;
  const roles = await rolesForUser(userId);
  const row = data as unknown as RawDiagnostic;
  return {
    id: row.id,
    folio: row.folio,
    cat_estado: row.cat_estado,
    company_id: row.company_id,
    company_name: companyName(row),
    diagnosticRole: roles.get(row.id) ?? null,
  };
}

/* ------------------------------------------------------------------------- */
/* Borrador (cat_responses bajo RLS)                                         */
/* ------------------------------------------------------------------------- */

/**
 * Guarda/actualiza una respuesta. La UI no envía `created_by` en updates (se conserva el
 * autor original) y nunca toca `diagnostics.cat_estado`.
 */
export async function saveCatAnswer(input: {
  diagnosticId: string;
  itemId: string;
  userId: string;
  answer: AnswerState;
  exists: boolean;
}): Promise<CatResponse> {
  const db = client();
  const payload = answerPayload(input.answer);
  if (input.exists) {
    const { data, error } = await db
      .from('cat_responses')
      .update(payload)
      .eq('diagnostic_id', input.diagnosticId)
      .eq('item_id', input.itemId)
      .select('item_id, valor, no_se, na, document_id, updated_at')
      .single();
    if (error) throw postgresError(error);
    return data as unknown as CatResponse;
  }
  const { data, error } = await db
    .from('cat_responses')
    .insert({
      diagnostic_id: input.diagnosticId,
      item_id: input.itemId,
      created_by: input.userId,
      ...payload,
    })
    .select('item_id, valor, no_se, na, document_id, updated_at')
    .single();
  if (error) throw postgresError(error);
  return data as unknown as CatResponse;
}

/* ------------------------------------------------------------------------- */
/* EF-04 — submit / validate-r2                                              */
/* ------------------------------------------------------------------------- */

async function accessToken(): Promise<string> {
  const db = client();
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new CatApiError('auth', 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.');
  }
  return token;
}

async function callEf04<T>(
  diagnosticId: string,
  action: 'submit' | 'validate-r2',
  body: Record<string, unknown> = {},
  idempotencyKey?: string,
): Promise<T> {
  const token = await accessToken();
  let response: Response;
  try {
    response = await fetch(
      `${SUPABASE_URL}/functions/v1/ef-04-cat/cat/${diagnosticId}/${action}`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
      },
    );
  } catch {
    throw new CatApiError(
      'network',
      'No fue posible contactar el servidor de HIDRIA. Revisa tu conexión.',
    );
  }
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) throw catError(response.status, parsed);
  return parsed as T;
}

export interface CatSubmitResult {
  diagnostic_id: string;
  cat_estado: CatEstado;
  pendientes: number;
}

export async function submitCat(diagnosticId: string): Promise<CatSubmitResult> {
  return callEf04<CatSubmitResult>(
    diagnosticId,
    'submit',
    {},
    globalThis.crypto?.randomUUID?.(),
  );
}

/** `validate-r2` exige la ficha BIT-R2 cerrada del diagnóstico. */
export async function validateCatR2(
  diagnosticId: string,
  r2LogbookId: string,
): Promise<CatSubmitResult> {
  return callEf04<CatSubmitResult>(
    diagnosticId,
    'validate-r2',
    { r2_logbook_id: r2LogbookId },
    globalThis.crypto?.randomUUID?.(),
  );
}
