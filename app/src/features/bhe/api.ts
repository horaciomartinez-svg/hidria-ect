import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import {
  presignDocument,
  putToPresignedUrl,
  registerDocument,
  sha256OfFile,
} from '../checklist/api';
import { XLSX_MIME } from '../iih/types';
import type {
  BheBalance,
  BheCatalogFlow,
  BheDiagnostic,
  BheFlow,
  BheListRow,
  BheMonthly,
  BheSummary,
  MetodoEstimacion,
} from './types';

/**
 * M6 — capa de datos del BHE (F1-09a).
 *
 * Captura: `water_balances`/`balance_flows` por PostgREST bajo RLS; brecha/totales se leen de las
 * vistas (`v_bhe_monthly_capture`/`v_bhe_capture_summary` en captura; `v_bhe_monthly`/`v_bhe_summary`
 * post-R3). Validación R3 por EF-05. Import por EF-08→EF-09. La UI nunca actualiza estado/ficha/version.
 */
export type BheErrorKind =
  | 'config'
  | 'auth'
  | 'forbidden'
  | 'conflict'
  | 'validation'
  | 'not_found'
  | 'network'
  | 'unknown';

export class BheApiError extends Error {
  readonly kind: BheErrorKind;
  readonly code?: string;
  readonly details?: unknown;
  readonly status?: number;

  constructor(
    kind: BheErrorKind,
    message: string,
    options: { code?: string; details?: unknown; status?: number } = {},
  ) {
    super(message);
    this.name = 'BheApiError';
    this.kind = kind;
    this.code = options.code;
    this.details = options.details;
    this.status = options.status;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown; ref?: string };
}

function kindForStatus(status: number, code?: string): BheErrorKind {
  if (status === 401 || code === 'AUTH_INVALID') return 'auth';
  if (status === 403 || code === 'FORBIDDEN_ROLE' || code === 'FORBIDDEN_NOT_MEMBER') return 'forbidden';
  if (status === 404 || code === 'NOT_FOUND') return 'not_found';
  if (status === 409 || code === 'CONFLICT_STATE' || code === 'GATE_BHE_BRECHA' || code === 'GATE_R3_FICHA' || code === 'GATE_BHE_R3') return 'conflict';
  if (status === 422 || (code ?? '').startsWith('VALIDATION')) return 'validation';
  return 'unknown';
}

function efError(status: number, body: unknown): BheApiError {
  const envelope = (body ?? {}) as ErrorEnvelope;
  const code = envelope.error?.code;
  return new BheApiError(
    kindForStatus(status, code),
    envelope.error?.message ?? 'No fue posible completar la operación del BHE.',
    { code, details: envelope.error?.details, status },
  );
}

function postgresError(error: { code?: string; message?: string } | null): BheApiError {
  const code = error?.code;
  if (code === '42501' || code === 'PGRST301') {
    return new BheApiError(
      'forbidden',
      'No tienes permiso sobre este balance (RLS por membresía/rol del diagnóstico).',
      { code },
    );
  }
  if (code === '23505') {
    return new BheApiError('conflict', 'Ya existe un balance vigente para este diagnóstico.', { code });
  }
  return new BheApiError('unknown', 'No fue posible cargar el balance.', { code });
}

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new BheApiError(
      'config',
      'La configuración de Supabase está incompleta en este despliegue.',
    );
  }
  return supabase;
}

/* ------------------------------------------------------------------------- */
/* Diagnósticos / listado                                                    */
/* ------------------------------------------------------------------------- */

interface RawDiagnostic {
  id: string;
  folio: string | null;
  company_id: string | null;
  fase_actual: number;
  organization_id: string;
  companies: { razon_social: string } | { razon_social: string }[] | null;
}

function companyName(raw: RawDiagnostic): string | null {
  const company = Array.isArray(raw.companies) ? raw.companies[0] : raw.companies;
  return company?.razon_social ?? null;
}

