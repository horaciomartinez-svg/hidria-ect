/**
 * F1-04 — pruebas de contrato de EF-01 `advance-phase` (handler con fakes).
 */

import { assertEquals } from "./asserts.ts";
import {
  type AdvancePhaseConfig,
  type AdvancePhaseDeps,
  createAdvancePhaseHandler,
} from "../advance_phase.ts";
import { ApiError } from "../errors.ts";
import type { RealtimeConfig, RealtimeMessage } from "../realtime.ts";
import {
  DIAG_ID,
  ISSUER,
  makeFakeClient,
  makeRequest,
  OTHER_ORG_ID,
  SERVICE_KEY,
  TEST_SECRET,
  USER_EQUIPO,
} from "./ef_fakes.ts";

const CONFIG: AdvancePhaseConfig = {
  auth: { jwtSecret: TEST_SECRET, expectedIssuer: ISSUER },
  cors: { allowedOrigins: ["https://app.example"] },
  realtime: {
    supabaseUrl: "https://test.supabase.co",
    serviceRoleKey: SERVICE_KEY,
  },
};

type Broadcast = typeof import("../realtime.ts").broadcastRealtime;

interface RecordedBroadcast {
  messages: ReadonlyArray<{
    topic: string;
    event: string;
    payload: Record<string, unknown>;
  }>;
}

