/**
 * HIDRIA — CORS de las Edge Functions (allowlist estricta, sin comodines).
 *
 * Tarea `task-39` (EF-08). El navegador solo puede llamar a la función si el origen está en
 * `CORS_ALLOWED_ORIGINS` (Pages del PWA y `http://localhost:*` de desarrollo). Un origen no
 * permitido recibe la respuesta **sin** `Access-Control-Allow-Origin`: el navegador la bloquea.
 * No es una frontera de autorización (el JWT y la membresía lo son); es solo la política CORS.
 */

export interface CorsConfig {
  readonly allowedOrigins: readonly string[];
}

/** Cabeceras permitidas en las peticiones a las EF de documentos. */
const ALLOWED_REQUEST_HEADERS =
  "authorization, content-type, idempotency-key, x-api-version";
const ALLOWED_METHODS = "POST, OPTIONS";
const MAX_AGE_SECONDS = "600";

/** Parsea una lista separada por comas (env `CORS_ALLOWED_ORIGINS`). */
export function parseAllowedOrigins(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/** Cabeceras CORS para la petición (vacías si el origen no está permitido). */
export function buildCorsHeaders(
  request: Request,
  config: CorsConfig,
): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (origin !== null && config.allowedOrigins.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
    headers.set("access-control-allow-methods", ALLOWED_METHODS);
    headers.set("access-control-allow-headers", ALLOWED_REQUEST_HEADERS);
    headers.set("access-control-max-age", MAX_AGE_SECONDS);
  }
  return headers;
}

/** Responde el preflight (`OPTIONS`) o `null` si no lo es. */
export function handlePreflight(
  request: Request,
  config: CorsConfig,
): Response | null {
  if (request.method.toUpperCase() !== "OPTIONS") return null;
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(request, config),
  });
}

/** Combina cabeceras de respuesta con las CORS aplicables. */
export function mergeCorsHeaders(
  base: HeadersInit,
  request: Request,
  config: CorsConfig,
): Headers {
  const headers = new Headers(base);
  for (const [name, value] of buildCorsHeaders(request, config)) {
    headers.set(name, value);
  }
  return headers;
}
