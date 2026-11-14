/**
 * HIDRIA — EF-08 `documents/presign`: URL `PUT` prefirmada de R2 con membresía verificada.
 *
 * Tarea `task-39` (Q-08/M1 de PR #8) y ADR-012. Contrato en `docs/04` §4 EF-08.
 *
 * Garantías:
 * - `diagnostic_id` obligatorio y **membresía verificada antes de firmar** (no hay ventana de
 *   URL para no-miembros). Roles de diagnóstico `coordinador|equipo|empresa` (espejo de la RLS
 *   `documents_ins`); `observador`/`invitado` ⇒ 403.
 * - Tenant fail-closed: `diagnostics.organization_id` debe coincidir con el claim de tenant.
 * - La clave de objeto se genera en servidor y **no se devuelve** (solo `upload_url`,
 *   `document_id`, `expira_en_seg`, `metodo`); el `filename` se sanea y el MIME/extensión se
 *   validan contra allowlist.
 * - `presign` no escribe BD ni auditoría (sin efectos persistentes). `register` se implementa
 *   en F1-05 (task-86) y por ahora responde `501 NOT_IMPLEMENTED_PHASE` sin efectos.
 */

import {
  type AuthContext,
  authenticate,
  type AuthenticateOptions,
  guardEndpoint,
  isUuid,
  type ResolveDiagnosticRole,
} from "./auth.ts";
import { buildCorsHeaders, type CorsConfig, handlePreflight } from "./cors.ts";
import { ApiError, errorResponse } from "./errors.ts";
import {
  buildDocumentObjectKey,
  deterministicUuid,
  headObject,
  PRESIGN_TTL_SECONDS,
  presignPutObject,
  type R2Config,
  sha256Hex,
  validateUploadMetadata,
} from "./r2.ts";

/** Endpoints del catálogo `_shared/auth.ts` que sirve esta función. */
export const PRESIGN_ENDPOINT = "EF-08.presign";
export const REGISTER_ENDPOINT = "EF-08.register";

/** Cuerpo máximo aceptado (los bytes del archivo van directo a R2, nunca por la EF). */
const MAX_BODY_BYTES = 16 * 1024;

export type DocumentsRoute = "presign" | "register";

/** Diagnóstico mínimo necesario para firmar (se consulta con `service_role`). */
export interface DiagnosticScope {
  readonly id: string;
  readonly organizationId: string;
  readonly companyId: string | null;
}

/** Dependencias inyectables (DB/RPC) para pruebas sin red ni Supabase. */
export interface DocumentsDeps {
  readonly resolveRole: ResolveDiagnosticRole;
  readonly fetchDiagnostic: (
    diagnosticId: string,
  ) => Promise<DiagnosticScope | null>;
  /** Reloj inyectable para pruebas deterministas de la URL. */
  readonly now?: () => Date;
  /** `verifyProfile` (SEC-PR8-01): perfil inexistente o tenant distinto ⇒ 401. */
  readonly verifyProfile?: (context: AuthContext) => Promise<boolean>;
  /** HEAD de R2 inyectable en pruebas (por defecto, el real con SigV4). */
  readonly head?: typeof headObject;
  /** RPC atómica `fn_register_document` (task-86); la inyecta el runtime real. */
  readonly registerDocument?: (
    args: RegisterDocumentArgs,
  ) => Promise<RegisterDocumentResult>;
}

/** Argumentos de la RPC de registro (r2_key se deriva server-side; no viaja del cliente). */
export interface RegisterDocumentArgs {
  readonly p_user_id: string;
  readonly p_document_id: string;
  readonly p_diagnostic_id: string;
  readonly p_doc_type: string;
  readonly p_title: string;
  readonly p_mime: string;
  readonly p_size_bytes: number;
  readonly p_sha256: string;
  readonly p_exposure_level: string;
  readonly p_idempotency_key: string | null;
  readonly p_request_hash: string;
}

/** Resultado JSONB de la RPC (mismo contrato que las RPC de EF-01/EF-12). */
export interface RegisterDocumentResult {
  readonly ok: boolean;
  readonly replayed?: boolean;
  readonly code?: string;
  readonly message?: string;
  readonly details?: Record<string, unknown>;
  readonly data?: Record<string, unknown>;
  readonly audit_ref?: string;
}

