/**
 * task-39 — pruebas de `_shared/r2.ts` (SigV4, clave de objeto y validación de metadatos).
 * Sin red ni permisos: criptografía WebCrypto y fechas inyectadas.
 */

import { assert, assertEquals, assertNotIncludes } from "./asserts.ts";
import { ApiError } from "../errors.ts";
import {
  ALLOWED_DOC_TYPES,
  buildDocumentObjectKey,
  buildR2Config,
  deterministicUuid,
  encodeRfc3986,
  hmacSha256,
  MAX_UPLOAD_BYTES,
  presignPutObject,
  type R2Config,
  sha256Hex,
  signAwsV4Query,
  toAmzDate,
  toHex,
  validateUploadMetadata,
} from "../r2.ts";

const CONFIG: R2Config = {
  accountId: "0123456789abcdef0123456789abcdef",
  accessKeyId: "AKIDTESTF1-39",
  secretAccessKey: "secreto-sintetico-r2-f1-39",
  bucket: "hidria-docs",
};

const ORG = "00000000-0000-4000-8000-000000000001";
const DIAG = "c1000000-0000-4000-8000-000000000001";
const DOC = "11111111-1111-5111-8111-111111111111";

async function expectApiError(
  promise: Promise<unknown>,
  code: string,
): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof ApiError, "se esperaba un ApiError");
    assertEquals(error.code, code);
    return error;
  }
  return fail(`se esperaba ApiError ${code}`);
}

function fail(message: string): never {
  throw new Error(message);
}

// ---------------------------------------------------------------------------
// Criptografía
// ---------------------------------------------------------------------------

Deno.test("RFC 4231: vector HMAC-SHA256 (key=Jefe)", async () => {
  const mac = await hmacSha256("Jefe", "what do ya want for nothing?");
  assertEquals(
    toHex(mac),
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
  );
});

