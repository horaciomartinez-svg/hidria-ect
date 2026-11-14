/**
 * F1-05 — pruebas de `_shared/r2.ts` para `HEAD` de objeto (SigV4 con cabeceras).
 */

import { assert, assertEquals, assertNotIncludes } from "./asserts.ts";
import { ApiError } from "../errors.ts";
import { headObject, type R2Config, signAwsV4Headers } from "../r2.ts";

const CONFIG: R2Config = {
  accountId: "cuenta-sintetica",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "secreto-r2-sintetico-f1-05",
  bucket: "hidria-docs",
  region: "auto",
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

Deno.test("SigV4 headers: canónico, scope y Authorization deterministas", async () => {
  const input = {
    method: "HEAD",
    host: "cuenta-sintetica.r2.cloudflarestorage.com",
    canonicalUri: "/hidria-docs/org/o/diag/d/doc.pdf",
    region: "auto",
    accessKeyId: CONFIG.accessKeyId,
    secretAccessKey: CONFIG.secretAccessKey,
    amzDate: "20261114T120000Z",
  };
  const first = await signAwsV4Headers(input);
  const second = await signAwsV4Headers(input);
  assertEquals(first.authorization, second.authorization);
  assert(first.authorization.startsWith("AWS4-HMAC-SHA256 Credential="));
  assert(first.authorization.includes("/20261114/auto/s3/aws4_request"));
  assert(
    first.authorization.includes(
      "SignedHeaders=host;x-amz-content-sha256;x-amz-date",
    ),
  );
  assertEquals(first.headers["x-amz-date"], "20261114T120000Z");
  assertEquals(
    first.headers["x-amz-content-sha256"],
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert(/Signature=[0-9a-f]{64}$/.test(first.authorization));
  assert(first.canonicalRequest.startsWith("HEAD\n/hidria-docs/"));
  assert(first.stringToSign.startsWith("AWS4-HMAC-SHA256\n20261114T120000Z\n"));

  const otherHost = await signAwsV4Headers({
    ...input,
    host: "otra-cuenta.r2.cloudflarestorage.com",
  });
  assert(first.authorization !== otherHost.authorization);
});

Deno.test("headObject 200: devuelve existencia, tamaño y MIME; firma con credenciales server-side", async () => {
  const { fetchImpl, calls } = fakeFetch(() =>
    new Response(null, {
      status: 200,
      headers: {
        "content-length": "482133",
        "content-type": "application/pdf; charset=binary",
      },
    })
  );
  const result = await headObject(
    CONFIG,
    "org/o/diag/d/doc.pdf",
    fetchImpl,
    () => new Date("2026-11-14T12:00:00Z"),
  );
  assertEquals(result, {
    exists: true,
    sizeBytes: 482133,
    contentType: "application/pdf",
  });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].init.method, "HEAD");
  assertEquals(
    calls[0].url,
    "https://cuenta-sintetica.r2.cloudflarestorage.com/hidria-docs/org/o/diag/d/doc.pdf",
  );
  const headers = new Headers(calls[0].init.headers);
  assert((headers.get("authorization") ?? "").startsWith("AWS4-HMAC-SHA256 "));
  assertEquals(headers.get("x-amz-date"), "20261114T120000Z");
  assertNotIncludes(calls[0].url, CONFIG.secretAccessKey);
  assertNotIncludes(calls[0].url, "X-Amz-Signature");
});

Deno.test("headObject 404 ⇒ exists:false (sin lanzar)", async () => {
  const { fetchImpl } = fakeFetch(() => new Response(null, { status: 404 }));
  assertEquals(
    await headObject(CONFIG, "org/o/diag/d/doc.pdf", fetchImpl),
    { exists: false, sizeBytes: null, contentType: null },
  );
});

Deno.test("headObject error HTTP o de red ⇒ INTERNAL_ERROR saneado", async () => {
  const forbidden = fakeFetch(() => new Response("denegado", { status: 403 }));
  try {
    await headObject(CONFIG, "org/o/diag/d/doc.pdf", forbidden.fetchImpl);
    throw new Error("se esperaba ApiError");
  } catch (error) {
    assert(error instanceof ApiError);
    assertEquals(error.code, "INTERNAL_ERROR");
    assertNotIncludes(error.message, CONFIG.secretAccessKey);
    assertNotIncludes(error.message, "denegado");
  }

  const throwing = (() => Promise.reject(new Error("network"))) as typeof fetch;
  try {
    await headObject(CONFIG, "org/o/diag/d/doc.pdf", throwing);
    throw new Error("se esperaba ApiError");
  } catch (error) {
    assert(error instanceof ApiError);
    assertEquals(error.code, "INTERNAL_ERROR");
  }
});
