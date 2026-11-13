/**
 * F1-01b (task-21) — pruebas de `_shared/auth.ts` (guardas de rol y SEC-04).
 *
 * Ejecución: `npx --yes deno@2 test supabase/functions/_shared/tests/`
 * Sin dependencias externas ni red: el JWT se firma en la prueba con un secreto sintético,
 * porque E3 (activación del hook) aún no está hecha.
 *
 * Fixtures alineadas al seed sintético de F1-01a (task-20, confirmado por `arquitecto-bd`;
 * `a1000000-…006` se agrega en `20261108020020_f1_01a_fix_roles.sql`):
 *   001 coordinador_srhds · 002 equipo · 003 empresa · 004 observador
 *   005 admin_institucional · 006 invitado
 * Diagnósticos `c1000000-…001` (D1) y `c1000000-…002` (D2), pertenecientes a la organización
 * semilla `00000000-…001` (ver F0-14/F1-01a; `b1000000-…001` es una empresa sintética).
 */

import {
  assert,
  assertEquals,
  assertMatch,
  assertNotIncludes,
  fail,
} from "./asserts.ts";
import {
  type AuthContext,
  authenticate,
  authorizeEndpoint,
  base64UrlEncode,
  type DiagnosticRole,
  type EndpointDefinition,
  type EndpointId,
  ENDPOINTS,
  GLOBAL_ROLES,
  type GuardDependencies,
  guardEndpoint,
  matchEndpoint,
  requireDiagnosticRole,
  requireGlobalRole,
  requireTenant,
  type ResourceScope,
  verifyHs256Signature,
  withAuth,
} from "../auth.ts";
import { ApiError, errorResponse, statusForErrorCode } from "../errors.ts";

// ---------------------------------------------------------------------------
// Fixtures (seed sintético task-20, emails .invalid, sin datos personales)
// ---------------------------------------------------------------------------

const TEST_SECRET = "secreto-sintetico-f1-01b-sin-valor-real";
const ISSUER = "https://test.supabase.co/auth/v1";
const USER_COORDINADOR = "a1000000-0000-4000-8000-000000000001";
const USER_EQUIPO = "a1000000-0000-4000-8000-000000000002";
const USER_EMPRESA = "a1000000-0000-4000-8000-000000000003";
const USER_OBSERVADOR = "a1000000-0000-4000-8000-000000000004";
const USER_ADMIN = "a1000000-0000-4000-8000-000000000005";
const USER_INVITADO = "a1000000-0000-4000-8000-000000000006";
// Organización semilla real (F0-14 / F1-01a): `00000000-…001` (`b1000000-…001` es una
// EMPRESA sintética, no la organización).
const ORG_ID = "00000000-0000-4000-8000-000000000001";
// Organización B sintética: solo para tokens de prueba de precedencia/aislamiento.
const ORG_B_ID = "00000000-0000-4000-8000-000000000002";
const DIAGNOSTIC_ID = "c1000000-0000-4000-8000-000000000001";
const DIAGNOSTIC_B_ID = "c1000000-0000-4000-8000-000000000002";
const LOGBOOK_ENTRY_ID = "d1000000-0000-4000-8000-000000000001";
const CHECKLIST_ITEM_ID = "d1000000-0000-4000-8000-000000000002";
const BALANCE_ID = "d1000000-0000-4000-8000-000000000003";
const SAMPLE_ID = "d1000000-0000-4000-8000-000000000004";
const DOCUMENT_ID = "d1000000-0000-4000-8000-000000000005";
const URL_BASE = "https://test.supabase.co/functions/v1";

const encoder = new TextEncoder();

async function signToken(
  payload: Record<string, unknown>,
  secret: string = TEST_SECRET,
  header: Record<string, unknown> = { alg: "HS256", typ: "JWT" },
): Promise<string> {
  const headerPart = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadPart = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerPart}.${payloadPart}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput)),
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

interface ClaimOverrides {
  sub?: string | null;
  aud?: unknown;
  iss?: string | null;
  organization_id?: string | null;
  tenant_id?: string | null;
  global_role?: string | null;
  exp?: number;
  iat?: number;
  nbf?: number;
}

function buildClaims(overrides: ClaimOverrides = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    iss: ISSUER,
    sub: USER_COORDINADOR,
    aud: "authenticated",
    role: "authenticated",
    email: "coordinador.hidria@example.invalid",
    iat: now,
    exp: now + 3600,
    organization_id: ORG_ID,
    tenant_id: ORG_ID,
    global_role: "coordinador_srhds",
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      delete claims[key];
    } else {
      claims[key] = value;
    }
  }
  return claims;
}

function requestWith(
  token: string | null,
  url: string = `${URL_BASE}/diagnostics/${DIAGNOSTIC_ID}/advance-phase`,
  method = "POST",
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (token !== null) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return new Request(url, { method, headers });
}

