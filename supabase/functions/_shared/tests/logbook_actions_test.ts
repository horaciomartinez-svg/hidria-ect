/**
 * F1-11 (task-173) — pruebas de contrato EF-02 `logbook/{id}/submit-review|sign|close`.
 * Sin red: ficha y RPC inyectadas; JWT sintético.
 */

import { assertEquals } from "./asserts.ts";
import type { DiagnosticRole } from "../auth.ts";
import {
  createLogbookHandler,
  type LogbookClient,
  type LogbookConfig,
} from "../logbook_actions.ts";
import type { LogbookEntryRow, RpcResult } from "../db.ts";
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

const ENTRY_ID = "ab100000-0000-4000-8000-000000000001";
const PARTICIPANTE = "Dirección de la empresa";

const CONFIG: LogbookConfig = {
  auth: { jwtSecret: TEST_SECRET, expectedIssuer: ISSUER },
  cors: { allowedOrigins: ["https://app.example"] },
  realtime: {
    supabaseUrl: "https://test.supabase.co",
    serviceRoleKey: SERVICE_KEY,
  },
};

interface Recorded {
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  notifications: Array<{ userId: string; kind: string }>;
  broadcast: ReadonlyArray<RealtimeMessage>;
}

interface FakeOptions {
  role?: string | null;
  verifyProfile?: boolean;
  entry?: Partial<LogbookEntryRow> | null;
  rpc?: RpcResult;
}

