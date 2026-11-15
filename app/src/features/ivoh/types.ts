/**
 * M8 — IVOH (Índice de Valor de Optimización Hídrica), contrato docs/01 §4.8, ADR-015 y EF-06.
 *
 * La UI captura los 6 factores y guarda borrador vía EF-06 `score`; total/semáforo/serie/radial
 * se leen de `v_ivoh_capture` (borrador) o `v_ivoh_score` (post-R4). **La UI nunca calcula el
 * IVOH ni el semáforo**; el label sale del catálogo/vista.
 */

export const FACTOR_CODES = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'] as const;
export type FactorCode = (typeof FACTOR_CODES)[number];

export const EVIDENCE_TYPES = ['documento', 'activo', 'indicador', 'ficha'] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  documento: 'Documento',
  activo: 'Activo IIH',
  indicador: 'Indicador',
  ficha: 'Ficha de bitácora',
};

export interface IvohEvidence {
  tipo: EvidenceType;
  ref: string;
  descripcion?: string;
}

export interface IvohFactor {
  version_id: string;
  factor_code: FactorCode;
  nombre: string;
  peso: string | number;
}

export interface IvohRubric {
  factor_code: FactorCode;
  nivel_min: number;
  nivel_max: number;
  etiqueta: string;
  descripcion: string;
}

export interface IvohSemaforo {
  nivel: 'rojo' | 'amarillo' | 'verde';
  min_total: string | number;
  max_total: string | number | null;
  label: string;
  descripcion: string;
  orden: number;
}

export interface IvohEvaluation {
  diagnostic_id: string;
  version_id: string;
  factor_code: FactorCode;
  puntaje: string | number;
  justificacion: string | null;
  evidencia: IvohEvidence[] | null;
  estado: 'borrador' | 'validado_r4';
  r4_logbook_id: string | null;
}

export interface IvohPorFactor {
  factor_code: FactorCode;
  peso: string | number;
  puntaje: string | number;
  aportacion: string | number;
}

export interface IvohCapture {
  diagnostic_id: string;
  version_id: string;
  factores_guardados: number;
  completo: boolean;
  /** D16 usa `total`; `ivoh` queda como alias por compatibilidad de vista. */
  total?: string | number | null;
  ivoh?: string | number | null;
  semaforo: 'rojo' | 'amarillo' | 'verde' | null;
  semaforo_label: string | null;
  por_factor: IvohPorFactor[] | null;
  serie_factores: Record<string, string | number> | null;
}

export interface IvohScore extends Omit<IvohCapture, 'factores_guardados' | 'completo' | 'total'> {
  ivoh: string | number;
  total?: string | number;
}

export interface IvohDiagnostic {
  id: string;
  folio: string | null;
  company_id: string | null;
  company_name: string | null;
  fase_actual: number;
  index_version_id: string | null;
  ivoh_actual: string | number | null;
  diagnosticRole: 'coordinador' | 'equipo' | 'empresa' | 'organismo_operador' | 'observador' | null;
}

export interface IvohListRow extends IvohDiagnostic {
  version_number: number | null;
}

export interface FactorDraft {
  puntaje: string;
  justificacion: string;
  evidencia: IvohEvidence[];
}

export function canCapture(role: IvohDiagnostic['diagnosticRole']): boolean {
  return role === 'coordinador' || role === 'equipo';
}

export function canValidateR4(role: IvohDiagnostic['diagnosticRole']): boolean {
  return role === 'coordinador' || role === 'equipo';
}

export function emptyDraft(): FactorDraft {
  return { puntaje: '', justificacion: '', evidencia: [] };
}

export function draftFromEvaluation(evaluation: IvohEvaluation | undefined): FactorDraft {
  if (!evaluation) return emptyDraft();
  const evidence = Array.isArray(evaluation.evidencia) ? evaluation.evidencia : [];
  return {
    puntaje: String(evaluation.puntaje ?? ''),
    justificacion: evaluation.justificacion ?? '',
    evidencia: evidence.filter(
      (item): item is IvohEvidence =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as IvohEvidence).tipo === 'string' &&
        typeof (item as IvohEvidence).ref === 'string',
    ),
  };
}

/** Puntaje 0–10 en pasos de 0.5. */
export function validScore(value: string): boolean {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10) return false;
  return Math.abs(numeric * 2 - Math.round(numeric * 2)) < 1e-9;
}

export function validateDraft(draft: FactorDraft): string | null {
  if (!validScore(draft.puntaje)) return 'El puntaje debe estar entre 0 y 10 en pasos de 0.5.';
  if (draft.justificacion.trim().length === 0) return 'La justificación es obligatoria.';
  if (draft.evidencia.length === 0) return 'Agrega al menos una evidencia.';
  if (draft.evidencia.some((item) => item.ref.trim().length === 0)) {
    return 'Cada evidencia debe tener una referencia.';
  }
  if (draft.evidencia.some((item) => !EVIDENCE_TYPES.includes(item.tipo))) {
    return 'El tipo de evidencia no es válido.';
  }
  return null;
}

export function formatScore(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numeric)) return '—';
  return numeric.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function weightLabel(value: string | number): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value);
}

export function evidenceLabel(evidence: IvohEvidence): string {
  return `${EVIDENCE_TYPE_LABEL[evidence.tipo] ?? evidence.tipo}: ${evidence.ref}`;
}

export function sanitizeText(value: unknown, maxLength = 500): string {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, maxLength);
}

export function rubricForPuntaje(rubrics: IvohRubric[], factor: FactorCode, puntaje: string): IvohRubric | null {
  const numeric = Number(puntaje);
  if (!Number.isFinite(numeric)) return null;
  return (
    rubrics.find(
      (rubric) => rubric.factor_code === factor && numeric >= rubric.nivel_min && numeric <= rubric.nivel_max,
    ) ?? null
  );
}

/** Entradas de la serie para el radial (solo datos ya calculados por el servidor). */
export function serieEntries(
  serie: Record<string, string | number> | null | undefined,
): Array<{ factor: FactorCode; puntaje: number }> {
  if (!serie) return [];
  return FACTOR_CODES.flatMap((factor) => {
    const value = serie[factor];
    if (value === undefined || value === null) return [];
    const numeric = Number(value);
    return Number.isFinite(numeric) ? [{ factor, puntaje: numeric }] : [];
  });
}

export function porFactorMap(porFactor: IvohPorFactor[] | null | undefined): Map<string, IvohPorFactor> {
  const map = new Map<string, IvohPorFactor>();
  for (const item of porFactor ?? []) map.set(item.factor_code, item);
  return map;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
