/**
 * F1-09 (task-143) — pruebas de EF-09 `kind='bhe'` (plantilla BHE, mapeo 12 meses).
 * Sin red: R2/checksum/parser/RPC inyectados; JWT sintético.
 */

import { assertEquals } from "./asserts.ts";
import type { DiagnosticRole } from "../auth.ts";
import type { DiagnosticRow, DocumentImportRow, RpcResult } from "../db.ts";
import {
  BHE_MONTHS,
  createIihImportHandler,
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
const BYTES = new TextEncoder().encode("xlsx-bhe-sintetico-f1-09");

const CONFIG: IihImportConfig = {
  auth: { jwtSecret: TEST_SECRET, expectedIssuer: ISSUER },
  cors: { allowedOrigins: ["https://app.example"] },
  r2: {
    accountId: "cuenta-sintetica",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "secreto-r2-sintetico-f1-09",
    bucket: "hidria-docs",
    region: "auto",
  },
};

const SHEET_NAMES = [
  "1. Entradas",
  "2. Destinos del agua",
  "3. Reúso y calidad",
] as const;

function headerRow(count: number): Map<number, string> {
  const row = new Map<number, string>();
  row.set(2, "Concepto");
  for (let index = 0; index < 12; index += 1) {
    row.set(3 + index, BHE_MONTHS[index]);
  }
  row.set(15, "Total anual");
  row.set(16, "Promedio mensual");
  void count;
  return row;
}

function emptyWorkbook(): ParsedWorkbook {
  const sheets: XlsxSheet[] = SHEET_NAMES.map((name) => {
    const header = headerRow(0);
    const rows = new Map<number, Map<number, string>>();
    rows.set(name === "3. Reúso y calidad" ? 7 : 6, header);
    return { name, rows };
  });
  return { sheets };
}

function addMonth(
  workbook: ParsedWorkbook,
  sheetName: string,
  row: number,
  month: number,
  value: number,
): void {
  const sheet = workbook.sheets.find((item) => item.name === sheetName);
  if (sheet === undefined) return;
  const rows = sheet.rows as Map<number, Map<number, string>>;
  const cells = rows.get(row) ?? new Map<number, string>();
  cells.set(2 + month, String(value));
  rows.set(row, cells);
}

function validWorkbook(): ParsedWorkbook {
  const workbook = emptyWorkbook();
  addMonth(workbook, "1. Entradas", 7, 1, 100);
  addMonth(workbook, "1. Entradas", 8, 1, 50);
  addMonth(workbook, "1. Entradas", 9, 1, 25);
  addMonth(workbook, "2. Destinos del agua", 8, 1, 40);
  addMonth(workbook, "2. Destinos del agua", 19, 1, 10);
  addMonth(workbook, "3. Reúso y calidad", 8, 1, 5);
  return workbook;
}

interface Recorded {
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  notifications: Array<{ userId: string; kind: string }>;
  downloadKeys: string[];
}

interface FakeOptions {
  role?: string | null;
  verifyProfile?: boolean;
  diagnostic?: Partial<DiagnosticRow>;
  document?: Partial<DocumentImportRow> | null;
  rpc?: RpcResult;
  parseResult?: ParsedWorkbook;
}

async function makeDeps(options: FakeOptions = {}): Promise<{
  deps: Parameters<typeof createIihImportHandler>[1];
  recorded: Recorded;
}> {
  const checksum = await sha256HexBytes(BYTES);
  const recorded: Recorded = {
    rpcCalls: [],
    notifications: [],
    downloadKeys: [],
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
    fetchDiagnostic: () =>
      Promise.resolve({
        id: DIAG_ID,
        organizationId: ORG_ID,
        companyId: null,
        folio: "MDOHI-2026-001",
        faseActual: 4,
        estado: "activo",
        catEstado: "validado_r2",
        proximoHito: null,
        semaforoAtraso: "verde",
        avancePct: 60,
        fechaInicio: "2026-11-01",
        ...(options.diagnostic ?? {}),
      } as DiagnosticRow),
    fetchDocumentForImport: () => Promise.resolve(document),
    listMemberUserIds: () => Promise.resolve([USER_EQUIPO]),
    insertNotifications: (rows) => {
      recorded.notifications = rows.map((row) => ({
        userId: row.userId,
        kind: row.kind,
      }));
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
        return Promise.resolve({
          bytes: BYTES,
          contentType: "application/xml",
        });
      },
      parse: () => Promise.resolve(options.parseResult ?? validWorkbook()),
    },
    recorded,
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
}> {
  const { deps, recorded } = await makeDeps(fake);
  const handler = createIihImportHandler(CONFIG, deps);
  const response = await handler(
    await makeRequest(body, options, "/import/xlsx"),
  );
  const payload = await response.json() as Record<string, unknown>;
  return { response, payload, recorded };
}

const BODY = {
  diagnostic_id: DIAG_ID,
  document_id: DOC_ID,
  kind: "bhe",
  periodo_anio: 2026,
};

function errorOf(payload: Record<string, unknown>): {
  code: string;
  details?: Record<string, unknown>;
} {
  return payload.error as { code: string; details?: Record<string, unknown> };
}

Deno.test("EF-09-bhe 200: mapea hojas 1/2/3A, agrega pozos y responde periodo/destino", async () => {
  const { response, payload, recorded } = await call(BODY, {
    origin: "https://app.example",
  }, {
    rpc: {
      ok: true,
      data: { destino_id: "be100000-0000-4000-8000-000000000001", filas_ok: 5 },
    },
  });
  assertEquals(response.status, 200);
  assertEquals(payload.kind, "bhe");
  assertEquals(payload.periodo_anio, 2026);
  assertEquals(payload.destino_id, "be100000-0000-4000-8000-000000000001");
  assertEquals(payload.filas_ok, 5);
  assertEquals(payload.filas_rechazadas, []);
  const advertencias = payload.advertencias as string[];
  assertEquals(advertencias.length, 1);

  assertEquals(recorded.rpcCalls.length, 1);
  assertEquals(recorded.rpcCalls[0].fn, "fn_import_bhe");
  const args = recorded.rpcCalls[0].args;
  assertEquals(args.p_periodo_anio, 2026);
  assertEquals(args.p_user_id, USER_EQUIPO);
  const rows = args.p_rows as Array<{
    catalog_code: string;
    mes: number;
    volumen_m3: number;
  }>;
  assertEquals(rows.length, 5);
  const ent02 = rows.find((row) => row.catalog_code === "ENT-02");
  assertEquals(ent02?.volumen_m3, 75);
  assertEquals(rows.some((row) => row.catalog_code === "ENT-01"), true);
  assertEquals(rows.some((row) => row.catalog_code === "DST-13"), true);
  assertEquals(rows.some((row) => row.catalog_code === "CIR-01"), true);
});

Deno.test("EF-09-bhe 422: exige periodo_anio y valida estructura/hojas", async () => {
  const noPeriodo = await call({
    diagnostic_id: DIAG_ID,
    document_id: DOC_ID,
    kind: "bhe",
  });
  assertEquals(noPeriodo.response.status, 422);
  assertEquals(
    errorOf(noPeriodo.payload).code,
    "VALIDATION_PARAMETRO_REQUERIDO",
  );

  const badPeriodo = await call({ ...BODY, periodo_anio: 1999 });
  assertEquals(badPeriodo.response.status, 422);

  const missingSheet: ParsedWorkbook = {
    sheets: validWorkbook().sheets.filter((sheet) =>
      sheet.name !== "3. Reúso y calidad"
    ),
  };
  const structure = await call(BODY, {}, { parseResult: missingSheet });
  assertEquals(structure.response.status, 422);
  assertEquals(
    errorOf(structure.payload).code,
    "VALIDATION_XLSX_ESTRUCTURA",
  );

  const empty = await call(BODY, {}, { parseResult: emptyWorkbook() });
  assertEquals(empty.response.status, 422);
  assertEquals(
    errorOf(empty.payload).code,
    "VALIDATION_XLSX_ESTRUCTURA",
  );
});

Deno.test("EF-09-bhe 409/422: conflicto de RPC e Idempotency-Key inválida", async () => {
  const conflict = await call(BODY, {}, {
    rpc: {
      ok: false,
      code: "CONFLICT_STATE",
      details: { motivo: "validado_r3" },
    },
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

Deno.test("EF-09-bhe 403/401: rol observador, otro tenant y sin token", async () => {
  const observador = await call(BODY, {}, { role: "observador" });
  assertEquals(observador.response.status, 403);
  assertEquals(errorOf(observador.payload).code, "FORBIDDEN_ROLE");

  const otherTenant = await call(BODY, {}, {
    diagnostic: { organizationId: OTHER_ORG_ID },
  });
  assertEquals(otherTenant.response.status, 403);

  const noToken = await call(BODY, { token: null });
  assertEquals(noToken.response.status, 401);
});