async function expectApiError(
  promise: Promise<unknown>,
  code: string,
  status: number,
): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof ApiError, "se esperaba un ApiError canónico");
    assertEquals(error.code, code);
    assertEquals(error.status, status);
    return error;
  }
  return fail(`se esperaba ApiError ${code}/${status}`);
}

async function authenticateWithToken(
  token: string,
  options: Parameters<typeof authenticate>[1] = {},
): Promise<AuthContext> {
  return await authenticate(requestWith(token), {
    jwtSecret: TEST_SECRET,
    ...options,
  });
}

function depsWithRole(role: DiagnosticRole | null): GuardDependencies {
  return {
    resolveRole: (_userId: string, _diagnosticId: string) =>
      Promise.resolve(role),
  };
}

function depsResolving(
  mapping: Record<string, DiagnosticRole | null>,
  scopeMapping: Record<string, string> = {},
): GuardDependencies {
  return {
    resolveDiagnosticId: (_scope: ResourceScope, resourceId: string) =>
      Promise.resolve(scopeMapping[resourceId] ?? null),
    resolveRole: (_userId: string, diagnosticId: string) =>
      Promise.resolve(mapping[diagnosticId] ?? null),
  };
}

function endpointById(id: EndpointId): EndpointDefinition {
  const endpoint = ENDPOINTS.find((candidate) => candidate.id === id);
  assert(endpoint !== undefined, `no existe el endpoint ${id}`);
  return endpoint;
}

// ---------------------------------------------------------------------------
// SEC-04 — token ausente, malformado, expirado o manipulado ⇒ 401 AUTH_INVALID
// ---------------------------------------------------------------------------

Deno.test("SEC-04: sin header Authorization ⇒ 401 AUTH_INVALID", async () => {
  await expectApiError(
    authenticate(requestWith(null), { jwtSecret: TEST_SECRET }),
    "AUTH_INVALID",
    401,
  );
});

Deno.test("SEC-04: header que no es Bearer ⇒ 401 AUTH_INVALID", async () => {
  const request = new Request(`${URL_BASE}/quiz/submit`, {
    method: "POST",
    headers: { authorization: `Basic ${TEST_SECRET}` },
  });
  await expectApiError(
    authenticate(request, { jwtSecret: TEST_SECRET }),
    "AUTH_INVALID",
    401,
  );
});

Deno.test("SEC-04: JWT malformado ⇒ 401 AUTH_INVALID", async () => {
  await expectApiError(
    authenticateWithToken("no-es-un-jwt"),
    "AUTH_INVALID",
    401,
  );
  await expectApiError(authenticateWithToken("a.b.c"), "AUTH_INVALID", 401);
});

Deno.test("SEC-04: payload no-JSON ⇒ 401 AUTH_INVALID", async () => {
  const token = await signToken({});
  const [header, , signature] = token.split(".");
  const corrupted = `${header}.${
    base64UrlEncode(encoder.encode("no-json"))
  }.${signature}`;
  await expectApiError(authenticateWithToken(corrupted), "AUTH_INVALID", 401);
});

Deno.test("SEC-04: firma inválida (otro secreto) ⇒ 401 AUTH_INVALID", async () => {
  const token = await signToken(buildClaims(), "otro-secreto");
  await expectApiError(authenticateWithToken(token), "AUTH_INVALID", 401);
});

Deno.test("SEC-04: algoritmo distinto de HS256 ⇒ 401 AUTH_INVALID", async () => {
  const token = await signToken(buildClaims(), TEST_SECRET, {
    alg: "none",
    typ: "JWT",
  });
  await expectApiError(authenticateWithToken(token), "AUTH_INVALID", 401);
});

Deno.test("SEC-04: token expirado ⇒ 401 AUTH_INVALID", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await signToken(
    buildClaims({ exp: now - 120, iat: now - 3720 }),
  );
  await expectApiError(authenticateWithToken(token), "AUTH_INVALID", 401);
});

Deno.test("SEC-04: token no vigente aún (nbf futuro) ⇒ 401 AUTH_INVALID", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await signToken(buildClaims({ nbf: now + 600 }));
  await expectApiError(authenticateWithToken(token), "AUTH_INVALID", 401);
});

Deno.test("SEC-04: JWT sin claim de tenant ⇒ 401 AUTH_INVALID", async () => {
  const token = await signToken(
    buildClaims({ organization_id: null, tenant_id: null }),
  );
  const error = await expectApiError(
    authenticateWithToken(token),
    "AUTH_INVALID",
    401,
  );
  assertEquals(error.details, { reason: "claim_tenant_ausente" });
});

Deno.test("ADR-005: organization_id tiene precedencia si tenant_id difiere (no se rechaza)", async () => {
  // Semántica alineada con `current_org_id()` de F1-01a: precedencia + no rechazo.
  const token = await signToken(
    buildClaims({ organization_id: ORG_ID, tenant_id: ORG_B_ID }),
  );
  const context = await authenticateWithToken(token);
  assertEquals(context.organizationId, ORG_ID);
  assertEquals(context.tenantId, ORG_ID);
});

