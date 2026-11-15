import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import {
  presignDocument,
  putToPresignedUrl,
  registerDocument,
  sha256OfFile,
} from '../checklist/api';
import { XLSX_MIME } from './types';
import type {
  IihAsset,
  IihAssetInput,
  IihAssetType,
  IihStage,
} from './types';

/** M5 — capa de datos IIH (F1-08a). CRUD por PostgREST bajo RLS; import por EF-09. */
export type IihErrorKind =
  | 'config'
  | 'auth'
  | 'forbidden'
  | 'conflict'
  | 'validation'
  | 'not_found'
  | 'network'
  | 'unknown';

export class IihApiError extends Error {
  readonly kind: IihErrorKind;
  readonly code?: string;
  readonly details?: unknown;
  readonly status?: number;

  constructor(
    kind: IihErrorKind,
    message: string,
    options: { code?: string; details?: unknown; status?: number } = {},
  ) {
    super(message);
    this.name = 'IihApiError';
    this.kind = kind;
    this.code = options.code;
    this.details = options.details;
    this.status = options.status;
  }
}

function kindForStatus(status: number, code?: string): IihErrorKind {
  if (status === 401 || code === 'AUTH_INVALID') return 'auth';
  if (status === 403 || code === 'FORBIDDEN_ROLE' || code === 'FORBIDDEN_NOT_MEMBER') return 'forbidden';
  if (status === 409 || code === 'CONFLICT_STATE') return 'conflict';
  if (status === 404 || code === 'NOT_FOUND') return 'not_found';
  if (status === 422 || (code ?? '').startsWith('VALIDATION')) return 'validation';
  return 'unknown';
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown; ref?: string };
}

function efError(status: number, body: unknown): IihApiError {
  const envelope = (body ?? {}) as ErrorEnvelope;
  const code = envelope.error?.code;
  return new IihApiError(
    kindForStatus(status, code),
    envelope.error?.message ??
      (status === 422
        ? 'El archivo no cumple la estructura de la plantilla IIH.'
        : status === 403
          ? 'No tienes permiso para importar el IIH de este diagnóstico.'
          : 'No fue posible completar la importación.'),
    { code, details: envelope.error?.details, status },
  );
}

function postgresError(error: { code?: string; message?: string } | null): IihApiError {
  const code = error?.code;
  if (code === '42501' || code === 'PGRST301') {
    return new IihApiError(
      'forbidden',
      'No tienes permiso sobre este inventario (RLS por membresía/rol del diagnóstico).',
      { code },
    );
  }
  return new IihApiError('unknown', 'No fue posible cargar el inventario.', { code });
}

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new IihApiError(
      'config',
      'La configuración de Supabase está incompleta en este despliegue.',
    );
  }
  return supabase;
}

/* ------------------------------------------------------------------------- */
/* Catálogos y diagnóstico                                                   */
/* ------------------------------------------------------------------------- */

export async function listStages(): Promise<IihStage[]> {
  const db = client();
  const { data, error } = await db
    .from('iih_stages')
    .select('code, nombre, orden')
    .order('orden', { ascending: true });
  if (error) throw postgresError(error);
  return (data ?? []) as unknown as IihStage[];
}

export async function listAssetTypes(): Promise<IihAssetType[]> {
  const db = client();
  const { data, error } = await db
    .from('iih_asset_types')
    .select('id, stage_code, code, nombre')
    .order('stage_code', { ascending: true })
    .order('code', { ascending: true });
  if (error) throw postgresError(error);
  return (data ?? []) as unknown as IihAssetType[];
}

export interface IihDiagnostic {
  id: string;
  folio: string | null;
  company_id: string | null;
  company_name: string | null;
  organization_id: string;
  diagnosticRole: 'coordinador' | 'equipo' | 'empresa' | 'organismo_operador' | 'observador' | null;
}

interface RawDiagnostic {
  id: string;
  folio: string | null;
  company_id: string | null;
  organization_id: string;
  companies: { razon_social: string } | { razon_social: string }[] | null;
}

function companyName(raw: RawDiagnostic): string | null {
  const company = Array.isArray(raw.companies) ? raw.companies[0] : raw.companies;
  return company?.razon_social ?? null;
}

async function rolesForUser(
  userId: string,
): Promise<Map<string, IihDiagnostic['diagnosticRole']>> {
  const db = client();
  const { data, error } = await db
    .from('project_members')
    .select('diagnostic_id, role')
    .eq('user_id', userId);
  if (error) throw postgresError(error);
  const roles = new Map<string, IihDiagnostic['diagnosticRole']>();
  for (const row of (data ?? []) as Array<{ diagnostic_id: string; role: IihDiagnostic['diagnosticRole'] }>) {
    roles.set(row.diagnostic_id, row.role);
  }
  return roles;
}

