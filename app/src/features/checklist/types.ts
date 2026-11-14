/**
 * M3 — Checklist documental (F1-06a). Contrato `docs/02` §2.1 y `docs/04` EF-03/EF-08;
 * estados y transiciones según TD-2 (`docs/04` §TD-2). La autorización efectiva es
 * RLS/EF-03: la UI sólo muestra acciones y estados permitidos (no es autorización).
 */

export const ESTADOS = ['no_recibido', 'recibido', 'revisado', 'validado_r1'] as const;
export type ChecklistEstado = (typeof ESTADOS)[number];

export const ESTADO_LABEL: Record<ChecklistEstado, string> = {
  no_recibido: 'No recibido',
  recibido: 'Recibido',
  revisado: 'Revisado',
  validado_r1: 'Validado en R1',
};

export const ITEM_CODES = [
  'layout',
  'planos',
  'parametros_calidad',
  'iih',
  'balance_basico',
  'concesion',
  'permiso_descarga',
  'recibos',
  'lab_previos',
  'otra',
] as const;
export type ChecklistItemCode = (typeof ITEM_CODES)[number];

export const ITEM_LABEL: Record<ChecklistItemCode, string> = {
  layout: 'Layout de planta',
  planos: 'Planos hidrosanitarios',
  parametros_calidad: 'Parámetros de calidad',
  iih: 'Inventario de infraestructura hidráulica (IIH)',
  balance_basico: 'Balance hídrico básico',
  concesion: 'Título de concesión',
  permiso_descarga: 'Permiso de descarga',
  recibos: 'Recibos / comprobantes',
  lab_previos: 'Informes de laboratorio previos',
  otra: 'Otro documento',
};

/** `documents.doc_type` (allowlist EF-08) para el ítem de checklist. */
export const DOC_TYPE_FOR_ITEM: Record<ChecklistItemCode, string> = {
  layout: 'layout',
  planos: 'planos_hidrosanitarios',
  parametros_calidad: 'parametros_calidad',
  iih: 'otro',
  balance_basico: 'balance_basico',
  concesion: 'concesion',
  permiso_descarga: 'permiso_descarga',
  recibos: 'recibos',
  lab_previos: 'informe_laboratorio',
  otra: 'otro',
};

/** Rol por diagnóstico (`project_members.role`); TD-2 distingue coordinador/equipo/empresa. */
export type DiagnosticRole =
  | 'coordinador'
  | 'equipo'
  | 'empresa'
  | 'organismo_operador'
  | 'observador';

export interface ChecklistItem {
  id: string;
  diagnostic_id: string;
  item_code: ChecklistItemCode;
  estado: ChecklistEstado;
  document_id: string | null;
  solicitud_nota: string | null;
  updated_at: string;
  diagnostic: {
    id: string;
    folio: string | null;
    company_id: string | null;
    company_name: string | null;
  } | null;
  /** Rol del usuario en ese diagnóstico (de `project_members`); null si no es miembro. */
  diagnosticRole: DiagnosticRole | null;
}

/** MIME permitidos por EF-08 (`_shared/r2.ts`); el servidor vuelve a validar. */
export const MIME_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
  'image/tiff': 'TIFF',
  'image/heic': 'HEIC',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-excel': 'XLS',
  'image/vnd.dwg': 'DWG',
  'application/dwg': 'DWG',
  'application/acad': 'DWG',
  'application/x-ofx': 'OFX',
  'application/ofx': 'OFX',
};

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MIN_UPLOAD_BYTES = 1;

export const EXPOSURE_LABEL: Record<string, string> = {
  restringido_nda: 'Restringido (NDA)',
  anonimizado: 'Anonimizado',
  sintetico: 'Sintético',
  publico: 'Público',
};

/** Transición que la UI puede ofrecer según TD-2 (pista; EF-03/TD-2 es la autoridad). */
export interface TransitionOption {
  to: ChecklistEstado;
  label: string;
  /** `true` si exige `solicitud_nota` (TD-2 #4). */
  requiresNote?: boolean;
  /** `true` si exige `document_id` adjunto (TD-2 #3). */
  requiresDocument?: boolean;
}

export function availableTransitions(
  role: DiagnosticRole | null,
  item: Pick<ChecklistItem, 'estado' | 'document_id'>,
): TransitionOption[] {
  if (item.estado === 'validado_r1') return [];

  if (role === 'empresa') {
    if (item.estado === 'no_recibido') {
      return [{ to: 'recibido', label: 'Adjuntar documento y marcar recibido', requiresDocument: true }];
    }
    return [];
  }

  if (role === 'coordinador' || role === 'equipo') {
    const options: TransitionOption[] = [];
    if (item.estado === 'no_recibido') {
      options.push({ to: 'recibido', label: 'Solicitar documento', requiresNote: true });
    }
    if (item.estado === 'recibido') {
      options.push({ to: 'revisado', label: 'Marcar como revisado' });
    }
    if (item.estado === 'revisado' && role === 'coordinador') {
      options.push({ to: 'validado_r1', label: 'Validar en R1', requiresDocument: true });
    }
    return options;
  }

  return [];
}

export function isFileAllowed(file: File): string | null {
  if (file.size < MIN_UPLOAD_BYTES || file.size > MAX_UPLOAD_BYTES) {
    return 'El archivo debe pesar entre 1 byte y 100 MB.';
  }
  if (!MIME_LABELS[file.type]) {
    return 'Tipo de archivo no permitido (PDF, imágenes, XLSX/XLS, DWG u OFX).';
  }
  return null;
}
