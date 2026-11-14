/**
 * F1-04 — pruebas de `_shared/realtime.ts` (broadcast post-commit, best-effort).
 */

import { assertEquals } from "./asserts.ts";
import {
  broadcastRealtime,
  diagnosticTopic,
  organizationTopic,
  type RealtimeConfig,
} from "../realtime.ts";

const CONFIG: RealtimeConfig = {
  supabaseUrl: "https://test.supabase.co/",
  serviceRoleKey: "service-role-sintetico-f1-04",
};

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(responder: () => Response | Promise<Response>): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: typeof input === "string" ? input : input.toString(),
      init: init ?? {},
    });
    return Promise.resolve(responder());
  }) as typeof fetch;
  return { fetchImpl, calls };
}

Deno.test("realtime: publica mensajes en /realtime/v1/api/broadcast con service_role", async () => {
  const { fetchImpl, calls } = fakeFetch(() =>
    new Response(null, { status: 202 })
  );
  const ok = await broadcastRealtime(CONFIG, [
    {
      topic: "diagnostic:c1000000-0000-4000-8000-000000000001",
      event: "phase_changed",
      payload: { fase_actual: 2 },
    },
    {
      topic: "org:00000000-0000-4000-8000-000000000001",
      event: "kanban_refresh",
      payload: {},
    },
  ], fetchImpl);

  assertEquals(ok, true);
  assertEquals(
    calls[0].url,
    "https://test.supabase.co/realtime/v1/api/broadcast",
  );
  assertEquals(calls[0].init.method, "POST");
  const headers = new Headers(calls[0].init.headers);
  assertEquals(headers.get("apikey"), "service-role-sintetico-f1-04");
  assertEquals(
    JSON.parse(String(calls[0].init.body)),
    {
      messages: [
        {
          topic: "diagnostic:c1000000-0000-4000-8000-000000000001",
          event: "phase_changed",
          payload: { fase_actual: 2 },
        },
        {
          topic: "org:00000000-0000-4000-8000-000000000001",
          event: "kanban_refresh",
          payload: {},
        },
      ],
    },
  );
});

Deno.test("realtime: fallo HTTP o excepción ⇒ false (no revierte el negocio)", async () => {
  const http = fakeFetch(() => new Response("boom", { status: 500 }));
  assertEquals(
    await broadcastRealtime(
      CONFIG,
      [{ topic: "t", event: "e", payload: {} }],
      http.fetchImpl,
    ),
    false,
  );

  const throwing = (() => Promise.reject(new Error("network"))) as typeof fetch;
  assertEquals(
    await broadcastRealtime(
      CONFIG,
      [{ topic: "t", event: "e", payload: {} }],
      throwing,
    ),
    false,
  );
});

Deno.test("realtime: sin mensajes no llama a la red", async () => {
  const { fetchImpl, calls } = fakeFetch(() =>
    new Response(null, { status: 202 })
  );
  assertEquals(await broadcastRealtime(CONFIG, [], fetchImpl), true);
  assertEquals(calls.length, 0);
});

Deno.test("realtime: topics de contrato", () => {
  assertEquals(
    diagnosticTopic("c1000000-0000-4000-8000-000000000001"),
    "diagnostic:c1000000-0000-4000-8000-000000000001",
  );
  assertEquals(
    organizationTopic("00000000-0000-4000-8000-000000000001"),
    "org:00000000-0000-4000-8000-000000000001",
  );
});
