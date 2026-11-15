/**
 * F1-09 (task-143) — pruebas de contrato EF-05 `balances/{id}/validate-r3`.
 * Sin red: balance, ficha R3 y RPC inyectados; JWT sintético.
 */

import { assertEquals } from "./asserts.ts";
import type { DiagnosticRole } from "../auth.ts";
import {
  type BheValidateClient,
  type BheValidateConfig,
  CANONICAL_BRECHA_MESSAGE,
  createBheValidateHandler,
} from "../bhe_validate.ts";
import type { RpcResult, WaterBalanceRow } from "../db.ts";
import type { RealtimeMessage } from "../realtime.ts";
import {
  DIAG_ID,
  ISSUER,
  makeRequest,
  ORG_ID,
  OTHER_ORG_ID,
  SERVICE_KEY,
  TEST_SECRET,
  USER_EQUIPO,
} from "./ef_fakes.ts";

const BALANCE_ID = "ba100000-0000-4000-8000-000000000001";
const FICHA_R3 = "fa100000-0000-4000-8000-000000000001";
const OTHER_DIAG = "c1000000-0000-4000-8000-000000000002";

const CONFIG: BheValidateConfig = {
  auth: { jwtSecret: TEST_SECRET, expectedIssuer: ISSUER },
  cors: { allowedOrigins: ["https://app.example"] },
  realtime: {
    supabaseUrl: "https://test.supabase.co",
    serviceRoleKey: SERVICE_KEY,
  },
};

interface Recorded {
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  notifications: Array<{
    userId: string;
    kind: string;
    payload: Record<string, unknown>;
  }>;
  broadcast: ReadonlyArray<RealtimeMessage>;
}

interface FakeOptions {
  role?: string | null;
  verifyProfile?: boolean;
  balance?: Partial<WaterBalanceRow> | null;
  ficha?: {
    id: string;
    diagnosticId: string;
    clave: string;
    estado: string;
  } | null;
  rpc?: RpcResult;
}

function makeFake(options: FakeOptions = {}): {
  deps: Parameters<typeof createBheValidateHandler>[1];
  recorded: Recorded;
} {
  const recorded: Recorded = { rpcCalls: [], notifications: [], broadcast: [] };
  const balance: WaterBalanceRow | null = options.balance === null ? null : {
    id: BALANCE_ID,
    diagnosticId: DIAG_ID,
    organizationId: ORG_ID,
    estado: "en_captura",
    version: 1,
    periodoAnio: 2026,
    ...(options.balance ?? {}),
  };
  const client: BheValidateClient = {
    resolveRole: () =>
      Promise.resolve(
        (options.role !== undefined ? options.role : "coordinador") as
          | DiagnosticRole
          | null,
      ),
    verifyProfile: () => Promise.resolve(options.verifyProfile ?? true),
    fetchWaterBalance: () => Promise.resolve(balance),
    fetchLogbookEntryById: (entryId) => {
      if (options.ficha === null) return Promise.resolve(null);
      const ficha = options.ficha ?? {
        id: FICHA_R3,
        diagnosticId: DIAG_ID,
        clave: "R3",
        estado: "cerrada",
      };
      return Promise.resolve(ficha.id === entryId ? ficha : null);
    },
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
      broadcast: ((_config, messages: readonly RealtimeMessage[]) => {
        recorded.broadcast = messages;
        return Promise.resolve(true);
      }) as typeof import("../realtime.ts").broadcastRealtime,
    },
    recorded,
  };
}

async function call(
  body: Record<string, unknown> = { r3_logbook_id: FICHA_R3 },
  options: Parameters<typeof makeRequest>[1] = {},
  fake: FakeOptions = {},
): Promise<{
  response: Response;
  payload: Record<string, unknown>;
  recorded: Recorded;
}> {
  const { deps, recorded } = makeFake(fake);
  const handler = createBheValidateHandler(CONFIG, deps);
  const response = await handler(
    await makeRequest(body, options, `/balances/${BALANCE_ID}/validate-r3`),
  );
  const payload = await response.json() as Record<string, unknown>;
  return { response, payload, recorded };
}

