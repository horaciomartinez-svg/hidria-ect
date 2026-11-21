import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import {
  presignDocument,
  putToPresignedUrl,
  registerDocument,
  sha256OfFile,
} from '../checklist/api';
import type {
  AgendaEstado,
  EntryCreateInput,
  EntryHeaderInput,
  LogbookAgreement,
  LogbookAgendaRow,
  LogbookChangeLog,
  LogbookDiagnostic,
  LogbookEntry,
  LogbookEvidence,
  LogbookFinding,
  LogbookListRow,
  LogbookParticipant,
  LogbookTemplate,
} from './types';

/**
 * M10 — capa de datos de la Bitácora (F1-11a).
 *
 * Entradas y hijas se editan por PostgREST bajo RLS hasta el cierre; `submit-review`/`sign`/`close`
 * van por EF-02. La UI nunca escribe `estado`/`cerrada_*`/`version`/`folio`/`organization_id`.
 */
export type LogbookErrorKind =
  | 'config'
  | 'auth'
  | 'forbidden'
  | 'conflict'
  | 'validation'
  | 'not_found'
  | 'network'
  | 'unknown';

export class LogbookApiError extends Error {
  readonly kind: LogbookErrorKind;
  readonly code?: string;
  readonly details?: unknown;
  readonly status?: number;

  constructor(
    kind: LogbookErrorKind,
    message: string,
    options: { code?: string; details?: unknown; status?: number } = {},
  ) {
    super(message);
    this.name = 'LogbookApiError';
    this.kind = kind;
    this.code = options.code;
    this.details = options.details;
    this.status = options.status;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown; ref?: string };
}

function kindForStatus(status: number, code?: string): LogbookErrorKind {
  if (status === 401 || code === 'AUTH_INVALID') return 'auth';
  if (status === 403 || code === 'FORBIDDEN_ROLE' || code === 'FORBIDDEN_NOT_MEMBER') return 'forbidden';
  if (status === 404 || code === 'NOT_FOUND') return 'not_found';
  if (
    status === 409 ||
    code === 'CONFLICT_STATE' ||
    code === 'GATE_BHE_R3' ||
    code === 'CONFLICT_LOGBOOK_STATE'
  ) {
    return 'conflict';
  }
  if (status === 422 || (code ?? '').startsWith('VALIDATION')) return 'validation';
  return 'unknown';
}

function efError(status: number, body: unknown): LogbookApiError {
  const envelope = (body ?? {}) as ErrorEnvelope;
  const code = envelope.error?.code;
  return new LogbookApiError(
    kindForStatus(status, code),
    envelope.error?.message ?? 'No fue posible completar la operación de la bitácora.',
    { code, details: envelope.error?.details, status },
  );
}

function postgresError(error: { code?: string; message?: string } | null): LogbookApiError {
  const code = error?.code;
  if (code === '42501' || code === 'PGRST301') {
    return new LogbookApiError(
      'forbidden',
      'No tienes permiso sobre esta bitácora (RLS/guard por membresía y estado).',
      { code },
    );
  }
  if (code === '23505') {
    return new LogbookApiError('conflict', 'Ya existe una ficha con ese folio o clave.', { code });
  }
  return new LogbookApiError('unknown', 'No fue posible cargar la bitácora.', { code });
}

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new LogbookApiError(
      'config',
      'La configuración de Supabase está incompleta en este despliegue.',
    );
  }
  return supabase;
}

const DIAGNOSTIC_COLUMNS =
  'id, folio, fase_actual, bitacora_cerrada, companies(razon_social)';

interface RawDiagnostic {
  id: string;
  folio: string | null;
  fase_actual: number;
  bitacora_cerrada: boolean;
  companies: { razon_social: string } | { razon_social: string }[] | null;
}

const ENTRY_COLUMNS =
  'id, organization_id, diagnostic_id, clave, folio, responsable_sesion, fecha, horario_inicio, horario_fin, modalidad, lugar, estado, cerrada_en, cerrada_razon, version, cierre_tardio, created_at, updated_at';

async function rolesForUser(
  userId: string,
): Promise<Map<string, LogbookDiagnostic['diagnosticRole']>> {
  const db = client();
  const { data, error } = await db
    .from('project_members')
    .select('diagnostic_id, role')
    .eq('user_id', userId);
  if (error) throw postgresError(error);
  const roles = new Map<string, LogbookDiagnostic['diagnosticRole']>();
  for (const row of (data ?? []) as Array<{ diagnostic_id: string; role: LogbookDiagnostic['diagnosticRole'] }>) {
    roles.set(row.diagnostic_id, row.role);
  }
  return roles;
}

