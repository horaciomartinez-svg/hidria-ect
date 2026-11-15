/**
 * F1-10 (task-158) — pruebas de contrato EF-06 `ivoh/score` y `validate-r4`.
 * Sin red: diagnóstico, ficha R4 y RPC inyectados; JWT sintético.
 */

import { assertEquals } from "./asserts.ts";
import type { DiagnosticRole } from "../auth.ts";
import {
  createIvohHandler,
  type IvohClient,
  type IvohConfig,
} from "../ivoh_validate.ts";
import type { DiagnosticRow, RpcResult } from "../db.ts";
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

const FICHA_R4 = "fa100000-0000-4000-8000-000000000004";
const OTHER_DIAG = "c1000000-0000-4000-8000-000000000002";
const VERSION_ID = "ab100000-0000-4000-8000-000000000001";

const CONFIG: IvohConfig = {
  auth: { jwtSecret: TEST_SECRET, expectedIssuer: ISSUER },
  cors: { allowedOrigins: ["https://app.example"] },
  realtime: {
    supabaseUrl: "https://test.supabase.co",
    serviceRoleKey: SERVICE_KEY,
  },
};

const SCORES = [
  {
    factor_code: "F1",
    puntaje: 6.5,
    justificacion: "Evidencia de consumos",
    evidencia: [{ tipo: "documento", ref: "doc-1" }],
  },
  {
    factor_code: "F2",
    puntaje: 8,
    justificacion: "Buen control operativo",
    evidencia: [
      { tipo: "indicador", ref: "IND-2", descripcion: "Indicador mensual" },
    ],
  },
];

interface Recorded {
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  notifications: Array<{ userId: string; kind: string }>;
  broadcast: ReadonlyArray<RealtimeMessage>;
}

interface FakeOptions {
  role?: string | null;
  verifyProfile?: boolean;
  diagnostic?: Partial<DiagnosticRow> | null;
  ficha?: {
    id: string;
    diagnosticId: string;
    clave: string;
    estado: string;
  } | null;
  rpc?: RpcResult;
}

function makeFake(options: FakeOptions = {}): {
  deps: Parameters<typeof createIvohHandler>[1];
  recorded: Recorded;
} {
  const recorded: Recorded = { rpcCalls: [], notifications: [], broadcast: [] };
  const diagnostic: DiagnosticRow | null = options.diagnostic === null
    ? null
    : {
      id: DIAG_ID,
      organizationId: ORG_ID,
      companyId: null,
      folio: "MDOHI-2026-001",
      faseActual: 5,
      estado: "activo",
      catEstado: "validado_r2",
      proximoHito: null,
      semaforoAtraso: "verde",
      avancePct: 75,
      fechaInicio: "2026-11-01",
      ...(options.diagnostic ?? {}),
    };
  const client: IvohClient = {
    resolveRole: () =>
      Promise.resolve(
        (options.role !== undefined ? options.role : "coordinador") as
          | DiagnosticRole
          | null,
      ),
    verifyProfile: () => Promise.resolve(options.verifyProfile ?? true),
    fetchDiagnostic: () => Promise.resolve(diagnostic),
    fetchLogbookEntryById: (entryId) => {
      if (options.ficha === null) return Promise.resolve(null);
      const ficha = options.ficha ?? {
        id: FICHA_R4,
        diagnosticId: DIAG_ID,
        clave: "R4",
        estado: "cerrada",
      };
      return Promise.resolve(ficha.id === entryId ? ficha : null);
    },
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
      broadcast: ((_config, messages: readonly RealtimeMessage[]) => {
        recorded.broadcast = messages;
        return Promise.resolve(true);
      }) as typeof import("../realtime.ts").broadcastRealtime,
    },
    recorded,
  };
}

async function call(
  action: "score" | "validate-r4",
  body: Record<string, unknown>,
  options: Parameters<typeof makeRequest>[1] = {},
  fake: FakeOptions = {},
): Promise<{
  response: Response;
  payload: Record<string, unknown>;
  recorded: Recorded;
}> {
  const { deps, recorded } = makeFake(fake);
  const handler = createIvohHandler(CONFIG, deps);
  const response = await handler(
    await makeRequest(body, options, `/ivoh/${DIAG_ID}/${action}`),
  );
  const payload = await response.json() as Record<string, unknown>;
  return { response, payload, recorded };
}