function errorOf(payload: Record<string, unknown>): {
  code: string;
  message?: string;
  details?: Record<string, unknown>;
} {
  return payload.error as {
    code: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

Deno.test("EF-05 200: valida R3 con RPC atómica, notificación y bhe_validated", async () => {
  const { response, payload, recorded } = await call(
    { r3_logbook_id: FICHA_R3 },
    { origin: "https://app.example" },
    {
      rpc: {
        ok: true,
        data: {
          estado: "validado_r3",
          brecha_anual_pct: 6.4,
          brecha_max_mes_pct: 8.4,
          meses_sobre_umbral: 0,
        },
      },
    },
  );
  assertEquals(response.status, 200);
  assertEquals(payload, {
    balance_id: BALANCE_ID,
    estado: "validado_r3",
    brecha_anual_pct: 6.4,
    brecha_max_mes_pct: 8.4,
    meses_sobre_umbral: 0,
  });
  assertEquals(recorded.rpcCalls[0].fn, "fn_validate_bhe_r3");
  assertEquals(recorded.rpcCalls[0].args.p_user_id, USER_EQUIPO);
  assertEquals(recorded.rpcCalls[0].args.p_balance_id, BALANCE_ID);
  assertEquals(recorded.rpcCalls[0].args.p_r3_logbook_id, FICHA_R3);
  assertEquals(recorded.notifications.length, 1);
  assertEquals(recorded.broadcast[0].event, "bhe_validated");
});

Deno.test("EF-05 409: GATE_BHE_BRECHA con mensaje canónico y months 1-based", async () => {
  const meses = [{ mes: 7, brecha_pct: 12.6 }];
  const { response, payload, recorded } = await call(
    undefined,
    {},
    {
      rpc: {
        ok: false,
        code: "GATE_BHE_BRECHA",
        message: "mensaje de la RPC",
        details: { meses },
      },
    },
  );
  assertEquals(response.status, 409);
  const error = errorOf(payload);
  assertEquals(error.code, "GATE_BHE_BRECHA");
  assertEquals(error.message, CANONICAL_BRECHA_MESSAGE);
  assertEquals(error.details?.meses, meses);
  assertEquals(recorded.notifications.length, 0);
});

Deno.test("EF-05 409: ficha R3 inexistente/abierta/clave distinta/otro diagnóstico", async () => {
  for (
    const ficha of [
      null,
      { id: FICHA_R3, diagnosticId: DIAG_ID, clave: "R3", estado: "abierta" },
      { id: FICHA_R3, diagnosticId: DIAG_ID, clave: "R2", estado: "cerrada" },
      {
        id: FICHA_R3,
        diagnosticId: OTHER_DIAG,
        clave: "R3",
        estado: "cerrada",
      },
    ]
  ) {
    const { response, payload } = await call(undefined, {}, { ficha });
    assertEquals(response.status, 409);
    assertEquals(errorOf(payload).code, "GATE_R3_FICHA");
  }
});

Deno.test("EF-05 403/401: observador, no miembro, otro tenant y sin token", async () => {
  const observador = await call(undefined, {}, { role: "observador" });
  assertEquals(observador.response.status, 403);
  assertEquals(errorOf(observador.payload).code, "FORBIDDEN_ROLE");

  const nonMember = await call(undefined, {}, { role: null });
  assertEquals(nonMember.response.status, 403);
  assertEquals(errorOf(nonMember.payload).code, "FORBIDDEN_NOT_MEMBER");

  const otherTenant = await call(undefined, {}, {
    balance: { organizationId: OTHER_ORG_ID },
  });
  assertEquals(otherTenant.response.status, 403);
  assertEquals(errorOf(otherTenant.payload).code, "FORBIDDEN_NOT_MEMBER");

  const nonExistent = await call(undefined, {}, { balance: null });
  assertEquals(nonExistent.response.status, 403);
  assertEquals(errorOf(nonExistent.payload).code, "FORBIDDEN_NOT_MEMBER");

  const noToken = await call(undefined, { token: null });
  assertEquals(noToken.response.status, 401);
  assertEquals(errorOf(noToken.payload).code, "AUTH_INVALID");
});

Deno.test("EF-05 422/409/401: body inválido, idempotencia y conflicto de RPC", async () => {
  const missingFicha = await call({});
  assertEquals(missingFicha.response.status, 422);
  assertEquals(
    errorOf(missingFicha.payload).code,
    "VALIDATION_PARAMETRO_REQUERIDO",
  );

  const invalidIdem = await call(undefined, { idempotencyKey: "no-uuid" });
  assertEquals(invalidIdem.response.status, 422);
  assertEquals(
    errorOf(invalidIdem.payload).code,
    "VALIDATION_IDEMPOTENCY_KEY",
  );

  const conflict = await call(undefined, {}, {
    rpc: { ok: false, code: "CONFLICT_STATE", details: { motivo: "doble" } },
  });
  assertEquals(conflict.response.status, 409);
  assertEquals(errorOf(conflict.payload).code, "CONFLICT_STATE");

  const badProfile = await call(undefined, {}, { verifyProfile: false });
  assertEquals(badProfile.response.status, 401);
});

Deno.test("EF-05 replay: 200 sin notificación ni evento", async () => {
  const { response, recorded } = await call(undefined, {}, {
    rpc: {
      ok: true,
      replayed: true,
      data: {
        estado: "validado_r3",
        brecha_anual_pct: 5,
        brecha_max_mes_pct: 8,
        meses_sobre_umbral: 0,
      },
    },
  });
  assertEquals(response.status, 200);
  assertEquals(recorded.notifications.length, 0);
  assertEquals(recorded.broadcast.length, 0);
});

Deno.test("EF-05: CORS preflight y ruta desconocida", async () => {
  const { deps } = makeFake();
  const handler = createBheValidateHandler(CONFIG, deps);
  const preflight = await handler(
    await makeRequest(null, {
      method: "OPTIONS",
      origin: "https://app.example",
    }, `/balances/${BALANCE_ID}/validate-r3`),
  );
  assertEquals(preflight.status, 204);
  assertEquals(
    preflight.headers.get("access-control-allow-origin"),
    "https://app.example",
  );

  const notFound = await handler(
    await makeRequest({}, {}, `/balances/${BALANCE_ID}/otra`),
  );
  assertEquals(notFound.status, 404);
});
