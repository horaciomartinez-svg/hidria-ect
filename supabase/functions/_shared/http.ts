/**
 * HIDRIA — utilidades HTTP compartidas por las Edge Functions.
 *
 * Tarea `task-95` (F1-04). Se extraen de `_shared/presign.ts` para reutilizarlas en EF-01 y
 * EF-12: parseo JSON con límite, respuesta JSON con CORS y cabeceras seguras.
 */

import { buildCorsHeaders, type CorsConfig } from "./cors.ts";
import { ApiError } from "./errors.ts";

/** Cuerpo máximo aceptado para cuerpos JSON de EF (nunca se suben bytes por la EF). */
export const MAX_JSON_BODY_BYTES = 16 * 1024;

/** Lee y valida un cuerpo JSON objeto. Errores canónicos `422 VALIDATION_JSON`. */
export async function readJsonObject(
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
  if (
    declaredLength !== null && Number(declaredLength) > MAX_JSON_BODY_BYTES
  ) {
    throw new ApiError(
      "VALIDATION_JSON",
      "Cuerpo de petición demasiado grande.",
      {
        max_bytes: MAX_JSON_BODY_BYTES,
      },
    );
  }
  const text = await request.text();
  if (text.length > MAX_JSON_BODY_BYTES) {
    throw new ApiError(
      "VALIDATION_JSON",
      "Cuerpo de petición demasiado grande.",
      {
        max_bytes: MAX_JSON_BODY_BYTES,
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

/** Respuesta JSON con CORS y cabeceras sin caché. */
export function jsonResponse(
  request: Request,
  cors: CorsConfig,
  body: unknown,
  status = 200,
): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  for (const [name, value] of buildCorsHeaders(request, cors)) {
    headers.set(name, value);
  }
  return new Response(JSON.stringify(body), { status, headers });
}
