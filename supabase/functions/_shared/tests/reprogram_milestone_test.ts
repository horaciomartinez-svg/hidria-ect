/**
 * F1-04 — pruebas de contrato de EF-12 `reprogram-milestone` (handler con fakes).
 */

import { assertEquals } from "./asserts.ts";
import { ApiError } from "../errors.ts";
import {
  createReprogramMilestoneHandler,
  type ReprogramConfig,
  type ReprogramDeps,
} from "../reprogram_milestone.ts";
import type { RealtimeConfig, RealtimeMessage } from "../realtime.ts";
import {
  DIAG_ID,
  ISSUER,
  makeFakeClient,
  makeRequest,
  OTHER_ORG_ID,
  SERVICE_KEY,
  TEST_SECRET,
} from "./ef_fakes.ts";

const CONFIG: ReprogramConfig = {
  auth: { jwtSecret: TEST_SECRET, expectedIssuer: ISSUER },
  cors: { allowedOrigins: ["https://app.example"] },
  realtime: {
    supabaseUrl: "https://test.supabase.co",
    serviceRoleKey: SERVICE_KEY,
  },
};

const BASE_PATH = `/diagnostics/${DIAG_ID}/reprogram-milestone`;

const VALID_BODY = {
  diagnostic_id: DIAG_ID,
  hito: "V2",
  fecha_original: "2026-11-10",
  fecha_nueva: "2026-11-20",
  justificacion: "Reprogramación por causa de la empresa (paro de planta).",
  causa: "empresa",
};

type Broadcast = typeof import("../realtime.ts").broadcastRealtime;

function makeDeps(
  overrides: Parameters<typeof makeFakeClient>[0] = {},
): {
  deps: ReprogramDeps;
  fake: ReturnType<typeof makeFakeClient>;
  broadcast: { messages: ReadonlyArray<RealtimeMessage> };
} {
  const fake = makeFakeClient({
    role: "coordinador",
    ficha: { id: "e-v2", clave: "V2", estado: "cerrada", folio: "BIT-V2-01" },
    ...overrides,
  });
  const broadcast = { messages: [] as ReadonlyArray<RealtimeMessage> };
  const broadcastFn = ((
    _config: RealtimeConfig,
    messages: readonly RealtimeMessage[],
  ) => {
    broadcast.messages = messages;
    return Promise.resolve(true);
  }) as Broadcast;
  return {
    deps: { client: fake.client, broadcast: broadcastFn },
    fake,
    broadcast,
  };
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function errorOf(envelope: Record<string, unknown>): {
  code: string;
  details?: Record<string, unknown>;
} {
  return envelope.error as { code: string; details?: Record<string, unknown> };
}

async function call(
  bodyValue: Record<string, unknown>,
  options: Parameters<typeof makeRequest>[1] = {},
  overrides: Parameters<typeof makeFakeClient>[0] = {},
): Promise<{
  response: Response;
  fake: ReturnType<typeof makeFakeClient>;
  broadcast: { messages: ReadonlyArray<RealtimeMessage> };
}> {
  const { deps, fake, broadcast } = makeDeps(overrides);
  const handler = createReprogramMilestoneHandler(CONFIG, deps);
  const response = await handler(
    await makeRequest(bodyValue, options, BASE_PATH),
  );
  return { response, fake, broadcast };
}

Deno.test("EF-12 200: reprograma hito con ficha, RPC e evento kanban", async () => {
  const { response, fake, broadcast } = await call(VALID_BODY, {}, {
    rpcResult: {
      ok: true,
      replayed: false,
      data: {
        hito: "V2",
        fecha_nueva: "2026-11-20",
        semaforo_atraso: "amarillo",
      },
    },
  });
  assertEquals(response.status, 200);
  const payload = await body(response);
  assertEquals(payload.hito, "V2");
  assertEquals(payload.fecha_nueva, "2026-11-20");
  assertEquals(payload.semaforo_atraso, "amarillo");

  assertEquals(fake.rpcCalls.length, 1);
  assertEquals(fake.rpcCalls[0].functionName, "fn_reprogram_milestone");
  const args = fake.rpcCalls[0].args;
  assertEquals(args.p_hito, "V2");
  assertEquals(args.p_fecha_original, "2026-11-10");
  assertEquals(args.p_fecha_nueva, "2026-11-20");
  assertEquals(args.p_causa, "empresa");
  assertEquals(args.p_idempotency_key, null);
  assertEquals(fake.notifications.rows.length, 0);
  assertEquals(broadcast.messages.length, 1);
  assertEquals(broadcast.messages[0].event, "kanban_refresh");
});

Deno.test("EF-12 replay: sin evento kanban", async () => {
  const { response, broadcast } = await call(
    VALID_BODY,
    { idempotencyKey: "22222222-2222-4222-8222-222222222222" },
    { rpcResult: { ok: true, replayed: true, data: {} } },
  );
  assertEquals(response.status, 200);
  assertEquals(broadcast.messages.length, 0);
});

Deno.test("EF-12 422: validaciones de hito/fechas/justificación/causa", async () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ ...VALID_BODY, hito: "X1" }, "hito"],
    [{ ...VALID_BODY, fecha_original: "10-11-2026" }, "fecha_original"],
    [{ ...VALID_BODY, fecha_nueva: "2026-11-01" }, "fecha_nueva"],
    [{ ...VALID_BODY, justificacion: "corta" }, "justificacion"],
    [{ ...VALID_BODY, causa: "clima" }, "causa"],
  ];
  for (const [bodyValue, field] of cases) {
    const { response, fake } = await call(bodyValue);
    assertEquals(response.status, 422);
    const error = errorOf(await body(response));
    assertEquals(error.code, "VALIDATION_REPROGRAMACION");
    assertEquals(error.details?.field, field);
    assertEquals(fake.rpcCalls.length, 0);
  }
});

