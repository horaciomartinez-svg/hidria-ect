import type { GlobalRole } from '../lib/auth/claims';

/**
 * Registro de módulos M1–M13 (F1-02).
 *
 * Cada entrada es la **ruta canónica del módulo** y declara el contrato que
 * consumirá (`docs/04`: EF, vista o tabla con RLS), la fase de entrega y los
 * roles institucionales previstos en la UI. Las pantallas reales sustituyen al
 * placeholder en las tareas de cada módulo; el contrato citado no se inventa.
 *
 * Roles: son sólo visibilidad de navegación; la autorización efectiva está en
 * RLS y en las Edge Functions (`docs/04` §2.1).
 */

export type Phase = 'F1' | 'F2' | 'F3';
export type ModuleId =
  | 'M1'
  | 'M2'
  | 'M3'
  | 'M4'
  | 'M5'
  | 'M6'
  | 'M7'
  | 'M8'
  | 'M9'
  | 'M10'
  | 'M11'
  | 'M12'
  | 'M13';

export interface ModuleDef {
  id: ModuleId;
  path: string;
  title: string;
  short: string;
  summary: string;
  phase: Phase;
  /**
   * Matiz cuando ADR-003 reparte el módulo entre dos fases (p. ej. M7 mínimo en F1 y
   * dictamen completo en F2). No sustituye a `phase`: la aclara en la UI.
   */
  phaseNote?: string;
  /** Contrato consumido, citado de `docs/04` / `docs/02`. */
  contract: string;
  roles: readonly GlobalRole[];
}

const OPERACION: readonly GlobalRole[] = [
  'admin_institucional',
  'coordinador_srhds',
  'equipo',
  'observador',
];

const EQUIPO: readonly GlobalRole[] = ['admin_institucional', 'coordinador_srhds', 'equipo'];

const TODOS: readonly GlobalRole[] = [
  'admin_institucional',
  'coordinador_srhds',
  'equipo',
  'empresa',
  'observador',
  'invitado',
];

