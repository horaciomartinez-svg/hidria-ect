/**
 * F1-06b (task-114) — pruebas de contrato de EF-03 `checklist/transition` (TD-2).
 * Sin red: cliente DB/RPC y broadcast inyectados; JWT sintético.
 */

import { assert, assertEquals } from "./asserts.ts";
import type { DiagnosticRole } from "../auth.ts";
import {
  type ChecklistClient,
  type ChecklistConfig,
  createChecklistTransitionHandler,
  evaluateTransition,
} from "../checklist_transition.ts";
import type {
  ChecklistItemRow,
  DiagnosticRow,
  DocumentScopeRow,
  RpcResult,
} from "../db.ts";
import type { RealtimeConfig, RealtimeMessage } from "../realtime.ts";
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

const ITEM_ID = "e1000000-0000-4000-8000-000000000001";
const DOC_ID = "d1000000-0000-4000-8000-000000000001";
const OTHER_DIAG = "c1000000-0000-4000-8000-000000000002";
const PATH = `/checklist/${ITEM_ID}/transition`;

const CONFIG: ChecklistConfig = {
  auth: { jwtSecret: TEST_SECRET, expectedIssuer: ISSUER },
  cors: { allowedOrigins: ["https://app.example"] },
  realtime: {
    supabaseUrl: "https://test.supabase.co",
    serviceRoleKey: SERVICE_KEY,
  },
};

interface Recorded {
  rpcArgs: Array<Record<string, unknown>>;
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
  item?: Partial<ChecklistItemRow> | null;
  diagnostic?: Partial<DiagnosticRow> | null;
  document?: Partial<DocumentScopeRow> | null;
  users?: string[];
  rpc?: RpcResult;
  broadcastFails?: boolean;
}

