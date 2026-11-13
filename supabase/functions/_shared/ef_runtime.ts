/**
 * HIDRIA — wiring de runtime compartido por EF-01/EF-12 (F1-04).
 *
 * Lee `Deno.env` una sola vez por invocación fría y construye:
 * - `auth`: secreto JWT + emisor esperado (`/auth/v1`).
 * - `cors`: allowlist `CORS_ALLOWED_ORIGINS`.
 * - `realtime`: URL/servicio para el broadcast post-commit.
 * - `client`: cliente `service_role` (PostgREST/RPC) de `_shared/db.ts`.
 *
 * Es inyectable (`env`, `fetchImpl`) para pruebas sin Supabase.
 */

import type { AuthenticateOptions } from "./auth.ts";
import { type CorsConfig, parseAllowedOrigins } from "./cors.ts";
import {
  createServiceClient,
  type RuntimeEnv,
  type ServiceClient,
} from "./db.ts";
import { ApiError } from "./errors.ts";
import type { RealtimeConfig } from "./realtime.ts";

export interface EfRuntimeConfig {
  readonly auth: AuthenticateOptions;
  readonly cors: CorsConfig;
  readonly realtime: RealtimeConfig;
}

export interface EfRuntime {
  readonly config: EfRuntimeConfig;
  readonly client: ServiceClient;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function requireEnv(env: RuntimeEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value.length === 0) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "Configuración de la función incompleta.",
    );
  }
  return value;
}

/** Configuración de EF-01/EF-12 a partir del entorno. Falla cerrado si falta algo. */
export function createEfRuntimeConfig(env: RuntimeEnv): EfRuntimeConfig {
  const supabaseUrl = trimTrailingSlashes(requireEnv(env, "SUPABASE_URL"));
  const serviceKey = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const jwtSecret = requireEnv(env, "SUPABASE_JWT_SECRET");
  return {
    auth: {
      jwtSecret,
      expectedIssuer: `${supabaseUrl}/auth/v1`,
    },
    cors: {
      allowedOrigins: parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS),
    },
    realtime: {
      supabaseUrl,
      serviceRoleKey: serviceKey,
    },
  };
}

/** Runtime completo (config + cliente de servicio). */
export function createEfRuntime(
  env: RuntimeEnv = Deno.env.toObject(),
  fetchImpl: typeof fetch = fetch,
): EfRuntime {
  return {
    config: createEfRuntimeConfig(env),
    client: createServiceClient(env, fetchImpl),
  };
}