function companyName(raw: RawDiagnostic): string | null {
  const company = Array.isArray(raw.companies) ? raw.companies[0] : raw.companies;
  return company?.razon_social ?? null;
}

export async function listBitacora(userId: string): Promise<LogbookListRow[]> {
  const db = client();
  const { data, error } = await db
    .from('diagnostics')
    .select(DIAGNOSTIC_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw postgresError(error);
  const roles = await rolesForUser(userId);
  const diagnostics = ((data ?? []) as unknown as RawDiagnostic[]).map((row) => ({
    id: row.id,
    folio: row.folio,
    company_name: companyName(row),
    fase_actual: row.fase_actual,
    bitacora_cerrada: row.bitacora_cerrada,
    diagnosticRole: roles.get(row.id) ?? null,
  }));
  if (diagnostics.length === 0) return [];
  const ids = diagnostics.map((diagnostic) => diagnostic.id);

  const [entriesResult, completenessResult] = await Promise.all([
    db.from('logbook_entries').select(ENTRY_COLUMNS).in('diagnostic_id', ids),
    db.from('v_diagnostic_completeness').select('diagnostic_id, p7_bitacoras').in('diagnostic_id', ids),
  ]);
  if (entriesResult.error) throw postgresError(entriesResult.error);
  if (completenessResult.error) throw postgresError(completenessResult.error);

  const entries = (entriesResult.data ?? []) as unknown as LogbookEntry[];
  const completeness = new Map(
    ((completenessResult.data ?? []) as Array<{ diagnostic_id: string; p7_bitacoras: boolean }>).map(
      (row) => [row.diagnostic_id, row.p7_bitacoras],
    ),
  );

  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    entries: entries
      .filter((entry) => entry.diagnostic_id === diagnostic.id)
      .sort((a, b) => a.clave.localeCompare(b.clave)),
    p7_bitacoras: completeness.get(diagnostic.id) ?? null,
  }));
}

export interface BitacoraListData {
  diagnostics: LogbookListRow[];
  templates: LogbookTemplate[];
}

export async function getBitacoraList(userId: string): Promise<BitacoraListData> {
  const diagnostics = await listBitacora(userId);
  const db = client();
  const { data, error } = await db
    .from('logbook_templates')
    .select('clave, semana, tipo, titulo, duracion_horas, objetivo, asistentes_requeridos, agenda_items, evidence_items')
    .order('semana', { ascending: true });
  if (error) throw postgresError(error);
  return {
    diagnostics,
    templates: (data ?? []) as unknown as LogbookTemplate[],
  };
}

export interface BitacoraEntryContext {
  entry: LogbookEntry;
  diagnostic: LogbookDiagnostic;
  template: LogbookTemplate | null;
  participants: LogbookParticipant[];
  agenda: LogbookAgendaRow[];
  findings: LogbookFinding[];
  agreements: LogbookAgreement[];
  evidence: LogbookEvidence[];
  changeLog: LogbookChangeLog[];
  p7Bitacoras: boolean | null;
}

