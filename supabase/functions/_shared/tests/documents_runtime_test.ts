/**
 * task-39 — pruebas de `_shared/documents_runtime.ts` (env → config + RPC/PostgREST).
 * Usa un `fetch` falso: sin red, sin Supabase y sin secretos reales.
 */

import { assert, assertEquals, assertNotIncludes } from "./asserts.ts";
import { ApiError } from "../errors.ts";
import {
  createRuntimeDocumentsConfig,
  createSupabaseDocumentsDeps,
} from "../documents_runtime.ts";

const USER_ID = "a1000000-0000-4000-8000-000000000003";
const DIAG_ID = "c1000000-0000-4000-8000-000000000001";
const ORG_ID = "00000000-0000-4000-8000-000000000001";
const SERVICE_KEY = "service-role-sintetico-f1-39";

const ENV: Record<string, string | undefined> = {
  SUPABASE_URL: "https://test.supabase.co/",
  SUPABASE_JWT_SECRET: "jwt-secret-sintetico-f1-39",
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_ACCESS_KEY_ID: "AKIDTESTF1-39",
  R2_SECRET_ACCESS_KEY: "secreto-r2-sintetico-f1-39",
  R2_BUCKET_DOCS: "hidria-docs",
  CORS_ALLOWED_ORIGINS: "https://app.example,http://localhost:5173",
};

interface FetchCall {
  url: string;
  init: RequestInit;
}

function fakeFetch(
  responder: (call: FetchCall) => Response | Promise<Response>,
): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const call: FetchCall = {
      url: typeof input === "string" ? input : input.toString(),
      init: init ?? {},
    };
    calls.push(call);
    return Promise.resolve(responder(call));
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function expectApiError(
  promise: Promise<unknown>,
  code: string,
): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof ApiError, "se esperaba un ApiError");
    assertEquals(error.code, code);
    return error;
  }
  throw new Error(`se esperaba ApiError ${code}`);
}

Deno.test("runtime: configuración de auth, R2 y CORS desde env", () => {
  const config = createRuntimeDocumentsConfig(ENV);
  assertEquals(config.auth.jwtSecret, ENV.SUPABASE_JWT_SECRET);
  assertEquals(config.auth.expectedIssuer, "https://test.supabase.co/auth/v1");
  assertEquals(config.r2.bucket, "hidria-docs");
  assertEquals(config.r2.accountId, "0123456789abcdef0123456789abcdef");
  assertEquals(config.cors.allowedOrigins, [
    "https://app.example",
    "http://localhost:5173",
  ]);
});

Deno.test("runtime: fail-closed sin JWT, sin service key o sin R2", async () => {
  const noJwt = await expectApiError(
    Promise.resolve().then(() =>
      createRuntimeDocumentsConfig({ ...ENV, SUPABASE_JWT_SECRET: undefined })
    ),
    "INTERNAL_ERROR",
  );
  assertNotIncludes(noJwt.message, "jwt-secret-sintetico");

  await expectApiError(
    Promise.resolve().then(() =>
      createSupabaseDocumentsDeps({
        ...ENV,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
      })
    ),
    "INTERNAL_ERROR",
  );
  await expectApiError(
    Promise.resolve().then(() =>
      createRuntimeDocumentsConfig({ ...ENV, R2_SECRET_ACCESS_KEY: undefined })
    ),
    "INTERNAL_ERROR",
  );
});

Deno.test("runtime resolveRole: RPC fn_diag_role con service_role", async () => {
  const { fetchImpl, calls } = fakeFetch(() => jsonResponse("equipo"));
  const deps = createSupabaseDocumentsDeps(ENV, fetchImpl);

  assertEquals(await deps.resolveRole(USER_ID, DIAG_ID), "equipo");
  assertEquals(calls.length, 1);
  assertEquals(
    calls[0].url,
    "https://test.supabase.co/rest/v1/rpc/fn_diag_role",
  );
  assertEquals(calls[0].init.method, "POST");
  assertEquals(JSON.parse(String(calls[0].init.body)), {
    p_user_id: USER_ID,
    p_diagnostic_id: DIAG_ID,
  });
  const headers = new Headers(calls[0].init.headers);
  assertEquals(headers.get("apikey"), SERVICE_KEY);
  assertEquals(headers.get("authorization"), `Bearer ${SERVICE_KEY}`);
});

Deno.test("runtime resolveRole: null/vacío/rol inválido ⇒ null", async () => {
  for (
    const response of [
      jsonResponse(null),
      jsonResponse(""),
      jsonResponse("invitado"),
    ]
  ) {
    const deps = createSupabaseDocumentsDeps(
      ENV,
      fakeFetch(() => response).fetchImpl,
    );
    assertEquals(await deps.resolveRole(USER_ID, DIAG_ID), null);
  }
});

Deno.test("runtime resolveRole: error de PostgREST ⇒ INTERNAL_ERROR sin filtrar service key", async () => {
  const deps = createSupabaseDocumentsDeps(
    ENV,
    fakeFetch(() => jsonResponse({ message: "boom" }, 500)).fetchImpl,
  );
  const error = await expectApiError(
    deps.resolveRole(USER_ID, DIAG_ID),
    "INTERNAL_ERROR",
  );
  assertNotIncludes(error.message, SERVICE_KEY);
  assertNotIncludes(error.message, "boom");
});

Deno.test("runtime fetchDiagnostic: consulta por id y mapea organización", async () => {
  const { fetchImpl, calls } = fakeFetch(() =>
    jsonResponse([{
      id: DIAG_ID,
      organization_id: ORG_ID,
      company_id: "b1000000-0000-4000-8000-000000000001",
    }])
  );
  const deps = createSupabaseDocumentsDeps(ENV, fetchImpl);

  const diagnostic = await deps.fetchDiagnostic(DIAG_ID);
  assertEquals(diagnostic, {
    id: DIAG_ID,
    organizationId: ORG_ID,
    companyId: "b1000000-0000-4000-8000-000000000001",
  });
  assertEquals(calls[0].init.method, "GET");
  assertEquals(
    calls[0].url,
    `https://test.supabase.co/rest/v1/diagnostics?id=eq.${DIAG_ID}` +
      "&select=id,organization_id,company_id&limit=1",
  );
});

Deno.test("runtime fetchDiagnostic: sin filas o sin organization_id ⇒ null", async () => {
  const empty = createSupabaseDocumentsDeps(
    ENV,
    fakeFetch(() => jsonResponse([])).fetchImpl,
  );
  assertEquals(await empty.fetchDiagnostic(DIAG_ID), null);

  const malformed = createSupabaseDocumentsDeps(
    ENV,
    fakeFetch(() => jsonResponse([{ id: DIAG_ID }])).fetchImpl,
  );
  assertEquals(await malformed.fetchDiagnostic(DIAG_ID), null);
});

Deno.test("runtime: fallo de red y JSON inválido ⇒ INTERNAL_ERROR", async () => {
  const network = createSupabaseDocumentsDeps(
    ENV,
    (() => Promise.reject(new Error("network down"))) as typeof fetch,
  );
  await expectApiError(
    network.fetchDiagnostic(DIAG_ID),
    "INTERNAL_ERROR",
  );

  const invalidJson = createSupabaseDocumentsDeps(
    ENV,
    fakeFetch(() =>
      new Response("no-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ).fetchImpl,
  );
  await expectApiError(
    invalidJson.fetchDiagnostic(DIAG_ID),
    "INTERNAL_ERROR",
  );
});
