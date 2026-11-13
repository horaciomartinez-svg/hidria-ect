/**
 * task-39 — pruebas de contrato de EF-08 `documents/presign` (`_shared/presign.ts`).
 *
 * Cubre Q-08/ADR-012: membresía antes de firmar, roles, tenant fail-closed, respuesta mínima
 * (sin `r2_key`), TTL 300, idempotencia determinista, `register` 501 y CORS.
 */

import {
  assert,
  assertEquals,
  assertMatch,
  assertNotIncludes,
} from "./asserts.ts";
import { base64UrlEncode } from "../auth.ts";
import {
  createDocumentsHandler,
  type DocumentsDeps,
  type DocumentsHandlerConfig,
  matchDocumentsRoute,
} from "../presign.ts";

const TEST_SECRET = "jwt-secret-sintetico-f1-39";
const ISSUER = "https://test.supabase.co/auth/v1";
const USER_EMPRESA = "a1000000-0000-4000-8000-000000000003";
const USER_OBSERVADOR = "a1000000-0000-4000-8000-000000000004";
const ORG_ID = "00000000-0000-4000-8000-000000000001";
const DIAG_ID = "c1000000-0000-4000-8000-000000000001";
const OTHER_DIAG_ID = "c1000000-0000-4000-8000-000000000002";
const OTHER_ORG_ID = "00000000-0000-4000-8000-000000000002";
const R2_SECRET = "secreto-r2-sintetico-f1-39";
const URL_BASE = "https://test.supabase.co/functions/v1/ef-08-documents";

const encoder = new TextEncoder();

const CONFIG: DocumentsHandlerConfig = {
  auth: { jwtSecret: TEST_SECRET, expectedIssuer: ISSUER },
  r2: {
    accountId: "0123456789abcdef0123456789abcdef",
    accessKeyId: "AKIDTESTF1-39",
    secretAccessKey: R2_SECRET,
    bucket: "hidria-docs",
  },
  cors: { allowedOrigins: ["https://app.example"] },
};

const VALID_BODY = {
  diagnostic_id: DIAG_ID,
  filename: "layout_planta.pdf",
  doc_type: "layout",
  mime: "application/pdf",
  size_bytes: 2048,
  exposure_level: "restringido_nda",
};

function deps(
  overrides: Partial<DocumentsDeps> = {},
): DocumentsDeps {
  return {
    resolveRole: (_userId: string, diagnosticId: string) =>
      Promise.resolve(diagnosticId === DIAG_ID ? "empresa" : null),
    fetchDiagnostic: (diagnosticId: string) =>
      Promise.resolve(
        diagnosticId === DIAG_ID
          ? { id: DIAG_ID, organizationId: ORG_ID, companyId: null }
          : null,
      ),
    now: () => new Date("2026-11-12T20:00:00.000Z"),
    ...overrides,
  };
}

