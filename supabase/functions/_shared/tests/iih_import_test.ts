/**
 * F1-08b — pruebas de contrato de EF-09 `import/xlsx` (kind='iih').
 * Sin red: descarga R2, parser y RPC inyectados; JWT sintético.
 */

import { assertEquals, assertNotIncludes } from "./asserts.ts";
import type { DiagnosticRole } from "../auth.ts";
import type { DiagnosticRow, DocumentImportRow, RpcResult } from "../db.ts";
import {
  createIihImportHandler,
  IIH_HEADERS,
  type IihImportClient,
  type IihImportConfig,
} from "../iih_import.ts";
import { sha256HexBytes } from "../r2.ts";
import type { ParsedWorkbook, XlsxSheet } from "../xlsx.ts";
import {
  DIAG_ID,
  ISSUER,
  makeRequest,
  ORG_ID,
  OTHER_ORG_ID,
  TEST_SECRET,
  USER_EQUIPO,
} from "./ef_fakes.ts";

const DOC_ID = "d1000000-0000-4000-8000-000000000001";
const OTHER_DIAG = "c1000000-0000-4000-8000-000000000002";
const BYTES = new TextEncoder().encode("xlsx-sintetico-f1-08b");

const CONFIG: IihImportConfig = {
  auth: { jwtSecret: TEST_SECRET, expectedIssuer: ISSUER },
  cors: { allowedOrigins: ["https://app.example"] },
  r2: {
    accountId: "cuenta-sintetica",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "secreto-r2-sintetico-f1-08b",
    bucket: "hidria-docs",
    region: "auto",
  },
};

const SHEET_NAMES = [
  "1. Captación",
  "2. Almacenamiento",
  "3. Tratamiento",
  "4. Distribución",
  "5. Uso y consumo",
  "6. Evacuación",
];

function dataRow(
  overrides: Partial<Record<number, string>> = {},
): Map<number, string> {
  const row = new Map<number, string>([
    [2, "CAP-01"],
    [3, "Toma municipal"],
    [4, "TAG-001"],
    [5, "Sala de máquinas"],
    [11, "bueno"],
    [12, "si"],
    [13, "alta"],
    [14, "no"],
    [18, "ninguna"],
    [20, "Sin hallazgos"],
  ]);
  for (const [column, value] of Object.entries(overrides)) {
    if (value !== undefined) row.set(Number(column), value);
  }
  return row;
}

function workbook(
  rows?: Map<number, Map<number, string>>,
  omitSheet?: string,
): ParsedWorkbook {
  const headerRow = new Map<number, string>();
  IIH_HEADERS.forEach((header, index) => headerRow.set(index + 2, header));
  const data = rows ?? new Map<number, Map<number, string>>([
    [7, headerRow],
    [8, dataRow()],
  ]);
  const sheets: XlsxSheet[] = SHEET_NAMES
    .filter((name) => name !== omitSheet)
    .map((name, index) => ({
      name,
      // Solo la primera hoja lleva filas de datos (códigos CAP-xx).
      rows: index === 0 ? data : new Map([[7, headerRow]]),
    }));
  return { sheets };
}

interface Recorded {
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  notifications: Array<{
    userId: string;
    kind: string;
    payload: Record<string, unknown>;
  }>;
  downloadKeys: string[];
}

interface FakeOptions {
  role?: string | null;
  verifyProfile?: boolean;
  diagnostic?: Partial<DiagnosticRow> | null;
  document?: Partial<DocumentImportRow> | null;
  rpc?: RpcResult;
  downloadNull?: boolean;
  parseResult?: ParsedWorkbook;
  parseError?: Error;
}

async function makeDeps(options: FakeOptions = {}): Promise<{
  deps: Parameters<typeof createIihImportHandler>[1];
  recorded: Recorded;
  checksum: string;
}> {
  const checksum = await sha256HexBytes(BYTES);
  const recorded: Recorded = {
    rpcCalls: [],
    notifications: [],
    downloadKeys: [],
  };
  const diagnostic: DiagnosticRow | null = options.diagnostic === null
    ? null
    : {
      id: DIAG_ID,
      organizationId: ORG_ID,
      companyId: null,
      folio: "MDOHI-2026-001",
      faseActual: 3,
      estado: "activo",
      catEstado: "no_enviado",
      proximoHito: null,
      semaforoAtraso: "verde",
      avancePct: 50,
      fechaInicio: "2026-11-01",
      ...(options.diagnostic ?? {}),
    };
  const document: DocumentImportRow | null = options.document === null
    ? null
    : {
      id: DOC_ID,
      diagnosticId: DIAG_ID,
      organizationId: ORG_ID,
      r2Key: `org/${ORG_ID}/diag/${DIAG_ID}/${DOC_ID}.xlsx`,
      sha256: checksum,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: BYTES.length,
      uploadStatus: "registered",
      ...(options.document ?? {}),
    };
  const client: IihImportClient = {
    resolveRole: () =>
      Promise.resolve(
        (options.role !== undefined ? options.role : "coordinador") as
          | DiagnosticRole
          | null,
      ),
    verifyProfile: () => Promise.resolve(options.verifyProfile ?? true),
    fetchDiagnostic: () => Promise.resolve(diagnostic),
    fetchDocumentForImport: () => Promise.resolve(document),
    listMemberUserIds: () => Promise.resolve([USER_EQUIPO]),
    insertNotifications: (rows) => {
      recorded.notifications = rows;
      return Promise.resolve();
    },
    callRpc: <T extends RpcResult>(
      fn: string,
      args: Record<string, unknown>,
    ): Promise<T> => {
      recorded.rpcCalls.push({ fn, args });
      return Promise.resolve((options.rpc ?? { ok: true }) as T);
    },
  };
  return {
    deps: {
      client,
      download: (_config, key) => {
        recorded.downloadKeys.push(key);
        if (options.downloadNull === true) return Promise.resolve(null);
        return Promise.resolve({
          bytes: BYTES,
          contentType: "application/xml",
        });
      },
      parse: () => {
        if (options.parseError !== undefined) {
          return Promise.reject(options.parseError);
        }
        return Promise.resolve(options.parseResult ?? workbook());
      },
    },
    recorded,
    checksum,
  };
}

