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
  PRESIGN_TTL_SECONDS,
  presignPutObject,
  type R2Config,
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
 * Handler de EF-08. `register` queda diferido a F1-05 (task-86) y responde 501 **sin efectos**
 * (se autentica primero para no revelar nada a peticiones anónimas).
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
        await authenticate(request, config.auth);
        throw new ApiError(
          "NOT_IMPLEMENTED_PHASE",
          "El registro de documentos se habilita en F1-05 (task-86).",
        );
      }
      return await handlePresign(request, config, deps);
    } catch (error) {
      return errorResponse(error, {
        headers: buildCorsHeaders(request, config.cors),
      });
    }
  };
}
