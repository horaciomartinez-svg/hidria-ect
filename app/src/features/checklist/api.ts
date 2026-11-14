import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import {
  DOC_TYPE_FOR_ITEM,
  MAX_UPLOAD_BYTES,
  type ChecklistEstado,
  type ChecklistItem,
  type ChecklistItemCode,
  type DiagnosticRole,
} from './types';

/**
 * M3 — capa de datos del checklist documental (F1-06a).
 *
 * Lectura por PostgREST (RLS decide filas). Escrituras **solo por EF**: `presign`/`register`
 * (EF-08) y `transition` (EF-03, F1-06b). La UI nunca hace UPDATE directo de
 * `document_checklist_items`: TD-2/auditoría viven en EF-03.
 */
export type ChecklistErrorKind =
  | 'config'
  | 'auth'
  | 'forbidden'
  | 'conflict'
  | 'validation'
  | 'not_found'
  | 'network'
  | 'unknown';

export class ChecklistApiError extends Error {
  readonly kind: ChecklistErrorKind;
  readonly code?: string;
  readonly details?: unknown;
  readonly status?: number;

  constructor(
    kind: ChecklistErrorKind,
    message: string,
    options: { code?: string; details?: unknown; status?: number } = {},
  ) {
    super(message);
    this.name = 'ChecklistApiError';
    this.kind = kind;
    this.code = options.code;
    this.details = options.details;
    this.status = options.status;
  }
}

function errorKind(status: number, code: string | undefined): ChecklistErrorKind {
  if (code === 'AUTH_INVALID' || status === 401) return 'auth';
  if (
    code === 'FORBIDDEN_ROLE' ||
    code === 'FORBIDDEN_NOT_MEMBER' ||
    status === 403
  ) {
    return 'forbidden';
  }
  if (code === 'CONFLICT_STATE' || status === 409) return 'conflict';
  if (code === 'NOT_FOUND' || status === 404) return 'not_found';
  if (
    status === 422 ||
    (code !== undefined && (code.startsWith('VALIDATION') || code.startsWith('GATE')))
  ) {
    return 'validation';
  }
  return 'unknown';
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown; ref?: string };
}

/** Envelope de error de las EF (`{error:{code,message,details?,ref?}}`). */
function errorFromResponse(status: number, body: unknown): ChecklistApiError {
  const envelope = (body ?? {}) as ErrorEnvelope;
  const code = envelope.error?.code;
  const message =
    envelope.error?.message ??
    (status === 401
      ? 'Tu sesión no es válida o expiró.'
      : status === 403
        ? 'No tienes permiso para esta operación.'
        : status === 409
          ? 'La transición no es válida para el estado actual.'
          : 'No fue posible completar la operación.');
  return new ChecklistApiError(errorKind(status, code), message, {
    code,
    details: envelope.error?.details,
    status,
  });
}

function postgresError(error: { code?: string; message?: string } | null): ChecklistApiError {
  const code = error?.code;
  const kind: ChecklistErrorKind =
    code === '42501' || code === 'PGRST301' ? 'forbidden' : 'unknown';
  return new ChecklistApiError(
    kind,
    kind === 'forbidden'
      ? 'No tienes permiso para ver el checklist de este diagnóstico (RLS).'
      : 'No fue posible cargar el checklist.',
    { code },
  );
}

async function accessToken(): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new ChecklistApiError(
      'config',
      'La configuración de Supabase está incompleta en este despliegue.',
    );
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new ChecklistApiError('auth', 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.');
  }
  return token;
}

