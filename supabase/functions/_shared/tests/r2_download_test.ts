/**
 * F1-08b — pruebas de descarga R2 con cap streaming (SEC-PR64-02).
 */

import { assert, assertEquals } from "./asserts.ts";
import { ApiError } from "../errors.ts";
import { downloadObject, type R2Config } from "../r2.ts";

const CONFIG: R2Config = {
  accountId: "cuenta-sintetica",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "secreto-r2-sintetico-f1-08b",
  bucket: "hidria-docs",
  region: "auto",
};

function streamOf(
  size: number,
  chunkSize = 64 * 1024,
): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= size) {
        controller.close();
        return;
      }
      const length = Math.min(chunkSize, size - sent);
      controller.enqueue(new Uint8Array(length));
      sent += length;
    },
  });
}

Deno.test("R2 download: objeto > maxBytes SIN Content-Length ⇒ VALIDATION_FILE (cap streaming)", async () => {
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(streamOf(2 * 1024 * 1024), {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    )) as unknown as typeof fetch;
  try {
    await downloadObject(CONFIG, "org/x.xlsx", 1024 * 1024, fetchImpl);
    throw new Error("se esperaba VALIDATION_FILE");
  } catch (error) {
    assert(error instanceof ApiError);
    assertEquals(error.code, "VALIDATION_FILE");
    assertEquals(
      (error.details as { reason?: string })?.reason,
      "archivo_demasiado_grande",
    );
  }
});

Deno.test("R2 download: Content-Length declarado > maxBytes ⇒ rechazo temprano y 404 ⇒ null", async () => {
  const tooLarge = (() =>
    Promise.resolve(
      new Response(new Uint8Array(10), {
        status: 200,
        headers: { "content-length": String(5 * 1024 * 1024) },
      }),
    )) as unknown as typeof fetch;
  try {
    await downloadObject(CONFIG, "org/x.xlsx", 1024 * 1024, tooLarge);
    throw new Error("se esperaba VALIDATION_FILE");
  } catch (error) {
    assert(error instanceof ApiError);
    assertEquals(error.code, "VALIDATION_FILE");
  }

  const notFound = (() =>
    Promise.resolve(
      new Response(null, { status: 404 }),
    )) as unknown as typeof fetch;
  assertEquals(
    await downloadObject(CONFIG, "org/no.xlsx", 1024, notFound),
    null,
  );
});