export interface DocumentsHandlerConfig {
  readonly auth: AuthenticateOptions;
  readonly r2: R2Config;
  readonly cors: CorsConfig;
}

/**
 * Resuelve la ruta del contrato a partir del `Request` de Supabase.
 *
 * Se aceptan tanto las rutas del contrato (`/documents/presign`) como las de despliegue
 * (`/functions/v1/ef-08-documents/presign` y `…/register`).
 */
export function matchDocumentsRoute(
  method: string,
  pathOrUrl: string,
): DocumentsRoute | null {
  if (method.toUpperCase() !== "POST") return null;
  const pathname = pathOrUrl.startsWith("http://") ||
      pathOrUrl.startsWith("https://")
    ? new URL(pathOrUrl).pathname
    : pathOrUrl.split("?")[0].split("#")[0];
  const lastSegment = pathname.split("/").filter((segment) =>
    segment.length > 0
  ).pop();
  if (lastSegment === "presign") return "presign";
  if (lastSegment === "register") return "register";
  return null;
}

async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    throw new ApiError(
      "VALIDATION_JSON",
      "El cuerpo de la petición debe ser JSON.",
      { reason: "content_type" },
    );
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > MAX_BODY_BYTES) {
    throw new ApiError(
      "VALIDATION_JSON",
      "Cuerpo de petición demasiado grande.",
      {
        max_bytes: MAX_BODY_BYTES,
      },
    );
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new ApiError(
      "VALIDATION_JSON",
      "Cuerpo de petición demasiado grande.",
      {
        max_bytes: MAX_BODY_BYTES,
      },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError("VALIDATION_JSON", "JSON inválido.", {
      reason: "json_invalido",
    });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ApiError("VALIDATION_JSON", "JSON inválido.", {
      reason: "json_invalido",
    });
  }
  return parsed as Record<string, unknown>;
}

function jsonResponse(
  request: Request,
  config: DocumentsHandlerConfig,
  body: unknown,
  status = 200,
): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  for (const [name, value] of buildCorsHeaders(request, config.cors)) {
    headers.set(name, value);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * `document_id`: aleatorio (UUID v4) o determinista con `Idempotency-Key` para que reintentos
 * con el mismo payload apunten al mismo objeto (sin estado persistente).
 */
async function resolveDocumentId(
  request: Request,
  userId: string,
  diagnosticId: string,
  metadata: {
    filename: string;
    mime: string;
    sizeBytes: number;
    docType: string;
    exposureLevel: string;
  },
): Promise<string> {
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey === null) {
    return crypto.randomUUID();
  }
  if (!isUuid(idempotencyKey)) {
    throw new ApiError(
      "VALIDATION_IDEMPOTENCY_KEY",
      "La cabecera Idempotency-Key debe ser un UUID.",
      { header: "Idempotency-Key" },
    );
  }
  const canonicalPayload = JSON.stringify({
    diagnostic_id: diagnosticId,
    doc_type: metadata.docType,
    exposure_level: metadata.exposureLevel,
    filename: metadata.filename,
    mime: metadata.mime,
    size_bytes: metadata.sizeBytes,
  });
  return await deterministicUuid(
    `${userId}|${PRESIGN_ENDPOINT}|${idempotencyKey}|${canonicalPayload}`,
  );
}

