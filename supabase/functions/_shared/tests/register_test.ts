/**
 * F1-05 (task-106) — pruebas de contrato de EF-08 `register`.
 *
 * Sin red: `HEAD` de R2 y la RPC `fn_register_document` se inyectan. JWT sintético.
 */

import { assertEquals, assertNotIncludes } from "./asserts.ts";
import type { DiagnosticRole } from "../auth.ts";
import { ApiError } from "../errors.ts";
import {
  createDocumentsHandler,
  type DiagnosticScope,
  type DocumentsDeps,
  type DocumentsHandlerConfig,
  type RegisterDocumentArgs,
  type RegisterDocumentResult,
} from "../presign.ts";
import type { HeadObjectResult, R2Config } from "../r2.ts";
import {
  DIAG_ID,
  ISSUER,
  makeRequest,
  ORG_ID,
  TEST_SECRET,
  USER_EQUIPO,
} from "./ef_fakes.ts";

const R2: R2Config = {
  accountId: "cuenta-sintetica",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "secreto-r2-sintetico-f1-05",
  bucket: "hidria-docs",
  region: "auto",
};

const CONFIG: DocumentsHandlerConfig = {
  auth: { jwtSecret: TEST_SECRET, expectedIssuer: ISSUER },
  r2: R2,
  cors: { allowedOrigins: ["https://app.example"] },
};

const DOCUMENT_ID = "d1000000-0000-4000-8000-000000000001";
const OTHER_ORG_ID = "00000000-0000-4000-8000-000000000002";

const VALID_BODY = {
  diagnostic_id: DIAG_ID,
  document_id: DOCUMENT_ID,
  filename: "layout_planta.pdf",
  doc_type: "layout",
  mime: "application/pdf",
  size_bytes: 482133,
  exposure_level: "restringido_nda",
  sha256: "a".repeat(64),
};

const HEAD_OK: HeadObjectResult = {
  exists: true,
  sizeBytes: 482133,
  contentType: "application/pdf",
};

interface Recorded {
  headKeys: string[];
  rpcArgs: RegisterDocumentArgs[];
  verifyCalls: number;
}

interface FakeOptions {
  role?: string | null;
  verifyProfile?: boolean;
  diagnostic?: Partial<DiagnosticScope> | null;
  head?: HeadObjectResult | Error;
  rpc?: RegisterDocumentResult;
}

function makeFake(options: FakeOptions = {}): {
  deps: DocumentsDeps;
  recorded: Recorded;
} {
  const recorded: Recorded = { headKeys: [], rpcArgs: [], verifyCalls: 0 };
  const diagnostic: DiagnosticScope | null = options.diagnostic === null
    ? null
    : {
      id: DIAG_ID,
      organizationId: ORG_ID,
      companyId: null,
      ...(options.diagnostic ?? {}),
    };
  const deps: DocumentsDeps = {
    resolveRole: () =>
      Promise.resolve(
        (options.role !== undefined ? options.role : "coordinador") as
          | DiagnosticRole
          | null,
      ),
    fetchDiagnostic: () => Promise.resolve(diagnostic),
    verifyProfile: () => {
      recorded.verifyCalls += 1;
      return Promise.resolve(options.verifyProfile ?? true);
    },
    head: (_config: R2Config, key: string) => {
      recorded.headKeys.push(key);
      if (options.head instanceof Error) return Promise.reject(options.head);
      return Promise.resolve(options.head ?? HEAD_OK);
    },
    registerDocument: (args) => {
      recorded.rpcArgs.push(args);
      return Promise.resolve(
        options.rpc ?? {
          ok: true,
          replayed: false,
          data: { document_id: DOCUMENT_ID, sha256: VALID_BODY.sha256 },
        },
      );
    },
  };
  return { deps, recorded };
}

async function call(
  bodyValue: Record<string, unknown>,
  options: Parameters<typeof makeRequest>[1] = {},
  fakeOptions: FakeOptions = {},
): Promise<
  { response: Response; recorded: Recorded; payload: Record<string, unknown> }
> {
  const { deps, recorded } = makeFake(fakeOptions);
  const handler = createDocumentsHandler(CONFIG, deps);
  const response = await handler(
    await makeRequest(bodyValue, options, "/documents/register"),
  );
  const payload = await response.json() as Record<string, unknown>;
  return { response, recorded, payload };
}

