/**
 * HIDRIA — EF-09 `import/xlsx` para `kind='iih'` (M5 · Inventario de Infraestructura Hídrica).
 *
 * Tarea `task-135` (F1-08b). Contrato `docs/04` EF-09 (patch JSON aprobado en #63):
 * body `{diagnostic_id, document_id, kind:'iih', periodo_anio?}`; el XLSX ya está en R2
 * (EF-08 register) y la EF lo descarga con credenciales server-side, lo parsea con límites
 * anti zip-bomb/fórmulas y llama a la RPC atómica `fn_import_iih_assets` (F1-08c) para
 * INSERT de `iih_assets` + `audit_log` + idempotencia. `verificado_v1=false` (la importación
 * no valida V1).
 */

import {
  authenticate,
  type AuthenticateOptions,
  guardEndpoint,
  isUuid,
  type ResolveDiagnosticRole,
} from "./auth.ts";
import { buildCorsHeaders, type CorsConfig, handlePreflight } from "./cors.ts";
import type { DiagnosticRow, DocumentImportRow, RpcResult } from "./db.ts";
import { ApiError, errorResponse } from "./errors.ts";
import { readJsonObject } from "./http.ts";
import type { R2Config } from "./r2.ts";
import { downloadObject, sha256HexBytes } from "./r2.ts";
import {
  type ParsedWorkbook,
  parseXlsx,
  type XlsxParseOptions,
  type XlsxSheet,
} from "./xlsx.ts";

export const IMPORT_ENDPOINT = "EF-09";
export const IMPORT_KIND = "iih";
export const MAX_XLSX_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;