function errorOf(payload: Record<string, unknown>): {
  code: string;
  details?: Record<string, unknown>;
} {
  return payload.error as { code: string; details?: Record<string, unknown> };
}

Deno.test("EF-06 score 200: borrador parcial sin total/semáforo y RPC canónica", async () => {
  const { response, payload, recorded } = await call("score", {
    scores: SCORES,
  }, {
    origin: "https://app.example",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  }, {
    rpc: {
      ok: true,
      data: {
        version_id: VERSION_ID,
        estado: "borrador",
        factores_guardados: 2,
      },
    },
  });
  assertEquals(response.status, 200);
  assertEquals(payload, {
    diagnostic_id: DIAG_ID,
    version_id: VERSION_ID,
    estado: "borrador",
    factores_guardados: 2,
  });
  assertEquals("total" in payload, false);
  assertEquals("semaforo" in payload, false);
  assertEquals(recorded.rpcCalls[0].fn, "fn_save_ivoh_score");
  assertEquals(recorded.rpcCalls[0].args.p_user_id, USER_EQUIPO);
  const sent = recorded.rpcCalls[0].args.p_scores as Array<
    { factor_code: string }
  >;
  assertEquals(sent.map((row) => row.factor_code), ["F1", "F2"]);
  assertEquals(recorded.notifications.length, 0);
});

Deno.test("EF-06 score 422: valida 1–6, duplicados, paso 0.5, justificación y evidencia", async () => {
  const invalidCases: Array<Record<string, unknown>> = [
    { scores: [] },
    { scores: [...SCORES, ...SCORES] },
    { scores: [{ ...SCORES[0], puntaje: 7.3 }] },
    { scores: [{ ...SCORES[0], justificacion: "  " }] },
    { scores: [{ ...SCORES[0], evidencia: [] }] },
    { scores: [{ ...SCORES[0], evidencia: [{ tipo: "otro", ref: "x" }] }] },
    { scores: [{ ...SCORES[0], evidencia: [{ tipo: "documento", ref: "" }] }] },
    { scores: [{ ...SCORES[0], factor_code: "F7" }] },
  ];
  for (const body of invalidCases) {
    const { response, payload, recorded } = await call("score", body);
    assertEquals(response.status, 422);
    assertEquals(
      errorOf(payload).code,
      "VALIDATION_PARAMETRO_REQUERIDO",
    );
    assertEquals(recorded.rpcCalls.length, 0);
  }
});

Deno.test("EF-06 score 403/401: rol observador, no miembro, otro tenant y sin token", async () => {
  const observador = await call("score", { scores: SCORES }, {}, {
    role: "observador",
  });
  assertEquals(observador.response.status, 403);
  assertEquals(errorOf(observador.payload).code, "FORBIDDEN_ROLE");

  const nonMember = await call("score", { scores: SCORES }, {}, { role: null });
  assertEquals(nonMember.response.status, 403);

  const otherTenant = await call("score", { scores: SCORES }, {}, {
    diagnostic: { organizationId: OTHER_ORG_ID },
  });
  assertEquals(otherTenant.response.status, 403);

  const nonExistent = await call("score", { scores: SCORES }, {}, {
    diagnostic: null,
  });
  assertEquals(nonExistent.response.status, 403);

  const noToken = await call("score", { scores: SCORES }, { token: null });
  assertEquals(noToken.response.status, 401);
});

Deno.test("EF-06 score 409/422: RPC gate/version/conflicto e idempotency inválida", async () => {
  const gate = await call("score", { scores: SCORES }, {}, {
    rpc: { ok: false, code: "GATE_BHE_R3", message: "BHE pendiente" },
  });
  assertEquals(gate.response.status, 409);
  assertEquals(errorOf(gate.payload).code, "GATE_BHE_R3");

  const version = await call("score", { scores: SCORES }, {}, {
    rpc: { ok: false, code: "CONFLICT_IVOH_VERSION", message: "versión" },
  });
  assertEquals(version.response.status, 409);

  const invalidKey = await call("score", { scores: SCORES }, {
    idempotencyKey: "no-uuid",
  });
  assertEquals(invalidKey.response.status, 422);
  assertEquals(
    errorOf(invalidKey.payload).code,
    "VALIDATION_IDEMPOTENCY_KEY",
  );
});