Deno.test("register 200: HEAD con clave server-side, RPC atómica y respuesta sin r2_key", async () => {
  const { response, recorded, payload } = await call(VALID_BODY, {
    origin: "https://app.example",
  });
  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("access-control-allow-origin"),
    "https://app.example",
  );
  assertEquals(payload, {
    document_id: DOCUMENT_ID,
    sha256: VALID_BODY.sha256,
  });
  assertNotIncludes(JSON.stringify(payload), "r2_key");
  assertNotIncludes(JSON.stringify(payload), R2.secretAccessKey);

  assertEquals(recorded.verifyCalls, 1);
  assertEquals(recorded.headKeys.length, 1);
  assertEquals(
    recorded.headKeys[0],
    `org/${ORG_ID}/diag/${DIAG_ID}/${DOCUMENT_ID}.pdf`,
  );
  assertEquals(recorded.rpcArgs.length, 1);
  const args = recorded.rpcArgs[0];
  assertEquals(args.p_user_id, USER_EQUIPO);
  assertEquals(args.p_document_id, DOCUMENT_ID);
  assertEquals(args.p_diagnostic_id, DIAG_ID);
  assertEquals(args.p_doc_type, "layout");
  assertEquals(args.p_title, "layout_planta");
  assertEquals(args.p_mime, "application/pdf");
  assertEquals(args.p_size_bytes, 482133);
  assertEquals(args.p_sha256, VALID_BODY.sha256);
  assertEquals(args.p_exposure_level, "restringido_nda");
  assertEquals(args.p_idempotency_key, null);
  assertEquals(typeof args.p_request_hash, "string");
  assertEquals(args.p_request_hash.length, 64);
  assertEquals(args.p_extension, "pdf");
});

Deno.test("register replay idempotente: 200 con el mismo cuerpo", async () => {
  const { response, payload } = await call(
    VALID_BODY,
    { idempotencyKey: "22222222-2222-4222-8222-222222222222" },
    { rpc: { ok: true, replayed: true, data: {} } },
  );
  assertEquals(response.status, 200);
  assertEquals(payload, {
    document_id: DOCUMENT_ID,
    sha256: VALID_BODY.sha256,
  });
});

Deno.test("register 401: sin token o verifyProfile falso", async () => {
  const noToken = await call(VALID_BODY, { token: null });
  assertEquals(noToken.response.status, 401);
  assertEquals(
    (noToken.payload.error as { code: string }).code,
    "AUTH_INVALID",
  );

  const badProfile = await call(VALID_BODY, {}, { verifyProfile: false });
  assertEquals(badProfile.response.status, 401);
  assertEquals(
    (badProfile.payload.error as { code: string }).code,
    "AUTH_INVALID",
  );
});

Deno.test("register 403: observador, no miembro y tenant distinto (anti-enumeración)", async () => {
  const observador = await call(VALID_BODY, {}, { role: "observador" });
  assertEquals(observador.response.status, 403);
  assertEquals(
    (observador.payload.error as { code: string }).code,
    "FORBIDDEN_ROLE",
  );

  const nonMember = await call(VALID_BODY, {}, { role: null });
  assertEquals(nonMember.response.status, 403);
  assertEquals(
    (nonMember.payload.error as { code: string }).code,
    "FORBIDDEN_NOT_MEMBER",
  );

  const otherTenant = await call(VALID_BODY, {}, {
    diagnostic: { organizationId: OTHER_ORG_ID },
  });
  assertEquals(otherTenant.response.status, 403);
  assertEquals(
    (otherTenant.payload.error as { code: string }).code,
    "FORBIDDEN_NOT_MEMBER",
  );
});

Deno.test("register 422: document_id/sha256/metadatos inválidos", async () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [
      { ...VALID_BODY, document_id: "no-uuid" },
      "VALIDATION_PARAMETRO_REQUERIDO",
    ],
    [
      { ...VALID_BODY, document_id: undefined },
      "VALIDATION_PARAMETRO_REQUERIDO",
    ],
    [{ ...VALID_BODY, sha256: undefined }, "VALIDATION_PARAMETRO_REQUERIDO"],
    [{ ...VALID_BODY, sha256: "xyz" }, "VALIDATION_FILE"],
    [{ ...VALID_BODY, mime: "text/plain" }, "VALIDATION_FILE"],
    [{ ...VALID_BODY, size_bytes: 0 }, "VALIDATION_FILE"],
    [{ ...VALID_BODY, filename: "../../etc/passwd.pdf" }, "VALIDATION_FILE"],
    [{ ...VALID_BODY, doc_type: "otro_invalido" }, "VALIDATION_DOC_TYPE"],
    [{ ...VALID_BODY, exposure_level: "secreto" }, "VALIDATION_EXPOSURE_LEVEL"],
  ];
  for (const [bodyValue, code] of cases) {
    const { response, payload } = await call(bodyValue);
    assertEquals(response.status, 422);
    assertEquals((payload.error as { code: string }).code, code);
  }
});