async function rolesForUser(
  userId: string,
): Promise<Map<string, BheDiagnostic['diagnosticRole']>> {
  const db = client();
  const { data, error } = await db
    .from('project_members')
    .select('diagnostic_id, role')
    .eq('user_id', userId);
  if (error) throw postgresError(error);
  const roles = new Map<string, BheDiagnostic['diagnosticRole']>();
  for (const row of (data ?? []) as Array<{ diagnostic_id: string; role: BheDiagnostic['diagnosticRole'] }>) {
    roles.set(row.diagnostic_id, row.role);
  }
  return roles;
}

const DIAGNOSTIC_COLUMNS =
  'id, folio, company_id, fase_actual, organization_id, companies(razon_social)';

function mapDiagnostic(raw: RawDiagnostic, role: BheDiagnostic['diagnosticRole']): BheDiagnostic {
  return {
    id: raw.id,
    folio: raw.folio,
    company_id: raw.company_id,
    company_name: companyName(raw),
    fase_actual: raw.fase_actual,
    organization_id: raw.organization_id,
    diagnosticRole: role,
  };
}

const BALANCE_COLUMNS =
  'id, diagnostic_id, organization_id, periodo_anio, mes_inicio, fuente_origen, estado, version, validado_r3_logbook_id, produccion_mensual, unidad_produccion, dias_operacion, dqo_mg_l, dbo5_mg_l, updated_at';

const SUMMARY_LIST_COLUMNS =
  'balance_id, brecha_anual_pct, brecha_max_mes_pct, meses_sobre_umbral, meses_con_captura, captura_completa, tiene_datos';

/**
 * Columnas del resumen (captura y validado). D16/D17 fijan el mismo contrato para
 * `v_bhe_capture_summary` y `v_bhe_summary`; se listan explícitamente para no pedir columnas
 * inexistentes en la vista validada (B2).
 */
const SUMMARY_COLUMNS =
  'balance_id, entradas_anual_m3, destinos_anual_m3, descargas_anual_m3, perdidas_anual_m3, circular_anual_m3, brecha_anual_m3, brecha_anual_pct, brecha_max_mes_pct, meses_sobre_umbral, meses_con_captura, captura_completa, tiene_datos';

