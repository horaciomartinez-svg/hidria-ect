import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import type {
  FactorCode,
  FactorDraft,
  IvohCapture,
  IvohDiagnostic,
  IvohEvaluation,
  IvohFactor,
  IvohListRow,
  IvohRubric,
  IvohScore,
  IvohSemaforo,
} from './types';

/**
 * M8 — capa de datos del IVOH (F1-10a).
 *
 * Lecturas: diagnóstico/versión vigente, factores/rúbricas/semáforo, evaluaciones (SELECT por
 * membresía) y vistas `v_ivoh_capture`/`v_ivoh_score`. Escritura: **solo EF-06** (`score`,
 * `validate-r4`); no hay INSERT/UPDATE directo de `ivoh_evaluations` ni de `diagnostics`.
 */
export type IvohErrorKind =
  | 'config'
  | 'auth'
  | 'forbidden'
  | 'conflict'
  | 'validation'
  | 'not_found'
  | 'network'
  | 'unknown';

export class IvohApiError extends Error {
  readonly kind: IvohErrorKind;
  readonly code?: string;
  readonly details?: unknown;
  readonly status?: number;

  constructor(
    kind: IvohErrorKind,
    message: string,
    options: { code?: string; details?: unknown; status?: number } = {},
  ) {
    super(message);
    this.name = 'IvohApiError';
    this.kind = kind;
    this.code = options.code;
    this.details = options.details;
    this.status = options.status;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown; ref?: string };
}

function kindForStatus(status: number, code?: string): IvohErrorKind {
  if (status === 401 || code === 'AUTH_INVALID') return 'auth';
  if (status === 403 || code === 'FORBIDDEN_ROLE' || code === 'FORBIDDEN_NOT_MEMBER') return 'forbidden';
  if (status === 404 || code === 'NOT_FOUND') return 'not_found';
  if (
    status === 409 ||
    code === 'CONFLICT_STATE' ||
    code === 'CONFLICT_IVOH_VERSION' ||
    code === 'GATE_BHE_R3' ||
    code === 'GATE_R4_FICHA' ||
    code === 'GATE_FICHA' ||
    code === 'GATE_IVOH_R4'
  ) {
    return 'conflict';
  }
  if (status === 422 || (code ?? '').startsWith('VALIDATION')) return 'validation';
  return 'unknown';
}

function efError(status: number, body: unknown): IvohApiError {
  const envelope = (body ?? {}) as ErrorEnvelope;
  const code = envelope.error?.code;
  const fallback =
    code === 'GATE_BHE_R3'
      ? 'El IVOH requiere un BHE validado en R3.'
      : code === 'CONFLICT_IVOH_VERSION'
        ? 'La versión del índice cambió. Recarga antes de continuar.'
        : code === 'GATE_R4_FICHA'
          ? 'La ficha BIT-R4 cerrada es obligatoria para validar.'
          : 'No fue posible completar la operación del IVOH.';
  return new IvohApiError(kindForStatus(status, code), envelope.error?.message ?? fallback, {
    code,
    details: envelope.error?.details,
    status,
  });
}

function postgresError(error: { code?: string; message?: string } | null): IvohApiError {
  const code = error?.code;
  if (code === '42501' || code === 'PGRST301') {
    return new IvohApiError(
      'forbidden',
      'No tienes permiso sobre este IVOH (RLS por membresía del diagnóstico).',
      { code },
    );
  }
  return new IvohApiError('unknown', 'No fue posible cargar el IVOH.', { code });
}

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new IvohApiError(
      'config',
      'La configuración de Supabase está incompleta en este despliegue.',
    );
  }
  return supabase;
}

/* ------------------------------------------------------------------------- */
/* Lecturas                                                                  */
/* ------------------------------------------------------------------------- */

interface RawDiagnostic {
  id: string;
  folio: string | null;
  company_id: string | null;
  fase_actual: number;
  index_version_id: string | null;
  ivoh_actual: string | number | null;
  companies: { razon_social: string } | { razon_social: string }[] | null;
}

function companyName(raw: RawDiagnostic): string | null {
  const company = Array.isArray(raw.companies) ? raw.companies[0] : raw.companies;
  return company?.razon_social ?? null;
}