Deno.test("ADR-005/F1-01a: si organization_id no es UUID se usa tenant_id (respaldo)", async () => {
  const token = await signToken(
    buildClaims({ organization_id: "no-es-uuid", tenant_id: ORG_ID }),
  );
  const context = await authenticateWithToken(token);
  assertEquals(context.organizationId, ORG_ID);
});

Deno.test("SEC-04: sin ningún claim de tenant utilizable ⇒ 401 AUTH_INVALID", async () => {
  const token = await signToken(
    buildClaims({ organization_id: "no-es-uuid", tenant_id: "tampoco" }),
  );
  await expectApiError(authenticateWithToken(token), "AUTH_INVALID", 401);
});

Deno.test("BLOQUEANTE B1: firma base64url malformada ⇒ 401 AUTH_INVALID, nunca 500", async () => {
  const token = await signToken(buildClaims());
  const [header, payload] = token.split(".");

  await expectApiError(
    authenticateWithToken(`${header}.${payload}.`),
    "AUTH_INVALID",
    401,
  );

  const error = await expectApiError(
    authenticateWithToken(`${header}.${payload}.%%%`),
    "AUTH_INVALID",
    401,
  );
  assertEquals(error.details, { reason: "formato_token" });
});

Deno.test("BLOQUEANTE B1: withAuth con firma malformada responde 401 canónico, no 500", async () => {
  const token = await signToken(buildClaims());
  const [header, payload] = token.split(".");
  let handlerCalled = false;
  const wrapped = withAuth(() => {
    handlerCalled = true;
    return new Response("no debería ejecutarse");
  }, { jwtSecret: TEST_SECRET });

  const response = await wrapped(requestWith(`${header}.${payload}.%%%`));
  assertEquals(handlerCalled, false);
  assertEquals(response.status, 401);
  const body = await response.json() as {
    error: { code: string; message: string; ref?: string };
  };
  assertEquals(body.error.code, "AUTH_INVALID");
  assertEquals(body.error.ref, undefined);
  assertNotIncludes(JSON.stringify(body), "stack");
});

Deno.test("SEC-04: sub ausente o inválido ⇒ 401 AUTH_INVALID", async () => {
  await expectApiError(
    authenticateWithToken(await signToken(buildClaims({ sub: null }))),
    "AUTH_INVALID",
    401,
  );
  await expectApiError(
    authenticateWithToken(await signToken(buildClaims({ sub: "1234" }))),
    "AUTH_INVALID",
    401,
  );
});

Deno.test("SEC-04: audiencia distinta de authenticated ⇒ 401", async () => {
  await expectApiError(
    authenticateWithToken(await signToken(buildClaims({ aud: "anon" }))),
    "AUTH_INVALID",
    401,
  );
});

Deno.test("SEC-04: emisor distinto del esperado ⇒ 401", async () => {
  const token = await signToken(
    buildClaims({ iss: "https://otro-proyecto.supabase.co/auth/v1" }),
  );
  await expectApiError(
    authenticateWithToken(token, { expectedIssuer: ISSUER }),
    "AUTH_INVALID",
    401,
  );
});

Deno.test("SEC-04: global_role ausente ⇒ 401 AUTH_INVALID", async () => {
  await expectApiError(
    authenticateWithToken(await signToken(buildClaims({ global_role: null }))),
    "AUTH_INVALID",
    401,
  );
});

Deno.test("SEC-04: global_role fuera del catálogo ⇒ 401 AUTH_INVALID", async () => {
  await expectApiError(
    authenticateWithToken(
      await signToken(buildClaims({ global_role: "superadmin" })),
    ),
    "AUTH_INVALID",
    401,
  );
});

// ---------------------------------------------------------------------------
// Caminos válidos y contrato de claims (ADR-005)
// ---------------------------------------------------------------------------

Deno.test("válido: contexto con userId, tenant y globalRole; claims congelados", async () => {
  const token = await signToken(buildClaims({ sub: USER_EQUIPO }));
  const context = await authenticateWithToken(token);

  assertEquals(context.userId, USER_EQUIPO);
  assertEquals(context.organizationId, ORG_ID);
  assertEquals(context.tenantId, ORG_ID);
  assertEquals(context.globalRole, "coordinador_srhds");
  assertEquals(context.accessToken, token);
  assertEquals(Object.isFrozen(context), true);
  assertEquals(Object.isFrozen(context.claims), true);
});

Deno.test("ADR-005: tenant_id funciona como alias si falta organization_id", async () => {
  const token = await signToken(
    buildClaims({ organization_id: null, tenant_id: ORG_ID }),
  );
  const context = await authenticateWithToken(token);
  assertEquals(context.organizationId, ORG_ID);
  assertEquals(context.tenantId, ORG_ID);
});

Deno.test("ADR-005: organization_id tiene precedencia (ambos iguales ⇒ mismo tenant)", async () => {
  const token = await signToken(
    buildClaims({ organization_id: ORG_ID, tenant_id: ORG_ID }),
  );
  const context = await authenticateWithToken(token);
  assertEquals(context.organizationId, ORG_ID);
});

