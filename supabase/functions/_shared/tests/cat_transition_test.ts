/**
 * F1-07b (task-126) — pruebas de contrato EF-04 `cat/submit|validate-r2`.
 * Sin red: CAT (cat_items/cat_responses), ficha R2 y RPC inyectados; JWT sintético.
 */

import { assertEquals, assertNotIncludes } from "./asserts.ts";
import type { DiagnosticRole } from "../auth.ts";
import {
  CAT_VERSION,
  type CatClient,
  type CatConfig,
  createCatHandler,
  evaluateCatCompleteness,
} from "../cat_transition.ts";
import type {
  CatItemRow,
  CatResponseRow,
  DiagnosticRow,
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

const FICHA_R2 = "aa100000-0000-4000-8000-000000000001";
const OTHER_DIAG = "c1000000-0000-4000-8000-000000000002";

const CONFIG: CatConfig = {
  auth: { jwtSecret: TEST_SECRET, expectedIssuer: ISSUER },
  cors: { allowedOrigins: ["https://app.example"] },
  realtime: {
    supabaseUrl: "https://test.supabase.co",
    serviceRoleKey: SERVICE_KEY,
  },
};

const ITEMS: CatItemRow[] = [
  {
    id: "b1000000-0000-4000-8000-000000000001",
    codigo: "A1",
    seccion: "A",
    tipo: "breve",
    admiteEvidencia: false,
    condicion: null,
  },
  {
    id: "b1000000-0000-4000-8000-000000000002",
    codigo: "B1",
    seccion: "B",
    tipo: "abierta",
    admiteEvidencia: false,
    condicion: null,
  },
  {
    id: "b1000000-0000-4000-8000-000000000003",
    codigo: "C1",
    seccion: "C",
    tipo: "breve",
    admiteEvidencia: true,
    condicion: null,
  },
  {
    id: "b1000000-0000-4000-8000-000000000004",
    codigo: "D1",
    seccion: "D",
    tipo: "breve",
    admiteEvidencia: false,
    condicion: { depends_on: "B1", contains: "pozo" },
  },
];

function responses(
  overrides: Partial<Record<string, CatResponseRow>> = {},
): CatResponseRow[] {
  const base: Record<string, CatResponseRow> = {
    "b1000000-0000-4000-8000-000000000001": {
      itemId: "b1000000-0000-4000-8000-000000000001",
      valor: "A1 respuesta",
      noSe: false,
      na: false,
      documentId: null,
      resueltaEnCampo: false,
    },
    "b1000000-0000-4000-8000-000000000002": {
      itemId: "b1000000-0000-4000-8000-000000000002",
      valor: "toma de pozo",
      noSe: false,
      na: false,
      documentId: null,
      resueltaEnCampo: false,
    },
    "b1000000-0000-4000-8000-000000000003": {
      itemId: "b1000000-0000-4000-8000-000000000003",
      valor: "C1",
      noSe: false,
      na: false,
      documentId: "d1000000-0000-4000-8000-000000000001",
      resueltaEnCampo: true,
    },
    "b1000000-0000-4000-8000-000000000004": {
      itemId: "b1000000-0000-4000-8000-000000000004",
      valor: "D1",
      noSe: false,
      na: false,
      documentId: null,
      resueltaEnCampo: false,
    },
  };
  return Object.values({ ...base, ...overrides }).filter(
    (row): row is CatResponseRow => row !== undefined,
  );
}

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
  catEstado?: string;
  diagnostic?: Partial<DiagnosticRow> | null;
  items?: CatItemRow[];
  responses?: CatResponseRow[];
  ficha?: {
    id: string;
    diagnosticId: string;
    clave: string;
    estado: string;
  } | null;
  users?: string[];
  rpc?: RpcResult;
}