async function handlePresign(
  request: Request,
  config: DocumentsHandlerConfig,
  deps: DocumentsDeps,
): Promise<Response> {
  const context = await authenticate(request, config.auth);
  const body = await readJsonObject(request);

  const rawDiagnosticId = body.diagnostic_id;
  const diagnosticIdParam = typeof rawDiagnosticId === "string"
    ? rawDiagnosticId
    : undefined;

  // Guarda del catálogo: membresía + rol antes de firmar (Q-08). Sin `diagnostic_id`
  // responde 422 `VALIDATION_PARAMETRO_REQUERIDO`; no-miembro → 403.
  const authorization = await guardEndpoint(
    context,
    PRESIGN_ENDPOINT,
    { diagnostic_id: diagnosticIdParam },
    { resolveRole: deps.resolveRole },
  );
  const diagnosticId = authorization.diagnosticId as string;

  // Tenant fail-closed + existencia del diagnóstico (anti-enumeración: mismo 403).
  const diagnostic = await deps.fetchDiagnostic(diagnosticId);
  if (
    diagnostic === null || diagnostic.organizationId !== context.organizationId
  ) {
    throw new ApiError("FORBIDDEN_NOT_MEMBER", undefined, {
      diagnostic_id: diagnosticId,
    });
  }

  const metadata = validateUploadMetadata({
    filename: body.filename,
    mime: body.mime,
    sizeBytes: body.size_bytes,
    docType: body.doc_type,
    exposureLevel: body.exposure_level,
  });

  const documentId = await resolveDocumentId(
    request,
    context.userId,
    diagnosticId,
    metadata,
  );
  const objectKey = buildDocumentObjectKey({
    organizationId: diagnostic.organizationId,
    diagnosticId,
    documentId,
    extension: metadata.extension,
  });
  const presigned = await presignPutObject({
    config: config.r2,
    key: objectKey,
    contentType: metadata.mime,
    now: deps.now?.(),
  });

  // Respuesta mínima (condición Lead/seguridad PR #36): sin `r2_key`, bucket ni rutas internas.
  return jsonResponse(request, config, {
    upload_url: presigned.url,
    document_id: documentId,
    expira_en_seg: presigned.expiresInSeconds ?? PRESIGN_TTL_SECONDS,
    metodo: "PUT",
  });
}

/**
 * Título del documento: `filename` saneado **sin extensión** (fallback `doc_type`).
 * `documents.title` es NOT NULL y el contrato no envía `title` (decisión Lead F1-05).
 */
