/**
 * M4 — CAT (Cuestionario de Autoevaluación Técnica), banco A1-v1.
 *
 * Fuente del banco: `docs/03` §7 (`cat_items`, 47 preguntas, secciones A–H). La UI sólo
 * renderiza y captura; el submit/gate se resuelve en EF-04 (`docs/04` §EF-04) y la escritura
 * de `diagnostics.cat_estado` **no** se hace nunca desde el cliente.
 */

export const CAT_SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export type CatSection = (typeof CAT_SECTIONS)[number];

export const SECTION_LABEL: Record<CatSection, string> = {
  A: 'Generalidades de la empresa',
  B: 'Fuentes de abastecimiento',
  C: 'Usos y consumo de agua',
  D: 'Descargas y disposición final',
  E: 'Reúso y aprovechamiento',
  F: 'Gestión y gobernanza del agua',
  G: 'Riesgos y continuidad',
  H: 'Documentación y observaciones',
};

export type CatTipo = 'abierta' | 'breve' | 'opcion_unica' | 'multiple';
export type CatEstado = 'no_enviado' | 'en_captura' | 'en_revision' | 'validado_r2';

export const CAT_ESTADO_LABEL: Record<CatEstado, string> = {
  no_enviado: 'No enviado',
  en_captura: 'En captura',
  en_revision: 'En revisión (R2)',
  validado_r2: 'Validado en R2',
};

export interface CatCondition {
  depends_on?: string;
  contains?: string;
}

export interface CatItem {
  id: string;
  version: string;
  seccion: CatSection;
  codigo: string;
  enunciado: string;
  tipo: CatTipo;
  opciones: string[] | null;
  ayuda: string | null;
  admite_evidencia: boolean;
  condicion: CatCondition | null;
  orden: number;
}

export interface CatResponse {
  item_id: string;
  valor: unknown;
  no_se: boolean;
  na: boolean;
  document_id: string | null;
  updated_at: string;
}

/** Valor de captura local por pregunta. */
export interface AnswerState {
  valor: string | string[];
  no_se: boolean;
  na: boolean;
}

export interface CatDiagnostic {
  id: string;
  folio: string | null;
  cat_estado: CatEstado;
  company_id: string | null;
  company_name: string | null;
  diagnosticRole: 'coordinador' | 'equipo' | 'empresa' | 'organismo_operador' | 'observador' | null;
}

/** Etiqueta humana de opciones del seed (`snake_case` → texto). */
export function optionLabel(value: string): string {
  const normalized = value.replace(/_/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function itemLabel(item: Pick<CatItem, 'codigo' | 'seccion'>): string {
  return `${item.seccion}${item.codigo.replace(/^[A-H]/, '')}`;
}

/** Respuesta vacía. */
export function emptyAnswer(): AnswerState {
  return { valor: '', no_se: false, na: false };
}

/** Convierte fila de `cat_responses` a estado local. */
export function answerFromResponse(response: CatResponse | undefined): AnswerState {
  if (!response) return emptyAnswer();
  const valor = response.valor;
  if (Array.isArray(valor)) {
    return { valor: valor.filter((item): item is string => typeof item === 'string'), no_se: response.no_se, na: response.na };
  }
  if (typeof valor === 'string') {
    return { valor, no_se: response.no_se, na: response.na };
  }
  return { valor: '', no_se: response.no_se, na: response.na };
}

/** Serializa al payload de `cat_responses` (valor jsonb, no_se, na). */
export function answerPayload(answer: AnswerState): {
  valor: string | string[] | null;
  no_se: boolean;
  na: boolean;
} {
  if (answer.no_se || answer.na) return { valor: null, no_se: answer.no_se, na: answer.na };
  if (Array.isArray(answer.valor)) {
    return { valor: answer.valor.length > 0 ? answer.valor : null, no_se: false, na: false };
  }
  const trimmed = answer.valor.trim();
  return { valor: trimmed.length > 0 ? trimmed : null, no_se: false, na: false };
}

/** ¿La respuesta está completa (valor o `no_se`/`na` explícito)? */
export function isAnswered(answer: AnswerState | undefined): boolean {
  if (!answer) return false;
  if (answer.no_se || answer.na) return true;
  if (Array.isArray(answer.valor)) return answer.valor.length > 0;
  return answer.valor.trim().length > 0;
}

/**
 * Condición del banco (`{"depends_on":"B1","contains":"pozo"}`): la pregunta aplica si la
 * respuesta de `depends_on` incluye `contains`. Sin condición ⇒ aplica siempre. Si la pregunta
 * de la que depende aún no está respondida, no se considera aplicable (no bloquea el submit).
 */
export function isApplicable(
  item: CatItem,
  itemsByCode: Map<string, CatItem>,
  answers: Record<string, AnswerState>,
): boolean {
  const condition = item.condicion;
  if (!condition?.depends_on || !condition.contains) return true;
  const dependency = itemsByCode.get(condition.depends_on);
  if (!dependency) return true;
  const answer = answers[dependency.id];
  if (!answer || !isAnswered(answer)) return false;
  const value = answer.valor;
  const values = Array.isArray(value) ? value : [value];
  return values.some((candidate) => candidate.toLowerCase() === condition.contains!.toLowerCase());
}

export interface CatProgress {
  total: number;
  answered: number;
  applicable: CatItem[];
  missing: CatItem[];
  bySection: Array<{ section: CatSection; total: number; answered: number }>;
  percent: number;
}

/** Progreso por sección y global (sólo preguntas aplicables). */
export function computeProgress(
  items: CatItem[],
  answers: Record<string, AnswerState>,
): CatProgress {
  const byCode = new Map(items.map((item) => [item.codigo, item]));
  const applicable = items.filter((item) => isApplicable(item, byCode, answers));
  const missing = applicable.filter((item) => !isAnswered(answers[item.id]));
  const bySection = CAT_SECTIONS.map((section) => {
    const sectionItems = applicable.filter((item) => item.seccion === section);
    return {
      section,
      total: sectionItems.length,
      answered: sectionItems.filter((item) => isAnswered(answers[item.id])).length,
    };
  });
  return {
    total: applicable.length,
    answered: applicable.length - missing.length,
    applicable,
    missing,
    bySection,
    percent:
      applicable.length === 0
        ? 0
        : Math.round(((applicable.length - missing.length) / applicable.length) * 100),
  };
}

/** Roles que pueden capturar/envuar (submit) según EF-04/TD-1. */
export function canCapture(role: CatDiagnostic['diagnosticRole']): boolean {
  return role === 'coordinador' || role === 'equipo' || role === 'empresa';
}

/** Roles que pueden validar en R2. */
export function canValidateR2(role: CatDiagnostic['diagnosticRole']): boolean {
  return role === 'coordinador' || role === 'equipo';
}
