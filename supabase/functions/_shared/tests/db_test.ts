/**
 * F1-04 — pruebas de `_shared/db.ts` y `_shared/ef_runtime.ts` (PostgREST/RPC con fakes).
 */

import { assert, assertEquals, assertNotIncludes } from "./asserts.ts";
import { ApiError } from "../errors.ts";
import { createServiceClient, mapTriggerGateError } from "../db.ts";
import { createEfRuntimeConfig } from "../ef_runtime.ts";
import {
  DIAG_ID,
  ISSUER,
  ORG_ID,
  SERVICE_KEY,
  TEST_SECRET,
  USER_EQUIPO,
} from "./ef_fakes.ts";

const ENV: Record<string, string | undefined> = {
  SUPABASE_URL: "https://test.supabase.co/",
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  SUPABASE_JWT_SECRET: TEST_SECRET,
  CORS_ALLOWED_ORIGINS: "https://app.example,http://localhost:5173",
};

interface FetchCall {
  url: string;
  init: RequestInit;
}

function fakeFetch(
  responder: (call: FetchCall) => Response,
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

function json(body: unknown, status = 200): Response {
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
    assert(error instanceof ApiError, "se esperaba ApiError");
    assertEquals(error.code, code);
    return error;
  }
  throw new Error(`se esperaba ApiError ${code}`);
}

Deno.test("runtime: config desde env; fail-closed sin JWT/servicio", async () => {
  const config = createEfRuntimeConfig(ENV);
  assertEquals(config.auth.expectedIssuer, ISSUER);
  assertEquals(config.auth.jwtSecret, TEST_SECRET);
  assertEquals(config.cors.allowedOrigins, [
    "https://app.example",
    "http://localhost:5173",
  ]);
  assertEquals(config.realtime.supabaseUrl, "https://test.supabase.co");
  assertEquals(config.realtime.serviceRoleKey, SERVICE_KEY);

  for (
    const missing of [
      "SUPABASE_URL",
      "SUPABASE_JWT_SECRET",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]
  ) {
    const env = { ...ENV, [missing]: undefined };
    await expectApiError(
      Promise.resolve().then(() => createEfRuntimeConfig(env)),
      "INTERNAL_ERROR",
    );
  }
});

Deno.test("db: resolveRole usa fn_diag_role con service_role", async () => {
  const { fetchImpl, calls } = fakeFetch(() => json("coordinador"));
  const client = createServiceClient(ENV, fetchImpl);

  assertEquals(await client.resolveRole(USER_EQUIPO, DIAG_ID), "coordinador");
  assertEquals(
    calls[0].url,
    "https://test.supabase.co/rest/v1/rpc/fn_diag_role",
  );
  assertEquals(calls[0].init.method, "POST");
  assertEquals(JSON.parse(String(calls[0].init.body)), {
    p_user_id: USER_EQUIPO,
    p_diagnostic_id: DIAG_ID,
  });
  const headers = new Headers(calls[0].init.headers);
  assertEquals(headers.get("apikey"), SERVICE_KEY);
  assert((headers.get("authorization") ?? "").includes(SERVICE_KEY));
});

Deno.test("db: resolveRole null/rol inválido ⇒ null", async () => {
  for (const payload of [null, "", "invitado", 42]) {
    const client = createServiceClient(
      ENV,
      fakeFetch(() => json(payload)).fetchImpl,
    );
    assertEquals(await client.resolveRole(USER_EQUIPO, DIAG_ID), null);
  }
});

Deno.test("db: verifyProfile compara profiles.organization_id", async () => {
  const ok = createServiceClient(
    ENV,
    fakeFetch(() => json([{ organization_id: ORG_ID }])).fetchImpl,
  );
  const context = {
    userId: USER_EQUIPO,
    organizationId: ORG_ID,
    tenantId: ORG_ID,
    globalRole: "equipo" as const,
    claims: { sub: USER_EQUIPO },
    accessToken: "token",
  };
  assertEquals(await ok.verifyProfile(context), true);

  const noRows = createServiceClient(ENV, fakeFetch(() => json([])).fetchImpl);
  assertEquals(await noRows.verifyProfile(context), false);

  const otherOrg = createServiceClient(
    ENV,
    fakeFetch(() =>
      json([{ organization_id: "00000000-0000-4000-8000-000000000002" }])
    ).fetchImpl,
  );
  assertEquals(await otherOrg.verifyProfile(context), false);
});

Deno.test("db: fetchDiagnostic mapea columnas y devuelve null si falta", async () => {
  const row = {
    id: DIAG_ID,
    organization_id: ORG_ID,
    company_id: null,
    folio: "MDOHI-2026-001",
    fase_actual: 2,
    estado: "activo",
    cat_estado: "validado_r2",
    proximo_hito: "V1",
    semaforo_atraso: "verde",
    avance_pct: 33.3,
    fecha_inicio: "2026-11-01",
  };
  const client = createServiceClient(
    ENV,
    fakeFetch(() => json([row])).fetchImpl,
  );
  const diagnostic = await client.fetchDiagnostic(DIAG_ID);
  assertEquals(diagnostic?.faseActual, 2);
  assertEquals(diagnostic?.catEstado, "validado_r2");
  assertEquals(diagnostic?.folio, "MDOHI-2026-001");

  const empty = createServiceClient(ENV, fakeFetch(() => json([])).fetchImpl);
  assertEquals(await empty.fetchDiagnostic(DIAG_ID), null);
});