function makeFake(options: FakeOptions = {}): {
  deps: Parameters<typeof createCatHandler>[1];
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
      faseActual: 1,
      estado: "activo",
      catEstado: options.catEstado ?? "en_captura",
      proximoHito: null,
      semaforoAtraso: "verde",
      avancePct: 16.7,
      fechaInicio: "2026-11-01",
      ...(options.diagnostic ?? {}),
    };
  const client: CatClient = {
    resolveRole: () =>
      Promise.resolve(
        (options.role !== undefined ? options.role : "coordinador") as
          | DiagnosticRole
          | null,
      ),
    verifyProfile: () => Promise.resolve(options.verifyProfile ?? true),
    fetchDiagnostic: () => Promise.resolve(diagnostic),
    fetchCatItems: (version) =>
      Promise.resolve(version === CAT_VERSION ? (options.items ?? ITEMS) : []),
    fetchCatResponses: () => Promise.resolve(options.responses ?? responses()),
    fetchLogbookEntryById: (entryId) => {
      if (options.ficha === null) return Promise.resolve(null);
      const ficha = options.ficha ?? {
        id: FICHA_R2,
        diagnosticId: DIAG_ID,
        clave: "R2",
        estado: "cerrada",
      };
      return Promise.resolve(
        ficha.id === entryId
          ? ficha
          : ficha.diagnosticId === OTHER_DIAG
          ? { ...ficha, diagnosticId: OTHER_DIAG }
          : ficha,
      );
    },
    listRoleUserIds: () => Promise.resolve(options.users ?? [USER_EQUIPO]),
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
      broadcast:
        ((_config: RealtimeConfig, messages: readonly RealtimeMessage[]) => {
          recorded.broadcast = messages;
          return Promise.resolve(true);
        }) as typeof import("../realtime.ts").broadcastRealtime,
    },
    recorded,
  };
}

