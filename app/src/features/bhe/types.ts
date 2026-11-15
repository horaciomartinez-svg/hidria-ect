/**
 * M6 — BHE (Balance Hídrico Enriquecido), contrato `docs/01` §4.6, ADR-014 y EF-05.
 *
 * La UI captura los flujos mensuales por RLS y **no calcula ni decide la brecha**: los totales
 * y la brecha se leen de `v_bhe_monthly_capture`/`v_bhe_capture_summary` (captura) o
 * `v_bhe_monthly`/`v_bhe_summary` (post-R3). La validación R3 se delega a EF-05/RPC.
 */

export const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;
export const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const;

export type BheEstado = 'borrador' | 'en_captura' | 'validado_r3';
export const BHE_ESTADO_LABEL: Record<BheEstado, string> = {
  borrador: 'Borrador',
  en_captura: 'En captura',
  validado_r3: 'Validado en R3',
};

export const FLOW_GROUPS = [
  'entrada',
  'consumo_proceso',
  'consumo_general',
  'descarga',
  'perdida',
  'circular',
] as const;
export type FlowGroup = (typeof FLOW_GROUPS)[number];
export const FLOW_GROUP_LABEL: Record<FlowGroup, string> = {
  entrada: 'Entradas',
  consumo_proceso: 'Consumo de proceso',
  consumo_general: 'Consumo general',
  descarga: 'Descargas',
  perdida: 'Pérdidas',
  circular: 'Reúso / recirculación',
};

export const METODOS = [
  'macromedidor',
  'medidor_area',
  'ultrasonico',
  'aforo',
  'estimacion_documentada',
] as const;
export type MetodoEstimacion = (typeof METODOS)[number];
export const METODO_LABEL: Record<MetodoEstimacion, string> = {
  macromedidor: 'Macromedidor',
  medidor_area: 'Medidor de área',
  ultrasonico: 'Ultrasónico',
  aforo: 'Aforo',
  estimacion_documentada: 'Estimación documentada',
};

export interface BheCatalogFlow {
  code: string;
  grupo: FlowGroup;
  nombre: string;
  orden: number;
}

export interface BheFlow {
  balance_id: string;
  catalog_code: string;
  mes: number;
  volumen_m3: string;
  fuente_dato: string | null;
  comentario: string | null;
  metodo_estimacion: MetodoEstimacion | null;
}

export interface BheBalance {
  id: string;
  diagnostic_id: string;
  organization_id: string;
  periodo_anio: number;
  mes_inicio: number;
  fuente_origen: 'nativa' | 'importada_excel';
  estado: BheEstado;
  version: number;
  validado_r3_logbook_id: string | null;
  produccion_mensual: Array<number | null> | null;
  unidad_produccion: string | null;
  dias_operacion: number | null;
  dqo_mg_l: string | null;
  dbo5_mg_l: string | null;
  updated_at: string;
}

export interface BheMonthly {
  balance_id: string;
  mes: number;
  entradas_m3: string | number;
  destinos_m3: string | number;
  descargas_m3: string | number;
  perdidas_m3: string | number;
  circular_m3: string | number;
  brecha_m3: string | number;
  brecha_pct: string | number | null;
  flujos_count?: number;
  tiene_captura?: boolean;
}

export interface BheSummary {
  balance_id: string;
  entradas_anual_m3: string | number | null;
  destinos_anual_m3: string | number | null;
  descargas_anual_m3: string | number | null;
  perdidas_anual_m3: string | number | null;
  circular_anual_m3: string | number | null;
  brecha_anual_m3: string | number | null;
  brecha_anual_pct: string | number | null;
  brecha_max_mes_pct: string | number | null;
  meses_sobre_umbral: number | null;
  meses_con_captura: number | null;
  captura_completa: boolean | null;
  tiene_datos: boolean | null;
  /** Campo legado de `v_bhe_summary`; no canónico. */
  brecha_pct_promedio?: string | number | null;
}

export interface BheDiagnostic {
  id: string;
  folio: string | null;
  company_id: string | null;
  company_name: string | null;
  fase_actual: number;
  organization_id: string;
  diagnosticRole: 'coordinador' | 'equipo' | 'empresa' | 'organismo_operador' | 'observador' | null;
}

export interface BheListRow extends BheDiagnostic {
  balance: Pick<BheBalance, 'id' | 'estado' | 'version' | 'periodo_anio' | 'mes_inicio'> | null;
  summary: Pick<BheSummary, 'brecha_anual_pct' | 'brecha_max_mes_pct' | 'meses_sobre_umbral' | 'meses_con_captura' | 'captura_completa' | 'tiene_datos'> | null;
}

export function canCapture(role: BheDiagnostic['diagnosticRole']): boolean {
  return role === 'coordinador' || role === 'equipo';
}

export function canValidateR3(role: BheDiagnostic['diagnosticRole']): boolean {
  return role === 'coordinador' || role === 'equipo';
}

export function emptyFlowMap(flows: BheFlow[]): Record<string, BheFlow> {
  const map: Record<string, BheFlow> = {};
  for (const flow of flows) map[`${flow.catalog_code}:${flow.mes}`] = flow;
  return map;
}

export function flowKey(catalogCode: string, mes: number): string {
  return `${catalogCode}:${mes}`;
}

export function formatNumber(value: string | number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numeric)) return '—';
  return numeric.toLocaleString('es-MX', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function formatPct(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return `${formatNumber(value, 2)} %`;
}

/** Semáforo de presentación a partir del valor ya calculado server-side (no recalcula). */
export function gapTone(value: string | number | null | undefined): 'ok' | 'warn' | 'missing' {
  if (value === null || value === undefined || value === '') return 'missing';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numeric)) return 'missing';
  return numeric > 10 ? 'warn' : 'ok';
}

export function sanitizeText(value: unknown, maxLength = 300): string {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, maxLength);
}

export function validYear(value: string): boolean {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 2000 && numeric <= 2100;
}

export function validMonth(value: string): boolean {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 12;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