/** POST autenticado a una EF (mismo envelope de error que EF-08/EF-03). */
async function callFunction<T>(
  path: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const token = await accessToken();
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ChecklistApiError(
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
  if (!response.ok) throw errorFromResponse(response.status, parsed);
  return parsed as T;
}

interface RawChecklistRow {
  id: string;
  diagnostic_id: string;
  item_code: ChecklistItemCode;
  estado: ChecklistEstado;
  document_id: string | null;
  solicitud_nota: string | null;
  updated_at: string;
  diagnostics:
    | {
        id: string;
        folio: string | null;
        company_id: string | null;
        companies: { razon_social: string } | { razon_social: string }[] | null;
      }
    | Array<{
        id: string;
        folio: string | null;
        company_id: string | null;
        companies: { razon_social: string } | { razon_social: string }[] | null;
      }>
    | null;
}

function companyName(value: RawChecklistRow['diagnostics']): string | null {
  if (!value) return null;
  const diagnostic = Array.isArray(value) ? value[0] : value;
  if (!diagnostic) return null;
  const companies = diagnostic.companies;
  if (!companies) return null;
  const company = Array.isArray(companies) ? companies[0] : companies;
  return company?.razon_social ?? null;
}

function diagnosticId(value: RawChecklistRow['diagnostics']): string | null {
  if (!value) return null;
  const diagnostic = Array.isArray(value) ? value[0] : value;
  return diagnostic?.id ?? null;
}

function diagnosticFolio(value: RawChecklistRow['diagnostics']): string | null {
  if (!value) return null;
  const diagnostic = Array.isArray(value) ? value[0] : value;
  return diagnostic?.folio ?? null;
}

function diagnosticCompanyId(value: RawChecklistRow['diagnostics']): string | null {
  if (!value) return null;
  const diagnostic = Array.isArray(value) ? value[0] : value;
  return diagnostic?.company_id ?? null;
}

/** Ítems de checklist visibles por RLS + rol del usuario en cada diagnóstico. */
export async function listChecklistItems(userId: string): Promise<ChecklistItem[]> {
  if (!supabase) {
    throw new ChecklistApiError(
      'config',
      'La configuración de Supabase está incompleta en este despliegue.',
    );
  }
  const { data, error } = await supabase
    .from('document_checklist_items')
    .select(
      'id, diagnostic_id, item_code, estado, document_id, solicitud_nota, updated_at, diagnostics!inner(id, folio, company_id, companies(razon_social))',
    )
    .order('diagnostic_id', { ascending: true })
    .order('item_code', { ascending: true });
  if (error) throw postgresError(error);

  // Roles de diagnóstico del usuario (RLS `project_members_sel` permite leer miembros del diagnóstico).
  const { data: memberships, error: membershipError } = await supabase
    .from('project_members')
    .select('diagnostic_id, role')
    .eq('user_id', userId);
  if (membershipError) throw postgresError(membershipError);

  const roleByDiagnostic = new Map<string, DiagnosticRole>();
  for (const membership of (memberships ?? []) as Array<{
    diagnostic_id: string;
    role: DiagnosticRole;
  }>) {
    roleByDiagnostic.set(membership.diagnostic_id, membership.role);
  }

  return ((data ?? []) as unknown as RawChecklistRow[]).map((row) => ({
    id: row.id,
    diagnostic_id: row.diagnostic_id,
    item_code: row.item_code,
    estado: row.estado,
    document_id: row.document_id,
    solicitud_nota: row.solicitud_nota,
    updated_at: row.updated_at,
    diagnostic: {
      id: diagnosticId(row.diagnostics) ?? row.diagnostic_id,
      folio: diagnosticFolio(row.diagnostics),
      company_id: diagnosticCompanyId(row.diagnostics),
      company_name: companyName(row.diagnostics),
    },
    diagnosticRole: roleByDiagnostic.get(row.diagnostic_id) ?? null,
  }));
}

/* ------------------------------------------------------------------------- */
/* EF-08 — presign / PUT R2 / register                                       */
/* ------------------------------------------------------------------------- */

export interface PresignResult {
  upload_url: string;
  document_id: string;
  expira_en_seg: number;
  metodo: string;
}

export interface UploadDocumentInput {
  diagnosticId: string;
  filename: string;
  docType: string;
  mime: string;
  sizeBytes: number;
  exposureLevel: string;
}

export async function presignDocument(input: UploadDocumentInput): Promise<PresignResult> {
  return callFunction<PresignResult>('ef-08-documents/presign', {
    diagnostic_id: input.diagnosticId,
    filename: input.filename,
    doc_type: input.docType,
    mime: input.mime,
    size_bytes: input.sizeBytes,
    exposure_level: input.exposureLevel,
  });
}

export async function putToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    });
  } catch {
    throw new ChecklistApiError(
      'network',
      'No fue posible subir el archivo al almacenamiento. Revisa tu conexión.',
    );
  }
  if (!response.ok) {
    throw new ChecklistApiError(
      'unknown',
      'El almacenamiento rechazó el archivo. Intenta de nuevo.',
      { status: response.status },
    );
  }
}