function makeFake(options: FakeOptions = {}): {
  deps: Parameters<typeof createLogbookHandler>[1];
  recorded: Recorded;
} {
  const recorded: Recorded = { rpcCalls: [], notifications: [], broadcast: [] };
  const entry: LogbookEntryRow | null = options.entry === null ? null : {
    id: ENTRY_ID,
    diagnosticId: DIAG_ID,
    organizationId: ORG_ID,
    clave: "V1",
    folio: "BIT-V1-01",
    estado: "abierta",
    version: 1,
    fecha: "2026-11-20",
    horarioInicio: "09:00:00",
    ...(options.entry ?? {}),
  };
  const client: LogbookClient = {
    resolveRole: () =>
      Promise.resolve(
        (options.role !== undefined ? options.role : "coordinador") as
          | DiagnosticRole
          | null,
      ),
    verifyProfile: () => Promise.resolve(options.verifyProfile ?? true),
    fetchLogbookEntryForEf02: () => Promise.resolve(entry),
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
  action: "submit-review" | "sign" | "close",
  body: Record<string, unknown> = {},
  options: Parameters<typeof makeRequest>[1] = {},
  fake: FakeOptions = {},
): Promise<{
  response: Response;
  payload: Record<string, unknown>;
  recorded: Recorded;
}> {
  const { deps, recorded } = makeFake(fake);
  const handler = createLogbookHandler(CONFIG, deps);
  const response = await handler(
    await makeRequest(body, options, `/logbook/${ENTRY_ID}/${action}`),
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

Deno.test("EF-02 submit-review 200: abierta→en_revision con RPC atómica", async () => {
  const { response, payload, recorded } = await call(
    "submit-review",
    {},
    { origin: "https://app.example" },
    { rpc: { ok: true, data: { estado: "en_revision" } } },
  );
  assertEquals(response.status, 200);
  assertEquals(payload, {
    entry_id: ENTRY_ID,
    folio: "BIT-V1-01",
    clave: "V1",
    estado: "en_revision",
  });
  assertEquals(recorded.rpcCalls[0].fn, "fn_submit_logbook_review");
  assertEquals(recorded.rpcCalls[0].args.p_user_id, USER_EQUIPO);
  assertEquals(recorded.rpcCalls[0].args.p_entry_id, ENTRY_ID);
});

Deno.test("EF-02 sign 200: firma por nombre y respuesta con firma_ts", async () => {
  const { response, payload, recorded } = await call(
    "sign",
    { participante: PARTICIPANTE },
    {},
    {
      entry: { estado: "en_revision" },
      rpc: {
        ok: true,
        data: { firma_ts: "2026-11-21T15:00:00Z", estado: "en_revision" },
      },
    },
  );
  assertEquals(response.status, 200);
  assertEquals(payload.participante, PARTICIPANTE);
  assertEquals(payload.firma_ts, "2026-11-21T15:00:00Z");
  assertEquals(recorded.rpcCalls[0].fn, "fn_sign_logbook_participant");
  assertEquals(
    recorded.rpcCalls[0].args.p_participante_nombre,
    PARTICIPANTE,
  );
});

Deno.test("EF-02 sign 422: participante faltante/vacío/no texto", async () => {
  for (const body of [{}, { participante: "" }, { participante: 3 }]) {
    const { response, payload, recorded } = await call("sign", body);
    assertEquals(response.status, 422);
    assertEquals(
      errorOf(payload).code,
      "VALIDATION_PARAMETRO_REQUERIDO",
    );
    assertEquals(recorded.rpcCalls.length, 0);
  }
});

Deno.test("EF-02 close 200: cierre desde en_revision, respuesta y post-commit", async () => {
  const { response, payload, recorded } = await call(
    "close",
    { cierre_razon: "Cierre en reunión de revisión con el equipo." },
    {},
    {
      entry: { estado: "en_revision" },
      rpc: {
        ok: true,
        data: {
          folio: "BIT-V1-01",
          clave: "V1",
          cerrada_en: "2026-11-21T16:00:00Z",
          version: 2,
          cierre_tardio: true,
        },
      },
    },
  );
  assertEquals(response.status, 200);
  assertEquals(payload, {
    entry_id: ENTRY_ID,
    folio: "BIT-V1-01",
    clave: "V1",
    cerrada_en: "2026-11-21T16:00:00Z",
    version: 2,
    cierre_tardio: true,
  });
  assertEquals(recorded.rpcCalls[0].fn, "fn_close_logbook");
  assertEquals(
    recorded.rpcCalls[0].args.p_cierre_razon,
    "Cierre en reunión de revisión con el equipo.",
  );
  assertEquals(recorded.notifications.length, 1);
  assertEquals(recorded.broadcast[0].event, "logbook_closed");
});

Deno.test("EF-02 close 422: reglas de firmas/agenda/evidencia/razón de la RPC", async () => {
  for (
    const code of [
      "VALIDATION_FIRMAS",
      "VALIDATION_AGENDA",
      "VALIDATION_EVIDENCIA",
      "VALIDATION_RAZON",
    ]
  ) {
    const { response, payload } = await call(
      "close",
      {},
      {},
      {
        entry: { estado: "en_revision" },
        rpc: { ok: false, code, details: { motivo: code } },
      },
    );
    assertEquals(response.status, 422);
    assertEquals(errorOf(payload).code, code);
  }
});

Deno.test("EF-02 403/401: observador, no miembro, otro tenant, inexistente y sin token", async () => {
  const observador = await call("submit-review", {}, {}, {
    role: "observador",
  });
  assertEquals(observador.response.status, 403);
  assertEquals(errorOf(observador.payload).code, "FORBIDDEN_ROLE");

  const nonMember = await call("submit-review", {}, {}, { role: null });
  assertEquals(nonMember.response.status, 403);

  const otherTenant = await call("submit-review", {}, {}, {
    entry: { organizationId: OTHER_ORG_ID },
  });
  assertEquals(otherTenant.response.status, 403);

  const nonExistent = await call("submit-review", {}, {}, { entry: null });
  assertEquals(nonExistent.response.status, 403);

  const noToken = await call("submit-review", {}, { token: null });
  assertEquals(noToken.response.status, 401);
});

Deno.test("EF-02 409/422: CONFLICT_STATE de RPC e Idempotency-Key inválida", async () => {
  const conflict = await call("submit-review", {}, {}, {
    rpc: { ok: false, code: "CONFLICT_STATE", message: "estado" },
  });
  assertEquals(conflict.response.status, 409);
  assertEquals(errorOf(conflict.payload).code, "CONFLICT_STATE");

  const invalid = await call("close", {}, { idempotencyKey: "no-uuid" });
  assertEquals(invalid.response.status, 422);
  assertEquals(
    errorOf(invalid.payload).code,
    "VALIDATION_IDEMPOTENCY_KEY",
  );
});

Deno.test("EF-02 close replay: 200 sin notificación ni evento", async () => {
  const { response, recorded } = await call(
    "close",
    {},
    {},
    {
      entry: { estado: "en_revision" },
      rpc: {
        ok: true,
        replayed: true,
        data: {
          folio: "BIT-V1-01",
          clave: "V1",
          cerrada_en: "2026-11-21T16:00:00Z",
          version: 2,
          cierre_tardio: false,
        },
      },
    },
  );
  assertEquals(response.status, 200);
  assertEquals(recorded.notifications.length, 0);
  assertEquals(recorded.broadcast.length, 0);
});

Deno.test("EF-02 close 422: razón no textual o > 2000 caracteres", async () => {
  const notText = await call("close", { cierre_razon: 3 });
  assertEquals(notText.response.status, 422);
  assertEquals(
    errorOf(notText.payload).code,
    "VALIDATION_PARAMETRO_REQUERIDO",
  );

  const tooLong = await call("close", { cierre_razon: "x".repeat(2001) });
  assertEquals(tooLong.response.status, 422);
});

Deno.test("EF-02: CORS preflight y ruta desconocida", async () => {
  const { deps } = makeFake();
  const handler = createLogbookHandler(CONFIG, deps);
  const preflight = await handler(
    await makeRequest(null, {
      method: "OPTIONS",
      origin: "https://app.example",
    }, `/logbook/${ENTRY_ID}/close`),
  );
  assertEquals(preflight.status, 204);
  assertEquals(
    preflight.headers.get("access-control-allow-origin"),
    "https://app.example",
  );

  const notFound = await handler(await makeRequest({}, {}, "/logbook/otra"));
  assertEquals(notFound.status, 404);
});