const DIAGNOSTIC_COLUMNS =
  'id, folio, company_id, fase_actual, index_version_id, ivoh_actual, companies(razon_social)';

async function rolesForUser(
  userId: string,
): Promise<Map<string, IvohDiagnostic['diagnosticRole']>> {
  const db = client();
  const { data, error } = await db
    .from('project_members')
    .select('diagnostic_id, role')
    .eq('user_id', userId);
  if (error) throw postgresError(error);
  const roles = new Map<string, IvohDiagnostic['diagnosticRole']>();
  for (const row of (data ?? []) as Array<{ diagnostic_id: string; role: IvohDiagnostic['diagnosticRole'] }>) {
    roles.set(row.diagnostic_id, row.role);
  }
  return roles;
}

function mapDiagnostic(raw: RawDiagnostic, role: IvohDiagnostic['diagnosticRole']): IvohDiagnostic {
  return {
    id: raw.id,
    folio: raw.folio,
    company_id: raw.company_id,
    company_name: companyName(raw),
    fase_actual: raw.fase_actual,
    index_version_id: raw.index_version_id,
    ivoh_actual: raw.ivoh_actual,
    diagnosticRole: role,
  };
}

export async function listIvohDiagnostics(userId: string): Promise<IvohListRow[]> {
  const db = client();
  const [{ data, error }, { data: versions, error: versionError }] = await Promise.all([
    db.from('diagnostics').select(DIAGNOSTIC_COLUMNS).order('created_at', { ascending: false }),
    db.from('ivoh_index_versions').select('id, version'),
  ]);
  if (error) throw postgresError(error);
  if (versionError) throw postgresError(versionError);
  const roles = await rolesForUser(userId);
  const versionNumbers = new Map<string, number>(
    ((versions ?? []) as Array<{ id: string; version: number }>).map((row) => [row.id, row.version]),
  );
  return ((data ?? []) as unknown as RawDiagnostic[]).map((row) => ({
    ...mapDiagnostic(row, roles.get(row.id) ?? null),
    version_number: row.index_version_id ? versionNumbers.get(row.index_version_id) ?? null : null,
  }));
}