async function call(
  body: Record<string, unknown>,
  options: Parameters<typeof makeRequest>[1] = {},
  fake: FakeOptions = {},
): Promise<{
  response: Response;
  payload: Record<string, unknown>;
  recorded: Recorded;
  checksum: string;
}> {
  const { deps, recorded, checksum } = await makeDeps(fake);
  const handler = createIihImportHandler(CONFIG, deps);
  const response = await handler(
    await makeRequest(body, options, "/import/xlsx"),
  );
  const payload = await response.json() as Record<string, unknown>;
  return { response, payload, recorded, checksum };
}

function errorOf(payload: Record<string, unknown>): {
  code: string;
  details?: Record<string, unknown>;
} {
  return payload.error as { code: string; details?: Record<string, unknown> };
}

const BODY = { diagnostic_id: DIAG_ID, document_id: DOC_ID, kind: "iih" };

Deno.test("EF-09 200: descarga, parsea, checksum y RPC atómica; respuesta de contrato", async () => {
  const { response, payload, recorded, checksum } = await call(BODY, {
    origin: "https://app.example",
  }, {
    rpc: {
      ok: true,
      data: {
        destino_id: DIAG_ID,
        filas_ok: 1,
        filas_rechazadas: [],
        advertencias: [],
      },
    },
  });
  assertEquals(response.status, 200);
  assertEquals(payload.kind, "iih");
  assertEquals(payload.destino_id, DIAG_ID);
  assertEquals(payload.filas_ok, 1);
  assertEquals(payload.filas_rechazadas, []);
  assertEquals(recorded.downloadKeys.length, 1);
  assertEquals(recorded.rpcCalls.length, 1);
  assertEquals(recorded.rpcCalls[0].fn, "fn_import_iih_assets");
  assertEquals(recorded.rpcCalls[0].args.p_user_id, USER_EQUIPO);
  assertEquals(recorded.rpcCalls[0].args.p_checksum, checksum);
  assertEquals(recorded.rpcCalls[0].args.p_document_id, DOC_ID);
  assertEquals((recorded.rpcCalls[0].args.p_rows as unknown[]).length, 1);
  assertEquals(recorded.notifications.length, 1);
});

Deno.test("EF-09 422: plantilla/estructura inválida ⇒ VALIDATION_XLSX_ESTRUCTURA", async () => {
  const { response, payload, recorded } = await call(BODY, {}, {
    parseResult: workbook(undefined, "3. Tratamiento"),
  });
  assertEquals(response.status, 422);
  const error = errorOf(payload);
  assertEquals(error.code, "VALIDATION_XLSX_ESTRUCTURA");
  assertEquals(
    (error.details as { hojas_faltantes?: string[] }).hojas_faltantes,
    ["3. Tratamiento"],
  );
  assertEquals(recorded.rpcCalls.length, 0);
});

Deno.test("EF-09 422: sin filas válidas ⇒ VALIDATION_XLSX_ESTRUCTURA", async () => {
  const rows = new Map<number, Map<number, string>>([
    [7, workbook().sheets[0].rows.get(7) as Map<number, string>],
    [8, new Map<number, string>([[2, "CAP-01"], [3, "Tipo"]])],
  ]);
  const { response, payload } = await call(BODY, {}, {
    parseResult: workbook(rows),
  });
  assertEquals(response.status, 422);
  assertEquals(
    errorOf(payload).details?.reason,
    "sin_filas_validas",
  );
});

Deno.test("EF-09: rechazos por fila se combinan con los de la RPC (200)", async () => {
  const rows = new Map<number, Map<number, string>>([
    [7, workbook().sheets[0].rows.get(7) as Map<number, string>],
    [8, dataRow()],
    [9, dataRow({ 4: "", 5: "" })],
  ]);
  const { response, payload } = await call(BODY, {}, {
    parseResult: workbook(rows),
    rpc: {
      ok: true,
      data: {
        filas_ok: 1,
        filas_rechazadas: [{ fila: 10, razon: "asset_type inexistente" }],
      },
    },
  });
  assertEquals(response.status, 200);
  const rejected = payload.filas_rechazadas as Array<{ fila: number }>;
  assertEquals(rejected.length, 2);
  assertEquals(rejected.some((row) => row.fila === 9), true);
  assertEquals(rejected.some((row) => row.fila === 10), true);
});

