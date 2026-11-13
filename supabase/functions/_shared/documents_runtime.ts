/**
 * HIDRIA — wiring de runtime de EF-08 (`documents/presign`).
 *
 * Convierte variables de entorno en configuración tipada y dependencias de base de datos
 * (`service_role` solo aquí, nunca en el cliente ni en respuestas):
 * - `SUPABASE_JWT_SECRET` + `SUPABASE_URL` ⇒ verificación del JWT (`_shared/auth.ts`).
 * - `R2_*` ⇒ configuración de firma (`_shared/r2.ts`). Falla cerrado si falta.
 * - `CORS_ALLOWED_ORIGINS` ⇒ allowlist CORS.
 * - `fn_diag_role` (RPC, solo `service_role`) ⇒ rol de diagnóstico.
 * - `diagnostics` (PostgREST, `service_role`) ⇒ `organization_id`/`company_id` del diagnóstico.
 *
 * Todo es inyectable (`env`, `fetchImpl`) para probarse sin red ni permisos.
 */

import { type AuthenticateOptions, DIAGNOSTIC_ROLES } from "./auth.ts";
import type { DiagnosticRole } from "./auth.ts";
import { type CorsConfig, parseAllowedOrigins } from "./cors.ts";
import { ApiError } from "./errors.ts";
import type {
  DiagnosticScope,
  DocumentsDeps,
  DocumentsHandlerConfig,
} from "./presign.ts";
import { buildR2Config, type R2Config } from "./r2.ts";

export type RuntimeEnv = Record<string, string | undefined>;

/** Configuración completa + dependencias para `createDocumentsHandler`. */
export interface RuntimeDocuments {
  readonly config: DocumentsHandlerConfig;
  readonly deps: DocumentsDeps;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function requireSupabaseUrl(env: RuntimeEnv): string {
  const value = env.SUPABASE_URL;
  if (value === undefined || value.length === 0) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "Configuración de la función incompleta.",
    );
  }
  return trimTrailingSlashes(value);
}

/** Configuración de auth/R2/CORS a partir del entorno. Falla cerrado si falta algo. */
export function createRuntimeDocumentsConfig(
  env: RuntimeEnv,
): DocumentsHandlerConfig {
  const supabaseUrl = requireSupabaseUrl(env);
  const jwtSecret = env.SUPABASE_JWT_SECRET;
  if (jwtSecret === undefined || jwtSecret.length === 0) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "Autenticación de la función no configurada.",
    );
  }
  const auth: AuthenticateOptions = {
    jwtSecret,
    expectedIssuer: `${supabaseUrl}/auth/v1`,
  };
  const r2: R2Config = buildR2Config(env);
  const cors: CorsConfig = {
    allowedOrigins: parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS),
  };
  return { auth, r2, cors };
}

function createServiceHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
  };
}

/**
 * Dependencias de DB para EF-08 usando PostgREST con `service_role`.
 *
 * - `resolveRole`: `POST /rest/v1/rpc/fn_diag_role` (M-06; solo `service_role`).
 * - `fetchDiagnostic`: `GET /rest/v1/diagnostics?id=eq.<uuid>` (tenant/company del diagnóstico).
 */
export function createSupabaseDocumentsDeps(
  env: RuntimeEnv,
  fetchImpl: typeof fetch = fetch,
): DocumentsDeps {
  const supabaseUrl = requireSupabaseUrl(env);
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey === undefined || serviceKey.length === 0) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "Base de datos de la función no configurada.",
    );
  }
  const headers = createServiceHeaders(serviceKey);

  const requestJson = async (
    url: string,
    init: RequestInit,
  ): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch {
      throw new ApiError(
        "INTERNAL_ERROR",
        "No se pudo consultar la base de datos.",
      );
    }
    if (!response.ok) {
      throw new ApiError(
        "INTERNAL_ERROR",
        "No se pudo consultar la base de datos.",
      );
    }
    try {
      return await response.json();
    } catch {
      throw new ApiError(
        "INTERNAL_ERROR",
        "Respuesta inválida de la base de datos.",
      );
    }
  };

  const resolveRole = async (
    userId: string,
    diagnosticId: string,
  ): Promise<DiagnosticRole | null> => {
    const payload = await requestJson(
      `${supabaseUrl}/rest/v1/rpc/fn_diag_role`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_user_id: userId,
          p_diagnostic_id: diagnosticId,
        }),
      },
    );
    if (
      typeof payload === "string" &&
      (DIAGNOSTIC_ROLES as readonly string[]).includes(payload)
    ) {
      return payload as DiagnosticRole;
    }
    return null;
  };

  const fetchDiagnostic = async (
    diagnosticId: string,
  ): Promise<DiagnosticScope | null> => {
    const query = `id=eq.${encodeURIComponent(diagnosticId)}` +
      `&select=id,organization_id,company_id&limit=1`;
    const payload = await requestJson(
      `${supabaseUrl}/rest/v1/diagnostics?${query}`,
      { method: "GET", headers },
    );
    if (!Array.isArray(payload) || payload.length === 0) return null;
    const row = payload[0] as Record<string, unknown>;
    const id = row.id;
    const organizationId = row.organization_id;
    if (typeof id !== "string" || typeof organizationId !== "string") {
      return null;
    }
    const companyId = row.company_id;
    return {
      id,
      organizationId,
      companyId: typeof companyId === "string" ? companyId : null,
    };
  };

  return { resolveRole, fetchDiagnostic };
}

/**
 * Runtime real de la función: lee `Deno.env` y usa `fetch` global. En pruebas se inyectan
 * `env` y `fetchImpl` (ver `_shared/tests/documents_runtime_test.ts`).
 */
export function createRuntimeDocuments(
  env: RuntimeEnv = Deno.env.toObject(),
  fetchImpl: typeof fetch = fetch,
): RuntimeDocuments {
  return {
    config: createRuntimeDocumentsConfig(env),
    deps: createSupabaseDocumentsDeps(env, fetchImpl),
  };
}