async function signToken(
  sub: string = USER_EMPRESA,
  globalRole = "empresa",
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(
    encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const payload = base64UrlEncode(
    encoder.encode(JSON.stringify({
      iss: ISSUER,
      sub,
      aud: "authenticated",
      role: "authenticated",
      iat: now,
      exp: now + 3600,
      organization_id: ORG_ID,
      tenant_id: ORG_ID,
      global_role: globalRole,
    })),
  );
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(TEST_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput)),
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

interface RequestOptions {
  token?: string | null;
  idempotencyKey?: string;
  origin?: string;
  path?: string;
  method?: string;
}

async function request(
  body: unknown,
  options: RequestOptions = {},
): Promise<Request> {
  const {
    token = await signToken(),
    idempotencyKey,
    origin,
    path = "/presign",
    method = "POST",
  } = options;
  const headers = new Headers({ "content-type": "application/json" });
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  if (idempotencyKey !== undefined) {
    headers.set("idempotency-key", idempotencyKey);
  }
  if (origin !== undefined) headers.set("origin", origin);
  return new Request(`${URL_BASE}${path}`, {
    method,
    headers,
    body: method === "GET" || method === "OPTIONS"
      ? undefined
      : JSON.stringify(body),
  });
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

async function expectError(
  responsePromise: Promise<Response>,
  status: number,
  code: string,
): Promise<Record<string, unknown>> {
  const response = await responsePromise;
  assertEquals(response.status, status);
  const body = await bodyOf(response);
  const error = body.error as { code?: string } | undefined;
  assertEquals(error?.code, code);
  return body;
}

// ---------------------------------------------------------------------------

Deno.test("presign 200: respuesta mínima sin r2_key, TTL 300 y Content-Type firmado", async () => {
  const response = await createDocumentsHandler(CONFIG, deps())(
    await request(VALID_BODY, { origin: "https://app.example" }),
  );
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "no-store");
  assertEquals(
    response.headers.get("access-control-allow-origin"),
    "https://app.example",
  );

  const body = await bodyOf(response);
  assertEquals(
    Object.keys(body).sort(),
    ["document_id", "expira_en_seg", "metodo", "upload_url"],
  );
  assertEquals(body.expira_en_seg, 300);
  assertEquals(body.metodo, "PUT");
  assertMatch(String(body.document_id), /^[0-9a-f-]{36}$/);
  const uploadUrl = String(body.upload_url);
  assert(
    uploadUrl.startsWith(
      "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/hidria-docs/org/",
    ),
    uploadUrl,
  );
  assert(uploadUrl.includes("X-Amz-SignedHeaders=content-type%3Bhost"));
  assert(uploadUrl.includes("X-Amz-Expires=300"));
  assert(uploadUrl.includes(String(body.document_id)));
  assertNotIncludes(JSON.stringify(body), R2_SECRET);
  assertNotIncludes(JSON.stringify(body), "r2_key");
});

Deno.test("presign 401 sin token; 404 en ruta desconocida; 501 en register", async () => {
  const handler = createDocumentsHandler(CONFIG, deps());

  await expectError(
    handler(await request(VALID_BODY, { token: null })),
    401,
    "AUTH_INVALID",
  );

  await expectError(
    handler(await request(VALID_BODY, { path: "/desconocido" })),
    404,
    "NOT_FOUND",
  );

  const registerBody = await expectError(
    handler(await request(VALID_BODY, { path: "/register" })),
    501,
    "NOT_IMPLEMENTED_PHASE",
  );
  assertEquals(
    (registerBody.error as { message: string }).message.includes("F1-05"),
    true,
  );
  await expectError(
    handler(await request(VALID_BODY, { path: "/register", token: null })),
    401,
    "AUTH_INVALID",
  );
});

Deno.test("presign 422 sin diagnostic_id (QA: entrada del cliente)", async () => {
  const body = await expectError(
    createDocumentsHandler(CONFIG, deps())(
      await request({ ...VALID_BODY, diagnostic_id: undefined }),
    ),
    422,
    "VALIDATION_PARAMETRO_REQUERIDO",
  );
  assertEquals((body.error as { details: unknown }).details, {
    param: "diagnostic_id",
  });
});

Deno.test("presign 403: no miembro, observador/invitado y tenant distinto", async () => {
  const nonMember = await expectError(
    createDocumentsHandler(
      CONFIG,
      deps({ resolveRole: () => Promise.resolve(null) }),
    )(
      await request({ ...VALID_BODY, diagnostic_id: OTHER_DIAG_ID }),
    ),
    403,
    "FORBIDDEN_NOT_MEMBER",
  );
  assert((nonMember.error as { code: string }).code);
  assertEquals(
    (nonMember.error as { code: string }).code,
    "FORBIDDEN_NOT_MEMBER",
  );

  await expectError(
    createDocumentsHandler(
      CONFIG,
      deps({ resolveRole: () => Promise.resolve("observador") }),
    )(await request(VALID_BODY)),
    403,
    "FORBIDDEN_ROLE",
  );

  // Miembro con rol válido pero diagnóstico de otro tenant ⇒ fail-closed.
  await expectError(
    createDocumentsHandler(
      CONFIG,
      deps({
        fetchDiagnostic: () =>
          Promise.resolve({
            id: DIAG_ID,
            organizationId: OTHER_ORG_ID,
            companyId: null,
          }),
      }),
    )(await request(VALID_BODY)),
    403,
    "FORBIDDEN_NOT_MEMBER",
  );
});

Deno.test("presign 422 de metadatos: campos, MIME, tamaño, traversal, doc_type, exposure", async () => {
  const handler = createDocumentsHandler(CONFIG, deps());
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ ...VALID_BODY, filename: undefined }, "VALIDATION_PARAMETRO_REQUERIDO"],
    [{ ...VALID_BODY, mime: undefined }, "VALIDATION_PARAMETRO_REQUERIDO"],
    [
      { ...VALID_BODY, size_bytes: undefined },
      "VALIDATION_PARAMETRO_REQUERIDO",
    ],
    [{ ...VALID_BODY, doc_type: undefined }, "VALIDATION_PARAMETRO_REQUERIDO"],
    [{ ...VALID_BODY, mime: "application/x-msdownload" }, "VALIDATION_FILE"],
    [{ ...VALID_BODY, size_bytes: 0 }, "VALIDATION_FILE"],
    [{ ...VALID_BODY, size_bytes: 100 * 1024 * 1024 + 1 }, "VALIDATION_FILE"],
    [{ ...VALID_BODY, filename: "../../etc/passwd.pdf" }, "VALIDATION_FILE"],
    [{ ...VALID_BODY, filename: "layout.exe" }, "VALIDATION_FILE"],
    [{ ...VALID_BODY, doc_type: "hoja" }, "VALIDATION_DOC_TYPE"],
    [
      { ...VALID_BODY, exposure_level: "publico_total" },
      "VALIDATION_EXPOSURE_LEVEL",
    ],
  ];
  for (const [body, code] of cases) {
    await expectError(handler(await request(body)), 422, code);
  }
});