const XLSX_MIMES: readonly string[] = [
  // Allowlist estricta (seguridad): solo el MIME oficial XLSX.
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export interface IihImportClient {
  readonly resolveRole: ResolveDiagnosticRole;
  readonly verifyProfile: (
    context: import("./auth.ts").AuthContext,
  ) => Promise<boolean>;
  readonly fetchDiagnostic: (
    diagnosticId: string,
  ) => Promise<DiagnosticRow | null>;
  readonly fetchDocumentForImport: (
    documentId: string,
  ) => Promise<DocumentImportRow | null>;
  readonly listMemberUserIds: (diagnosticId: string) => Promise<string[]>;
  readonly insertNotifications: (
    rows: Array<{
      userId: string;
      kind: string;
      payload: Record<string, unknown>;
    }>,
  ) => Promise<void>;
  readonly callRpc: <T extends RpcResult>(
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<T>;
}

export interface IihImportConfig {
  readonly auth: AuthenticateOptions;
  readonly cors: CorsConfig;
  readonly r2: R2Config;
}

export interface IihImportDeps {
  readonly client: IihImportClient;
  /** Inyectables en pruebas; por defecto, R2 real y parser propio. */
  readonly download?: typeof downloadObject;
  readonly parse?: (
    bytes: Uint8Array,
    limits?: { maxRows: number },
    options?: XlsxParseOptions,
  ) => Promise<ParsedWorkbook>;
}

interface SheetSpec {
  readonly stage: string;
  readonly name: string;
}

const SHEETS: readonly SheetSpec[] = [
  { stage: "CAP", name: "1. Captación" },
  { stage: "ALM", name: "2. Almacenamiento" },
  { stage: "TRA", name: "3. Tratamiento" },
  { stage: "DIS", name: "4. Distribución" },
  { stage: "USO", name: "5. Uso y consumo" },
  { stage: "EVA", name: "6. Evacuación" },
];

/** Encabezados de la fila 7 (21 columnas) de la plantilla oficial. */
export const IIH_HEADERS: readonly string[] = [
  "No. / folio",
  "Tipo de activo",
  "Identificación / TAG",
  "Ubicación en planta",
  "Capacidad o caudal",
  "Unidad",
  "Potencia (kW)",
  "Material / diámetro",
  "Año de inst.",
  "Estado físico",
  "¿Opera?",
  "Criticidad",
  "¿Tiene respaldo?",
  "Capacidad suficiente",
  "Mantenimiento",
  "Último servicio",
  "Intervención",
  "Prioridad (calc.)",
  "Observaciones y hallazgo de la ficha",
  "Evidencia",
];

const HEADER_ROW = 7;
const FIRST_DATA_ROW = 8;
const LAST_COLUMN = 21;

export function normalizeCell(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function sheetByName(
  workbook: ParsedWorkbook,
  name: string,
): XlsxSheet | undefined {
  return workbook.sheets.find((sheet) => sheet.name === name);
}

function cell(sheet: XlsxSheet, row: number, column: number): string {
  return sheet.rows.get(row)?.get(column) ?? "";
}

function num(value: string, field: string, rowErrors: string[]): number | null {
  if (value.length === 0) return null;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    rowErrors.push(`${field}: número inválido`);
    return null;
  }
  return parsed;
}

function enumValue(
  value: string,
  field: string,
  allowed: readonly string[],
  rowErrors: string[],
): string | null {
  const normalized = normalizeCell(value);
  if (normalized.length === 0) return null;
  if (!allowed.includes(normalized)) {
    rowErrors.push(`${field}: valor no permitido (${value})`);
    return null;
  }
  return normalized;
}

function parseBoolean(
  value: string,
  field: string,
  rowErrors: string[],
): boolean | null {
  const normalized = normalizeCell(value);
  if (normalized.length === 0) return false;
  if (["si", "sí", "true", "1"].includes(normalized)) return true;
  if (["no", "false", "0"].includes(normalized)) return false;
  rowErrors.push(`${field}: valor sí/no inválido (${value})`);
  return null;
}

function excelSerialToIso(serial: number): string {
  const base = Date.UTC(1899, 11, 30);
  const date = new Date(base + Math.round(serial) * 86400000);
  return date.toISOString().slice(0, 10);
}

function parseDate(
  value: string,
  field: string,
  rowErrors: string[],
): string | null {
  if (value.length === 0) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const serial = Number(value.replace(",", "."));
  if (Number.isFinite(serial) && serial > 0) return excelSerialToIso(serial);
  rowErrors.push(`${field}: fecha inválida (${value})`);
  return null;
}

const ENUMS = {
  estado_fisico: ["bueno", "regular", "deficiente", "fuera_de_servicio"],
  opera: ["si", "no", "parcial"],
  criticidad: ["alta", "media", "baja"],
  suficiencia: ["suficiente", "limitada", "insuficiente"],
  mantenimiento_tipo: ["preventivo", "correctivo", "mixto", "nulo"],
  intervencion: ["ninguna", "rehabilitacion", "reposicion", "ampliacion"],
} as const;

export interface IihRow {
  readonly fila: number;
  readonly stage_code: string;
  readonly asset_code: string;
  readonly tag: string;
  readonly ubicacion: string;
  readonly capacidad: number | null;
  readonly capacidad_unidad: string | null;
  readonly potencia_kw: number | null;
  readonly material: string | null;
  readonly anio_instalacion: number | null;
  readonly estado_fisico: string;
  readonly opera: string;
  readonly criticidad: string;
  readonly respaldo: boolean;
  readonly suficiencia: string | null;
  readonly mantenimiento_tipo: string | null;
  readonly ultimo_servicio: string | null;
  readonly intervencion: string;
  readonly observaciones: string | null;
}

export interface IihRejectedRow {
  readonly fila: number;
  readonly razon: string;
}

export interface IihParseResult {
  readonly rows: IihRow[];
  readonly rejected: IihRejectedRow[];
}

/**
 * Valida estructura global (hojas 1–6, encabezados fila 7, columnas) y mapea las filas
 * de datos (desde fila 8) a `iih_assets`. Lanza `VALIDATION_XLSX_ESTRUCTURA` con
 * `faltantes/sobrantes` si la plantilla no coincide.
 */
export function parseIihWorkbook(workbook: ParsedWorkbook): IihParseResult {
  const missingSheets: string[] = [];
  const headerIssues: Record<string, unknown>[] = [];
  const expectedHeaders = IIH_HEADERS.map(normalizeCell);
  for (const spec of SHEETS) {
    const sheet = sheetByName(workbook, spec.name);
    if (sheet === undefined) {
      missingSheets.push(spec.name);
      continue;
    }
    const actual: string[] = [];
    for (let column = 2; column <= LAST_COLUMN + 1; column += 1) {
      actual.push(normalizeCell(cell(sheet, HEADER_ROW, column)));
    }
    const faltantes = expectedHeaders.filter((header, index) =>
      header.length > 0 && actual[index] !== header
    );
    const sobrantes = actual.filter((value, index) =>
      index >= expectedHeaders.length && value.length > 0
    );
    if (faltantes.length > 0 || sobrantes.length > 0) {
      headerIssues.push({
        hoja: spec.name,
        faltantes,
        sobrantes,
      });
    }
  }
  if (missingSheets.length > 0 || headerIssues.length > 0) {
    throw new ApiError(
      "VALIDATION_XLSX_ESTRUCTURA",
      "El archivo no corresponde a la plantilla oficial del IIH.",
      {
        reason: "plantilla_no_coincide",
        hojas_faltantes: missingSheets,
        columnas: headerIssues,
      },
    );
  }

  const rows: IihRow[] = [];
  const rejected: IihRejectedRow[] = [];
  for (const spec of SHEETS) {
    const sheet = sheetByName(workbook, spec.name);
    if (sheet === undefined) continue;
    const maxRow = Math.max(0, ...sheet.rows.keys());
    for (let rowNumber = FIRST_DATA_ROW; rowNumber <= maxRow; rowNumber += 1) {
      const values: string[] = [];
      for (let column = 2; column <= LAST_COLUMN + 1; column += 1) {
        values.push(cell(sheet, rowNumber, column));
      }
      if (values.every((value) => value.trim().length === 0)) continue;
      const rowErrors: string[] = [];
      const assetCode = normalizeCell(values[0]).toUpperCase();
      if (assetCode.length === 0) {
        rejected.push({ fila: rowNumber, razon: "código de activo vacío" });
        continue;
      }
      const stageFromCode = assetCode.split("-")[0];
      if (stageFromCode !== spec.stage) {
        rowErrors.push(
          `código ${assetCode} no pertenece a la hoja ${spec.name}`,
        );
      }
      const tag = values[2].trim();
      const ubicacion = values[3].trim();
      if (tag.length === 0) rowErrors.push("tag obligatorio");
      if (ubicacion.length === 0) rowErrors.push("ubicación obligatoria");
      const capacidad = num(values[4], "capacidad", rowErrors);
      const unidad = values[5].trim();
      const potencia = num(values[6], "potencia_kw", rowErrors);
      const material = values[7].trim();
      const anio = num(values[8], "anio_instalacion", rowErrors);
      if (anio !== null && (anio < 1900 || anio > 2100)) {
        rowErrors.push("año de instalación fuera de rango (1900–2100)");
      }
      const estadoFisico = enumValue(
        values[9],
        "estado_fisico",
        ENUMS.estado_fisico,
        rowErrors,
      );
      const opera = enumValue(values[10], "opera", ENUMS.opera, rowErrors);
      const criticidad = enumValue(
        values[11],
        "criticidad",
        ENUMS.criticidad,
        rowErrors,
      );
      const respaldo = parseBoolean(values[12], "respaldo", rowErrors);
      const suficiencia = enumValue(
        values[13],
        "suficiencia",
        ENUMS.suficiencia,
        rowErrors,
      );
      const mantenimiento = enumValue(
        values[14],
        "mantenimiento_tipo",
        ENUMS.mantenimiento_tipo,
        rowErrors,
      );
      const ultimoServicio = parseDate(
        values[15],
        "ultimo_servicio",
        rowErrors,
      );
      const intervencion = enumValue(
        values[16],
        "intervencion",
        ENUMS.intervencion,
        rowErrors,
      );
      if (estadoFisico === null) rowErrors.push("estado_fisico obligatorio");
      if (opera === null) rowErrors.push("opera obligatorio");
      if (criticidad === null) rowErrors.push("criticidad obligatoria");
      if (intervencion === null) rowErrors.push("intervencion obligatoria");
      if (
        rowErrors.length > 0 || estadoFisico === null || opera === null ||
        criticidad === null || intervencion === null || respaldo === null
      ) {
        rejected.push({ fila: rowNumber, razon: rowErrors.join("; ") });
        continue;
      }
      rows.push({
        fila: rowNumber,
        stage_code: spec.stage,
        asset_code: assetCode,
        tag,
        ubicacion,
        capacidad,
        capacidad_unidad: unidad.length > 0 ? unidad : null,
        potencia_kw: potencia,
        material: material.length > 0 ? material : null,
        anio_instalacion: anio === null ? null : Math.round(anio),
        estado_fisico: estadoFisico,
        opera,
        criticidad,
        respaldo,
        suficiencia,
        mantenimiento_tipo: mantenimiento,
        ultimo_servicio: ultimoServicio,
        intervencion,
        observaciones: values[18].trim() || null,
      });
      if (rows.length + rejected.length > MAX_IMPORT_ROWS) {
        throw new ApiError(
          "VALIDATION_XLSX_ESTRUCTURA",
          "El archivo excede el número máximo de filas permitido.",
          { reason: "demasiadas_filas", max_rows: MAX_IMPORT_ROWS },
        );
      }
    }
  }
  if (rows.length === 0 && rejected.length === 0) {
    throw new ApiError(
      "VALIDATION_XLSX_ESTRUCTURA",
      "La plantilla no contiene filas de datos.",
      { reason: "sin_filas" },
    );
  }
  return { rows, rejected };
}

// ---------------------------------------------------------------------------
// F1-09 / ADR-014 — EF-09 `kind='bhe'` (plantilla BHE, 12 meses, hojas 1/2/3A)
// ---------------------------------------------------------------------------

export const BHE_KIND = "bhe";
export const BHE_MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

const BHE_CAPTURE_SHEETS = [
  "1. Entradas",
  "2. Destinos del agua",
  "3. Reúso y calidad",
] as const;

const BHE_HEADER_ROW: Record<string, number> = {
  "1. Entradas": 6,
  "2. Destinos del agua": 6,
  "3. Reúso y calidad": 7,
};

/** Filas de la plantilla con su(s) código(s) de `balance_flow_catalog`. */
const BHE_ROW_CODES: Record<string, Array<{ row: number; codes: string[] }>> = {
  "1. Entradas": [
    { row: 7, codes: ["ENT-01"] },
    { row: 8, codes: ["ENT-02"] },
    { row: 9, codes: ["ENT-02"] }, // Pozo 2: suma en ENT-02
    { row: 10, codes: ["ENT-03"] },
    { row: 11, codes: ["ENT-04"] },
    { row: 12, codes: ["ENT-05"] },
  ],
  "2. Destinos del agua": [
    { row: 8, codes: ["DST-01"] },
    { row: 9, codes: ["DST-02"] },
    { row: 10, codes: ["DST-04"] },
    { row: 11, codes: ["DST-09"] },
    { row: 13, codes: ["DST-11"] },
    { row: 14, codes: ["DST-12"] },
    { row: 15, codes: ["DST-11"] },
    { row: 16, codes: ["DST-11"] },
    { row: 17, codes: ["DST-13"] },
    { row: 19, codes: ["DST-13"] },
  ],
  "3. Reúso y calidad": [
    { row: 8, codes: ["CIR-01"] },
    { row: 9, codes: ["CIR-02"] },
    { row: 10, codes: ["CIR-04"] },
    { row: 11, codes: ["CIR-03"] },
  ],
};

export interface BheRow {
  readonly fila: number;
  readonly catalog_code: string;
  readonly mes: number;
  readonly volumen_m3: number;
}

export interface BheParseResult {
  readonly rows: BheRow[];
  readonly rejected: IihRejectedRow[];
  readonly advertencias: string[];
}

function bheCell(
  sheet: XlsxSheet,
  row: number,
  column: number,
): string {
  return sheet.rows.get(row)?.get(column) ?? "";
}

function parseVolume(value: string): number | null {
  const text = value.trim().replace(/\s/g, "").replace(",", ".");
  if (text.length === 0) return 0;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/** Valida hojas/encabezados de la plantilla BHE y mapea sus 12 meses. */
export function parseBheWorkbook(workbook: ParsedWorkbook): BheParseResult {
  const missingSheets: string[] = [];
  const headerIssues: Array<Record<string, unknown>> = [];
  const advertencias: string[] = [];
  for (const name of BHE_CAPTURE_SHEETS) {
    const sheet = sheetByName(workbook, name);
    if (sheet === undefined) {
      missingSheets.push(name);
      continue;
    }
    const headerRow = BHE_HEADER_ROW[name];
    if (normalizeCell(bheCell(sheet, headerRow, 2)).length === 0) {
      headerIssues.push({ hoja: name, faltantes: ["columna B"] });
    }
    for (let index = 0; index < BHE_MONTHS.length; index += 1) {
      const actual = normalizeCell(bheCell(sheet, headerRow, 3 + index));
      if (actual !== BHE_MONTHS[index]) {
        headerIssues.push({
          hoja: name,
          mes: index + 1,
          esperado: BHE_MONTHS[index],
          actual,
        });
      }
    }
  }
  if (missingSheets.length > 0 || headerIssues.length > 0) {
    throw new ApiError(
      "VALIDATION_XLSX_ESTRUCTURA",
      "El archivo no corresponde a la plantilla oficial del BHE.",
      {
        reason: "plantilla_bhe_no_coincide",
        hojas_faltantes: missingSheets,
        columnas: headerIssues,
      },
    );
  }

  const totals = new Map<string, { fila: number; volumen: number }>();
  const rejected: IihRejectedRow[] = [];
  for (const name of BHE_CAPTURE_SHEETS) {
    const sheet = sheetByName(workbook, name);
    if (sheet === undefined) continue;
    for (const mapping of BHE_ROW_CODES[name]) {
      const rowErrors: string[] = [];
      const monthly: number[] = [];
      for (let month = 1; month <= 12; month += 1) {
        const raw = bheCell(sheet, mapping.row, 3 + month - 1);
        const value = parseVolume(raw);
        if (value === null) {
          rowErrors.push(`mes ${month}: volumen inválido (${raw})`);
        }
        monthly.push(value ?? 0);
      }
      if (monthly.every((value) => value === 0)) continue;
      if (rowErrors.length > 0) {
        rejected.push({ fila: mapping.row, razon: rowErrors.join("; ") });
        continue;
      }
      for (let month = 1; month <= 12; month += 1) {
        if (monthly[month - 1] === 0) continue;
        for (const code of mapping.codes) {
          const key = `${code}:${month}`;
          const existing = totals.get(key);
          if (existing === undefined) {
            totals.set(key, { fila: mapping.row, volumen: monthly[month - 1] });
          } else {
            existing.volumen += monthly[month - 1];
          }
        }
      }
    }
  }
  if (sheetByName(workbook, "2. Destinos del agua") !== undefined) {
    advertencias.push(
      "La fila «Otros destinos» de la hoja 2 no se importa en F1-09.",
    );
  }
  const rows: BheRow[] = [];
  for (const [key, value] of totals) {
    const [catalogCode, monthText] = key.split(":");
    const mes = Number(monthText);
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) continue;
    rows.push({
      fila: value.fila,
      catalog_code: catalogCode,
      mes,
      volumen_m3: Math.round(value.volumen * 1000) / 1000,
    });
  }
  rows.sort((a, b) =>
    a.catalog_code.localeCompare(b.catalog_code) || a.mes - b.mes
  );
  if (rows.length === 0 && rejected.length === 0) {
    throw new ApiError(
      "VALIDATION_XLSX_ESTRUCTURA",
      "La plantilla BHE no contiene volúmenes capturados.",
      { reason: "sin_filas" },
    );
  }
  return { rows, rejected, advertencias };
}

/** Allowlist ADR-014 D18.5: fórmulas solo en O/P de hojas 1–3 y hoja 4 (se ignoran). */
export function bheAllowFormula(
  sheetName: string,
  row: number,
  column: number,
): boolean {
  if (sheetName === "4. Balance e indicadores") return true;
  if (
    sheetName === "1. Entradas" || sheetName === "2. Destinos del agua" ||
    sheetName === "3. Reúso y calidad"
  ) {
    return (column === 15 || column === 16) && row >= 6;
  }
  return false;
}

interface ImportRoute {
  readonly matches: boolean;
}

export function matchImportRoute(
  method: string,
  pathOrUrl: string,
): ImportRoute {
  if (method.toUpperCase() !== "POST") return { matches: false };
  const pathname = pathOrUrl.startsWith("http://") ||
      pathOrUrl.startsWith("https://")
    ? new URL(pathOrUrl).pathname
    : pathOrUrl.split("?")[0].split("#")[0];
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const last = segments[segments.length - 1];
  return {
    matches: last === "xlsx" &&
      segments.some((segment) => segment === "import"),
  };
}

function json(
  request: Request,
  config: IihImportConfig,
  body: unknown,
  status = 200,
): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  for (const [name, value] of buildCorsHeaders(request, config.cors)) {
    headers.set(name, value);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function corsHeaders(request: Request, config: IihImportConfig): Headers {
  const headers = new Headers();
  for (const [name, value] of buildCorsHeaders(request, config.cors)) {
    headers.set(name, value);
  }
  return headers;
}

/** Handler de EF-09 (`kind='iih'`). */
export function createIihImportHandler(
  config: IihImportConfig,
  deps: IihImportDeps,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const preflight = handlePreflight(request, config.cors);
    if (preflight !== null) return preflight;

    try {
      if (!matchImportRoute(request.method, request.url).matches) {
        return json(request, config, {
          error: { code: "NOT_FOUND", message: "Ruta no disponible." },
        }, 404);
      }
      const context = await authenticate(request, {
        ...config.auth,
        verifyProfile: (ctx) => deps.client.verifyProfile(ctx),
      });
      const body = await readJsonObject(request);

      const diagnosticId = typeof body.diagnostic_id === "string"
        ? body.diagnostic_id
        : null;
      if (diagnosticId === null || !isUuid(diagnosticId)) {
        throw new ApiError(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "Falta diagnostic_id (UUID).",
          { field: "diagnostic_id" },
        );
      }
      const documentId = typeof body.document_id === "string"
        ? body.document_id
        : null;
      if (documentId === null || !isUuid(documentId)) {
        throw new ApiError(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "Falta document_id (UUID) del XLSX registrado en EF-08.",
          { field: "document_id" },
        );
      }
      const kind = typeof body.kind === "string" ? body.kind : null;
      if (kind !== IMPORT_KIND && kind !== BHE_KIND) {
        throw new ApiError(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "kind debe ser 'iih' o 'bhe'.",
          { field: "kind", allowed: [IMPORT_KIND, BHE_KIND] },
        );
      }
      let periodoAnio: number | null = null;
      if (body.periodo_anio !== undefined) {
        const anio = body.periodo_anio;
        if (
          typeof anio !== "number" || !Number.isInteger(anio) || anio < 2000 ||
          anio > 2100
        ) {
          throw new ApiError(
            "VALIDATION_PARAMETRO_REQUERIDO",
            "periodo_anio debe ser un entero 2000–2100.",
            { field: "periodo_anio" },
          );
        }
        periodoAnio = anio;
      }
      if (kind === BHE_KIND && periodoAnio === null) {
        throw new ApiError(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "kind='bhe' exige periodo_anio (2000–2100).",
          { field: "periodo_anio" },
        );
      }

      const authorization = await guardEndpoint(
        context,
        IMPORT_ENDPOINT,
        { diagnostic_id: diagnosticId },
        { resolveRole: deps.client.resolveRole },
      );
      void authorization;
      const diagnostic = await deps.client.fetchDiagnostic(diagnosticId);
      if (
        diagnostic === null ||
        diagnostic.organizationId !== context.organizationId
      ) {
        throw new ApiError("FORBIDDEN_NOT_MEMBER", undefined, {
          diagnostic_id: diagnosticId,
        });
      }

      const document = await deps.client.fetchDocumentForImport(documentId);
      if (
        document === null || document.diagnosticId !== diagnosticId ||
        document.organizationId !== context.organizationId ||
        document.uploadStatus !== "registered"
      ) {
        throw new ApiError(
          "VALIDATION_FILE",
          "El documento no pertenece al diagnóstico o no está registrado.",
          { reason: "documento_no_valido" },
        );
      }
      const documentMime = document.mime.toLowerCase();
      if (documentMime === "application/vnd.ms-excel") {
        // M1: el parser solo soporta XLSX (OOXML); el XLS binario se rechaza de forma controlada.
        throw new ApiError(
          "VALIDATION_XLSX_ESTRUCTURA",
          "El formato XLS binario no está soportado; guarda e importa como XLSX.",
          { reason: "formato_xls_no_soportado" },
        );
      }
      if (!XLSX_MIMES.includes(documentMime)) {
        throw new ApiError(
          "VALIDATION_XLSX_ESTRUCTURA",
          "El archivo no es un XLSX válido.",
          { reason: "mime_no_permitido" },
        );
      }
      if (document.sizeBytes > MAX_XLSX_BYTES) {
        throw new ApiError(
          "VALIDATION_XLSX_ESTRUCTURA",
          "El archivo excede el tamaño máximo permitido.",
          { reason: "archivo_demasiado_grande", max_bytes: MAX_XLSX_BYTES },
        );
      }

      const download = deps.download ?? downloadObject;
      const downloaded = await download(
        config.r2,
        document.r2Key,
        MAX_XLSX_BYTES,
      );
      if (downloaded === null) {
        throw new ApiError(
          "VALIDATION_FILE",
          "El archivo no existe en el almacenamiento.",
          { reason: "objeto_no_encontrado" },
        );
      }
      const checksum = await sha256HexBytes(downloaded.bytes);
      if (checksum.toLowerCase() !== document.sha256.toLowerCase()) {
        throw new ApiError(
          "VALIDATION_FILE",
          "El checksum del archivo no coincide con el registrado.",
          { reason: "checksum_no_coincide" },
        );
      }

      const parser = deps.parse ??
        ((bytes, limits, options) =>
          parseXlsx(bytes, {
            maxEntries: 256,
            maxTotalUncompressedBytes: 25 * 1024 * 1024,
            maxEntryUncompressedBytes: 10 * 1024 * 1024,
            maxEntryRatio: 200,
            maxRows: limits?.maxRows ?? MAX_IMPORT_ROWS + 10,
          }, options));
      const workbook = await parser(downloaded.bytes, {
        maxRows: MAX_IMPORT_ROWS + 10,
      }, kind === BHE_KIND ? { allowFormula: bheAllowFormula } : {});
      const parsed = kind === BHE_KIND
        ? parseBheWorkbook(workbook)
        : parseIihWorkbook(workbook);
      if (parsed.rows.length === 0) {
        throw new ApiError(
          "VALIDATION_XLSX_ESTRUCTURA",
          "La plantilla no contiene filas válidas para importar.",
          {
            reason: "sin_filas_validas",
            filas_rechazadas: parsed.rejected,
          },
        );
      }

      const idempotencyKey = request.headers.get("idempotency-key");
      if (idempotencyKey !== null && !isUuid(idempotencyKey)) {
        throw new ApiError(
          "VALIDATION_IDEMPOTENCY_KEY",
          "La cabecera Idempotency-Key debe ser un UUID.",
          { header: "Idempotency-Key" },
        );
      }
      const requestHash = await sha256HexBytes(
        new TextEncoder().encode(JSON.stringify({
          endpoint: IMPORT_ENDPOINT,
          kind,
          diagnostic_id: diagnosticId,
          document_id: documentId,
          periodo_anio: periodoAnio,
          checksum,
        })),
      );

      const result = kind === BHE_KIND
        ? await deps.client.callRpc<RpcResult>(
          "fn_import_bhe",
          {
            p_user_id: context.userId,
            p_diagnostic_id: diagnosticId,
            p_document_id: documentId,
            p_periodo_anio: periodoAnio,
            p_rows: (parsed.rows as BheRow[]).map((row) => ({
              fila: row.fila,
              catalog_code: row.catalog_code,
              mes: row.mes,
              volumen_m3: row.volumen_m3,
            })),
            p_checksum: checksum,
            p_idempotency_key: idempotencyKey,
            p_request_hash: requestHash,
          },
        )
        : await deps.client.callRpc<RpcResult>(
          "fn_import_iih_assets",
          {
            p_user_id: context.userId,
            p_diagnostic_id: diagnosticId,
            p_document_id: documentId,
            p_rows: (parsed.rows as IihRow[]).map((row) => ({
              fila: row.fila,
              stage_code: row.stage_code,
              asset_code: row.asset_code,
              tag: row.tag,
              ubicacion: row.ubicacion,
              capacidad: row.capacidad,
              capacidad_unidad: row.capacidad_unidad,
              potencia_kw: row.potencia_kw,
              material: row.material,
              anio_instalacion: row.anio_instalacion,
              estado_fisico: row.estado_fisico,
              opera: row.opera,
              criticidad: row.criticidad,
              respaldo: row.respaldo,
              suficiencia: row.suficiencia,
              mantenimiento_tipo: row.mantenimiento_tipo,
              ultimo_servicio: row.ultimo_servicio,
              intervencion: row.intervencion,
              observaciones: row.observaciones,
            })),
            p_checksum: checksum,
            p_idempotency_key: idempotencyKey,
            p_request_hash: requestHash,
          },
        );
      if (result.ok !== true) {
        throw new ApiError(
          typeof result.code === "string" ? result.code : "INTERNAL_ERROR",
          typeof result.message === "string" ? result.message : undefined,
          result.details ?? {},
        );
      }

      if (result.replayed !== true) {
        try {
          const members = await deps.client.listMemberUserIds(diagnosticId);
          if (members.length > 0) {
            await deps.client.insertNotifications(
              members.map((userId) => ({
                userId,
                kind: "hito",
                payload: {
                  diagnostic_id: diagnosticId,
                  import_kind: kind,
                  document_id: documentId,
                },
              })),
            );
          }
        } catch {
          // Best-effort post-commit.
        }
      }

      const data = (result.data ?? {}) as Record<string, unknown>;
      const rawRejected = Array.isArray(data.filas_rechazadas)
        ? data.filas_rechazadas as Array<{ fila: number; razon: string }>
        : [];
      // IIH: la RPC devuelve la posición (1-based) dentro de p_rows; se traduce a la fila de
      // Excel. BHE: la RPC recibe `fila` y la devuelve ya como fila Excel (no se remapea).
      const rejected = kind === BHE_KIND
        ? rawRejected
        : rawRejected.map((row) => {
          const index = row.fila;
          if (
            Number.isInteger(index) && index >= 1 && index <= parsed.rows.length
          ) {
            return { fila: parsed.rows[index - 1].fila, razon: row.razon };
          }
          return row;
        });
      if (kind === BHE_KIND) {
        const bhe = parsed as BheParseResult;
        const rpcAdvertencias = Array.isArray(data.advertencias)
          ? data.advertencias as string[]
          : [];
        return json(request, config, {
          kind: BHE_KIND,
          destino_id: typeof data.destino_id === "string"
            ? data.destino_id
            : diagnosticId,
          periodo_anio: periodoAnio,
          filas_ok: typeof data.filas_ok === "number" ? data.filas_ok : 0,
          filas_rechazadas: [...bhe.rejected, ...rejected],
          advertencias: [...bhe.advertencias, ...rpcAdvertencias],
        });
      }
      return json(request, config, {
        kind: IMPORT_KIND,
        destino_id: typeof data.destino_id === "string"
          ? data.destino_id
          : diagnosticId,
        filas_ok: typeof data.filas_ok === "number" ? data.filas_ok : 0,
        filas_rechazadas: [...parsed.rejected, ...rejected],
        advertencias: Array.isArray(data.advertencias)
          ? data.advertencias
          : (parsed.rejected.length > 0
            ? ["Algunas filas se rechazaron; revisa el detalle."]
            : []),
      });
    } catch (error) {
      return errorResponse(error, {
        headers: corsHeaders(request, config),
      });
    }
  };
}