Deno.test("register 422: objeto ausente o no coincide con los metadatos (HEAD)", async () => {
  const missing = await call(VALID_BODY, {}, {
    head: { exists: false, sizeBytes: null, contentType: null },
  });
  assertEquals(missing.response.status, 422);
  assertEquals(
    (missing.payload.error as { details: { reason: string } }).details.reason,
    "objeto_no_encontrado",
  );

  const size = await call(VALID_BODY, {}, {
    head: { exists: true, sizeBytes: 10, contentType: "application/pdf" },
  });
  assertEquals(size.response.status, 422);
  assertEquals(
    (size.payload.error as { details: { reason: string } }).details.reason,
    "tamano_no_coincide",
  );

  const mime = await call(VALID_BODY, {}, {
    head: { exists: true, sizeBytes: 482133, contentType: "image/png" },
  });
  assertEquals(mime.response.status, 422);
  assertEquals(
    (mime.payload.error as { details: { reason: string } }).details.reason,
    "mime_no_coincide",
  );
});

Deno.test("register 500 saneado si HEAD falla (sin credenciales/R2 en el mensaje)", async () => {
  const { response, payload } = await call(VALID_BODY, {}, {
    head: new ApiError(
      "INTERNAL_ERROR",
      "No se pudo verificar el objeto en el almacenamiento.",
    ),
  });
  assertEquals(response.status, 500);
  const error = payload.error as { code: string; message: string };
  assertEquals(error.code, "INTERNAL_ERROR");
  assertNotIncludes(error.message, R2.secretAccessKey);
  assertNotIncludes(error.message, "hidria-docs");
});

Deno.test("register 409/422 desde la RPC: CONFLICT_STATE y errores de validación", async () => {
  const conflict = await call(VALID_BODY, {}, {
    rpc: {
      ok: false,
      code: "CONFLICT_STATE",
      details: { reason: "duplicado" },
    },
  });
  assertEquals(conflict.response.status, 409);
  assertEquals(
    (conflict.payload.error as { code: string }).code,
    "CONFLICT_STATE",
  );

  const invalid = await call(VALID_BODY, {}, {
    rpc: {
      ok: false,
      code: "VALIDATION_FILE",
      message: "Metadatos invalidados por la RPC.",
    },
  });
  assertEquals(invalid.response.status, 422);
  assertEquals(
    (invalid.payload.error as { message: string }).message,
    "Metadatos invalidados por la RPC.",
  );
});

Deno.test("register: Idempotency-Key inválida ⇒ 422 sin llamar a la RPC", async () => {
  const { response, recorded, payload } = await call(VALID_BODY, {
    idempotencyKey: "no-uuid",
  });
  assertEquals(response.status, 422);
  assertEquals(
    (payload.error as { code: string }).code,
    "VALIDATION_IDEMPOTENCY_KEY",
  );
  assertEquals(recorded.rpcArgs.length, 0);
});

Deno.test("register: preflight CORS y ruta desconocida", async () => {
  const { deps } = makeFake();
  const handler = createDocumentsHandler(CONFIG, deps);
  const preflight = await handler(
    await makeRequest(null, {
      method: "OPTIONS",
      origin: "https://app.example",
    }, "/documents/register"),
  );
  assertEquals(preflight.status, 204);
  assertEquals(
    preflight.headers.get("access-control-allow-origin"),
    "https://app.example",
  );

  const notFound = await handler(
    await makeRequest({}, {}, "/documents/inexistente"),
  );
  assertEquals(notFound.status, 404);
});

Deno.test("register B1: extensión canónica por MIME y title sin extensión", async () => {
  const cases: Array<{
    filename: string;
    mime: string;
    size: number;
    extension: string;
    title: string;
  }> = [
    {
      filename: "foto_planta.jpeg",
      mime: "image/jpeg",
      size: 2048,
      extension: "jpg",
      title: "foto_planta",
    },
    {
      filename: "scan.tiff",
      mime: "image/tiff",
      size: 4096,
      extension: "tif",
      title: "scan",
    },
    {
      filename: "report.final.pdf",
      mime: "application/pdf",
      size: 1024,
      extension: "pdf",
      title: "report.final",
    },
  ];
  for (const item of cases) {
    const { response, recorded, payload } = await call(
      {
        ...VALID_BODY,
        filename: item.filename,
        mime: item.mime,
        size_bytes: item.size,
      },
      {},
      {
        head: {
          exists: true,
          sizeBytes: item.size,
          contentType: item.mime,
        },
      },
    );
    assertEquals(response.status, 200);
    assertEquals(payload.document_id, DOCUMENT_ID);
    assertEquals(
      recorded.headKeys[0],
      `org/${ORG_ID}/diag/${DIAG_ID}/${DOCUMENT_ID}.${item.extension}`,
    );
    assertEquals(recorded.rpcArgs[0].p_extension, item.extension);
    assertEquals(recorded.rpcArgs[0].p_title, item.title);
  }
});
