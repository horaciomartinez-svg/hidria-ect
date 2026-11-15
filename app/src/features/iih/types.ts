/**
 * M5 — IIH (Inventario de Infraestructura Hidráulica), contrato `docs/01` §4.5 y `docs/02`.
 *
 * La UI captura/edita activos por PostgREST **bajo RLS** (`iih_assets_write`: coordinador/equipo)
 * y usa **EF-09** sólo para importar la plantilla XLSX (kind='iih'). No toca `diagnostics` ni gates.
 */

export const ESTADOS_FISICOS = ['bueno', 'regular', 'deficiente', 'fuera_de_servicio'] as const;
export type EstadoFisico = (typeof ESTADOS_FISICOS)[number];
export const ESTADO_FISICO_LABEL: Record<EstadoFisico, string> = {
  bueno: 'Bueno',
  regular: 'Regular',
  deficiente: 'Deficiente',
  fuera_de_servicio: 'Fuera de servicio',
};

export const OPERA_VALUES = ['si', 'no', 'parcial'] as const;
export type Opera = (typeof OPERA_VALUES)[number];
export const OPERA_LABEL: Record<Opera, string> = {
  si: 'Sí',
  no: 'No',
  parcial: 'Parcial',
};

export const CRITICIDAD_VALUES = ['alta', 'media', 'baja'] as const;
export type Criticidad = (typeof CRITICIDAD_VALUES)[number];
export const CRITICIDAD_LABEL: Record<Criticidad, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

export const SUFICIENCIA_VALUES = ['suficiente', 'limitada', 'insuficiente'] as const;
export type Suficiencia = (typeof SUFICIENCIA_VALUES)[number];
export const SUFICIENCIA_LABEL: Record<Suficiencia, string> = {
  suficiente: 'Suficiente',
  limitada: 'Limitada',
  insuficiente: 'Insuficiente',
};

export const MANTENIMIENTO_VALUES = ['preventivo', 'correctivo', 'mixto', 'nulo'] as const;
export type MantenimientoTipo = (typeof MANTENIMIENTO_VALUES)[number];
export const MANTENIMIENTO_LABEL: Record<MantenimientoTipo, string> = {
  preventivo: 'Preventivo',
  correctivo: 'Correctivo',
  mixto: 'Mixto',
  nulo: 'Nulo',
};

export const INTERVENCION_VALUES = ['ninguna', 'rehabilitacion', 'reposicion', 'ampliacion'] as const;
export type Intervencion = (typeof INTERVENCION_VALUES)[number];
export const INTERVENCION_LABEL: Record<Intervencion, string> = {
  ninguna: 'Ninguna',
  rehabilitacion: 'Rehabilitación',
  reposicion: 'Reposición',
  ampliacion: 'Ampliación',
};

export const PRIORIDAD_VALUES = ['alta', 'media', 'baja'] as const;
export type Prioridad = (typeof PRIORIDAD_VALUES)[number];
export const PRIORIDAD_LABEL: Record<Prioridad, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

export interface IihStage {
  code: string;
  nombre: string;
  orden: number;
}

export interface IihAssetType {
  id: number;
  stage_code: string;
  code: string;
  nombre: string;
}

export interface IihAsset {
  id: string;
  diagnostic_id: string;
  folio: string;
  stage_code: string;
  asset_type_id: number;
  asset_type_name: string | null;
  tag: string;
  ubicacion: string;
  capacidad: string | null;
  capacidad_unidad: string | null;
  potencia_kw: string | null;
  material: string | null;
  anio_instalacion: number | null;
  estado_fisico: EstadoFisico;
  opera: Opera;
  criticidad: Criticidad;
  respaldo: boolean;
  suficiencia: Suficiencia | null;
  mantenimiento_tipo: MantenimientoTipo | null;
  ultimo_servicio: string | null;
  intervencion: Intervencion;
  prioridad: Prioridad;
  observaciones: string | null;
  verificado_v1: boolean;
  updated_at: string;
}

/** Campos editables (server-side: id/folio/organization_id/diagnostic_id/timestamps). */
export interface IihAssetInput {
  stage_code: string;
  asset_type_id: number | null;
  tag: string;
  ubicacion: string;
  capacidad: string | null;
  capacidad_unidad: string | null;
  potencia_kw: string | null;
  material: string | null;
  anio_instalacion: number | null;
  estado_fisico: EstadoFisico;
  opera: Opera;
  criticidad: Criticidad;
  respaldo: boolean;
  suficiencia: Suficiencia | null;
  mantenimiento_tipo: MantenimientoTipo | null;
  ultimo_servicio: string | null;
  intervencion: Intervencion;
  prioridad: Prioridad;
  observaciones: string | null;
  verificado_v1: boolean;
}

export function emptyAssetInput(stageCode = 'CAP'): IihAssetInput {
  return {
    stage_code: stageCode,
    asset_type_id: null,
    tag: '',
    ubicacion: '',
    capacidad: null,
    capacidad_unidad: null,
    potencia_kw: null,
    material: null,
    anio_instalacion: null,
    estado_fisico: 'bueno',
    opera: 'si',
    criticidad: 'media',
    respaldo: false,
    suficiencia: null,
    mantenimiento_tipo: null,
    ultimo_servicio: null,
    intervencion: 'ninguna',
    prioridad: 'media',
    observaciones: null,
    verificado_v1: false,
  };
}