export async function listBheDiagnostics(userId: string): Promise<BheListRow[]> {
  const db = client();
  const { data, error } = await db
    .from('diagnostics')
    .select(DIAGNOSTIC_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw postgresError(error);
  const roles = await rolesForUser(userId);
  const rows = (data ?? []) as unknown as RawDiagnostic[];
  const diagnostics = rows.map((row) => mapDiagnostic(row, roles.get(row.id) ?? null));
  if (diagnostics.length === 0) return [];

  const ids = diagnostics.map((diagnostic) => diagnostic.id);
  const { data: balanceData, error: balanceError } = await db
    .from('water_balances')
    .select('id, diagnostic_id, estado, version, periodo_anio, mes_inicio')
    .in('diagnostic_id', ids)
    .order('version', { ascending: false });
  if (balanceError) throw postgresError(balanceError);

  const latestByDiagnostic = new Map<
    string,
    Pick<BheBalance, 'id' | 'estado' | 'version' | 'periodo_anio' | 'mes_inicio'>
  >();
  for (const row of (balanceData ?? []) as Array<{
    id: string;
    diagnostic_id: string;
    estado: BheBalance['estado'];
    version: number;
    periodo_anio: number;
    mes_inicio: number;
  }>) {
    if (!latestByDiagnostic.has(row.diagnostic_id)) {
      latestByDiagnostic.set(row.diagnostic_id, {
        id: row.id,
        estado: row.estado,
        version: row.version,
        periodo_anio: row.periodo_anio,
        mes_inicio: row.mes_inicio,
      });
    }
  }

  const balanceIds = [...latestByDiagnostic.values()].map((balance) => balance.id);
  let summaries = new Map<string, BheListRow['summary']>();
  if (balanceIds.length > 0) {
    const { data: summaryData, error: summaryError } = await db
      .from('v_bhe_capture_summary')
      .select(SUMMARY_LIST_COLUMNS)
      .in('balance_id', balanceIds);
    if (summaryError) throw postgresError(summaryError);
    summaries = new Map(
      ((summaryData ?? []) as unknown as Array<Record<string, unknown>>).map((row) => [
        String(row.balance_id),
        row as unknown as BheListRow['summary'],
      ]),
    );
  }

  return diagnostics.map((diagnostic) => {
    const balance = latestByDiagnostic.get(diagnostic.id) ?? null;
    return {
      ...diagnostic,
      balance,
      summary: balance ? summaries.get(balance.id) ?? null : null,
    };
  });
}

export async function getBheDiagnostic(
  diagnosticId: string,
  userId: string,
): Promise<BheDiagnostic | null> {
  const db = client();
  const { data, error } = await db
    .from('diagnostics')
    .select(DIAGNOSTIC_COLUMNS)
    .eq('id', diagnosticId)
    .maybeSingle();
  if (error) throw postgresError(error);
  if (!data) return null;
  const roles = await rolesForUser(userId);
  return mapDiagnostic(data as unknown as RawDiagnostic, roles.get(diagnosticId) ?? null);
}

/* ------------------------------------------------------------------------- */
/* Contexto del balance                                                      */
/* ------------------------------------------------------------------------- */

export interface BheContextData {
  diagnostic: BheDiagnostic;
  balance: BheBalance | null;
  catalog: BheCatalogFlow[];
  flows: BheFlow[];
  monthly: BheMonthly[];
  summary: BheSummary | null;
}

export async function getBheContext(
  diagnosticId: string,
  userId: string,
): Promise<BheContextData | null> {
  const db = client();
  const diagnostic = await getBheDiagnostic(diagnosticId, userId);
  if (!diagnostic) return null;

  const { data: catalogData, error: catalogError } = await db
    .from('balance_flow_catalog')
    .select('code, grupo, nombre, orden')
    .eq('activo', true)
    .order('orden', { ascending: true });
  if (catalogError) throw postgresError(catalogError);

  const { data: balanceData, error: balanceError } = await db
    .from('water_balances')
    .select(BALANCE_COLUMNS)
    .eq('diagnostic_id', diagnosticId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (balanceError) throw postgresError(balanceError);

  const balance = (balanceData ?? null) as unknown as BheBalance | null;
  if (!balance) {
    return {
      diagnostic,
      balance: null,
      catalog: (catalogData ?? []) as unknown as BheCatalogFlow[],
      flows: [],
      monthly: [],
      summary: null,
    };
  }

  const monthlyTable = balance.estado === 'validado_r3' ? 'v_bhe_monthly' : 'v_bhe_monthly_capture';
  const summaryTable = balance.estado === 'validado_r3' ? 'v_bhe_summary' : 'v_bhe_capture_summary';

  const [flowsResult, monthlyResult, summaryResult] = await Promise.all([
    db
      .from('balance_flows')
      .select('balance_id, catalog_code, mes, volumen_m3, fuente_dato, comentario, metodo_estimacion')
      .eq('balance_id', balance.id)
      .order('mes', { ascending: true })
      .order('catalog_code', { ascending: true }),
    db
      .from(monthlyTable)
      .select(
        'balance_id, mes, entradas_m3, destinos_m3, descargas_m3, perdidas_m3, circular_m3, brecha_m3, brecha_pct' +
          (balance.estado === 'validado_r3' ? '' : ', flujos_count, tiene_captura'),
      )
      .eq('balance_id', balance.id)
      .order('mes', { ascending: true }),
    db.from(summaryTable).select(SUMMARY_COLUMNS).eq('balance_id', balance.id).maybeSingle(),
  ]);
  if (flowsResult.error) throw postgresError(flowsResult.error);
  if (monthlyResult.error) throw postgresError(monthlyResult.error);
  if (summaryResult.error) throw postgresError(summaryResult.error);

  return {
    diagnostic,
    balance,
    catalog: (catalogData ?? []) as unknown as BheCatalogFlow[],
    flows: (flowsResult.data ?? []) as unknown as BheFlow[],
    monthly: (monthlyResult.data ?? []) as unknown as BheMonthly[],
    summary: (summaryResult.data ?? null) as unknown as BheSummary | null,
  };
}

/* ------------------------------------------------------------------------- */
/* Escritura de captura (RLS; nunca estado/ficha/version)                    */
/* ------------------------------------------------------------------------- */

/** Alta: solo diagnostic_id/periodo_anio/mes_inicio; triggers fijan org/version/borrador. */
export async function createBheBalance(
  diagnosticId: string,
  periodoAnio: number,
  mesInicio: number,
): Promise<BheBalance> {
  const db = client();
  const { data, error } = await db
    .from('water_balances')
    .insert({
      diagnostic_id: diagnosticId,
      periodo_anio: periodoAnio,
      mes_inicio: mesInicio,
    })
    .select('id, diagnostic_id, organization_id, periodo_anio, mes_inicio, fuente_origen, estado, version, validado_r3_logbook_id, produccion_mensual, unidad_produccion, dias_operacion, dqo_mg_l, dbo5_mg_l, updated_at')
    .single();
  if (error) throw postgresError(error);
  return data as unknown as BheBalance;
}

export interface BheFlowInput {
  volumen_m3: number;
  fuente_dato: string | null;
  comentario: string | null;
  metodo_estimacion: MetodoEstimacion | null;
}

/** Upsert de una celda flujo×mes bajo RLS; el trigger puede promover `borrador→en_captura`. */
export async function saveBheFlow(
  balanceId: string,
  catalogCode: string,
  mes: number,
  input: BheFlowInput,
): Promise<void> {
  const db = client();
  const { error } = await db.from('balance_flows').upsert(
    {
      balance_id: balanceId,
      catalog_code: catalogCode,
      mes,
      volumen_m3: input.volumen_m3,
      fuente_dato: input.fuente_dato,
      comentario: input.comentario,
      metodo_estimacion: input.metodo_estimacion,
    },
    { onConflict: 'balance_id,catalog_code,mes' },
  );
  if (error) throw postgresError(error);
}

/* ------------------------------------------------------------------------- */
/* EF-05 validate-r3                                                         */
/* ------------------------------------------------------------------------- */

async function accessToken(): Promise<string> {
  const db = client();
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new BheApiError('auth', 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.');
  }
  return token;
}

export interface BheValidateResult {
  balance_id: string;
  estado: 'validado_r3';
  brecha_anual_pct: number | null;
  brecha_max_mes_pct: number | null;
  meses_sobre_umbral: number;
}

export async function validateBheR3(
  balanceId: string,
  r3LogbookId: string,
): Promise<BheValidateResult> {
  const token = await accessToken();
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/ef-05-balances/balances/${balanceId}/validate-r3`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': globalThis.crypto?.randomUUID?.() ?? '',
      },
      body: JSON.stringify({ r3_logbook_id: r3LogbookId }),
    });
  } catch {
    throw new BheApiError('network', 'No fue posible contactar el servidor de HIDRIA. Revisa tu conexión.');
  }
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) throw efError(response.status, parsed);
  return parsed as BheValidateResult;
}

/* ------------------------------------------------------------------------- */
/* EF-09 kind='bhe' (presign → PUT → register → JSON)                        */
/* ------------------------------------------------------------------------- */

export interface BheImportResult {
  kind: string;
  destino_id: string;
  periodo_anio?: number;
  filas_ok: number;
  filas_rechazadas: Array<{ fila: number; razon: string }>;
  advertencias: string[];
}

export async function importBheXlsx(
  diagnosticId: string,
  periodoAnio: number,
  file: File,
): Promise<BheImportResult> {
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
    response = await fetch(`${SUPABASE_URL}/functions/v1/ef-09-import/import/xlsx`, {
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
        kind: 'bhe',
        periodo_anio: periodoAnio,
      }),
    });
  } catch {
    throw new BheApiError('network', 'No fue posible contactar el servidor de HIDRIA. Revisa tu conexión.');
  }
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) throw efError(response.status, parsed);
  return parsed as BheImportResult;
}