export async function getIvohDiagnostic(
  diagnosticId: string,
  userId: string,
): Promise<IvohDiagnostic | null> {
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

export interface IvohContextData {
  diagnostic: IvohDiagnostic;
  versionNumber: number | null;
  factors: IvohFactor[];
  rubrics: IvohRubric[];
  semaforoCatalog: IvohSemaforo[];
  evaluations: IvohEvaluation[];
  validated: boolean;
  capture: IvohCapture | null;
  score: IvohScore | null;
}

export async function getIvohContext(
  diagnosticId: string,
  userId: string,
): Promise<IvohContextData | null> {
  const db = client();
  const diagnostic = await getIvohDiagnostic(diagnosticId, userId);
  if (!diagnostic) return null;
  const versionId = diagnostic.index_version_id;

  const [versionResult, factorsResult, rubricsResult, semaforoResult] = await Promise.all([
    versionId
      ? db.from('ivoh_index_versions').select('id, version').eq('id', versionId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    versionId
      ? db.from('ivoh_factors').select('version_id, factor_code, nombre, peso').eq('version_id', versionId)
      : Promise.resolve({ data: [], error: null }),
    db.from('ivoh_rubrics').select('factor_code, nivel_min, nivel_max, etiqueta, descripcion'),
    db.from('ivoh_semaforo').select('nivel, min_total, max_total, label, descripcion, orden').order('orden', { ascending: true }),
  ]);
  if (versionResult.error) throw postgresError(versionResult.error);
  if (factorsResult.error) throw postgresError(factorsResult.error);
  if (rubricsResult.error) throw postgresError(rubricsResult.error);
  if (semaforoResult.error) throw postgresError(semaforoResult.error);

  let evaluations: IvohEvaluation[] = [];
  if (versionId) {
    const { data: evaluationData, error: evaluationError } = await db
      .from('ivoh_evaluations')
      .select('diagnostic_id, version_id, factor_code, puntaje, justificacion, evidencia, estado, r4_logbook_id')
      .eq('diagnostic_id', diagnosticId)
      .eq('version_id', versionId);
    if (evaluationError) throw postgresError(evaluationError);
    evaluations = (evaluationData ?? []) as unknown as IvohEvaluation[];
  }

  const validated =
    evaluations.length === 6 && evaluations.every((evaluation) => evaluation.estado === 'validado_r4');

  let capture: IvohCapture | null = null;
  let score: IvohScore | null = null;
  if (versionId) {
    const source = validated ? 'v_ivoh_score' : 'v_ivoh_capture';
    const { data: scoreData, error: scoreError } = await db
      .from(source)
      .select('*')
      .eq('diagnostic_id', diagnosticId)
      .eq('version_id', versionId)
      .maybeSingle();
    if (scoreError) throw postgresError(scoreError);
    if (validated) score = (scoreData ?? null) as unknown as IvohScore | null;
    else capture = (scoreData ?? null) as unknown as IvohCapture | null;
  }

  return {
    diagnostic,
    versionNumber: (versionResult.data as { version?: number } | null)?.version ?? null,
    factors: ((factorsResult.data ?? []) as unknown as IvohFactor[]).sort((a, b) =>
      a.factor_code.localeCompare(b.factor_code),
    ),
    rubrics: (rubricsResult.data ?? []) as unknown as IvohRubric[],
    semaforoCatalog: (semaforoResult.data ?? []) as unknown as IvohSemaforo[],
    evaluations,
    validated,
    capture,
    score,
  };
}

/* ------------------------------------------------------------------------- */
/* EF-06 score / validate-r4                                                 */
/* ------------------------------------------------------------------------- */

async function accessToken(): Promise<string> {
  const db = client();
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new IvohApiError('auth', 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.');
  }
  return token;
}

export interface IvohScorePayload {
  factor_code: FactorCode;
  puntaje: number;
  justificacion: string;
  evidencia: Array<{ tipo: string; ref: string; descripcion?: string }>;
}

export interface IvohSaveResult {
  diagnostic_id: string;
  version_id: string;
  estado: 'borrador';
  factores_guardados: number;
}

async function callEf06<T>(
  diagnosticId: string,
  action: 'score' | 'validate-r4',
  body: Record<string, unknown>,
): Promise<T> {
  const token = await accessToken();
  let response: Response;
  try {
    response = await fetch(
      `${SUPABASE_URL}/functions/v1/ef-06-ivoh/ivoh/${diagnosticId}/${action}`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': globalThis.crypto?.randomUUID?.() ?? '',
        },
        body: JSON.stringify(body),
      },
    );
  } catch {
    throw new IvohApiError('network', 'No fue posible contactar el servidor de HIDRIA. Revisa tu conexión.');
  }
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) throw efError(response.status, parsed);
  return parsed as T;
}

/** Guarda un subconjunto 1–6 de factores (autosave parcial) vía EF-06. */
export async function saveIvohScores(
  diagnosticId: string,
  scores: IvohScorePayload[],
): Promise<IvohSaveResult> {
  return callEf06<IvohSaveResult>(diagnosticId, 'score', { scores });
}

/** Convierte el borrador de un factor al payload de EF-06. */
export function factorPayload(factor: FactorCode, draft: FactorDraft): IvohScorePayload {
  return {
    factor_code: factor,
    puntaje: Number(draft.puntaje),
    justificacion: draft.justificacion.trim(),
    evidencia: draft.evidencia.map((evidence) => ({
      tipo: evidence.tipo,
      ref: evidence.ref.trim(),
      ...(evidence.descripcion?.trim() ? { descripcion: evidence.descripcion.trim() } : {}),
    })),
  };
}

export interface IvohValidateResult {
  diagnostic_id: string;
  total: number;
  semaforo: 'rojo' | 'amarillo' | 'verde';
  semaforo_label: string;
  por_factor: Array<{
    factor_code: FactorCode;
    peso: number;
    puntaje: number;
    aportacion: number;
  }>;
}

export async function validateIvohR4(
  diagnosticId: string,
  r4LogbookId: string,
): Promise<IvohValidateResult> {
  return callEf06<IvohValidateResult>(diagnosticId, 'validate-r4', {
    r4_logbook_id: r4LogbookId,
  });
}