Deno.test("presign: Idempotency-Key determinista reutiliza document_id; clave inválida 422", async () => {
  const handler = createDocumentsHandler(CONFIG, deps());
  const key = "22222222-2222-4222-8222-222222222222";

  const first = await bodyOf(
    await handler(await request(VALID_BODY, { idempotencyKey: key })),
  );
  const second = await bodyOf(
    await handler(await request(VALID_BODY, { idempotencyKey: key })),
  );
  assertEquals(first.document_id, second.document_id);

  const other = await bodyOf(
    await handler(
      await request(VALID_BODY, { idempotencyKey: crypto.randomUUID() }),
    ),
  );
  assert(other.document_id !== first.document_id);

  await expectError(
    handler(await request(VALID_BODY, { idempotencyKey: "no-uuid" })),
    422,
    "VALIDATION_IDEMPOTENCY_KEY",
  );
});

Deno.test("presign: JSON inválido y cuerpo no-JSON ⇒ 422 VALIDATION_JSON", async () => {
  const handler = createDocumentsHandler(CONFIG, deps());
  const token = await signToken();

  const nonJson = new Request(`${URL_BASE}/presign`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      authorization: `Bearer ${token}`,
    },
    body: "hola",
  });
  await expectError(handler(nonJson), 422, "VALIDATION_JSON");

  const invalidJson = new Request(`${URL_BASE}/presign`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: "{no-json",
  });
  await expectError(handler(invalidJson), 422, "VALIDATION_JSON");
});

Deno.test("presign: CORS preflight permitido y origen no permitido sin ACAO", async () => {
  const handler = createDocumentsHandler(CONFIG, deps());

  const preflight = await handler(
    await request(null, { method: "OPTIONS", origin: "https://app.example" }),
  );
  assertEquals(preflight.status, 204);
  assertEquals(
    preflight.headers.get("access-control-allow-origin"),
    "https://app.example",
  );

  const evil = await handler(
    await request(VALID_BODY, { origin: "https://evil.example" }),
  );
  assertEquals(evil.headers.get("access-control-allow-origin"), null);
});

Deno.test("presign: GET ⇒ 404 del router (solo POST)", async () => {
  const handler = createDocumentsHandler(CONFIG, deps());
  await expectError(
    handler(await request(null, { method: "GET", path: "/presign" })),
    404,
    "NOT_FOUND",
  );
});

Deno.test("matchDocumentsRoute: rutas del contrato y de despliegue", () => {
  assertEquals(
    matchDocumentsRoute("POST", `${URL_BASE}/presign`),
    "presign",
  );
  assertEquals(
    matchDocumentsRoute(
      "POST",
      "https://test.supabase.co/functions/v1/documents/presign",
    ),
    "presign",
  );
  assertEquals(
    matchDocumentsRoute("POST", "/functions/v1/ef-08-documents/register"),
    "register",
  );
  assertEquals(matchDocumentsRoute("GET", `${URL_BASE}/presign`), null);
  assertEquals(matchDocumentsRoute("POST", `${URL_BASE}/otra`), null);
});

Deno.test("presign: el rol se resuelve con el usuario/tenant del JWT (no del body)", async () => {
  const seen: Array<[string, string]> = [];
  const handler = createDocumentsHandler(
    CONFIG,
    deps({
      resolveRole: (userId: string, diagnosticId: string) => {
        seen.push([userId, diagnosticId]);
        return Promise.resolve("empresa");
      },
    }),
  );
  const response = await handler(
    await request({
      ...VALID_BODY,
      user_id: "a1000000-0000-4000-8000-000000000005",
      rol: "coordinador",
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(seen, [[USER_EMPRESA, DIAG_ID]]);
});

Deno.test("presign: rol de diagnóstico observador ⇒ 403 aunque el body diga coordinador", async () => {
  // El rol de diagnóstico lo resuelve el servidor (fn_diag_role), nunca el body.
  const handler = createDocumentsHandler(
    CONFIG,
    deps({ resolveRole: () => Promise.resolve("observador") }),
  );
  const observerToken = await signToken(USER_OBSERVADOR, "observador");
  await expectError(
    handler(
      await request({
        ...VALID_BODY,
        rol: "coordinador",
        global_role: "coordinador_srhds",
      }, { token: observerToken }),
    ),
    403,
    "FORBIDDEN_ROLE",
  );
});
