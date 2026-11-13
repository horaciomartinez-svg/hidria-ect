/**
 * task-39 — pruebas de `_shared/cors.ts` (allowlist estricta, sin comodines).
 */

import { assert, assertEquals, assertNotIncludes } from "./asserts.ts";
import {
  buildCorsHeaders,
  type CorsConfig,
  handlePreflight,
  mergeCorsHeaders,
  parseAllowedOrigins,
} from "../cors.ts";

const CONFIG: CorsConfig = {
  allowedOrigins: ["https://hidria-staging.pages.dev", "http://localhost:5173"],
};

function requestWith(
  origin: string | null,
  method = "POST",
): Request {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  return new Request(
    "https://test.supabase.co/functions/v1/ef-08-documents/presign",
    { method, headers },
  );
}

Deno.test("CORS: origen permitido ⇒ ACAO exacto y Vary: Origin", () => {
  const headers = buildCorsHeaders(
    requestWith("http://localhost:5173"),
    CONFIG,
  );
  assertEquals(
    headers.get("access-control-allow-origin"),
    "http://localhost:5173",
  );
  assertEquals(headers.get("vary"), "Origin");
  assertEquals(
    headers.get("access-control-allow-headers"),
    "authorization, content-type, idempotency-key, x-api-version",
  );
  assert((headers.get("access-control-allow-methods") ?? "").includes("POST"));
});

Deno.test("CORS: origen no permitido o ausente ⇒ sin ACAO (fail-closed)", () => {
  const notAllowed = buildCorsHeaders(
    requestWith("https://evil.example"),
    CONFIG,
  );
  assertEquals(notAllowed.get("access-control-allow-origin"), null);
  assertNotIncludes(JSON.stringify([...notAllowed]), "*");

  const noOrigin = buildCorsHeaders(requestWith(null), CONFIG);
  assertEquals(noOrigin.get("access-control-allow-origin"), null);
});

Deno.test("CORS: preflight OPTIONS ⇒ 204 con cabeceras solo si el origen está permitido", () => {
  const allowed = handlePreflight(
    requestWith("https://hidria-staging.pages.dev", "OPTIONS"),
    CONFIG,
  );
  assert(allowed !== null);
  assertEquals(allowed.status, 204);
  assertEquals(
    allowed.headers.get("access-control-allow-origin"),
    "https://hidria-staging.pages.dev",
  );

  const denied = handlePreflight(
    requestWith("https://evil.example", "OPTIONS"),
    CONFIG,
  );
  assert(denied !== null);
  assertEquals(denied.status, 204);
  assertEquals(denied.headers.get("access-control-allow-origin"), null);
});

Deno.test("CORS: handlePreflight devuelve null si no es OPTIONS", () => {
  assertEquals(handlePreflight(requestWith(null, "POST"), CONFIG), null);
});

Deno.test("CORS: parseAllowedOrigins limpia espacios y descarta vacíos", () => {
  assertEquals(
    parseAllowedOrigins(" https://a.example , ,https://b.example "),
    ["https://a.example", "https://b.example"],
  );
  assertEquals(parseAllowedOrigins(undefined), []);
});

Deno.test("CORS: mergeCorsHeaders conserva cabeceras base y añade las CORS", () => {
  const merged = mergeCorsHeaders(
    { "content-type": "application/json", "cache-control": "no-store" },
    requestWith("https://hidria-staging.pages.dev"),
    CONFIG,
  );
  assertEquals(merged.get("content-type"), "application/json");
  assertEquals(merged.get("cache-control"), "no-store");
  assertEquals(
    merged.get("access-control-allow-origin"),
    "https://hidria-staging.pages.dev",
  );
});