Deno.test("db: gates (checklist, IIH, BHE, IVOH, ficha) y miembros", async () => {
  const responder = (call: FetchCall): Response => {
    if (call.url.includes("/document_checklist_items")) {
      return json([{ estado: "validado_r1" }]);
    }
    if (call.url.includes("/iih_assets")) {
      return json([{ verificado_v1: true }, { verificado_v1: false }]);
    }
    if (call.url.includes("/water_balances")) {
      return json([{ id: "balance-1", estado: "validado_r3" }]);
    }
    if (call.url.includes("/v_bhe_monthly")) {
      return json([{ brecha_pct: 6.9 }, { brecha_pct: 9.1 }]);
    }
    if (call.url.includes("/ivoh_evaluations")) {
      return json([{ factor_code: "F1" }, { factor_code: "F2" }]);
    }
    if (call.url.includes("/logbook_entries")) {
      return json([{
        id: "entry-1",
        clave: "R3",
        estado: "cerrada",
        folio: "BIT-R3-01",
      }]);
    }
    if (call.url.includes("/project_members")) {
      return json([{ user_id: USER_EQUIPO }]);
    }
    return json([]);
  };
  const { fetchImpl, calls } = fakeFetch(responder);
  const client = createServiceClient(ENV, fetchImpl);

  assertEquals(await client.fetchChecklistItem(DIAG_ID, "layout"), {
    estado: "validado_r1",
  });
  assertEquals(await client.fetchIihStats(DIAG_ID), {
    total: 2,
    unverified: 1,
  });
  assertEquals(await client.fetchBalance(DIAG_ID), {
    estado: "validado_r3",
    maxBrechaPct: 9.1,
  });
  assertEquals(await client.fetchIvohValidatedCount(DIAG_ID), 2);
  assertEquals(await client.fetchLatestFicha(DIAG_ID, "R3"), {
    id: "entry-1",
    clave: "R3",
    estado: "cerrada",
    folio: "BIT-R3-01",
  });
  assertEquals(await client.listMemberUserIds(DIAG_ID), [USER_EQUIPO]);
  assert(
    calls.some((call) =>
      call.url.includes("/logbook_entries") &&
      call.url.includes("order=fecha.desc")
    ),
  );
});

Deno.test("db: insertNotifications envía filas y Prefer minimal", async () => {
  const { fetchImpl, calls } = fakeFetch(() => json(null, 201));
  const client = createServiceClient(ENV, fetchImpl);
  await client.insertNotifications([
    { userId: USER_EQUIPO, kind: "hito", payload: { diagnostic_id: DIAG_ID } },
  ]);
  assertEquals(calls[0].url, "https://test.supabase.co/rest/v1/notifications");
  assertEquals(calls[0].init.method, "POST");
  assertEquals(JSON.parse(String(calls[0].init.body)), [{
    user_id: USER_EQUIPO,
    kind: "hito",
    payload: { diagnostic_id: DIAG_ID },
  }]);
  assertEquals(
    new Headers(calls[0].init.headers).get("prefer"),
    "return=minimal",
  );
});

Deno.test("db: callRpc envía args y devuelve jsonb; P0001 Gate Fx ⇒ ApiError GATE_*", async () => {
  const ok = createServiceClient(
    ENV,
    fakeFetch((call) => {
      assertEquals(
        call.url,
        "https://test.supabase.co/rest/v1/rpc/fn_advance_phase",
      );
      return json({ ok: true, replayed: false, data: { fase_actual: 2 } });
    }).fetchImpl,
  );
  const result = await ok.callRpc("fn_advance_phase", { p_to_phase: 2 });
  assertEquals(result, { ok: true, replayed: false, data: { fase_actual: 2 } });

  const gate = createServiceClient(
    ENV,
    fakeFetch(() =>
      json({
        code: "P0001",
        message: "Gate F4: el IIH tiene activos sin verificar en V1.",
      }, 400)
    ).fetchImpl,
  );
  const error = await expectApiError(
    gate.callRpc("fn_advance_phase", {}),
    "GATE_IIH_V1",
  );
  assertEquals(
    error.message,
    "Gate F4: el IIH tiene activos sin verificar en V1.",
  );
  assertEquals(error.details, { trigger: true });
});

Deno.test("db: error de PostgREST genérico ⇒ INTERNAL_ERROR sin filtrar service key", async () => {
  const client = createServiceClient(
    ENV,
    fakeFetch(() => json({ message: "boom interno" }, 500)).fetchImpl,
  );
  const error = await expectApiError(
    client.fetchDiagnostic(DIAG_ID),
    "INTERNAL_ERROR",
  );
  assertNotIncludes(error.message, SERVICE_KEY);
  assertNotIncludes(error.message, "boom");
});

Deno.test("db: mapTriggerGateError mapea F2–F6 y descarta otros", () => {
  assertEquals(mapTriggerGateError("Gate F2: x")?.code, "GATE_CHECKLIST_R1");
  assertEquals(mapTriggerGateError("Gate F3: x")?.code, "GATE_CAT_R2");
  assertEquals(mapTriggerGateError("Gate F5: x")?.code, "GATE_BHE_R3");
  assertEquals(mapTriggerGateError("Gate F6: x")?.code, "GATE_IVOH_R4");
  assertEquals(mapTriggerGateError("otro error"), null);
});
