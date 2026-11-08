/**
 * Fixtures de sesión para E2E del shell (task-49 / H-15).
 *
 * No hay usuarios con contraseña en el seed (ADR-007) ni secretos en el repo. El shell
 * lee los claims directamente del access token (ADR-005), por lo que se siembra una
 * sesión sintética de Supabase en `localStorage` y se abortan las llamadas HTTP al
 * proyecto Supabase ficticio. La autorización real (RLS/EF) no se prueba aquí.
 */

/** URL sintética; el cliente no debe poder alcanzarla (los tests abortan las peticiones). */
export const E2E_SUPABASE_URL =
  process.env.E2E_SUPABASE_URL ?? 'https://test.invalid';

const PROJECT_REF = new URL(E2E_SUPABASE_URL).hostname.split('.')[0] ?? 'test';

/** Clave de localStorage que usa supabase-js v2 para el proyecto. */
export const AUTH_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

export const USER_EQUIPO = 'a1000000-0000-4000-8000-000000000002';
export const USER_INVITADO = 'a1000000-0000-4000-8000-000000000006';
export const ORG_ID = '00000000-0000-4000-8000-000000000001';
export const DIAGNOSTIC_ID = 'c1000000-0000-4000-8000-000000000001';

type Claims = Record<string, unknown>;

function base64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

/** JWT sintético sin firma válida: el shell sólo decodifica el payload. */
export function makeJwt(payload: Claims): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64Url(JSON.stringify({
    aud: 'authenticated',
    role: 'authenticated',
    iat: now,
    exp: now + 60 * 60,
    ...payload,
  }));
  return `${header}.${body}.${'x'.repeat(43)}`;
}

/** Clave anon sintética que pasa el guard build-time (JWT con `role: anon`). */
export function makeAnonKey(): string {
  return makeJwt({ role: 'anon', iss: 'supabase', sub: undefined });
}

/** Claims válidos de un usuario `equipo` del tenant semilla. */
export const CLAIMS_EQUIPO: Claims = {
  sub: USER_EQUIPO,
  email: 'e2e.equipo@example.invalid',
  organization_id: ORG_ID,
  tenant_id: ORG_ID,
  global_role: 'equipo',
};

/** Claims de `invitado` (sin membresías en el seed). */
export const CLAIMS_INVITADO: Claims = {
  sub: USER_INVITADO,
  email: 'e2e.invitado@example.invalid',
  organization_id: ORG_ID,
  tenant_id: ORG_ID,
  global_role: 'invitado',
};

/** Sesión con forma GoTrue v2 (la que `supabase.auth.getSession()` espera). */
export function sessionFor(claims: Claims): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  const sub = typeof claims.sub === 'string' ? claims.sub : USER_EQUIPO;
  return {
    access_token: makeJwt(claims),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'e2e-refresh-token-sintetico',
    user: {
      id: sub,
      aud: 'authenticated',
      role: 'authenticated',
      email:
        typeof claims.email === 'string' ? claims.email : 'e2e@example.invalid',
      email_confirmed_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}