Deno.test("EF-12 422: fecha_nueva fuera de las 6 semanas desde fecha_inicio", async () => {
  const { response, fake } = await call({
    ...VALID_BODY,
    fecha_nueva: "2026-12-20",
  });
  assertEquals(response.status, 422);
  const error = errorOf(await body(response));
  assertEquals(error.code, "VALIDATION_REPROGRAMACION");
  assertEquals(error.details?.reason, "fuera_de_ventana_6_semanas");
  assertEquals(fake.rpcCalls.length, 0);
});

Deno.test("EF-12 422: hito sin ficha de bitácora", async () => {
  const { response, fake } = await call(VALID_BODY, {}, { ficha: null });
  assertEquals(response.status, 422);
  assertEquals(
    errorOf(await body(response)).code,
    "VALIDATION_HITO_SIN_FICHA",
  );
  assertEquals(fake.rpcCalls.length, 0);
});

Deno.test("EF-12 401/403/409: token, roles, tenant y estado", async () => {
  const noToken = await call(VALID_BODY, { token: null });
  assertEquals(noToken.response.status, 401);

  const wrongRole = await call(VALID_BODY, {}, { role: "equipo" });
  assertEquals(wrongRole.response.status, 403);
  assertEquals(errorOf(await body(wrongRole.response)).code, "FORBIDDEN_ROLE");

  const nonMember = await call(VALID_BODY, {}, { role: null });
  assertEquals(nonMember.response.status, 403);
  assertEquals(
    errorOf(await body(nonMember.response)).code,
    "FORBIDDEN_NOT_MEMBER",
  );

  const otherTenant = await call(VALID_BODY, {}, {
    diagnostic: { organizationId: OTHER_ORG_ID },
  });
  assertEquals(otherTenant.response.status, 403);

  const suspended = await call(VALID_BODY, {}, {
    diagnostic: { estado: "suspendido" },
  });
  assertEquals(suspended.response.status, 409);
  assertEquals(errorOf(await body(suspended.response)).code, "CONFLICT_STATE");
});

Deno.test("EF-12: RPC ok:false e Idempotency-Key inválida", async () => {
  const { response, broadcast } = await call(VALID_BODY, {}, {
    rpcResult: {
      ok: false,
      code: "CONFLICT_STATE",
      details: { motivo: "idem" },
    },
  });
  assertEquals(response.status, 409);
  assertEquals(errorOf(await body(response)).code, "CONFLICT_STATE");
  assertEquals(broadcast.messages.length, 0);

  const invalidKey = await call(VALID_BODY, { idempotencyKey: "abc" });
  assertEquals(invalidKey.response.status, 422);
  assertEquals(
    errorOf(await body(invalidKey.response)).code,
    "VALIDATION_IDEMPOTENCY_KEY",
  );
  assertEquals(invalidKey.fake.rpcCalls.length, 0);
});

Deno.test("EF-12: errores de validación de la RPC se propagan (ficha desaparecida)", async () => {
  const validation = new ApiError("VALIDATION_HITO_SIN_FICHA", undefined, {
    hito: "V2",
  });
  const { response } = await call(VALID_BODY, {}, { rpcError: validation });
  assertEquals(response.status, 422);
  assertEquals(
    errorOf(await body(response)).code,
    "VALIDATION_HITO_SIN_FICHA",
  );
});

Deno.test("EF-12: CORS/preflight, ruta y diagnóstico faltante", async () => {
  const { deps } = makeDeps();
  const handler = createReprogramMilestoneHandler(CONFIG, deps);

  const preflight = await handler(
    await makeRequest(null, {
      method: "OPTIONS",
      origin: "https://app.example",
    }, BASE_PATH),
  );
  assertEquals(preflight.status, 204);
  assertEquals(
    preflight.headers.get("access-control-allow-origin"),
    "https://app.example",
  );

  const notFound = await handler(
    await makeRequest(VALID_BODY, { path: "/otra" }, BASE_PATH),
  );
  assertEquals(notFound.status, 404);

  const missingDiagnostic = await handler(
    await makeRequest(
      { ...VALID_BODY, diagnostic_id: undefined },
      {},
      BASE_PATH,
    ),
  );
  assertEquals(missingDiagnostic.status, 422);
  assertEquals(
    errorOf(await body(missingDiagnostic)).code,
    "VALIDATION_PARAMETRO_REQUERIDO",
  );
});