function makeFake(options: FakeOptions = {}): {
  deps: Parameters<typeof createChecklistTransitionHandler>[1];
  recorded: Recorded;
} {
  const recorded: Recorded = { rpcArgs: [], notifications: [], broadcast: [] };
  const item: ChecklistItemRow | null = options.item === null ? null : {
    id: ITEM_ID,
    diagnosticId: DIAG_ID,
    itemCode: "layout",
    estado: "no_recibido",
    documentId: null,
    solicitudNota: null,
    ...(options.item ?? {}),
  };
  const diagnostic: DiagnosticRow | null = options.diagnostic === null
    ? null
    : {
      id: DIAG_ID,
      organizationId: ORG_ID,
      companyId: null,
      folio: "MDOHI-2026-001",
      faseActual: 1,
      estado: "activo",
      catEstado: "no_enviado",
      proximoHito: null,
      semaforoAtraso: "verde",
      avancePct: 16.7,
      fechaInicio: "2026-11-01",
      ...(options.diagnostic ?? {}),
    };
  const document: DocumentScopeRow | null = options.document === null ? null : {
    id: DOC_ID,
    diagnosticId: DIAG_ID,
    organizationId: ORG_ID,
    ...(options.document ?? {}),
  };

  const client: ChecklistClient = {
    resolveRole: () =>
      Promise.resolve(
        (options.role !== undefined ? options.role : "coordinador") as
          | DiagnosticRole
          | null,
      ),
    verifyProfile: () => Promise.resolve(options.verifyProfile ?? true),
    fetchDiagnostic: () => Promise.resolve(diagnostic),
    fetchChecklistItemById: () => Promise.resolve(item),
    fetchDocumentById: () => Promise.resolve(document),
    listRoleUserIds: () => Promise.resolve(options.users ?? [USER_EQUIPO]),
    insertNotifications: (rows) => {
      recorded.notifications = rows;
      return Promise.resolve();
    },
    callRpc: <T extends RpcResult>(
      _functionName: string,
      args: Record<string, unknown>,
    ): Promise<T> => {
      recorded.rpcArgs.push(args);
      return Promise.resolve((options.rpc ?? { ok: true }) as T);
    },
  };

  return {
    deps: {
      client,
      broadcast:
        ((_config: RealtimeConfig, messages: readonly RealtimeMessage[]) => {
          recorded.broadcast = messages;
          return Promise.resolve(!options.broadcastFails);
        }) as typeof import("../realtime.ts").broadcastRealtime,
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
  const { deps, recorded } = makeFake(fake);
  const handler = createChecklistTransitionHandler(CONFIG, deps);
  const response = await handler(await makeRequest(body, options, PATH));
  const payload = await response.json() as Record<string, unknown>;
  return { response, payload, recorded };
}

function errorOf(payload: Record<string, unknown>): {
  code: string;
  details?: Record<string, unknown>;
} {
  return payload.error as { code: string; details?: Record<string, unknown> };
}

Deno.test("TD-2: coordinador no_recibido→recibido con nota ⇒ 200, notificación y eventos", async () => {
  const { response, payload, recorded } = await call(
    {
      to: "recibido",
      solicitud_nota: "Falta el layout de planta actualizado.",
    },
    { origin: "https://app.example" },
  );
  assertEquals(response.status, 200);
  assertEquals(payload.item_id, ITEM_ID);
  assertEquals(payload.item_code, "layout");
  assertEquals(payload.estado, "recibido");
  assertEquals(
    response.headers.get("access-control-allow-origin"),
    "https://app.example",
  );
  assertEquals(recorded.rpcArgs.length, 1);
  assertEquals(recorded.rpcArgs[0].p_item_id, ITEM_ID);
  assertEquals(recorded.rpcArgs[0].p_to, "recibido");
  assertEquals(recorded.rpcArgs[0].p_document_id, null);
  assertEquals(
    recorded.rpcArgs[0].p_solicitud_nota,
    "Falta el layout de planta actualizado.",
  );
  assertEquals(typeof recorded.rpcArgs[0].p_request_hash, "string");
  assertEquals(recorded.notifications.length, 1);
  assertEquals(recorded.notifications[0].kind, "validacion");
  assertEquals(recorded.broadcast.length, 2);
  assertEquals(recorded.broadcast[0].event, "checklist_updated");
  assertEquals(recorded.broadcast[1].event, "kanban_refresh");
});

Deno.test("TD-2: empresa no_recibido→recibido con document_id ⇒ 200 sin notificación", async () => {
  const { response, recorded } = await call(
    { to: "recibido", document_id: DOC_ID },
    {},
    { role: "empresa" },
  );
  assertEquals(response.status, 200);
  assertEquals(recorded.rpcArgs[0].p_document_id, DOC_ID);
  assertEquals(recorded.notifications.length, 0);
});

Deno.test("TD-2: coordinador recibido→revisado y revisado→validado_r1 ⇒ 200", async () => {
  const revisado = await call({ to: "revisado" }, {}, {
    item: { estado: "recibido" },
  });
  assertEquals(revisado.response.status, 200);
  assertEquals(revisado.payload.estado, "revisado");

  const validado = await call({ to: "validado_r1", document_id: DOC_ID }, {}, {
    item: { estado: "revisado" },
  });
  assertEquals(validado.response.status, 200);
  assertEquals(validado.payload.estado, "validado_r1");
  assertEquals(validado.payload.document_id, DOC_ID);
});

Deno.test("TD-2: validado_r1 es terminal ⇒ 409 CONFLICT_STATE con estado_actual", async () => {
  const { response, payload } = await call({ to: "revisado" }, {}, {
    item: { estado: "validado_r1" },
  });
  assertEquals(response.status, 409);
  const error = errorOf(payload);
  assertEquals(error.code, "CONFLICT_STATE");
  assertEquals(error.details?.estado_actual, "validado_r1");
});

Deno.test("TD-2: roles no autorizados para validado_r1 ⇒ 403 FORBIDDEN_ROLE", async () => {
  for (const role of ["empresa", "equipo"]) {
    const { response, payload } = await call(
      { to: "validado_r1", document_id: DOC_ID },
      {},
      { role, item: { estado: "revisado" } },
    );
    assertEquals(response.status, 403);
    assertEquals(errorOf(payload).code, "FORBIDDEN_ROLE");
  }
});

Deno.test("TD-2: validado_r1 exige document_id; coord/equipo exige solicitud_nota", async () => {
  const sinDoc = await call({ to: "validado_r1" }, {}, {
    item: { estado: "revisado" },
  });
  assertEquals(sinDoc.response.status, 422);
  assertEquals(
    errorOf(sinDoc.payload).details?.field,
    "document_id",
  );

  const sinNota = await call({ to: "recibido" }, {});
  assertEquals(sinNota.response.status, 422);
  assertEquals(
    errorOf(sinNota.payload).details?.field,
    "solicitud_nota",
  );

  const empresaSinDoc = await call({ to: "recibido" }, {}, { role: "empresa" });
  assertEquals(empresaSinDoc.response.status, 422);
  assertEquals(
    errorOf(empresaSinDoc.payload).details?.field,
    "document_id",
  );
});

Deno.test("EF-03: transición no permitida y body inválido ⇒ 409/422", async () => {
  const salto = await call({ to: "validado_r1", document_id: DOC_ID });
  assertEquals(salto.response.status, 409);
  assertEquals(errorOf(salto.payload).code, "CONFLICT_STATE");

  const toInvalido = await call({ to: "aprobado" });
  assertEquals(toInvalido.response.status, 422);
  assertEquals(
    errorOf(toInvalido.payload).code,
    "VALIDATION_PARAMETRO_REQUERIDO",
  );

  const docInvalido = await call(
    { to: "recibido", document_id: "no-uuid" },
    {},
    {
      role: "empresa",
    },
  );
  assertEquals(docInvalido.response.status, 422);
  assertEquals(errorOf(docInvalido.payload).details?.field, "document_id");
});

Deno.test("EF-03: documento de otro diagnóstico ⇒ 422 con reason documento_no_valido", async () => {
  const { response, payload } = await call(
    { to: "validado_r1", document_id: DOC_ID },
    {},
    {
      item: { estado: "revisado" },
      document: { diagnosticId: OTHER_DIAG, organizationId: ORG_ID },
    },
  );
  assertEquals(response.status, 422);
  assertEquals(
    errorOf(payload).details?.reason,
    "documento_no_valido",
  );
});

Deno.test("EF-03: ítem inexistente ⇒ 404; otro tenant/no miembro ⇒ 403", async () => {
  const notFound = await call({ to: "recibido", solicitud_nota: "x" }, {}, {
    item: null,
  });
  assertEquals(notFound.response.status, 404);
  assertEquals(errorOf(notFound.payload).code, "NOT_FOUND");

  const otherTenant = await call({ to: "recibido", solicitud_nota: "x" }, {}, {
    diagnostic: { organizationId: OTHER_ORG_ID },
  });
  assertEquals(otherTenant.response.status, 403);
  assertEquals(errorOf(otherTenant.payload).code, "FORBIDDEN_NOT_MEMBER");

  const observador = await call({ to: "recibido", solicitud_nota: "x" }, {}, {
    role: "observador",
  });
  assertEquals(observador.response.status, 403);
  assertEquals(errorOf(observador.payload).code, "FORBIDDEN_ROLE");
});

Deno.test("EF-03: 401 sin token o verifyProfile falso", async () => {
  const noToken = await call({ to: "recibido" }, { token: null });
  assertEquals(noToken.response.status, 401);
  assertEquals(errorOf(noToken.payload).code, "AUTH_INVALID");

  const badProfile = await call({ to: "recibido" }, {}, {
    verifyProfile: false,
  });
  assertEquals(badProfile.response.status, 401);
});

Deno.test("EF-03: replay idempotente ⇒ 200 sin notificación ni eventos", async () => {
  const { response, recorded } = await call(
    {
      to: "recibido",
      solicitud_nota: "Solicitud de layout actualizado.",
    },
    { idempotencyKey: "22222222-2222-4222-8222-222222222222" },
    { rpc: { ok: true, replayed: true } },
  );
  assertEquals(response.status, 200);
  assertEquals(recorded.notifications.length, 0);
  assertEquals(recorded.broadcast.length, 0);
});

Deno.test("EF-03: CONFLICT_STATE de la RPC y Idempotency-Key inválida", async () => {
  const conflict = await call({ to: "recibido", solicitud_nota: "x" }, {}, {
    rpc: { ok: false, code: "CONFLICT_STATE", details: { motivo: "idem" } },
  });
  assertEquals(conflict.response.status, 409);
  assertEquals(errorOf(conflict.payload).code, "CONFLICT_STATE");

  const invalid = await call(
    { to: "recibido", solicitud_nota: "x" },
    { idempotencyKey: "no-uuid" },
  );
  assertEquals(invalid.response.status, 422);
  assertEquals(
    errorOf(invalid.payload).code,
    "VALIDATION_IDEMPOTENCY_KEY",
  );
  assertEquals(invalid.recorded.rpcArgs.length, 0);
});

Deno.test("EF-03: CORS preflight y ruta desconocida", async () => {
  const { deps } = makeFake();
  const handler = createChecklistTransitionHandler(CONFIG, deps);

  const preflight = await handler(
    await makeRequest(null, {
      method: "OPTIONS",
      origin: "https://app.example",
    }, PATH),
  );
  assertEquals(preflight.status, 204);
  assertEquals(
    preflight.headers.get("access-control-allow-origin"),
    "https://app.example",
  );

  const notFound = await handler(
    await makeRequest({}, {}, "/checklist/otra"),
  );
  assertEquals(notFound.status, 404);
});

Deno.test("evaluateTransition: matriz TD-2 pura (roles/estados)", () => {
  assertEquals(
    evaluateTransition({
      role: "coordinador",
      from: "revisado",
      to: "validado_r1",
      documentId: DOC_ID,
      solicitudNota: null,
    }).ok,
    true,
  );
  assertEquals(
    evaluateTransition({
      role: "empresa",
      from: "revisado",
      to: "validado_r1",
      documentId: DOC_ID,
      solicitudNota: null,
    }).ok,
    false,
  );
  assertEquals(
    evaluateTransition({
      role: "coordinador",
      from: "no_recibido",
      to: "recibido",
      documentId: null,
      solicitudNota: null,
    }).ok,
    false,
  );
  const result = evaluateTransition({
    role: "coordinador",
    from: "no_recibido",
    to: "recibido",
    documentId: null,
    solicitudNota: "Falta layout.",
  });
  assert(result.ok);
  if (result.ok) assertEquals(result.notifyEmpresa, true);
});
