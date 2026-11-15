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
import { type ParsedWorkbook, parseXlsx, type XlsxSheet } from "./xlsx.ts";

export const IMPORT_ENDPOINT = "EF-09";
export const IMPORT_KIND = "iih";
export const MAX_XLSX_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;

const XLSX_MIMES: readonly string[] = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
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
      if (body.kind !== IMPORT_KIND) {
        throw new ApiError(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "Esta función solo importa kind='iih'.",
          { field: "kind", allowed: [IMPORT_KIND] },
        );
      }
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
      if (!XLSX_MIMES.includes(document.mime.toLowerCase())) {
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
        ((bytes, limits) =>
          parseXlsx(bytes, {
            maxEntries: 256,
            maxTotalUncompressedBytes: 25 * 1024 * 1024,
            maxEntryRatio: 200,
            maxRows: limits?.maxRows ?? MAX_IMPORT_ROWS + 10,
          }));
      const workbook = await parser(downloaded.bytes, {
        maxRows: MAX_IMPORT_ROWS + 10,
      });
      const parsed = parseIihWorkbook(workbook);
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
          kind: IMPORT_KIND,
          diagnostic_id: diagnosticId,
          document_id: documentId,
          checksum,
        })),
      );

      const result = await deps.client.callRpc<RpcResult>(
        "fn_import_iih_assets",
        {
          p_user_id: context.userId,
          p_diagnostic_id: diagnosticId,
          p_document_id: documentId,
          p_rows: parsed.rows.map((row) => ({
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
                  import_kind: IMPORT_KIND,
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
      const rejected = Array.isArray(data.filas_rechazadas)
        ? data.filas_rechazadas as Array<{ fila: number; razon: string }>
        : [];
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
