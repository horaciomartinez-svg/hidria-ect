import { decodeJwtPayload } from '../config';

/**
 * Roles institucionales (`profiles.global_role`, ADR-005 / EF `_shared/auth.ts`).
 * El rol **por diagnóstico** es otro catálogo y se resuelve en servidor
 * (`docs/04` §2.1); el cliente no lo autoriza.
 */
export const GLOBAL_ROLES = [
  'admin_institucional',
  'coordinador_srhds',
  'equipo',
  'empresa',
  'observador',
  'invitado',
] as const;

export type GlobalRole = (typeof GLOBAL_ROLES)[number];

/** Etiqueta de UI (institucional, sin siglas prohibidas). */
export const GLOBAL_ROLE_LABEL: Record<GlobalRole, string> = {
  admin_institucional: 'Administrador institucional',
  coordinador_srhds: 'Coordinación SRHDS',
  equipo: 'Equipo técnico',
  empresa: 'Empresa atendida',
  observador: 'Observador',
  invitado: 'Invitado',
};

export interface HidriaClaims {
  /** `sub` del JWT (= `auth.users.id` = `profiles.user_id`). */
  sub: string;
  /** `organization_id` con precedencia sobre `tenant_id` (ADR-005). */
  organizationId: string | null;
  globalRole: GlobalRole | null;
  email: string | null;
}

export function isGlobalRole(value: unknown): value is GlobalRole {
  return (
    typeof value === 'string' && (GLOBAL_ROLES as readonly string[]).includes(value)
  );
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

/**
 * Lee los claims de HIDRIA desde el access token. Devuelve `null` si el token no
 * tiene `sub` (el servidor falla cerrado sin claim: `docs/04` §2.1, F1-01a).
 */
export function readClaims(accessToken: string | null | undefined): HidriaClaims | null {
  if (!accessToken) return null;
  const payload = decodeJwtPayload(accessToken);
  if (!payload || typeof payload.sub !== 'string') return null;
  const role = payload.global_role;
  return {
    sub: payload.sub,
    organizationId: firstNonEmpty(payload.organization_id, payload.tenant_id),
    globalRole: isGlobalRole(role) ? role : null,
    email: typeof payload.email === 'string' ? payload.email : null,
  };
}
