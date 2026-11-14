/**
 * F1-03c — Soporte para E2E **real** de M1 contra Supabase local.
 *
 * Este módulo sólo se usa cuando `E2E_LOCAL_SUPABASE=1`; la suite normal sigue
 * apuntando a `https://test.invalid` y usando sesiones sintéticas sin firma.
 *
 * El JWT se firma con el `JWT_SECRET` efímero del Supabase local (`supabase status -o env`).
 * El secreto **nunca** se versiona ni se pasa a la app: sólo vive en el proceso de test/CI.
 * Seguridad: el modo real sólo acepta URLs locales (127.0.0.1/localhost/[::1]) y tokens de
 * vida corta (`LOCAL_JWT_TTL_SECONDS`), para que un fallo de configuración no apunte a un
 * proyecto remoto ni deje credenciales largas en artefactos.
 */
import { createHmac } from 'node:crypto';
import { sessionFor } from './session';

export const LOCAL_SUPABASE_URL =
  process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const LOCAL_SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? '';
export const LOCAL_SUPABASE_JWT_SECRET = process.env.E2E_SUPABASE_JWT_SECRET ?? '';

/** Vida corta del JWT de prueba (5–15 min exigido por seguridad; sin refresh en la suite). */
export const LOCAL_JWT_TTL_SECONDS = 10 * 60;

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Sólo hosts locales: nunca un proyecto Supabase remoto/staging/producción. */
export function isLocalSupabaseUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return LOCAL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/** `sb-<primer-label-del-host>-auth-token`; para 127.0.0.1 es `sb-127-auth-token`. */
export const LOCAL_AUTH_STORAGE_KEY = `sb-${
  new URL(LOCAL_SUPABASE_URL).hostname.split('.')[0] ?? 'local'
}-auth-token`;

export const LOCAL_ORG_A = '00000000-0000-4000-8000-000000000001';
export const LOCAL_ORG_B = '00000000-0000-4000-8000-000000000002';

/** UUIDs del seed F1-01a; la fixture local añade empresa B (`...0007`) y contraparte dedicada (`...0008`). */
export const LOCAL_USERS = {
  coordinador: 'a1000000-0000-4000-8000-000000000001',
  equipo: 'a1000000-0000-4000-8000-000000000002',
  empresaA: 'a1000000-0000-4000-8000-000000000003',
  observador: 'a1000000-0000-4000-8000-000000000004',
  admin: 'a1000000-0000-4000-8000-000000000005',
  invitado: 'a1000000-0000-4000-8000-000000000006',
  empresaB: 'a1000000-0000-4000-8000-000000000007',
  /** Empresa del tenant A SIN membresía del diagnóstico seed; contraparte de A1. */
  empresaDedicadaA1: 'a1000000-0000-4000-8000-000000000008',
} as const;

export const LOCAL_COMPANIES = {
  a1: 'b2000000-0000-4000-8000-0000000000a1',
  a2: 'b2000000-0000-4000-8000-0000000000a2',
  b1: 'b2000000-0000-4000-8000-0000000000b1',
  seed: 'b1000000-0000-4000-8000-000000000001',
} as const;

export interface LocalClaims {
  sub: string;
  email: string;
  organization_id: string;
  tenant_id: string;
  global_role: 'admin_institucional' | 'coordinador_srhds' | 'equipo' | 'empresa' | 'observador' | 'invitado';
}

export function claimsFor(
  role: LocalClaims['global_role'],
  sub: string,
  organizationId: string = LOCAL_ORG_A,
): LocalClaims {
  return {
    sub,
    email: `e2e.local.${role}@example.invalid`,
    organization_id: organizationId,
    tenant_id: organizationId,
    global_role: role,
  };
}

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** Firma HS256 con el secreto efímero de Supabase local. */
export function mintLocalJwt(claims: LocalClaims): string {
  if (!LOCAL_SUPABASE_JWT_SECRET) {
    throw new Error(
      'E2E_LOCAL_SUPABASE=1 requiere E2E_SUPABASE_JWT_SECRET (supabase status -o env).',
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      aud: 'authenticated',
      role: 'authenticated',
      sub: claims.sub,
      email: claims.email,
      iat: now,
      exp: now + LOCAL_JWT_TTL_SECONDS,
      organization_id: claims.organization_id,
      tenant_id: claims.tenant_id,
      global_role: claims.global_role,
    }),
  );
  const signature = createHmac('sha256', LOCAL_SUPABASE_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/** Sesión GoTrue v2 con access_token firmado; exp corto evita refresh en la suite. */
export function localSession(claims: LocalClaims): Record<string, unknown> {
  const session = sessionFor(claims as unknown as Record<string, unknown>);
  const now = Math.floor(Date.now() / 1000);
  return {
    ...session,
    access_token: mintLocalJwt(claims),
    expires_at: now + LOCAL_JWT_TTL_SECONDS,
    expires_in: LOCAL_JWT_TTL_SECONDS,
    refresh_token: 'e2e-local-refresh-token-sintetico',
  };
}

/** Siembra localStorage antes de montar la app. */
export async function seedLocalSession(
  page: import('@playwright/test').Page,
  claims: LocalClaims,
): Promise<void> {
  assertLocalEnv();
  const session = localSession(claims);
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LOCAL_AUTH_STORAGE_KEY, value: JSON.stringify(session) },
  );
}

/**
 * Guard local-only: exige URL local + anon/JWT secret presentes. Acepta un objeto
 * opcional para poder probar el guard sin tocar el entorno real.
 */
export function assertLocalEnv(
  env: { url?: string; anonKey?: string; jwtSecret?: string } = {},
): void {
  const url = env.url ?? LOCAL_SUPABASE_URL;
  const anonKey = env.anonKey ?? LOCAL_SUPABASE_ANON_KEY;
  const jwtSecret = env.jwtSecret ?? LOCAL_SUPABASE_JWT_SECRET;
  if (!isLocalSupabaseUrl(url)) {
    throw new Error(
      `E2E_LOCAL_SUPABASE=1 sólo admite Supabase local (127.0.0.1/localhost); se recibió "${url}".`,
    );
  }
  if (!anonKey || !jwtSecret) {
    throw new Error(
      'E2E real requiere E2E_SUPABASE_ANON_KEY y E2E_SUPABASE_JWT_SECRET (supabase status -o env).',
    );
  }
}