Deno.test("verificador inyectado: sustituye la verificación HS256", async () => {
  const calls: string[] = [];
  const context = await authenticate(requestWith("token-opaco"), {
    verify: (token: string) => {
      calls.push(token);
      return Promise.resolve(buildClaims({ sub: USER_EMPRESA }));
    },
  });
  assertEquals(calls, ["token-opaco"]);
  assertEquals(context.userId, USER_EMPRESA);
});

Deno.test("verifyProfile: perfil válido permite; perfil inválido ⇒ 401", async () => {
  const token = await signToken(buildClaims());

  const allowed = await authenticateWithToken(token, {
    verifyProfile: (context: AuthContext) =>
      Promise.resolve(context.organizationId === ORG_ID),
  });
  assertEquals(allowed.userId, USER_COORDINADOR);

  await expectApiError(
    authenticateWithToken(token, {
      verifyProfile: () => Promise.resolve(false),
    }),
    "AUTH_INVALID",
    401,
  );
});

Deno.test("configuración incompleta (sin secreto ni verificador) ⇒ 500 INTERNAL_ERROR", async () => {
  await expectApiError(
    authenticate(requestWith(await signToken(buildClaims())), {}),
    "INTERNAL_ERROR",
    500,
  );
});

Deno.test("verifyHs256Signature: devuelve claims con firma correcta", async () => {
  const claims = await verifyHs256Signature(
    await signToken(buildClaims()),
    TEST_SECRET,
  );
  assertEquals(claims.sub, USER_COORDINADOR);
});

// ---------------------------------------------------------------------------
// Guardas de claims: tenant y rol global
// ---------------------------------------------------------------------------

Deno.test("requireTenant: devuelve el tenant del contexto", async () => {
  const context = await authenticateWithToken(await signToken(buildClaims()));
  assertEquals(requireTenant(context), ORG_ID);
});

Deno.test("requireGlobalRole: rol autorizado ⇒ lo devuelve", async () => {
  const context = await authenticateWithToken(
    await signToken(
      buildClaims({ sub: USER_INVITADO, global_role: "invitado" }),
    ),
  );
  assertEquals(requireGlobalRole(context, ["invitado"]), "invitado");
});

Deno.test("requireGlobalRole: rol insuficiente ⇒ 403 FORBIDDEN_ROLE", async () => {
  const context = await authenticateWithToken(
    await signToken(buildClaims({ global_role: "empresa" })),
  );
  const error = await expectApiError(
    Promise.resolve().then(() =>
      requireGlobalRole(context, ["admin_institucional"])
    ),
    "FORBIDDEN_ROLE",
    403,
  );
  assertEquals(error.details, {
    rol_actual: "empresa",
    roles_permitidos: ["admin_institucional"],
  });
});

// ---------------------------------------------------------------------------
// Guarda de rol de diagnóstico
// ---------------------------------------------------------------------------

Deno.test("requireDiagnosticRole: miembro con rol permitido ⇒ devuelve rol", async () => {
  const context = await authenticateWithToken(await signToken(buildClaims()));
  const role = await requireDiagnosticRole(
    context,
    DIAGNOSTIC_ID,
    ["coordinador", "equipo"],
    depsWithRole("equipo").resolveRole,
  );
  assertEquals(role, "equipo");
});

Deno.test("requireDiagnosticRole: no miembro ⇒ 403 FORBIDDEN_NOT_MEMBER", async () => {
  const context = await authenticateWithToken(await signToken(buildClaims()));
  await expectApiError(
    requireDiagnosticRole(
      context,
      DIAGNOSTIC_ID,
      ["coordinador", "equipo"],
      depsWithRole(null).resolveRole,
    ),
    "FORBIDDEN_NOT_MEMBER",
    403,
  );
});

Deno.test("requireDiagnosticRole: rol no autorizado ⇒ 403 FORBIDDEN_ROLE", async () => {
  const context = await authenticateWithToken(
    await signToken(buildClaims({ sub: USER_EMPRESA })),
  );
  const error = await expectApiError(
    requireDiagnosticRole(
      context,
      DIAGNOSTIC_ID,
      ["coordinador", "equipo"],
      depsWithRole("empresa").resolveRole,
    ),
    "FORBIDDEN_ROLE",
    403,
  );
  assertEquals(error.details, {
    rol_actual: "empresa",
    roles_permitidos: ["coordinador", "equipo"],
  });
});

Deno.test("requireDiagnosticRole: id malformado ⇒ 403 FORBIDDEN_NOT_MEMBER", async () => {
  const context = await authenticateWithToken(await signToken(buildClaims()));
  await expectApiError(
    requireDiagnosticRole(
      context,
      "no-es-uuid",
      ["coordinador"],
      depsWithRole("coordinador").resolveRole,
    ),
    "FORBIDDEN_NOT_MEMBER",
    403,
  );
});

