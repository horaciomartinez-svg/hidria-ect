/**
 * M10 — Bitácora (fichas V1–V3/R1–R5), contrato docs/01 §4.10, ADR-016 y EF-02.
 *
 * La UI edita las hijas por RLS hasta el cierre, pero **no** decide estados, firmas, cierre ni
 * el plazo de 24 h: `submit-review`/`sign`/`close` van por EF-02 y `estado`/`cerrada_*`/`version`
 * son server-side. En una ficha cerrada todo es lectura.
 */

export const LOGBOOK_KEYS = ['V1', 'V2', 'V3', 'R1', 'R2', 'R3', 'R4', 'R5'] as const;
export type LogbookKey = (typeof LOGBOOK_KEYS)[number];

export type LogbookEstado = 'abierta' | 'en_revision' | 'cerrada';
export const ESTADO_LABEL: Record<LogbookEstado, string> = {
  abierta: 'Abierta',
  en_revision: 'En revisión',
  cerrada: 'Cerrada',
};

export const MODALIDADES = ['presencial', 'virtual', 'mixta'] as const;
export type Modalidad = (typeof MODALIDADES)[number];
export const MODALIDAD_LABEL: Record<Modalidad, string> = {
  presencial: 'Presencial',
  virtual: 'Virtual',
  mixta: 'Mixta',
};

export const AGENDA_ESTADOS = ['realizado', 'modificado', 'no_realizado'] as const;
export type AgendaEstado = (typeof AGENDA_ESTADOS)[number];
export const AGENDA_ESTADO_LABEL: Record<AgendaEstado, string> = {
  realizado: 'Realizado',
  modificado: 'Modificado',
  no_realizado: 'No realizado',
};

export interface LogbookTemplate {
  clave: LogbookKey;
  semana: number;
  tipo: 'visita' | 'reunion';
  titulo: string;
  duracion_horas: string | number | null;
  objetivo: string;
  asistentes_requeridos: string;
  agenda_items: unknown;
  evidence_items: unknown;
}

export interface LogbookEntry {
  id: string;
  organization_id: string;
  diagnostic_id: string;
  clave: LogbookKey;
  folio: string;
  responsable_sesion: string;
  fecha: string;
  horario_inicio: string;
  horario_fin: string | null;
  modalidad: Modalidad;
  lugar: string | null;
  estado: LogbookEstado;
  cerrada_en: string | null;
  cerrada_razon: string | null;
  version: number;
  cierre_tardio?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface LogbookParticipant {
  entry_id: string;
  nombre: string;
  cargo: string;
  institucion: string;
  contacto: string | null;
  firma_ts: string | null;
}

export interface LogbookAgendaRow {
  entry_id: string;
  no: number;
  actividad: string;
  responsable: string | null;
  resultado: string | null;
  estado: AgendaEstado;
}

export interface LogbookFinding {
  id: number;
  entry_id: string;
  tema: string | null;
  texto: string;
  links: unknown;
}

export interface LogbookAgreement {
  id: number;
  entry_id: string;
  compromiso: string;
  responsable: string;
  fecha: string;
  seguimiento: string | null;
  cerrado: boolean;
}

export interface LogbookEvidence {
  id: number;
  entry_id: string;
  item: string;
  document_id: string | null;
  folio: string | null;
  obligatorio: boolean;
}

export interface LogbookChangeLog {
  id: number;
  entry_id: string;
  version: number;
  descripcion: string;
  responsable: string;
  ts: string;
}

export interface LogbookDiagnostic {
  id: string;
  folio: string | null;
  company_name: string | null;
  fase_actual: number;
  bitacora_cerrada: boolean;
  diagnosticRole: 'coordinador' | 'equipo' | 'empresa' | 'organismo_operador' | 'observador' | null;
}

export interface LogbookListRow extends LogbookDiagnostic {
  entries: LogbookEntry[];
  p7_bitacoras: boolean | null;
}

export interface EntryCreateInput {
  clave: LogbookKey;
  fecha: string;
  horario_inicio: string;
  responsable_sesion: string;
  modalidad: Modalidad;
  lugar: string | null;
}

export interface EntryHeaderInput {
  fecha: string;
  horario_inicio: string;
  horario_fin: string | null;
  responsable_sesion: string;
  modalidad: Modalidad;
  lugar: string | null;
}

export function canWrite(role: LogbookDiagnostic['diagnosticRole']): boolean {
  return role === 'coordinador' || role === 'equipo';
}

export function canSign(entry: Pick<LogbookEntry, 'estado'>): boolean {
  return entry.estado === 'abierta' || entry.estado === 'en_revision';
}

export function canEditChildren(entry: Pick<LogbookEntry, 'estado'>): boolean {
  return entry.estado !== 'cerrada';
}

export function missingKeys(entries: LogbookEntry[]): LogbookKey[] {
  return LOGBOOK_KEYS.filter((key) => !entries.some((entry) => entry.clave === key));
}

/** 8/8: cada clave requerida con ≥1 cerrada y ninguna ficha de esas claves abierta/en revisión. */
export function gateCoverage(entries: LogbookEntry[]): { closed: boolean; covered: number } {
  const required = LOGBOOK_KEYS.every((key) => entries.some((entry) => entry.clave === key && entry.estado === 'cerrada'));
  const noOpen = entries.every((entry) => entry.estado === 'cerrada');
  const covered = LOGBOOK_KEYS.filter((key) => entries.some((entry) => entry.clave === key && entry.estado === 'cerrada')).length;
  return { closed: required && noOpen, covered };
}

export function sanitizeText(value: unknown, maxLength = 1000): string {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, maxLength);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  return value.slice(0, 5);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

export function agendaItemsFromTemplate(template: LogbookTemplate | null): Array<{ no: number; actividad: string }> {
  const raw = template?.agenda_items;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (typeof item === 'string') return { no: index + 1, actividad: item };
      if (typeof item === 'object' && item !== null) {
        const record = item as Record<string, unknown>;
        return {
          no: typeof record.no === 'number' ? record.no : index + 1,
          actividad: String(record.actividad ?? record.titulo ?? record.item ?? `Actividad ${index + 1}`),
        };
      }
      return { no: index + 1, actividad: `Actividad ${index + 1}` };
    })
    .sort((a, b) => a.no - b.no);
}

export function evidenceItemsFromTemplate(template: LogbookTemplate | null): Array<{ item: string; obligatorio: boolean }> {
  const raw = template?.evidence_items;
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    if (typeof item === 'string') return { item, obligatorio: true };
    if (typeof item === 'object' && item !== null) {
      const record = item as Record<string, unknown>;
      return {
        item: String(record.item ?? record.nombre ?? record.descripcion ?? `Evidencia ${index + 1}`),
        obligatorio: Boolean(record.obligatorio ?? true),
      };
    }
    return { item: `Evidencia ${index + 1}`, obligatorio: true };
  });
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