Deno.test("EF-09 422: checksum no coincide; objeto inexistente; documento inválido", async () => {
  const mismatch = await call(BODY, {}, {
    document: { sha256: "b".repeat(64) },
  });
  assertEquals(mismatch.response.status, 422);
  assertEquals(
    errorOf(mismatch.payload).details?.reason,
    "checksum_no_coincide",
  );

  const missing = await call(BODY, {}, { downloadNull: true });
  assertEquals(missing.response.status, 422);
  assertEquals(
    errorOf(missing.payload).details?.reason,
    "objeto_no_encontrado",
  );

  const wrongDiag = await call(BODY, {}, {
    document: { diagnosticId: OTHER_DIAG },
  });
  assertEquals(wrongDiag.response.status, 422);
  assertEquals(
    errorOf(wrongDiag.payload).details?.reason,
    "documento_no_valido",
  );

  const notRegistered = await call(BODY, {}, {
    document: { uploadStatus: "pendiente" },
  });
  assertEquals(notRegistered.response.status, 422);
});

Deno.test("EF-09 403/401: rol observador, otro tenant y sin token", async () => {
  const observador = await call(BODY, {}, { role: "observador" });
  assertEquals(observador.response.status, 403);
  assertEquals(errorOf(observador.payload).code, "FORBIDDEN_ROLE");

  const otherTenant = await call(BODY, {}, {
    diagnostic: { organizationId: OTHER_ORG_ID },
  });
  assertEquals(otherTenant.response.status, 403);
  assertEquals(errorOf(otherTenant.payload).code, "FORBIDDEN_NOT_MEMBER");

  const noToken = await call(BODY, { token: null });
  assertEquals(noToken.response.status, 401);
  assertEquals(errorOf(noToken.payload).code, "AUTH_INVALID");
});

Deno.test("EF-09 409/422: conflicto de la RPC y Idempotency-Key inválida", async () => {
  const conflict = await call(BODY, {}, {
    rpc: { ok: false, code: "CONFLICT_STATE", details: { motivo: "idem" } },
  });
  assertEquals(conflict.response.status, 409);
  assertEquals(errorOf(conflict.payload).code, "CONFLICT_STATE");

  const invalid = await call(BODY, { idempotencyKey: "no-uuid" });
  assertEquals(invalid.response.status, 422);
  assertEquals(
    errorOf(invalid.payload).code,
    "VALIDATION_IDEMPOTENCY_KEY",
  );
});

Deno.test("EF-09 422: 0 filas de datos, MIME no permitido y documento ajeno", async () => {
  const headerRow = workbook().sheets[0].rows.get(7) as Map<number, string>;
  const zeroRows = await call(BODY, {}, {
    parseResult: workbook(new Map([[7, headerRow]])),
  });
  assertEquals(zeroRows.response.status, 422);
  assertEquals(errorOf(zeroRows.payload).details?.reason, "sin_filas");

  const mime = await call(BODY, {}, {
    document: { mime: "application/vnd.ms-excel" },
  });
  assertEquals(mime.response.status, 422);
  assertEquals(errorOf(mime.payload).details?.reason, "mime_no_permitido");

  const ajeno = await call(BODY, {}, {
    document: { diagnosticId: OTHER_DIAG },
  });
  assertEquals(ajeno.response.status, 422);
  assertEquals(errorOf(ajeno.payload).details?.reason, "documento_no_valido");
});

Deno.test("EF-09: body inválido, CORS y ruta desconocida", async () => {
  const missingDoc = await call({ ...BODY, document_id: "no-uuid" });
  assertEquals(missingDoc.response.status, 422);
  assertEquals(
    errorOf(missingDoc.payload).code,
    "VALIDATION_PARAMETRO_REQUERIDO",
  );

  const wrongKind = await call({ ...BODY, kind: "bhe" });
  assertEquals(wrongKind.response.status, 422);
  assertEquals(
    errorOf(wrongKind.payload).code,
    "VALIDATION_PARAMETRO_REQUERIDO",
  );

  const { deps } = await makeDeps();
  const handler = createIihImportHandler(CONFIG, deps);
  const preflight = await handler(
    await makeRequest(null, {
      method: "OPTIONS",
      origin: "https://app.example",
    }, "/import/xlsx"),
  );
  assertEquals(preflight.status, 204);
  assertEquals(
    preflight.headers.get("access-control-allow-origin"),
    "https://app.example",
  );

  const notFound = await handler(await makeRequest({}, {}, "/import/otro"));
  assertEquals(notFound.status, 404);
  assertNotIncludes(JSON.stringify(await notFound.json()), "hidria-docs");
});