// ---------------------------------------------------------------------------
// Catálogo de endpoints y guardas por endpoint (docs/04)
// ---------------------------------------------------------------------------

Deno.test("catálogo: 16 endpoints de EF-01…EF-13 con políticas del contrato", () => {
  assertEquals(new Set(ENDPOINTS.map((endpoint) => endpoint.ef)).size, 13);
  assertEquals(ENDPOINTS.length, 16);

  assertEquals(endpointById("EF-07").policy, {
    kind: "diagnostic",
    roles: ["coordinador"],
  });
  assertEquals(endpointById("EF-12").policy, {
    kind: "diagnostic",
    roles: ["coordinador"],
  });
  assertEquals(endpointById("EF-13").policy, {
    kind: "diagnostic",
    roles: ["coordinador"],
  });
  assertEquals(endpointById("EF-11").policy, { kind: "authenticated" });
  assertEquals(endpointById("EF-08.presign").policy, {
    kind: "diagnostic",
    roles: ["coordinador", "equipo", "empresa"],
  });
  assertEquals(endpointById("EF-08.presign").scope, {
    kind: "diagnostic",
    param: "diagnostic_id",
    inBody: true,
  });
  assertEquals(endpointById("EF-08.register").policy, { kind: "any_member" });
  assertEquals(endpointById("EF-01").policy, {
    kind: "diagnostic",
    roles: ["coordinador", "equipo"],
  });
  assertEquals(endpointById("EF-04.submit").policy, {
    kind: "diagnostic",
    roles: ["empresa", "coordinador", "equipo"],
  });

  const diagnosticRoles = [
    "coordinador",
    "equipo",
    "empresa",
    "organismo_operador",
    "observador",
  ];
  for (const endpoint of ENDPOINTS) {
    assertEquals(endpoint.tenantRequired, true);
    if (endpoint.policy.kind === "diagnostic") {
      for (const role of endpoint.policy.roles) {
        assert(
          diagnosticRoles.includes(role),
          `rol de diagnóstico inválido en ${endpoint.id}: ${role}`,
        );
      }
    }
  }
});

Deno.test("matchEndpoint: ruta, parámetros y prefijo /functions/v1", () => {
  const match = matchEndpoint(
    "POST",
    `${URL_BASE}/diagnostics/${DIAGNOSTIC_ID}/advance-phase?x=1`,
  );
  assert(match !== null);
  assertEquals(match.endpoint.id, "EF-01");
  assertEquals(match.params.diagnostic_id, DIAGNOSTIC_ID);

  const entry = matchEndpoint(
    "POST",
    `/functions/v1/logbook/${LOGBOOK_ENTRY_ID}/close`,
  );
  assert(entry !== null);
  assertEquals(entry.endpoint.id, "EF-02");
  assertEquals(entry.params.entry_id, LOGBOOK_ENTRY_ID);
});

Deno.test("matchEndpoint: método o ruta desconocidos ⇒ null", () => {
  assertEquals(
    matchEndpoint(
      "GET",
      `/functions/v1/diagnostics/${DIAGNOSTIC_ID}/advance-phase`,
    ),
    null,
  );
  assertEquals(matchEndpoint("POST", "/functions/v1/unknown/path"), null);
  assertEquals(matchEndpoint("POST", "/functions/v1/quiz/submit/extra"), null);
});

Deno.test("guardEndpoint EF-01: equipo permitido", async () => {
  const context = await authenticateWithToken(
    await signToken(buildClaims({ sub: USER_EQUIPO })),
  );
  const authorization = await guardEndpoint(
    context,
    "EF-01",
    { diagnostic_id: DIAGNOSTIC_ID },
    depsWithRole("equipo"),
  );
  assertEquals(authorization.diagnosticId, DIAGNOSTIC_ID);
  assertEquals(authorization.diagnosticRole, "equipo");
});

Deno.test("guardEndpoint EF-01: empresa ⇒ 403 FORBIDDEN_ROLE", async () => {
  const context = await authenticateWithToken(
    await signToken(buildClaims({ sub: USER_EMPRESA })),
  );
  await expectApiError(
    guardEndpoint(
      context,
      "EF-01",
      { diagnostic_id: DIAGNOSTIC_ID },
      depsWithRole("empresa"),
    ),
    "FORBIDDEN_ROLE",
    403,
  );
});

Deno.test("guardEndpoint EF-01: no miembro ⇒ 403 FORBIDDEN_NOT_MEMBER", async () => {
  const context = await authenticateWithToken(await signToken(buildClaims()));
  await expectApiError(
    guardEndpoint(
      context,
      "EF-01",
      { diagnostic_id: DIAGNOSTIC_ID },
      depsWithRole(null),
    ),
    "FORBIDDEN_NOT_MEMBER",
    403,
  );
});