Deno.test("EF-06 validate-r4 200: ficha R4, RPC, total/semáforo/por_factor, evento", async () => {
  const porFactor = [
    { factor_code: "F1", peso: 0.15, puntaje: 6.5, aportacion: 0.975 },
    { factor_code: "F2", peso: 0.2, puntaje: 8, aportacion: 1.6 },
  ];
  const { response, payload, recorded } = await call(
    "validate-r4",
    { r4_logbook_id: FICHA_R4 },
    {},
    {
      rpc: {
        ok: true,
        data: {
          diagnostic_id: DIAG_ID,
          total: 7.2,
          semaforo: "amarillo",
          semaforo_label: "Básico",
          por_factor: porFactor,
        },
      },
    },
  );
  assertEquals(response.status, 200);
  assertEquals(payload, {
    diagnostic_id: DIAG_ID,
    total: 7.2,
    semaforo: "amarillo",
    semaforo_label: "Básico",
    por_factor: porFactor,
  });
  assertEquals(recorded.rpcCalls[0].fn, "fn_validate_ivoh_r4");
  assertEquals(recorded.rpcCalls[0].args.p_r4_logbook_id, FICHA_R4);
  assertEquals(recorded.notifications.length, 1);
  assertEquals(recorded.broadcast[0].event, "ivoh_validated");
});

Deno.test("EF-06 validate-r4 409: ficha R4 inválida", async () => {
  for (
    const ficha of [
      null,
      { id: FICHA_R4, diagnosticId: DIAG_ID, clave: "R4", estado: "abierta" },
      { id: FICHA_R4, diagnosticId: DIAG_ID, clave: "R3", estado: "cerrada" },
      {
        id: FICHA_R4,
        diagnosticId: OTHER_DIAG,
        clave: "R4",
        estado: "cerrada",
      },
    ]
  ) {
    const { response, payload } = await call(
      "validate-r4",
      { r4_logbook_id: FICHA_R4 },
      {},
      { ficha },
    );
    assertEquals(response.status, 409);
    assertEquals(errorOf(payload).code, "GATE_R4_FICHA");
  }
});

Deno.test("EF-06 validate-r4 422/409: incompleto, versión, RPC y replay sin efectos", async () => {
  const incomplete = await call(
    "validate-r4",
    { r4_logbook_id: FICHA_R4 },
    {},
    {
      rpc: {
        ok: false,
        code: "VALIDATION_IVOH_INCOMPLETO",
        details: { factores_guardados: 4 },
      },
    },
  );
  assertEquals(incomplete.response.status, 422);
  assertEquals(
    errorOf(incomplete.payload).code,
    "VALIDATION_IVOH_INCOMPLETO",
  );

  const version = await call(
    "validate-r4",
    { r4_logbook_id: FICHA_R4 },
    {},
    { rpc: { ok: false, code: "CONFLICT_IVOH_VERSION" } },
  );
  assertEquals(version.response.status, 409);

  const replay = await call(
    "validate-r4",
    { r4_logbook_id: FICHA_R4 },
    {},
    {
      rpc: {
        ok: true,
        replayed: true,
        data: {
          total: 7.2,
          semaforo: "amarillo",
          semaforo_label: "Básico",
          por_factor: [],
        },
      },
    },
  );
  assertEquals(replay.response.status, 200);
  assertEquals(replay.recorded.notifications.length, 0);
  assertEquals(replay.recorded.broadcast.length, 0);
});

Deno.test("EF-06: CORS preflight y ruta desconocida", async () => {
  const { deps } = makeFake();
  const handler = createIvohHandler(CONFIG, deps);
  const preflight = await handler(
    await makeRequest(null, {
      method: "OPTIONS",
      origin: "https://app.example",
    }, `/ivoh/${DIAG_ID}/score`),
  );
  assertEquals(preflight.status, 204);
  assertEquals(
    preflight.headers.get("access-control-allow-origin"),
    "https://app.example",
  );

  const notFound = await handler(await makeRequest({}, {}, "/ivoh/otra"));
  assertEquals(notFound.status, 404);
});