export async function getBitacoraEntry(
  entryId: string,
  userId: string,
): Promise<BitacoraEntryContext | null> {
  const db = client();
  const { data: entryData, error: entryError } = await db
    .from('logbook_entries')
    .select(ENTRY_COLUMNS)
    .eq('id', entryId)
    .maybeSingle();
  if (entryError) throw postgresError(entryError);
  if (!entryData) return null;
  const entry = entryData as unknown as LogbookEntry;

  const [diagnosticResult, roles, participantsResult, agendaResult, findingsResult, agreementsResult, evidenceResult, changeLogResult, completenessResult] =
    await Promise.all([
      db.from('diagnostics').select(DIAGNOSTIC_COLUMNS).eq('id', entry.diagnostic_id).maybeSingle(),
      rolesForUser(userId),
      db.from('logbook_participants').select('entry_id, nombre, cargo, institucion, contacto, firma_ts').eq('entry_id', entryId).order('nombre', { ascending: true }),
      db.from('logbook_agenda').select('entry_id, no, actividad, responsable, resultado, estado').eq('entry_id', entryId).order('no', { ascending: true }),
      db.from('logbook_findings').select('id, entry_id, tema, texto, links').eq('entry_id', entryId).order('id', { ascending: true }),
      db.from('logbook_agreements').select('id, entry_id, compromiso, responsable, fecha, seguimiento, cerrado').eq('entry_id', entryId).order('id', { ascending: true }),
      db.from('logbook_evidence').select('id, entry_id, item, document_id, folio, obligatorio').eq('entry_id', entryId).order('id', { ascending: true }),
      db.from('logbook_change_log').select('id, entry_id, version, descripcion, responsable, ts').eq('entry_id', entryId).order('version', { ascending: true }),
      db.from('v_diagnostic_completeness').select('p7_bitacoras').eq('diagnostic_id', entry.diagnostic_id).maybeSingle(),
    ]);
  if (diagnosticResult.error) throw postgresError(diagnosticResult.error);
  if (!diagnosticResult.data) return null;
  if (participantsResult.error) throw postgresError(participantsResult.error);
  if (agendaResult.error) throw postgresError(agendaResult.error);
  if (findingsResult.error) throw postgresError(findingsResult.error);
  if (agreementsResult.error) throw postgresError(agreementsResult.error);
  if (evidenceResult.error) throw postgresError(evidenceResult.error);
  if (changeLogResult.error) throw postgresError(changeLogResult.error);
  if (completenessResult.error) throw postgresError(completenessResult.error);

  const rawDiagnostic = diagnosticResult.data as unknown as RawDiagnostic;
  const diagnostic: LogbookDiagnostic = {
    id: rawDiagnostic.id,
    folio: rawDiagnostic.folio,
    company_name: companyName(rawDiagnostic),
    fase_actual: rawDiagnostic.fase_actual,
    bitacora_cerrada: rawDiagnostic.bitacora_cerrada,
    diagnosticRole: roles.get(entry.diagnostic_id) ?? null,
  };

  const { data: templateData, error: templateError } = await db
    .from('logbook_templates')
    .select('clave, semana, tipo, titulo, duracion_horas, objetivo, asistentes_requeridos, agenda_items, evidence_items')
    .eq('clave', entry.clave)
    .maybeSingle();
  if (templateError) throw postgresError(templateError);

  return {
    entry,
    diagnostic,
    template: (templateData ?? null) as unknown as LogbookTemplate | null,
    participants: (participantsResult.data ?? []) as unknown as LogbookParticipant[],
    agenda: (agendaResult.data ?? []) as unknown as LogbookAgendaRow[],
    findings: (findingsResult.data ?? []) as unknown as LogbookFinding[],
    agreements: (agreementsResult.data ?? []) as unknown as LogbookAgreement[],
    evidence: (evidenceResult.data ?? []) as unknown as LogbookEvidence[],
    changeLog: (changeLogResult.data ?? []) as unknown as LogbookChangeLog[],
    p7Bitacoras: (completenessResult.data as { p7_bitacoras?: boolean } | null)?.p7_bitacoras ?? null,
  };
}

/* ------------------------------------------------------------------------- */
/* Escrituras de captura (RLS)                                               */
/* ------------------------------------------------------------------------- */

export async function createLogbookEntry(
  diagnosticId: string,
  input: EntryCreateInput,
): Promise<LogbookEntry> {
  const db = client();
  const { data, error } = await db
    .from('logbook_entries')
    .insert({
      diagnostic_id: diagnosticId,
      clave: input.clave,
      fecha: input.fecha,
      horario_inicio: input.horario_inicio,
      responsable_sesion: input.responsable_sesion.trim(),
      modalidad: input.modalidad,
      lugar: input.lugar?.trim() || null,
    })
    .select(ENTRY_COLUMNS)
    .single();
  if (error) throw postgresError(error);
  return data as unknown as LogbookEntry;
}

export async function updateLogbookEntry(
  entryId: string,
  input: EntryHeaderInput,
): Promise<void> {
  const db = client();
  const { error } = await db
    .from('logbook_entries')
    .update({
      fecha: input.fecha,
      horario_inicio: input.horario_inicio,
      horario_fin: input.horario_fin || null,
      responsable_sesion: input.responsable_sesion.trim(),
      modalidad: input.modalidad,
      lugar: input.lugar?.trim() || null,
    })
    .eq('id', entryId);
  if (error) throw postgresError(error);
}

export async function addParticipant(
  entryId: string,
  input: { nombre: string; cargo: string; institucion: string; contacto: string | null },
): Promise<void> {
  const db = client();
  const { error } = await db.from('logbook_participants').insert({
    entry_id: entryId,
    nombre: input.nombre.trim(),
    cargo: input.cargo.trim(),
    institucion: input.institucion.trim(),
    contacto: input.contacto?.trim() || null,
  });
  if (error) throw postgresError(error);
}