Deno.test("admin_institucional no eleva privilegios de diagnóstico", async () => {
  // El rol global admin_institucional no sustituye al rol de diagnóstico (docs/04 §2.1):
  // un admin con rol "empresa" en el diagnóstico no puede avanzar fase (EF-01).
  const admin = await authenticateWithToken(
    await signToken(
      buildClaims({ sub: USER_ADMIN, global_role: "admin_institucional" }),
    ),
  );
  assertEquals(admin.globalRole, "admin_institucional");

  const error = await expectApiError(
    guardEndpoint(
      admin,
      "EF-01",
      { diagnostic_id: DIAGNOSTIC_ID },
      depsWithRole("empresa"),
    ),
    "FORBIDDEN_ROLE",
    403,
  );
  assertEquals(error.details, {
    rol_actual: "empresa",
    roles_permitidos: ["coordinador", "equipo"],
  });
});

Deno.test("guardEndpoint EF-07/12/13: solo coordinador", async () => {
  const asCoordinador = await authenticateWithToken(
    await signToken(buildClaims({ sub: USER_COORDINADOR })),
  );
  const asEquipo = await authenticateWithToken(
    await signToken(buildClaims({ sub: USER_EQUIPO })),
  );

  const cases: Array<[EndpointId, Record<string, string>]> = [
    ["EF-07", { diagnostic_id: DIAGNOSTIC_ID }],
    ["EF-12", { diagnostic_id: DIAGNOSTIC_ID }],
    ["EF-13", { document_id: DOCUMENT_ID }],
  ];
  for (const [endpointId, params] of cases) {
    const authorization = await guardEndpoint(
      asCoordinador,
      endpointId,
      params,
      depsResolving({ [DIAGNOSTIC_ID]: "coordinador" }, {
        [DOCUMENT_ID]: DIAGNOSTIC_ID,
      }),
    );
    assertEquals(authorization.diagnosticRole, "coordinador");

    await expectApiError(
      guardEndpoint(
        asEquipo,
        endpointId,
        params,
        depsResolving({ [DIAGNOSTIC_ID]: "equipo" }, {
          [DOCUMENT_ID]: DIAGNOSTIC_ID,
        }),
      ),
      "FORBIDDEN_ROLE",
      403,
    );
  }
});

Deno.test("guardEndpoint EF-03: empresa y equipo permitidos; observador no", async () => {
  const asEmpresa = await authenticateWithToken(
    await signToken(buildClaims({ sub: USER_EMPRESA })),
  );
  const asCoordinador = await authenticateWithToken(
    await signToken(buildClaims({ sub: USER_COORDINADOR })),
  );

  const empresa = await guardEndpoint(
    asEmpresa,
    "EF-03",
    { item_id: CHECKLIST_ITEM_ID },
    depsResolving({ [DIAGNOSTIC_ID]: "empresa" }, {
      [CHECKLIST_ITEM_ID]: DIAGNOSTIC_ID,
    }),
  );
  assertEquals(empresa.diagnosticRole, "empresa");

  await expectApiError(
    guardEndpoint(
      asCoordinador,
      "EF-03",
      { item_id: CHECKLIST_ITEM_ID },
      depsResolving({ [DIAGNOSTIC_ID]: "observador" }, {
        [CHECKLIST_ITEM_ID]: DIAGNOSTIC_ID,
      }),
    ),
    "FORBIDDEN_ROLE",
    403,
  );
});

Deno.test("guardEndpoint EF-08 presign: exige membresía y rol de carga (Q-08)", async () => {
  const context = await authenticateWithToken(
    await signToken(buildClaims({ sub: USER_EMPRESA })),
  );

  const authorized = await guardEndpoint(
    context,
    "EF-08.presign",
    { diagnostic_id: DIAGNOSTIC_ID },
    depsWithRole("empresa"),
  );
  assertEquals(authorized.diagnosticId, DIAGNOSTIC_ID);
  assertEquals(authorized.diagnosticRole, "empresa");

  // No miembro ⇒ 403 FORBIDDEN_NOT_MEMBER (anti-enumeración).
  await expectApiError(
    guardEndpoint(
      context,
      "EF-08.presign",
      { diagnostic_id: DIAGNOSTIC_ID },
      depsWithRole(null),
    ),
    "FORBIDDEN_NOT_MEMBER",
    403,
  );

  // Miembro observador (invitado) ⇒ 403 FORBIDDEN_ROLE (no puede subir documentos).
  await expectApiError(
    guardEndpoint(
      context,
      "EF-08.presign",
      { diagnostic_id: DIAGNOSTIC_ID },
      depsWithRole("observador"),
    ),
    "FORBIDDEN_ROLE",
    403,
  );

  // Sin `diagnostic_id` en el cuerpo ⇒ 422 (entrada del cliente, no 500).
  const missing = await expectApiError(
    guardEndpoint(context, "EF-08.presign", {}, depsWithRole("empresa")),
    "VALIDATION_PARAMETRO_REQUERIDO",
    422,
  );
  assertEquals(missing.details, { param: "diagnostic_id" });
});