async function call(
  route: "submit" | "validate-r2",
  body: Record<string, unknown> = {},
  options: Parameters<typeof makeRequest>[1] = {},
  fake: FakeOptions = {},
): Promise<{
  response: Response;
  payload: Record<string, unknown>;
  recorded: Recorded;
}> {
  const { deps, recorded } = makeFake(fake);
  const handler = createCatHandler(CONFIG, deps);
  const response = await handler(
    await makeRequest(body, options, `/cat/${DIAG_ID}/${route}`),
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

Deno.test("EF-04 submit 200: CAT completo ⇒ en_revision con RPC atómica", async () => {
  const { response, payload, recorded } = await call("submit", {}, {
    origin: "https://app.example",
  });
  assertEquals(response.status, 200);
  assertEquals(payload, {
    diagnostic_id: DIAG_ID,
    cat_estado: "en_revision",
    pendientes: 0,
  });
  assertEquals(
    response.headers.get("access-control-allow-origin"),
    "https://app.example",
  );
  assertEquals(recorded.rpcCalls.length, 1);
  assertEquals(recorded.rpcCalls[0].fn, "fn_submit_cat");
  assertEquals(recorded.rpcCalls[0].args.p_user_id, USER_EQUIPO);
  assertEquals(recorded.rpcCalls[0].args.p_diagnostic_id, DIAG_ID);
  assertEquals(recorded.rpcCalls[0].args.p_idempotency_key, null);
  assertEquals(typeof recorded.rpcCalls[0].args.p_request_hash, "string");
  assertEquals(recorded.notifications.length, 0);
  assertEquals(recorded.broadcast.length, 0);
});

Deno.test("EF-04 submit 422: faltantes de obligatorias ⇒ VALIDATION_CAT_INCOMPLETO", async () => {
  const { response, payload, recorded } = await call("submit", {}, {}, {
    responses: responses({
      "b1000000-0000-4000-8000-000000000001": {
        itemId: "b1000000-0000-4000-8000-000000000001",
        valor: "",
        noSe: false,
        na: false,
        documentId: null,
        resueltaEnCampo: false,
      },
    }),
  });
  assertEquals(response.status, 422);
  const error = errorOf(payload);
  assertEquals(error.code, "VALIDATION_CAT_INCOMPLETO");
  assertEquals(error.details?.faltantes, ["A1"]);
  assertEquals(error.details?.pendientes, 1);
  assertEquals(recorded.rpcCalls.length, 0);
});

Deno.test("EF-04 completitud: no_se/na cuentan; evidencia en campo exige documento; condición no aplicable", () => {
  const ok = evaluateCatCompleteness(ITEMS, responses());
  assertEquals(ok.ok, true);

  const missingEvidence = evaluateCatCompleteness(
    ITEMS,
    responses({
      "b1000000-0000-4000-8000-000000000003": {
        itemId: "b1000000-0000-4000-8000-000000000003",
        valor: "C1",
        noSe: false,
        na: false,
        documentId: null,
        resueltaEnCampo: true,
      },
    }),
  );
  assertEquals(missingEvidence.ok, false);

  const sinDependencia = evaluateCatCompleteness(
    ITEMS,
    responses({
      "b1000000-0000-4000-8000-000000000002": {
        itemId: "b1000000-0000-4000-8000-000000000002",
        valor: "toma superficial",
        noSe: false,
        na: false,
        documentId: null,
        resueltaEnCampo: false,
      },
      "b1000000-0000-4000-8000-000000000004": {
        itemId: "b1000000-0000-4000-8000-000000000004",
        valor: null,
        noSe: false,
        na: false,
        documentId: null,
        resueltaEnCampo: false,
      },
    }),
  );
  assertEquals(sinDependencia.ok, true);

  const noSe = evaluateCatCompleteness(
    ITEMS,
    responses({
      "b1000000-0000-4000-8000-000000000001": {
        itemId: "b1000000-0000-4000-8000-000000000001",
        valor: null,
        noSe: true,
        na: false,
        documentId: null,
        resueltaEnCampo: false,
      },
    }),
  );
  assertEquals(noSe.ok, true);
});

Deno.test("EF-04 submit: no_enviado/en_captura permitidos; otro estado 409", async () => {
  const noEnviado = await call("submit", {}, {}, { catEstado: "no_enviado" });
  assertEquals(noEnviado.response.status, 200);
  assertEquals(noEnviado.payload.cat_estado, "en_revision");

  const { response, payload } = await call("submit", {}, {}, {
    catEstado: "en_revision",
  });
  assertEquals(response.status, 409);
  assertEquals(errorOf(payload).code, "CONFLICT_STATE");
});

Deno.test("EF-04 submit 403: observador, no miembro y otro tenant", async () => {
  const observador = await call("submit", {}, {}, { role: "observador" });
  assertEquals(observador.response.status, 403);
  assertEquals(errorOf(observador.payload).code, "FORBIDDEN_ROLE");

  const nonMember = await call("submit", {}, {}, { role: null });
  assertEquals(nonMember.response.status, 403);
  assertEquals(errorOf(nonMember.payload).code, "FORBIDDEN_NOT_MEMBER");

  const otherTenant = await call("submit", {}, {}, {
    diagnostic: { organizationId: OTHER_ORG_ID },
  });
  assertEquals(otherTenant.response.status, 403);
});

Deno.test("EF-04 submit 401: sin token y verifyProfile falso", async () => {
  const noToken = await call("submit", {}, { token: null });
  assertEquals(noToken.response.status, 401);
  assertEquals(errorOf(noToken.payload).code, "AUTH_INVALID");

  const badProfile = await call("submit", {}, {}, { verifyProfile: false });
  assertEquals(badProfile.response.status, 401);
});

Deno.test("EF-04 validate-r2 200: ficha R2 cerrada ⇒ validado_r2, notificación y evento", async () => {
  const { response, payload, recorded } = await call(
    "validate-r2",
    { r2_logbook_id: FICHA_R2 },
    { idempotencyKey: "22222222-2222-4222-8222-222222222222" },
    {
      catEstado: "en_revision",
      rpc: { ok: true, replayed: false },
    },
  );
  assertEquals(response.status, 200);
  assertEquals(payload, {
    diagnostic_id: DIAG_ID,
    cat_estado: "validado_r2",
    pendientes: 0,
  });
  assertEquals(recorded.rpcCalls[0].fn, "fn_validate_cat_r2");
  assertEquals(recorded.rpcCalls[0].args.p_ficha_r2_id, FICHA_R2);
  assertEquals(
    recorded.rpcCalls[0].args.p_idempotency_key,
    "22222222-2222-4222-8222-222222222222",
  );
  assertEquals(recorded.notifications.length, 1);
  assertEquals(recorded.notifications[0].kind, "validacion");
  assertEquals(recorded.broadcast.length, 2);
  assertEquals(recorded.broadcast[0].event, "cat_validated");
  assertEquals(recorded.broadcast[1].event, "kanban_refresh");
});

Deno.test("EF-04 validate-r2 409: ficha ausente/abierta/clave distinta ⇒ GATE_R2_FICHA", async () => {
  for (
    const ficha of [
      null,
      { id: FICHA_R2, diagnosticId: DIAG_ID, clave: "R2", estado: "abierta" },
      { id: FICHA_R2, diagnosticId: DIAG_ID, clave: "R3", estado: "cerrada" },
      {
        id: FICHA_R2,
        diagnosticId: OTHER_DIAG,
        clave: "R2",
        estado: "cerrada",
      },
    ]
  ) {
    const { response, payload } = await call(
      "validate-r2",
      { r2_logbook_id: FICHA_R2 },
      {},
      { catEstado: "en_revision", ficha },
    );
    assertEquals(response.status, 409);
    assertEquals(errorOf(payload).code, "GATE_R2_FICHA");
  }
});

Deno.test("EF-04 validate-r2 422 sin r2_logbook_id y 403 para empresa", async () => {
  const missing = await call("validate-r2", {}, {}, {
    catEstado: "en_revision",
  });
  assertEquals(missing.response.status, 422);
  assertEquals(
    errorOf(missing.payload).code,
    "VALIDATION_PARAMETRO_REQUERIDO",
  );

  const empresa = await call(
    "validate-r2",
    { r2_logbook_id: FICHA_R2 },
    {},
    { catEstado: "en_revision", role: "empresa" },
  );
  assertEquals(empresa.response.status, 403);
  assertEquals(errorOf(empresa.payload).code, "FORBIDDEN_ROLE");
});

Deno.test("EF-04 validate-r2 replay: 200 sin notificación ni evento", async () => {
  const { response, recorded } = await call(
    "validate-r2",
    { r2_logbook_id: FICHA_R2 },
    { idempotencyKey: "22222222-2222-4222-8222-222222222222" },
    { catEstado: "en_revision", rpc: { ok: true, replayed: true } },
  );
  assertEquals(response.status, 200);
  assertEquals(recorded.notifications.length, 0);
  assertEquals(recorded.broadcast.length, 0);
});

Deno.test("EF-04: CONFLICT_STATE de la RPC y Idempotency-Key inválida", async () => {
  const conflict = await call("submit", {}, {}, {
    rpc: { ok: false, code: "CONFLICT_STATE", details: { motivo: "idem" } },
  });
  assertEquals(conflict.response.status, 409);
  assertEquals(errorOf(conflict.payload).code, "CONFLICT_STATE");

  const invalid = await call("submit", {}, { idempotencyKey: "no-uuid" });
  assertEquals(invalid.response.status, 422);
  assertEquals(
    errorOf(invalid.payload).code,
    "VALIDATION_IDEMPOTENCY_KEY",
  );
  assertEquals(invalid.recorded.rpcCalls.length, 0);
});

Deno.test("EF-04: CORS preflight y ruta desconocida", async () => {
  const { deps } = makeFake();
  const handler = createCatHandler(CONFIG, deps);
  const preflight = await handler(
    await makeRequest(null, {
      method: "OPTIONS",
      origin: "https://app.example",
    }, `/cat/${DIAG_ID}/submit`),
  );
  assertEquals(preflight.status, 204);
  assertEquals(
    preflight.headers.get("access-control-allow-origin"),
    "https://app.example",
  );

  const notFound = await handler(
    await makeRequest({}, {}, "/cat/desconocido"),
  );
  assertEquals(notFound.status, 404);
  assertNotIncludes(JSON.stringify(await notFound.json()), "CAT_VERSION");
});
