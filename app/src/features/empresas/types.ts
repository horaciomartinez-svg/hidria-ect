/**
 * M1 — Registro de empresas (F1-03b).
 *
 * Contrato: `docs/01` §4.1 y `docs/02` (tabla `companies`). Sin EF en F1-03: la UI consume
 * PostgREST directamente y RLS decide las filas (`companies_write`: tenant + roles
 * admin_institucional/coordinador_srhds/equipo). Todos los `id`/folios son server-side.
 */

import type { GlobalRole } from '../../lib/auth/claims';

export const GIROS = [
  'manufacturera',
  'maquiladora',
  'termoelectrica',
  'alimentos_bebidas',
  'otra',
] as const;
export type Giro = (typeof GIROS)[number];

export const GIRO_LABEL: Record<Giro, string> = {
  manufacturera: 'Manufacturera',
  maquiladora: 'Maquiladora',
  termoelectrica: 'Termoeléctrica',
  alimentos_bebidas: 'Alimentos y bebidas',
  otra: 'Otra',
};

export const CICLOS_VIDA = [
  'prospecto',
  'convenio_firmado',
  'activa',
  'diagnostico_vigente',
  'plan_accion',
  'ehr',
] as const;
export type CicloVida = (typeof CICLOS_VIDA)[number];

export const CICLO_LABEL: Record<CicloVida, string> = {
  prospecto: 'Prospecto',
  convenio_firmado: 'Convenio/NDA firmado',
  activa: 'Activa',
  diagnostico_vigente: 'Con diagnóstico vigente',
  plan_accion: 'Plan de Acción en ejecución',
  ehr: 'Empresa Hídricamente Responsable',
};

/** Fila de `companies` tal como la devuelve PostgREST (columnas de `docs/02`). */
export interface Company {
  id: string;
  organization_id: string;
  razon_social: string;
  nombre_planta: string;
  giro: Giro;
  calle: string;
  colonia_parque: string;
  cp: string;
  municipio: string;
  organismo_operador: string;
  lat: number | null;
  lon: number | null;
  empleados: number | null;
  turnos: string | null;
  unidad_produccion: string | null;
  contraparte_user_id: string | null;
  ciclo_vida: CicloVida;
  created_at: string;
  updated_at: string;
}

/** Campos editables por la UI (server-side: `id`, `organization_id`, timestamps). */
export type CompanyInput = Omit<
  Company,
  'id' | 'organization_id' | 'created_at' | 'updated_at' | 'ciclo_vida'
> & { ciclo_vida: CicloVida };

export function emptyCompanyInput(): CompanyInput {
  return {
    razon_social: '',
    nombre_planta: '',
    giro: 'manufacturera',
    calle: '',
    colonia_parque: '',
    cp: '',
    municipio: '',
    organismo_operador: '',
    lat: null,
    lon: null,
    empleados: null,
    turnos: null,
    unidad_produccion: null,
    contraparte_user_id: null,
    ciclo_vida: 'prospecto',
  };
}

export function companyToInput(company: Company): CompanyInput {
  return {
    razon_social: company.razon_social,
    nombre_planta: company.nombre_planta,
    giro: company.giro,
    calle: company.calle,
    colonia_parque: company.colonia_parque,
    cp: company.cp,
    municipio: company.municipio,
    organismo_operador: company.organismo_operador,
    lat: company.lat,
    lon: company.lon,
    empleados: company.empleados,
    turnos: company.turnos,
    unidad_produccion: company.unidad_produccion,
    contraparte_user_id: company.contraparte_user_id,
    ciclo_vida: company.ciclo_vida,
  };
}

/** Roles institucionales con escritura en `companies` según la política RLS vigente. */
export const COMPANY_WRITE_ROLES: readonly GlobalRole[] = [
  'admin_institucional',
  'coordinador_srhds',
  'equipo',
];

/**
 * Roles con **alta** de empresa en la UI. F1-03a (#36) publicó `companies.created_by` y el
 * SELECT del creador, por lo que el alta vuelve a los 3 roles de escritura (B2 de #35 cerrado).
 */
export const COMPANY_CREATE_ROLES: readonly GlobalRole[] = COMPANY_WRITE_ROLES;