export async function removeParticipant(entryId: string, nombre: string): Promise<void> {
  const db = client();
  const { error } = await db
    .from('logbook_participants')
    .delete()
    .eq('entry_id', entryId)
    .eq('nombre', nombre);
  if (error) throw postgresError(error);
}

export async function updateAgendaRow(
  entryId: string,
  no: number,
  patch: { responsable: string | null; resultado: string | null; estado: AgendaEstado },
): Promise<void> {
  const db = client();
  const { error } = await db
    .from('logbook_agenda')
    .update({
      responsable: patch.responsable?.trim() || null,
      resultado: patch.resultado?.trim() || null,
      estado: patch.estado,
    })
    .eq('entry_id', entryId)
    .eq('no', no);
  if (error) throw postgresError(error);
}

export async function addFinding(
  entryId: string,
  input: { tema: string | null; texto: string },
): Promise<void> {
  const db = client();
  const { error } = await db.from('logbook_findings').insert({
    entry_id: entryId,
    tema: input.tema?.trim() || null,
    texto: input.texto.trim(),
    links: [],
  });
  if (error) throw postgresError(error);
}

export async function deleteFinding(findingId: number): Promise<void> {
  const db = client();
  const { error } = await db.from('logbook_findings').delete().eq('id', findingId);
  if (error) throw postgresError(error);
}

export async function addAgreement(
  entryId: string,
  input: { compromiso: string; responsable: string; fecha: string; seguimiento: string | null; cerrado: boolean },
): Promise<void> {
  const db = client();
  const { error } = await db.from('logbook_agreements').insert({
    entry_id: entryId,
    compromiso: input.compromiso.trim(),
    responsable: input.responsable.trim(),
    fecha: input.fecha,
    seguimiento: input.seguimiento?.trim() || null,
    cerrado: input.cerrado,
  });
  if (error) throw postgresError(error);
}

export async function deleteAgreement(agreementId: number): Promise<void> {
  const db = client();
  const { error } = await db.from('logbook_agreements').delete().eq('id', agreementId);
  if (error) throw postgresError(error);
}

export async function attachEvidenceDocument(evidenceId: number, documentId: string): Promise<void> {
  const db = client();
  const { error } = await db
    .from('logbook_evidence')
    .update({ document_id: documentId })
    .eq('id', evidenceId);
  if (error) throw postgresError(error);
}

/* ------------------------------------------------------------------------- */
/* EF-02 submit-review / sign / close                                        */
/* ------------------------------------------------------------------------- */

async function accessToken(): Promise<string> {
  const db = client();
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new LogbookApiError('auth', 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.');
  }
  return token;
}

async function callEf02<T>(
  entryId: string,
  action: 'submit-review' | 'sign' | 'close',
  body: Record<string, unknown>,
): Promise<T> {
  const token = await accessToken();
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/ef-02-logbook/logbook/${entryId}/${action}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': globalThis.crypto?.randomUUID?.() ?? '',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LogbookApiError(
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
  return parsed as T;
}

export interface LogbookActionResult {
  entry_id: string;
  folio: string;
  clave?: string;
  estado?: string;
  participante?: string;
  firma_ts?: string;
  cerrada_en?: string;
  version?: number;
  cierre_tardio?: boolean;
}

export async function submitLogbookReview(entryId: string): Promise<LogbookActionResult> {
  return callEf02<LogbookActionResult>(entryId, 'submit-review', {});
}

export async function signLogbookParticipant(entryId: string, participante: string): Promise<LogbookActionResult> {
  return callEf02<LogbookActionResult>(entryId, 'sign', { participante });
}

export async function closeLogbookEntry(
  entryId: string,
  cierreRazon: string | null,
): Promise<LogbookActionResult> {
  return callEf02<LogbookActionResult>(entryId, 'close', {
    ...(cierreRazon && cierreRazon.trim().length > 0 ? { cierre_razon: cierreRazon.trim() } : {}),
  });
}

/* ------------------------------------------------------------------------- */
/* Evidencia: EF-08 presign/register + update RLS                            */
/* ------------------------------------------------------------------------- */

export async function uploadEvidenceDocument(
  diagnosticId: string,
  file: File,
): Promise<string> {
  const sha256 = await sha256OfFile(file);
  const mime = file.type || 'application/octet-stream';
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
  return registered.document_id;
}