Deno.test("guardEndpoint EF-08 register: cualquier miembro; no miembro ⇒ 403", async () => {
  const context = await authenticateWithToken(
    await signToken(buildClaims({ sub: USER_EMPRESA })),
  );
  const authorization = await guardEndpoint(
    context,
    "EF-08.register",
    { diagnostic_id: DIAGNOSTIC_ID },
    depsWithRole("empresa"),
  );
  assertEquals(authorization.diagnosticRole, "empresa");

  await expectApiError(
    guardEndpoint(
      context,
      "EF-08.register",
      { diagnostic_id: DIAGNOSTIC_ID },
      depsWithRole(null),
    ),
    "FORBIDDEN_NOT_MEMBER",
    403,
  );
});

Deno.test("guardEndpoint EF-11: cualquier rol global autenticado permitido", async () => {
  // EF-11 (quiz/submit) solo exige autenticación: no depende del rol de diagnóstico.
  const sessionCases: Array<[string, string]> = [
    [USER_OBSERVADOR, "observador"],
    [USER_ADMIN, "admin_institucional"],
    [USER_INVITADO, "invitado"],
  ];
  for (const [userId, globalRole] of sessionCases) {
    const context = await authenticateWithToken(
      await signToken(buildClaims({ sub: userId, global_role: globalRole })),
    );
    const authorization = await guardEndpoint(context, "EF-11", {}, {
      resolveRole: () => Promise.resolve(null),
    });
    assertEquals(authorization, {});
  }
});

Deno.test("guardEndpoint: recurso inexistente o de otro tenant ⇒ 403 FORBIDDEN_NOT_MEMBER", async () => {
  const context = await authenticateWithToken(await signToken(buildClaims()));
  const dependencies = depsResolving({ [DIAGNOSTIC_B_ID]: "coordinador" });

  await expectApiError(
    guardEndpoint(context, "EF-05", { balance_id: BALANCE_ID }, {
      ...dependencies,
      resolveDiagnosticId: () => Promise.resolve(null),
    }),
    "FORBIDDEN_NOT_MEMBER",
    403,
  );
  await expectApiError(
    guardEndpoint(context, "EF-10", { sample_id: SAMPLE_ID }, {
      ...dependencies,
      resolveDiagnosticId: () => Promise.resolve(null),
    }),
    "FORBIDDEN_NOT_MEMBER",
    403,
  );
});

Deno.test("MAYOR M2: parámetro de cliente faltante ⇒ 422 VALIDATION_*, nunca 500", async () => {
  const context = await authenticateWithToken(await signToken(buildClaims()));
  const error = await expectApiError(
    guardEndpoint(context, "EF-01", {}, depsWithRole("coordinador")),
    "VALIDATION_PARAMETRO_REQUERIDO",
    422,
  );
  assertEquals(error.details, { param: "diagnostic_id" });
});

Deno.test("MAYOR M2: authorizeEndpoint EF-08 register sin body.diagnostic_id ⇒ 422", async () => {
  const token = await signToken(buildClaims({ sub: USER_EMPRESA }));
  const error = await expectApiError(
    authorizeEndpoint(requestWith(token, `${URL_BASE}/documents/register`), {
      auth: { jwtSecret: TEST_SECRET },
      deps: depsWithRole("empresa"),
    }),
    "VALIDATION_PARAMETRO_REQUERIDO",
    422,
  );
  assertEquals(error.details, { param: "diagnostic_id" });
});

Deno.test("guardEndpoint: alcance de recurso sin resolveDiagnosticId ⇒ 500", async () => {
  const context = await authenticateWithToken(await signToken(buildClaims()));
  await expectApiError(
    guardEndpoint(context, "EF-05", { balance_id: BALANCE_ID }, {
      resolveRole: () => Promise.resolve("coordinador"),
    }),
    "INTERNAL_ERROR",
    500,
  );
});

// ---------------------------------------------------------------------------
// Pipeline completo y middleware
// ---------------------------------------------------------------------------

Deno.test("authorizeEndpoint: pipeline EF-01 válido ⇒ endpoint y autorización", async () => {
  const token = await signToken(buildClaims({ sub: USER_EQUIPO }));
  const result = await authorizeEndpoint(
    requestWith(
      token,
      `${URL_BASE}/diagnostics/${DIAGNOSTIC_ID}/advance-phase`,
    ),
    {
      auth: { jwtSecret: TEST_SECRET },
      deps: depsWithRole("equipo"),
    },
  );
  assert(result !== null);
  assertEquals(result.endpoint.id, "EF-01");
  assertEquals(result.params.diagnostic_id, DIAGNOSTIC_ID);
  assertEquals(result.authorization.diagnosticRole, "equipo");
  assertEquals(result.context.userId, USER_EQUIPO);
});