export async function listIihDiagnostics(userId: string): Promise<IihDiagnostic[]> {
  const db = client();
  const { data, error } = await db
    .from('diagnostics')
    .select('id, folio, company_id, organization_id, companies(razon_social)')
    .order('created_at', { ascending: false });
  if (error) throw postgresError(error);
  const roles = await rolesForUser(userId);
  return ((data ?? []) as unknown as RawDiagnostic[]).map((row) => ({
    id: row.id,
    folio: row.folio,
    company_id: row.company_id,
    company_name: companyName(row),
    organization_id: row.organization_id,
    diagnosticRole: roles.get(row.id) ?? null,
  }));
}

export async function getIihDiagnostic(
  diagnosticId: string,
  userId: string,
): Promise<IihDiagnostic | null> {
  const db = client();
  const { data, error } = await db
    .from('diagnostics')
    .select('id, folio, company_id, organization_id, companies(razon_social)')
    .eq('id', diagnosticId)
    .maybeSingle();
  if (error) throw postgresError(error);
  if (!data) return null;
  const roles = await rolesForUser(userId);
  const row = data as unknown as RawDiagnostic;
  return {
    id: row.id,
    folio: row.folio,
    company_id: row.company_id,
    company_name: companyName(row),
    organization_id: row.organization_id,
    diagnosticRole: roles.get(row.id) ?? null,
  };
}

/* ------------------------------------------------------------------------- */
/* Activos                                                                   */
/* ------------------------------------------------------------------------- */

interface RawAsset {
  id: string;
  diagnostic_id: string;
  folio: string;
  stage_code: string;
  asset_type_id: number;
  tag: string;
  ubicacion: string;
  capacidad: string | number | null;
  capacidad_unidad: string | null;
  potencia_kw: string | number | null;
  material: string | null;
  anio_instalacion: number | null;
  estado_fisico: IihAsset['estado_fisico'];
  opera: IihAsset['opera'];
  criticidad: IihAsset['criticidad'];
  respaldo: boolean;
  suficiencia: IihAsset['suficiencia'];
  mantenimiento_tipo: IihAsset['mantenimiento_tipo'];
  ultimo_servicio: string | null;
  intervencion: IihAsset['intervencion'];
  prioridad: IihAsset['prioridad'];
  observaciones: string | null;
  verificado_v1: boolean;
  updated_at: string;
  iih_asset_types: { nombre: string } | { nombre: string }[] | null;
}

function assetTypeName(raw: RawAsset): string | null {
  const type = Array.isArray(raw.iih_asset_types) ? raw.iih_asset_types[0] : raw.iih_asset_types;
  return type?.nombre ?? null;
}

function toNumber(value: string | number | null): string | null {
  return value === null ? null : String(value);
}

export async function listIihAssets(diagnosticId: string): Promise<IihAsset[]> {
  const db = client();
  const { data, error } = await db
    .from('iih_assets')
    .select(
      'id, diagnostic_id, folio, stage_code, asset_type_id, tag, ubicacion, capacidad, capacidad_unidad, potencia_kw, material, anio_instalacion, estado_fisico, opera, criticidad, respaldo, suficiencia, mantenimiento_tipo, ultimo_servicio, intervencion, prioridad, observaciones, verificado_v1, updated_at, iih_asset_types(nombre)',
    )
    .eq('diagnostic_id', diagnosticId)
    .order('stage_code', { ascending: true })
    .order('folio', { ascending: true });
  if (error) throw postgresError(error);
  return ((data ?? []) as unknown as RawAsset[]).map((row) => ({
    id: row.id,
    diagnostic_id: row.diagnostic_id,
    folio: row.folio,
    stage_code: row.stage_code,
    asset_type_id: row.asset_type_id,
    asset_type_name: assetTypeName(row),
    tag: row.tag,
    ubicacion: row.ubicacion,
    capacidad: toNumber(row.capacidad),
    capacidad_unidad: row.capacidad_unidad,
    potencia_kw: toNumber(row.potencia_kw),
    material: row.material,
    anio_instalacion: row.anio_instalacion,
    estado_fisico: row.estado_fisico,
    opera: row.opera,
    criticidad: row.criticidad,
    respaldo: row.respaldo,
    suficiencia: row.suficiencia,
    mantenimiento_tipo: row.mantenimiento_tipo,
    ultimo_servicio: row.ultimo_servicio,
    intervencion: row.intervencion,
    prioridad: row.prioridad,
    observaciones: row.observaciones,
    verificado_v1: row.verificado_v1,
    updated_at: row.updated_at,
  }));
}