Deno.test("SHA-256: vector conocido (abc)", async () => {
  assertEquals(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

Deno.test("SigV4: vector documentado AWS de URL prefirmada (GET, us-east-1)", async () => {
  // Vector de AWS: «Authenticating Requests: Using Query Parameters (AWS Signature V4)».
  const signature = await signAwsV4Query({
    method: "GET",
    host: "examplebucket.s3.amazonaws.com",
    canonicalUri: "/test.txt",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    amzDate: "20130524T000000Z",
    expiresInSeconds: 86400,
  });
  assertEquals(signature.signedHeaders, "host");
  assertEquals(
    signature.signature,
    "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
  );
});

// ---------------------------------------------------------------------------
// URL prefirmada de R2
// ---------------------------------------------------------------------------

Deno.test("R2: URL PUT con host/bucket/clave, Content-Type firmado y TTL 300", async () => {
  const now = new Date("2026-11-12T20:00:00.000Z");
  const key = `org/${ORG}/diag/${DIAG}/${DOC}.pdf`;
  const presigned = await presignPutObject({
    config: CONFIG,
    key,
    contentType: "application/pdf",
    now,
  });

  assert(
    presigned.url.startsWith(
      "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/hidria-docs/org/",
    ),
    presigned.url,
  );
  assert(presigned.url.includes("X-Amz-SignedHeaders=content-type%3Bhost"));
  assert(presigned.url.includes("X-Amz-Expires=300"));
  assert(presigned.url.includes("X-Amz-Algorithm=AWS4-HMAC-SHA256"));
  assert(presigned.url.includes("X-Amz-Credential=AKIDTESTF1-39%2F"));
  assertNotIncludes(presigned.url, CONFIG.secretAccessKey);
  assertEquals(presigned.expiresInSeconds, 300);
  assertEquals(presigned.expiresAt, "2026-11-12T20:05:00.000Z");
  assertEquals(Object.keys(presigned).sort(), [
    "expiresAt",
    "expiresInSeconds",
    "url",
  ]);
});

Deno.test("R2: TTL mayor al máximo se limita a 300 (tope duro)", async () => {
  const presigned = await presignPutObject({
    config: CONFIG,
    key: `org/${ORG}/diag/${DIAG}/${DOC}.pdf`,
    contentType: "application/pdf",
    expiresInSeconds: 86400,
  });
  assertEquals(presigned.expiresInSeconds, 300);
});

Deno.test("R2: codificación RFC 3986 en la ruta del objeto", async () => {
  assertEquals(encodeRfc3986("a b/ñ!'"), "a%20b%2F%C3%B1%21%27");
  const presigned = await presignPutObject({
    config: CONFIG,
    key: "org/carpeta con espacio/archivo.pdf",
    contentType: "application/pdf",
  });
  assert(presigned.url.includes("carpeta%20con%20espacio"));
});

Deno.test("R2: configuración desde entorno; fail-closed sin credenciales", async () => {
  const config = buildR2Config({
    R2_ACCOUNT_ID: "cuenta",
    R2_ACCESS_KEY_ID: "id",
    R2_SECRET_ACCESS_KEY: "secreto",
    R2_BUCKET_DOCS: "hidria-docs",
  });
  assertEquals(config.accountId, "cuenta");
  assertEquals(config.bucket, "hidria-docs");

  const fallback = buildR2Config({
    CLOUDFLARE_ACCOUNT_ID: "cuenta-cf",
    R2_ACCESS_KEY_ID: "id",
    R2_SECRET: "secreto",
  });
  assertEquals(fallback.accountId, "cuenta-cf");

  const error = await expectApiError(
    Promise.resolve().then(() => buildR2Config({})),
    "INTERNAL_ERROR",
  );
  assertNotIncludes(error.message, "secreto");
  assertNotIncludes(error.message, "AKID");
});

Deno.test("R2: rechaza clave vacía o con traversal", async () => {
  await expectApiError(
    presignPutObject({
      config: CONFIG,
      key: "",
      contentType: "application/pdf",
    }),
    "INTERNAL_ERROR",
  );
  await expectApiError(
    presignPutObject({
      config: CONFIG,
      key: "org/../secreto.pdf",
      contentType: "application/pdf",
    }),
    "INTERNAL_ERROR",
  );
});

// ---------------------------------------------------------------------------
// Clave de objeto y UUID determinista
// ---------------------------------------------------------------------------

Deno.test("clave de objeto: formato org/diag/documento.ext y UUIDs validados", async () => {
  const key = buildDocumentObjectKey({
    organizationId: ORG,
    diagnosticId: DIAG,
    documentId: DOC,
    extension: "PDF",
  });
  assertEquals(key, `org/${ORG}/diag/${DIAG}/${DOC}.pdf`);

  await expectApiError(
    Promise.resolve().then(() =>
      buildDocumentObjectKey({
        organizationId: "no-uuid",
        diagnosticId: DIAG,
        documentId: DOC,
        extension: "pdf",
      })
    ),
    "INTERNAL_ERROR",
  );
});

Deno.test("UUID determinista: estable, formato v5 y distinto por semilla", async () => {
  const first = await deterministicUuid("usuario|endpoint|clave|payload");
  const second = await deterministicUuid("usuario|endpoint|clave|payload");
  const other = await deterministicUuid("usuario|endpoint|otra|payload");

  assertEquals(first, second);
  assert(other !== first);
  assertEquals(first.length, 36);
  assertEquals(first[14], "5");
  assertEquals("89ab".includes(first[19]), true);
});

// ---------------------------------------------------------------------------
// Validación de metadatos de subida
// ---------------------------------------------------------------------------

const VALID_INPUT = {
  filename: "layout_planta.pdf",
  mime: "application/pdf",
  sizeBytes: 1024,
  docType: "layout",
  exposureLevel: "restringido_nda",
};

Deno.test("metadatos: caso válido y normalización", () => {
  const metadata = validateUploadMetadata(VALID_INPUT);
  assertEquals(metadata.extension, "pdf");
  assertEquals(metadata.mime, "application/pdf");
  assertEquals(metadata.exposureLevel, "restringido_nda");

  const defaults = validateUploadMetadata({
    ...VALID_INPUT,
    exposureLevel: undefined,
  });
  assertEquals(defaults.exposureLevel, "restringido_nda");

  const withoutExtension = validateUploadMetadata({
    ...VALID_INPUT,
    filename: "layout_sin_extension",
  });
  assertEquals(withoutExtension.extension, "pdf");
});

Deno.test("metadatos: campos faltantes ⇒ 422 VALIDATION_PARAMETRO_REQUERIDO", async () => {
  for (const field of ["filename", "mime", "sizeBytes", "docType"] as const) {
    const input = { ...VALID_INPUT, [field]: undefined };
    const error = await expectApiError(
      Promise.resolve().then(() => validateUploadMetadata(input)),
      "VALIDATION_PARAMETRO_REQUERIDO",
    );
    assertEquals(error.status, 422);
  }
});

Deno.test("metadatos: MIME no permitido y extensión incompatible ⇒ 422", async () => {
  const mimeError = await expectApiError(
    Promise.resolve().then(() =>
      validateUploadMetadata({
        ...VALID_INPUT,
        mime: "application/x-msdownload",
      })
    ),
    "VALIDATION_FILE",
  );
  assertEquals(mimeError.details, { reason: "mime_no_permitido" });

  const extensionError = await expectApiError(
    Promise.resolve().then(() =>
      validateUploadMetadata({ ...VALID_INPUT, filename: "malware.exe" })
    ),
    "VALIDATION_FILE",
  );
  assertEquals(extensionError.details, {
    reason: "extension_incompatible",
    mime: "application/pdf",
  });
});

Deno.test("metadatos: tamaño fuera de rango ⇒ 422", async () => {
  for (const size of [0, -1, MAX_UPLOAD_BYTES + 1]) {
    await expectApiError(
      Promise.resolve().then(() =>
        validateUploadMetadata({ ...VALID_INPUT, sizeBytes: size })
      ),
      "VALIDATION_FILE",
    );
  }
  await expectApiError(
    Promise.resolve().then(() =>
      validateUploadMetadata({ ...VALID_INPUT, sizeBytes: 1.5 })
    ),
    "VALIDATION_PARAMETRO_REQUERIDO",
  );
});

Deno.test("metadatos: filename con traversal, separadores o control ⇒ 422", async () => {
  for (
    const filename of [
      "../etc/passwd.pdf",
      "a/b.pdf",
      "a\\b.pdf",
      "a\u0000b.pdf",
      "..pdf",
    ]
  ) {
    await expectApiError(
      Promise.resolve().then(() =>
        validateUploadMetadata({ ...VALID_INPUT, filename })
      ),
      "VALIDATION_FILE",
    );
  }
});

Deno.test("metadatos: doc_type y exposure_level inválidos ⇒ 422", async () => {
  const docTypeError = await expectApiError(
    Promise.resolve().then(() =>
      validateUploadMetadata({ ...VALID_INPUT, docType: "hoja_de_calculo" })
    ),
    "VALIDATION_DOC_TYPE",
  );
  assertEquals(docTypeError.status, 422);

  const exposureError = await expectApiError(
    Promise.resolve().then(() =>
      validateUploadMetadata({ ...VALID_INPUT, exposureLevel: "secreto" })
    ),
    "VALIDATION_EXPOSURE_LEVEL",
  );
  assertEquals(exposureError.status, 422);

  for (const docType of ALLOWED_DOC_TYPES) {
    const metadata = validateUploadMetadata({ ...VALID_INPUT, docType });
    assertEquals(metadata.docType, docType);
  }
});

Deno.test("toAmzDate: formato SigV4 (YYYYMMDDTHHMMSSZ)", () => {
  assertEquals(
    toAmzDate(new Date("2013-05-24T00:00:00.000Z")),
    "20130524T000000Z",
  );
});