Deno.test("authorizeEndpoint: sin token ⇒ 401; rol insuficiente ⇒ 403; ruta desconocida ⇒ null", async () => {
  await expectApiError(
    authorizeEndpoint(
      requestWith(null),
      { auth: { jwtSecret: TEST_SECRET }, deps: depsWithRole("equipo") },
    ),
    "AUTH_INVALID",
    401,
  );

  const token = await signToken(buildClaims({ sub: USER_EMPRESA }));
  await expectApiError(
    authorizeEndpoint(
      requestWith(token),
      { auth: { jwtSecret: TEST_SECRET }, deps: depsWithRole("empresa") },
    ),
    "FORBIDDEN_ROLE",
    403,
  );

  const unknown = await authorizeEndpoint(
    requestWith(token, `${URL_BASE}/desconocido`),
    { auth: { jwtSecret: TEST_SECRET }, deps: depsWithRole("empresa") },
  );
  assertEquals(unknown, null);
});

Deno.test("authorizeEndpoint: EF-08 register toma diagnostic_id del cuerpo", async () => {
  const token = await signToken(buildClaims({ sub: USER_EMPRESA }));
  const result = await authorizeEndpoint(
    requestWith(token, `${URL_BASE}/documents/register`),
    {
      auth: { jwtSecret: TEST_SECRET },
      deps: depsWithRole("empresa"),
      body: { diagnostic_id: DIAGNOSTIC_ID },
    },
  );
  assert(result !== null);
  assertEquals(result.endpoint.id, "EF-08.register");
  assertEquals(result.authorization.diagnosticId, DIAGNOSTIC_ID);
});

Deno.test("withAuth: sin token ⇒ 401 con envelope canónico y sin stack", async () => {
  const handler = () => new Response("no debería ejecutarse");
  const wrapped = withAuth(handler, { jwtSecret: TEST_SECRET });
  const response = await wrapped(requestWith(null));

  assertEquals(response.status, 401);
  assertMatch(response.headers.get("content-type") ?? "", /application\/json/);
  const body = await response.json() as {
    error: { code: string; message: string; ref?: string };
  };
  assertEquals(body.error.code, "AUTH_INVALID");
  assertEquals(typeof body.error.message, "string");
  assertEquals(body.error.ref, undefined);
  assertNotIncludes(JSON.stringify(body), "stack");
});

Deno.test("withAuth: token válido ⇒ el handler recibe el contexto", async () => {
  const token = await signToken(buildClaims({ sub: USER_EQUIPO }));
  const wrapped = withAuth((_request, context) => {
    return Response.json({ userId: context.userId });
  }, { jwtSecret: TEST_SECRET });

  const response = await wrapped(requestWith(token));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { userId: USER_EQUIPO });
});

Deno.test("withAuth: error no controlado ⇒ 500 genérico sin filtrar mensaje interno", async () => {
  const token = await signToken(buildClaims());
  const wrapped = withAuth(() => {
    throw new Error("detalle interno que no debe salir");
  }, { jwtSecret: TEST_SECRET });

  const response = await wrapped(requestWith(token));
  assertEquals(response.status, 500);
  const text = await response.text();
  assertNotIncludes(text, "detalle interno");
  assertMatch(text, /INTERNAL_ERROR/);
});

// ---------------------------------------------------------------------------
// Catálogo de errores y envelope
// ---------------------------------------------------------------------------

Deno.test("errors: VALIDATION_* ⇒ 422 y códigos catalogados con su HTTP", () => {
  assertEquals(statusForErrorCode("VALIDATION_CAT_INCOMPLETO"), 422);
  assertEquals(statusForErrorCode("VALIDATION_FIRMAS"), 422);
  assertEquals(statusForErrorCode("AUTH_INVALID"), 401);
  assertEquals(statusForErrorCode("FORBIDDEN_ROLE"), 403);
  assertEquals(statusForErrorCode("GATE_BHE_BRECHA"), 409);
  // Códigos de los contratos EF-04/EF-05 aunque no figuren en la tabla §8 (ver errors.ts).
  assertEquals(statusForErrorCode("GATE_R2_FICHA"), 409);
  assertEquals(statusForErrorCode("GATE_R3_FICHA"), 409);
  assertEquals(statusForErrorCode("CODIGO_NO_CATALOGADO"), 500);
});

Deno.test("errors: errorResponse incluye ref de auditoría cuando se provee", async () => {
  const response = errorResponse(
    new ApiError("FORBIDDEN_ROLE", undefined, { rol_actual: "empresa" }),
    { ref: "audit:abc123" },
  );
  assertEquals(response.status, 403);
  const body = await response.json() as {
    error: { code: string; details?: Record<string, unknown>; ref?: string };
  };
  assertEquals(body.error.code, "FORBIDDEN_ROLE");
  assertEquals(body.error.details, { rol_actual: "empresa" });
  assertEquals(body.error.ref, "audit:abc123");
});

Deno.test("errors: GLOBAL_ROLES cubre los 6 valores de ADR-005", () => {
  assertEquals(
    [...GLOBAL_ROLES].sort(),
    [
      "admin_institucional",
      "coordinador_srhds",
      "empresa",
      "equipo",
      "invitado",
      "observador",
    ],
  );
});