export async function registerDocument(input: {
  diagnosticId: string;
  documentId: string;
  filename: string;
  docType: string;
  mime: string;
  sizeBytes: number;
  exposureLevel: string;
  sha256: string;
}): Promise<{ document_id: string; sha256: string }> {
  return callFunction<{ document_id: string; sha256: string }>(
    'ef-08-documents/register',
    {
      diagnostic_id: input.diagnosticId,
      document_id: input.documentId,
      filename: input.filename,
      doc_type: input.docType,
      mime: input.mime,
      size_bytes: input.sizeBytes,
      exposure_level: input.exposureLevel,
      sha256: input.sha256,
    },
  );
}

/** SHA-256 hex del archivo en el navegador (el registro lo declara; la EF valida tamaño/HEAD). */
export async function sha256OfFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/* ------------------------------------------------------------------------- */
/* EF-03 — transición de estado (F1-06b)                                     */
/* ------------------------------------------------------------------------- */

export interface TransitionResult {
  item_id: string;
  item_code: string;
  estado: ChecklistEstado;
  document_id: string | null;
}

export async function transitionChecklistItem(
  itemId: string,
  body: { to: ChecklistEstado; documentId?: string | null; solicitudNota?: string | null },
): Promise<TransitionResult> {
  return callFunction<TransitionResult>(
    `ef-03-checklist/checklist/${itemId}/transition`,
    {
      to: body.to,
      ...(body.documentId ? { document_id: body.documentId } : {}),
      ...(body.solicitudNota ? { solicitud_nota: body.solicitudNota } : {}),
    },
    // Idempotencia opcional por transición (EF-03 replay 200 sin duplicar efectos).
    globalThis.crypto?.randomUUID?.() ?? undefined,
  );
}

/**
 * Flujo completo de carga para el ítem (rol `empresa` o staff que adjunta):
 * presign → PUT R2 → register → EF-03 `recibido` con `document_id`.
 */
export async function uploadAndMarkReceived(
  item: ChecklistItem,
  file: File,
  exposureLevel = 'restringido_nda',
): Promise<{ documentId: string; transition: TransitionResult }> {
  if (!item.diagnostic) {
    throw new ChecklistApiError('validation', 'El ítem no tiene diagnóstico asociado.');
  }
  const docType = DOC_TYPE_FOR_ITEM[item.item_code];
  const sha256 = await sha256OfFile(file);
  const presign = await presignDocument({
    diagnosticId: item.diagnostic_id,
    filename: file.name,
    docType,
    mime: file.type,
    sizeBytes: file.size,
    exposureLevel,
  });
  await putToPresignedUrl(presign.upload_url, file);
  const registered = await registerDocument({
    diagnosticId: item.diagnostic_id,
    documentId: presign.document_id,
    filename: file.name,
    docType,
    mime: file.type,
    sizeBytes: file.size,
    exposureLevel,
    sha256,
  });
  const transition = await transitionChecklistItem(item.id, {
    to: 'recibido',
    documentId: registered.document_id,
  });
  return { documentId: registered.document_id, transition };
}

/** Límite de tamaño espejo (el servidor vuelve a validar). */
export const CLIENT_MAX_UPLOAD_BYTES = MAX_UPLOAD_BYTES;