function toPayload(input: IihAssetInput) {
  const numericOrNull = (value: string | null): number | null =>
    value === null || value.trim().length === 0 ? null : Number(value);
  return {
    stage_code: input.stage_code,
    asset_type_id: input.asset_type_id,
    tag: input.tag.trim(),
    ubicacion: input.ubicacion.trim(),
    capacidad: numericOrNull(input.capacidad),
    capacidad_unidad: input.capacidad_unidad?.trim() || null,
    potencia_kw: numericOrNull(input.potencia_kw),
    material: input.material?.trim() || null,
    anio_instalacion: input.anio_instalacion,
    estado_fisico: input.estado_fisico,
    opera: input.opera,
    criticidad: input.criticidad,
    respaldo: input.respaldo,
    suficiencia: input.suficiencia,
    mantenimiento_tipo: input.mantenimiento_tipo,
    ultimo_servicio: input.ultimo_servicio || null,
    intervencion: input.intervencion,
    prioridad: input.prioridad,
    observaciones: input.observaciones?.trim() || null,
    verificado_v1: input.verificado_v1,
  };
}

/**
 * Alta manual: `organization_id` viene del claim de sesión (no hay default en DB) y `folio`
 * lo asigna el trigger `trg_iih_folio` (nunca se envía). RLS decide si coord/equipo puede.
 */
export async function createIihAsset(
  diagnosticId: string,
  organizationId: string,
  input: IihAssetInput,
): Promise<IihAsset> {
  const db = client();
  const { data, error } = await db
    .from('iih_assets')
    .insert({
      diagnostic_id: diagnosticId,
      organization_id: organizationId,
      ...toPayload(input),
    })
    .select('id')
    .single();
  if (error) throw postgresError(error);
  const created = await listIihAssets(diagnosticId);
  const found = created.find((asset) => asset.id === (data as { id: string }).id);
  if (!found) {
    throw new IihApiError('unknown', 'El activo se creó pero no pudo releerse.');
  }
  return found;
}

/** Edición: no envía folio/organization_id/diagnostic_id/timestamps (server-side/inmutables). */
export async function updateIihAsset(assetId: string, input: IihAssetInput): Promise<void> {
  const db = client();
  const { data, error } = await db
    .from('iih_assets')
    .update(toPayload(input))
    .eq('id', assetId)
    .select('id')
    .maybeSingle();
  if (error) throw postgresError(error);
  if (!data) {
    throw new IihApiError(
      'forbidden',
      'No se pudo actualizar el activo: no existe o no tienes permiso (RLS).',
    );
  }
}

/* ------------------------------------------------------------------------- */
/* EF-09 — importación XLSX (kind='iih')                                     */
/* ------------------------------------------------------------------------- */

export interface IihImportResult {
  kind: string;
  destino_id: string;
  filas_ok: number;
  filas_rechazadas: Array<{ fila: number; razon: string }>;
  advertencias: string[];
}

async function accessToken(): Promise<string> {
  const db = client();
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new IihApiError('auth', 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.');
  }
  return token;
}

/**
 * Importa la plantilla XLSX reutilizando el flujo de documentos ya existente:
 * presign → PUT R2 → register (EF-08) → **EF-09 import** con el `document_id` registrado
 * (contrato F1-08b en revisión; aislado en `EF09_PATH` para ajustar si Lead/revisor mantiene
 * multipart). La estructura/columnas/filas las valida el servidor; la UI muestra el reporte.
 */
const EF09_PATH = 'ef-09-import/import/xlsx';

export async function importIihXlsx(
  diagnosticId: string,
  file: File,
): Promise<IihImportResult> {
  const mime = file.type || XLSX_MIME;
  const sha256 = await sha256OfFile(file);
  const presign = await presignDocument({
    diagnosticId,
    filename: file.name,
    docType: 'otro',
    mime,
    sizeBytes: file.size,
    exposureLevel: 'restringido_nda',
  });
  await putToPresignedUrl(presign.upload_url, file);
  const registered = await registerDocument({
    diagnosticId,
    documentId: presign.document_id,
    filename: file.name,
    docType: 'otro',
    mime,
    sizeBytes: file.size,
    exposureLevel: 'restringido_nda',
    sha256,
  });

  const token = await accessToken();
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/${EF09_PATH}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': globalThis.crypto?.randomUUID?.() ?? '',
      },
      body: JSON.stringify({
        diagnostic_id: diagnosticId,
        document_id: registered.document_id,
        kind: 'iih',
      }),
    });
  } catch {
    throw new IihApiError(
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
  if (!response.ok) throw efError(response.status, parsed);
  return parsed as IihImportResult;
}