function buildDocumentTitle(
  filename: string,
  extension: string,
  docType: string,
): string {
  const suffix = `.${extension.toLowerCase()}`;
  const base = filename.toLowerCase().endsWith(suffix)
    ? filename.slice(0, filename.length - suffix.length)
    : filename;
  const title = base.trim();
  return title.length > 0 ? title : docType;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * `POST /documents/register` (F1-05/task-106).
 *
 * 1. Auth + `verifyProfile` + rol de contrato (coord/equipo/empresa) + tenant fail-closed.
 * 2. Valida metadatos + `document_id`/`sha256`; deriva la clave server-side (nunca del cliente).
 * 3. `HEAD` al objeto en R2 con credenciales de la EF (existencia/tamaño/MIME; sin exponer rutas).
 * 4. Llama a la RPC atómica `fn_register_document` (idempotencia `api_idempotency` incluida).
 * 5. Responde `{ document_id, sha256 }` (sin `r2_key`, bucket ni credenciales).
 */
async function handleRegister(
  request: Request,
  config: DocumentsHandlerConfig,
  deps: DocumentsDeps,
): Promise<Response> {
  const context = await authenticate(request, {
    ...config.auth,
    ...(deps.verifyProfile === undefined
      ? {}
      : { verifyProfile: deps.verifyProfile }),
  });
  if (deps.registerDocument === undefined) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "El registro de documentos no está configurado.",
    );
  }
  const body = await readJsonObject(request);

  const diagnosticIdParam = typeof body.diagnostic_id === "string"
    ? body.diagnostic_id
    : undefined;
  const authorization = await guardEndpoint(
    context,
    REGISTER_ENDPOINT,
    { diagnostic_id: diagnosticIdParam },
    { resolveRole: deps.resolveRole },
  );
  const diagnosticId = authorization.diagnosticId as string;

  // Anti-enumeración: diagnóstico inexistente/otro tenant ⇒ mismo 403 que no-miembro.
  const diagnostic = await deps.fetchDiagnostic(diagnosticId);
  if (
    diagnostic === null || diagnostic.organizationId !== context.organizationId
  ) {
    throw new ApiError("FORBIDDEN_NOT_MEMBER", undefined, {
      diagnostic_id: diagnosticId,
    });
  }

  const rawDocumentId = body.document_id;
  if (typeof rawDocumentId !== "string" || !isUuid(rawDocumentId)) {
    throw new ApiError(
      "VALIDATION_PARAMETRO_REQUERIDO",
      "El campo document_id debe ser un UUID.",
      { field: "document_id" },
    );
  }
  const rawSha256 = body.sha256;
  if (typeof rawSha256 !== "string") {
    throw new ApiError(
      "VALIDATION_PARAMETRO_REQUERIDO",
      "Falta el campo obligatorio sha256.",
      { field: "sha256" },
    );
  }
  const sha256 = rawSha256.toLowerCase();
  if (!SHA256_HEX.test(sha256)) {
    throw new ApiError(
      "VALIDATION_FILE",
      "El hash sha256 debe ser hexadecimal de 64 caracteres.",
      { field: "sha256", reason: "sha256_invalido" },
    );
  }

  const metadata = validateUploadMetadata({
    filename: body.filename,
    mime: body.mime,
    sizeBytes: body.size_bytes,
    docType: body.doc_type,
    exposureLevel: body.exposure_level,
  });
  const title = buildDocumentTitle(
    metadata.filename,
    metadata.extension,
    metadata.docType,
  );
  const objectKey = buildDocumentObjectKey({
    organizationId: diagnostic.organizationId,
    diagnosticId,
    documentId: rawDocumentId,
    extension: metadata.extension,
  });

  // HEAD con credenciales de la EF: el cliente nunca recibe/usa credenciales de R2.
  const headFn = deps.head ?? headObject;
  const head = await headFn(config.r2, objectKey);
  if (!head.exists) {
    throw new ApiError(
      "VALIDATION_FILE",
      "El objeto no existe en el almacenamiento para este documento.",
      { reason: "objeto_no_encontrado" },
    );
  }
  if (head.sizeBytes !== null && head.sizeBytes !== metadata.sizeBytes) {
    throw new ApiError(
      "VALIDATION_FILE",
      "El tamaño del objeto no coincide con los metadatos declarados.",
      { reason: "tamano_no_coincide" },
    );
  }
  if (
    head.contentType !== null &&
    head.contentType.toLowerCase() !== metadata.mime.toLowerCase()
  ) {
    throw new ApiError(
      "VALIDATION_FILE",
      "El tipo MIME del objeto no coincide con los metadatos declarados.",
      { reason: "mime_no_coincide" },
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey !== null && !isUuid(idempotencyKey)) {
    throw new ApiError(
      "VALIDATION_IDEMPOTENCY_KEY",
      "La cabecera Idempotency-Key debe ser un UUID.",
      { header: "Idempotency-Key" },
    );
  }
  const requestHash = await sha256Hex(JSON.stringify({
    endpoint: REGISTER_ENDPOINT,
    diagnostic_id: diagnosticId,
    document_id: rawDocumentId,
    doc_type: metadata.docType,
    title,
    mime: metadata.mime,
    size_bytes: metadata.sizeBytes,
    sha256,
    exposure_level: metadata.exposureLevel,
  }));

  const result = await deps.registerDocument({
    p_user_id: context.userId,
    p_document_id: rawDocumentId,
    p_diagnostic_id: diagnosticId,
    p_doc_type: metadata.docType,
    p_title: title,
    p_mime: metadata.mime,
    p_size_bytes: metadata.sizeBytes,
    p_sha256: sha256,
    p_exposure_level: metadata.exposureLevel,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
  });
  if (result.ok !== true) {
    throw new ApiError(
      typeof result.code === "string" ? result.code : "INTERNAL_ERROR",
      typeof result.message === "string" ? result.message : undefined,
      result.details ?? {},
    );
  }

  // Respuesta del contrato: sin `r2_key`, bucket ni credenciales (la clave es server-side).
  return jsonResponse(request, config, {
    document_id: rawDocumentId,
    sha256,
  });
}

/**
 * Handler de EF-08: `presign` (URL PUT prefirmada) y `register` (metadatos tras la subida).
 */
export function createDocumentsHandler(
  config: DocumentsHandlerConfig,
  deps: DocumentsDeps,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const preflight = handlePreflight(request, config.cors);
    if (preflight !== null) return preflight;

    try {
      const route = matchDocumentsRoute(request.method, request.url);
      if (route === null) {
        return jsonResponse(request, config, {
          error: {
            code: "NOT_FOUND",
            message: "Ruta no disponible en esta función.",
          },
        }, 404);
      }
      if (route === "register") {
        return await handleRegister(request, config, deps);
      }
      return await handlePresign(request, config, deps);
    } catch (error) {
      return errorResponse(error, {
        headers: buildCorsHeaders(request, config.cors),
      });
    }
  };
}