function makeDeps(
  overrides: Parameters<typeof makeFakeClient>[0] = {},
): {
  deps: AdvancePhaseDeps;
  fake: ReturnType<typeof makeFakeClient>;
  broadcast: RecordedBroadcast;
  broadcastFails: { value: boolean };
} {
  const fake = makeFakeClient(overrides);
  const broadcast: RecordedBroadcast = { messages: [] };
  const broadcastFails = { value: false };
  const broadcastFn = ((
    _config: RealtimeConfig,
    messages: readonly RealtimeMessage[],
  ) => {
    broadcast.messages = messages;
    return Promise.resolve(!broadcastFails.value);
  }) as Broadcast;
  return {
    deps: { client: fake.client, broadcast: broadcastFn },
    fake,
    broadcast,
    broadcastFails,
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

Deno.test("EF-01 200 fase 1→2: gate R1, folio de respaldo, notificación y eventos", async () => {
  const { deps, fake, broadcast } = makeDeps({
    rpcResult: {
      ok: true,
      replayed: false,
      data: {
        folio: "MDOHI-2026-001",
        proximo_hito: "R2",
        avance_pct: 33.3,
      },
    },
  });
  const handler = createAdvancePhaseHandler(CONFIG, deps);
  const response = await handler(
    await makeRequest(
      { diagnostic_id: DIAG_ID, to_phase: 2 },
      { origin: "https://app.example" },
    ),
  );

  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("access-control-allow-origin"),
    "https://app.example",
  );
  const payload = await body(response);
  assertEquals(payload.fase_actual, 2);
  assertEquals(payload.folio, "MDOHI-2026-001");
  assertEquals(payload.proximo_hito, "R2");
  assertEquals(payload.avance_pct, 33.3);
  assertEquals(payload.gate, {
    fase_origen: 1,
    entregable: "document_checklist_items['layout'].estado='validado_r1'",
    folio_respaldo: "BIT-R1-01",
  });

  assertEquals(fake.rpcCalls.length, 1);
  assertEquals(fake.rpcCalls[0].functionName, "fn_advance_phase");
  const args = fake.rpcCalls[0].args;
  assertEquals(args.p_user_id, USER_EQUIPO);
  assertEquals(args.p_diagnostic_id, DIAG_ID);
  assertEquals(args.p_to_phase, 2);
  assertEquals(args.p_idempotency_key, null);
  assertEquals(typeof args.p_request_hash, "string");
  assertEquals(args.p_gate, {
    fase_origen: 1,
    entregable: "document_checklist_items['layout'].estado='validado_r1'",
    folio_respaldo: "BIT-R1-01",
    ficha_clave: "R1",
  });

  assertEquals(fake.notifications.rows.length, 1);
  assertEquals(fake.notifications.rows[0].kind, "hito");
  assertEquals(
    (fake.notifications.rows[0].payload as Record<string, unknown>)
      .fase_actual,
    2,
  );

  assertEquals(broadcast.messages.length, 2);
  assertEquals(broadcast.messages[0].topic, `diagnostic:${DIAG_ID}`);
  assertEquals(broadcast.messages[0].event, "phase_changed");
  assertEquals(
    broadcast.messages[1].topic,
    "org:00000000-0000-4000-8000-000000000001",
  );
  assertEquals(broadcast.messages[1].event, "kanban_refresh");
});

Deno.test("EF-01 replay idempotente: 200 sin notificación ni evento", async () => {
  const { deps, fake, broadcast } = makeDeps({
    rpcResult: { ok: true, replayed: true, data: { fase_actual: 2 } },
  });
  const handler = createAdvancePhaseHandler(CONFIG, deps);
  const response = await handler(
    await makeRequest(
      { diagnostic_id: DIAG_ID, to_phase: 2 },
      { idempotencyKey: "22222222-2222-4222-8222-222222222222" },
    ),
  );

  assertEquals(response.status, 200);
  assertEquals(fake.notifications.rows.length, 0);
  assertEquals(broadcast.messages.length, 0);
  assertEquals(
    fake.rpcCalls[0].args.p_idempotency_key,
    "22222222-2222-4222-8222-222222222222",
  );
});

Deno.test("EF-01 401: sin token o verifyProfile falso", async () => {
  const handler = createAdvancePhaseHandler(CONFIG, makeDeps().deps);
  const noToken = await handler(
    await makeRequest({ diagnostic_id: DIAG_ID, to_phase: 2 }, { token: null }),
  );
  assertEquals(noToken.status, 401);
  assertEquals(errorOf(await body(noToken)).code, "AUTH_INVALID");

  const badProfile = createAdvancePhaseHandler(
    CONFIG,
    makeDeps({ verifyProfile: false }).deps,
  );
  const response = await badProfile(
    await makeRequest({ diagnostic_id: DIAG_ID, to_phase: 2 }),
  );
  assertEquals(response.status, 401);
  assertEquals(errorOf(await body(response)).code, "AUTH_INVALID");
});

Deno.test("EF-01 403: no miembro, rol empresa y tenant distinto", async () => {
  const nonMember = await createAdvancePhaseHandler(
    CONFIG,
    makeDeps({ role: null }).deps,
  )(await makeRequest({ diagnostic_id: DIAG_ID, to_phase: 2 }));
  assertEquals(nonMember.status, 403);
  assertEquals(errorOf(await body(nonMember)).code, "FORBIDDEN_NOT_MEMBER");

  const wrongRole = await createAdvancePhaseHandler(
    CONFIG,
    makeDeps({ role: "empresa" }).deps,
  )(await makeRequest({ diagnostic_id: DIAG_ID, to_phase: 2 }));
  assertEquals(wrongRole.status, 403);
  assertEquals(errorOf(await body(wrongRole)).code, "FORBIDDEN_ROLE");

  const otherTenant = await createAdvancePhaseHandler(
    CONFIG,
    makeDeps({ diagnostic: { organizationId: OTHER_ORG_ID } }).deps,
  )(await makeRequest({ diagnostic_id: DIAG_ID, to_phase: 2 }));
  assertEquals(otherTenant.status, 403);
  assertEquals(
    errorOf(await body(otherTenant)).code,
    "FORBIDDEN_NOT_MEMBER",
  );
});

Deno.test("EF-01 409: estado no activo, fase 6 y salto de fase", async () => {
  const estado = await createAdvancePhaseHandler(
    CONFIG,
    makeDeps({ diagnostic: { estado: "suspendido" } }).deps,
  )(await makeRequest({ diagnostic_id: DIAG_ID, to_phase: 2 }));
  assertEquals(estado.status, 409);
  const estadoError = errorOf(await body(estado));
  assertEquals(estadoError.code, "CONFLICT_STATE");
  assertEquals(estadoError.details, { estado_actual: "suspendido" });

  const fase6 = await createAdvancePhaseHandler(
    CONFIG,
    makeDeps({ diagnostic: { faseActual: 6 } }).deps,
  )(await makeRequest({ diagnostic_id: DIAG_ID, to_phase: 7 }));
  assertEquals(fase6.status, 409);
  assertEquals(errorOf(await body(fase6)).code, "CONFLICT_PHASE");

  const salto = await createAdvancePhaseHandler(CONFIG, makeDeps().deps)(
    await makeRequest({ diagnostic_id: DIAG_ID, to_phase: 3 }),
  );
  assertEquals(salto.status, 409);
  assertEquals(errorOf(await body(salto)).code, "CONFLICT_PHASE");
});

Deno.test("EF-01 422: to_phase inválido o ausente", async () => {
  const handler = createAdvancePhaseHandler(CONFIG, makeDeps().deps);
  for (const toPhase of [undefined, "2", 2.5, 7, 1]) {
    const response = await handler(
      await makeRequest({ diagnostic_id: DIAG_ID, to_phase: toPhase }),
    );
    assertEquals(response.status, 422);
    assertEquals(
      errorOf(await body(response)).code,
      "VALIDATION_PHASE_TRANSICION",
    );
  }
});

Deno.test("EF-01 409 gates replicados: checklist y ficha de respaldo", async () => {
  const checklist = await createAdvancePhaseHandler(
    CONFIG,
    makeDeps({ checklist: { estado: "revisado" } }).deps,
  )(await makeRequest({ diagnostic_id: DIAG_ID, to_phase: 2 }));
  assertEquals(checklist.status, 409);
  assertEquals(errorOf(await body(checklist)).code, "GATE_CHECKLIST_R1");

  const ficha = await createAdvancePhaseHandler(
    CONFIG,
    makeDeps({
      ficha: { id: "x", clave: "R1", estado: "abierta", folio: null },
    }).deps,
  )(await makeRequest({ diagnostic_id: DIAG_ID, to_phase: 2 }));
  assertEquals(ficha.status, 409);
  const fichaError = errorOf(await body(ficha));
  assertEquals(fichaError.code, "GATE_CHECKLIST_R1");
  assertEquals(fichaError.details?.reason, "ficha");
});

Deno.test("EF-01: gate F6 con fixtures (6/6 IVOH) y autoridad final del trigger", async () => {
  const fichaR4 = {
    id: "e4",
    clave: "R4",
    estado: "cerrada",
    folio: "BIT-R4-01",
  };
  const happy = await createAdvancePhaseHandler(
    CONFIG,
    makeDeps({
      diagnostic: { faseActual: 5 },
      ficha: fichaR4,
      ivohValidatedCount: 6,
    }).deps,
  )(await makeRequest({ diagnostic_id: DIAG_ID, to_phase: 6 }));
  assertEquals(happy.status, 200);

  const triggerGate = new ApiError(
    "GATE_IVOH_R4",
    "Gate F6: el IVOH no está validado en R4.",
    { trigger: true },
  );
  const raced = await createAdvancePhaseHandler(
    CONFIG,
    makeDeps({
      diagnostic: { faseActual: 5 },
      ficha: fichaR4,
      rpcError: triggerGate,
    }).deps,
  )(await makeRequest({ diagnostic_id: DIAG_ID, to_phase: 6 }));
  assertEquals(raced.status, 409);
  assertEquals(errorOf(await body(raced)).code, "GATE_IVOH_R4");
});

Deno.test("EF-01: RPC ok:false se mapea a error canónico y no emite efectos", async () => {
  const { deps, fake, broadcast } = makeDeps({
    rpcResult: {
      ok: false,
      code: "CONFLICT_STATE",
      details: { motivo: "idempotencia" },
    },
  });
  const response = await createAdvancePhaseHandler(CONFIG, deps)(
    await makeRequest({
      diagnostic_id: DIAG_ID,
      to_phase: 2,
    }, { idempotencyKey: "22222222-2222-4222-8222-222222222222" }),
  );
  assertEquals(response.status, 409);
  assertEquals(errorOf(await body(response)).code, "CONFLICT_STATE");
  assertEquals(fake.rpcCalls.length, 1);
  assertEquals(fake.notifications.rows.length, 0);
  assertEquals(broadcast.messages.length, 0);
});

Deno.test("EF-01: Idempotency-Key inválida ⇒ 422 sin llamar a la RPC", async () => {
  const { deps, fake } = makeDeps();
  const response = await createAdvancePhaseHandler(CONFIG, deps)(
    await makeRequest(
      { diagnostic_id: DIAG_ID, to_phase: 2 },
      { idempotencyKey: "no-uuid" },
    ),
  );
  assertEquals(response.status, 422);
  assertEquals(
    errorOf(await body(response)).code,
    "VALIDATION_IDEMPOTENCY_KEY",
  );
  assertEquals(fake.rpcCalls.length, 0);
});

Deno.test("EF-01: post-commit best-effort (fallos de notificación/Realtime no revierten)", async () => {
  const { deps, broadcastFails } = makeDeps({
    notificationsError: true,
    rpcResult: { ok: true, replayed: false, data: {} },
  });
  broadcastFails.value = true;
  const response = await createAdvancePhaseHandler(CONFIG, deps)(
    await makeRequest({ diagnostic_id: DIAG_ID, to_phase: 2 }),
  );
  assertEquals(response.status, 200);
});

Deno.test("EF-01: CORS/preflight, ruta y diagnóstico faltante", async () => {
  const handler = createAdvancePhaseHandler(CONFIG, makeDeps().deps);

  const preflight = await handler(
    await makeRequest(null, {
      method: "OPTIONS",
      origin: "https://app.example",
    }),
  );
  assertEquals(preflight.status, 204);
  assertEquals(
    preflight.headers.get("access-control-allow-origin"),
    "https://app.example",
  );

  const notFound = await handler(await makeRequest({}, { path: "/otra" }));
  assertEquals(notFound.status, 404);

  const missingDiagnostic = await handler(
    await makeRequest({ to_phase: 2 }),
  );
  assertEquals(missingDiagnostic.status, 422);
  assertEquals(
    errorOf(await body(missingDiagnostic)).code,
    "VALIDATION_PARAMETRO_REQUERIDO",
  );
});