export function assetToInput(asset: IihAsset): IihAssetInput {
  return {
    stage_code: asset.stage_code,
    asset_type_id: asset.asset_type_id,
    tag: asset.tag,
    ubicacion: asset.ubicacion,
    capacidad: asset.capacidad,
    capacidad_unidad: asset.capacidad_unidad,
    potencia_kw: asset.potencia_kw,
    material: asset.material,
    anio_instalacion: asset.anio_instalacion,
    estado_fisico: asset.estado_fisico,
    opera: asset.opera,
    criticidad: asset.criticidad,
    respaldo: asset.respaldo,
    suficiencia: asset.suficiencia,
    mantenimiento_tipo: asset.mantenimiento_tipo,
    ultimo_servicio: asset.ultimo_servicio,
    intervencion: asset.intervencion,
    prioridad: asset.prioridad,
    observaciones: asset.observaciones,
    verificado_v1: asset.verificado_v1,
  };
}

export interface FieldError {
  field: keyof IihAssetInput;
  message: string;
}

/**
 * Texto de origen externo (EF-09: `razon`/advertencias) que se muestra como texto plano:
 * elimina caracteres de control y acota longitud. React ya escapa HTML; esto evita además
 * celdas absurdamente largas o ruido de control sin interpretar markup.
 */
export function sanitizeText(value: unknown, maxLength = 300): string {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, maxLength);
}


/** Validación de cliente (complementa CHECK/RLS; el servidor es la autoridad). */
export function validateAssetInput(input: IihAssetInput): FieldError[] {
  const errors: FieldError[] = [];
  if (!input.stage_code) errors.push({ field: 'stage_code', message: 'Selecciona la etapa (CAP–EVA).' });
  if (!input.asset_type_id) errors.push({ field: 'asset_type_id', message: 'Selecciona el tipo de activo.' });
  if (input.tag.trim().length === 0) errors.push({ field: 'tag', message: 'El TAG es obligatorio.' });
  if (input.ubicacion.trim().length === 0) errors.push({ field: 'ubicacion', message: 'La ubicación es obligatoria.' });
  const numeric = (value: string | null, label: string, field: keyof IihAssetInput): void => {
    if (value === null || value.trim().length === 0) return;
    if (Number.isNaN(Number(value)) || Number(value) < 0) {
      errors.push({ field, message: `${label} debe ser un número ≥ 0.` });
    }
  };
  numeric(input.capacidad, 'La capacidad', 'capacidad');
  numeric(input.potencia_kw, 'La potencia', 'potencia_kw');
  if (
    input.anio_instalacion !== null &&
    (!Number.isInteger(input.anio_instalacion) ||
      input.anio_instalacion < 1900 ||
      input.anio_instalacion > 2100)
  ) {
    errors.push({ field: 'anio_instalacion', message: 'El año debe estar entre 1900 y 2100.' });
  }
  return errors;
}

/** Resumen del inventario (por etapa/tipo/estado) para la cabecera. */
export interface IihSummary {
  total: number;
  verificados: number;
  porEtapa: Array<{ stage_code: string; total: number; verificados: number }>;
  criticidadAlta: number;
}

export function computeSummary(assets: IihAsset[], stageOrder: string[]): IihSummary {
  const porEtapa = stageOrder.map((stage_code) => {
    const items = assets.filter((asset) => asset.stage_code === stage_code);
    return {
      stage_code,
      total: items.length,
      verificados: items.filter((asset) => asset.verificado_v1).length,
    };
  });
  return {
    total: assets.length,
    verificados: assets.filter((asset) => asset.verificado_v1).length,
    porEtapa,
    criticidadAlta: assets.filter((asset) => asset.criticidad === 'alta').length,
  };
}

/* ------------------------------------------------------------------------- */
/* Validación de archivo XLSX (cliente; la estructura/columnas las valida EF-09) */
/* ------------------------------------------------------------------------- */

export const MAX_XLSX_BYTES = 10 * 1024 * 1024;
export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface XlsxValidation {
  ok: boolean;
  message?: string;
}

/**
 * Valida en cliente formato/tamaño y firma ZIP de XLSX. **Las hojas/columnas exactas de la
 * plantilla las valida EF-09** (la UI no incluye parser XLSX) y el resultado/diff se muestra al
 * usuario; esta comprobación evita subir archivos claramente inválidos.
 */
export async function validateXlsxFile(file: File): Promise<XlsxValidation> {
  if (!/\.xlsx$/i.test(file.name)) {
    return { ok: false, message: 'La plantilla debe ser un archivo .xlsx.' };
  }
  if (file.size === 0) return { ok: false, message: 'El archivo está vacío.' };
  if (file.size > MAX_XLSX_BYTES) {
    return { ok: false, message: 'El archivo supera el máximo de 10 MB.' };
  }
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  // Firma ZIP ("PK\x03\x04") que todo XLSX debe tener.
  if (head[0] !== 0x50 || head[1] !== 0x4b) {
    return { ok: false, message: 'El archivo no tiene formato XLSX válido (firma ZIP).' };
  }
  return { ok: true };
}