export const MODULES: readonly ModuleDef[] = [
  {
    id: 'M11',
    path: '/kanban',
    title: 'Tablero de diagnósticos',
    short: 'Kanban',
    summary: 'Cada tarjeta es el diagnóstico de una empresa; columnas = fases del cronograma.',
    phase: 'F1',
    contract: 'docs/04 §7 (canal org:{id} · kanban_refresh) · EF-01 advance-phase',
    roles: OPERACION,
  },
  {
    id: 'M1',
    path: '/empresas',
    title: 'Registro de empresas',
    short: 'Empresas',
    summary: 'Alta y expediente maestro de la empresa atendida y sus contrapartes.',
    phase: 'F1',
    contract: 'tabla companies (RLS por organización) · folio de diagnóstico server-side',
    // Lectura para todos los roles autenticados: las filas las decide RLS (una `empresa`
    // con membresía lee su empresa; `invitado` sin membresía no verá filas). La escritura
    // se gatea aparte en las rutas de alta/edición (COMPANY_WRITE_ROLES).
    roles: TODOS,
  },
  {
    id: 'M2',
    path: '/diagnosticos',
    title: 'Diagnósticos y gates',
    short: 'Diagnósticos',
    summary: 'Objeto rector: fases 1–6, gates por entregable y reprogramación de hitos.',
    phase: 'F1',
    contract: 'EF-01 advance-phase · EF-12 reprogram-milestone · v_diagnostic_completeness',
    roles: TODOS,
  },
  {
    id: 'M3',
    path: '/documentos',
    title: 'Repositorio documental',
    short: 'Documentos',
    summary: 'Carga con URL prefirmada, versiones y lista de cotejo validada en R1.',
    phase: 'F1',
    contract: 'EF-08 documents/presign+register · EF-03 checklist/transition',
    roles: TODOS,
  },
  {
    id: 'M4',
    path: '/cat',
    title: 'CAT digital',
    short: 'CAT',
    summary: 'Cuestionario de Análisis Técnico (secciones A–H) con guardado parcial.',
    phase: 'F1',
    contract: 'EF-04 cat/submit · cat/validate-r2 · cat_responses',
    roles: TODOS,
  },
  {
    id: 'M5',
    path: '/iih',
    title: 'Inventario de infraestructura hidráulica',
    short: 'IIH',
    summary: 'Activos por etapa con folio, verificación en V1 y resumen F5.',
    phase: 'F2',
    contract: 'EF-09 import/xlsx · iih_assets',
    roles: EQUIPO,
  },
  {
    id: 'M6',
    path: '/bhe',
    title: 'Balance hídrico enriquecido',
    short: 'BHE',
    summary: 'Doce meses, destinos, reúso/calidad, brecha > 10 % y validación R3.',
    phase: 'F1',
    contract: 'EF-05 balances/validate-r3 · v_bhe_monthly · v_bhe_summary',
    roles: EQUIPO,
  },
  {
    id: 'M7',
    path: '/muestreo',
    title: 'Muestreo y cadena de custodia',
    short: 'Muestreo',
    summary: 'Muestras, tres transferencias firmadas y dictamen de laboratorio.',
    phase: 'F1',
    phaseNote: 'F1 mínimo / F2 completo',
    contract: 'EF-10 samples/dictamen · custody_transfers',
    roles: EQUIPO,
  },
  {
    id: 'M8',
    path: '/ivoh',
    title: 'Motor IVOH',
    short: 'IVOH',
    summary: 'Fichas F1–F6 con evidencia, radial de seis ejes y semáforo institucional.',
    phase: 'F1',
    contract: 'EF-06 ivoh/score · validate-r4 · v_ivoh_score',
    roles: EQUIPO,
  },
  {
    id: 'M9',
    path: '/reporte',
    title: 'Reporte y Plan de Acción',
    short: 'Reporte',
    summary: 'Matriz de completitud 10/10, emisión con folio -R1 y Plan de Acción.',
    phase: 'F1',
    phaseNote: 'esencial en F1 · avanzado en F3',
    contract: 'EF-07 emit-report · v_diagnostic_completeness',
    roles: TODOS,
  },
  {
    id: 'M10',
    path: '/bitacora',
    title: 'Bitácora de trabajo',
    short: 'Bitácora',
    summary: 'Ocho fichas V1–V3 y R1–R5 con firmas y cierre dentro de 24 h.',
    phase: 'F1',
    contract: 'EF-02 logbook/close · logbook_entries',
    roles: TODOS,
  },
  {
    id: 'M12',
    path: '/aula',
    title: 'Aula MD-OHI',
    short: 'Aula',
    summary: 'Curso del Taller, examen calificado en servidor e insignia OB3.',
    phase: 'F2',
    contract: 'EF-11 quiz/submit · v_quiz_questions (sin columna correcta)',
    roles: TODOS,
  },
  {
    id: 'M13',
    path: '/informes',
    title: 'Informes e indicadores',
    short: 'Informes',
    summary: 'Tablero agregado del Programa, sólo datos anonimizados.',
    phase: 'F3',
    contract: 'docs/04 §9 (vistas analíticas con security_invoker) · agregados anonimizados',
    roles: OPERACION,
  },
];

export interface NavGroup {
  label: string;
  modules: readonly ModuleId[];
}

/** Agrupación del menú lateral por flujo de trabajo. */
export const NAV_GROUPS: readonly NavGroup[] = [
  { label: 'Operación', modules: ['M11', 'M1', 'M2'] },
  { label: 'Diagnóstico', modules: ['M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'] },
  { label: 'Programa', modules: ['M12', 'M13'] },
];

export function moduleById(id: ModuleId): ModuleDef {
  const found = MODULES.find((module) => module.id === id);
  if (!found) throw new Error(`Módulo no registrado: ${id}`);
  return found;
}

export function moduleByPath(pathname: string): ModuleDef | undefined {
  return MODULES.find(
    (module) => pathname === module.path || pathname.startsWith(`${module.path}/`),
  );
}

export function modulesForRole(role: GlobalRole | null): readonly ModuleDef[] {
  if (!role) return [];
  return MODULES.filter((module) => module.roles.includes(role));
}
