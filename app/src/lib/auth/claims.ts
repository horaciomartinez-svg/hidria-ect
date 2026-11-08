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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID en formato canónico (valida forma; no exige versión ni variante concretas). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function isGlobalRole(value: unknown): value is GlobalRole {
  return (
    typeof value === 'string' && (GLOBAL_ROLES as readonly string[]).includes(value)
  );
}

export interface HidriaClaims {
  /** `sub` del JWT (= `auth.users.id` = `profiles.user_id`), UUID. */
  sub: string;
  /** `organization_id` UUID con precedencia sobre `tenant_id` (ADR-005). */
  organizationId: string;
  globalRole: GlobalRole;
  email: string | null;
}

function asEmail(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Claims de HIDRIA desde el access token, con **falla cerrada** (B1 de la revisión de
 * PR #12): devuelve `null` si falta `sub` UUID, si no hay `organization_id`/`tenant_id`
 * UUID, o si `global_role` no pertenece al enum. Una sesión con claims incompletos no
 * monta el shell: el servidor también falla cerrado sin claim (`docs/04` §2.1).
 */
export function readClaims(accessToken: string | null | undefined): HidriaClaims | null {
  if (!accessToken) return null;
  const payload = decodeJwtPayload(accessToken);
  if (!payload || !isUuid(payload.sub)) return null;

  // `organization_id` es el claim canónico; `tenant_id` sólo alias de compatibilidad.
  const organizationId = [payload.organization_id, payload.tenant_id].find(isUuid);
  if (!organizationId) return null;

  const role = payload.global_role;
  if (!isGlobalRole(role)) return null;

  return {
    sub: payload.sub,
    organizationId,
    globalRole: role,
    email: asEmail(payload.email),
  };
}
