/**
 * HIDRIA — autenticación, claims y guardas de rol para las Edge Functions.
 *
 * Tarea F1-01b (task-21). Alcance: middleware común de EF-01…EF-13.
 *
 * Contrato:
 * - Claims canónicos (ADR-005): `organization_id` con precedencia, `tenant_id` como alias de
 *   compatibilidad y `global_role` institucional. El hook `public.custom_access_token_hook`
 *   (F1-00) emite los tres.
 * - `global_role` institucional NO es el rol de diagnóstico: `coordinador|equipo|empresa|
 *   organismo_operador|observador` se resuelven siempre en servidor (`my_diagnostic_role`,
 *   o `fn_diag_role(user_id, diagnostic_id)` para EF con `service_role`). Jamás se acepta
 *   rol, usuario, tenant ni folio enviados por el cliente.
 * - Errores canónicos de `docs/04` §8: `401 AUTH_INVALID` (token ausente/expirado/firma
 *   inválida/claim de tenant ausente o inconsistente/rol global inválido) y `403
 *   FORBIDDEN_ROLE` / `403 FORBIDDEN_NOT_MEMBER` (SEC-04, SEC-01, DOC-03).
 * - Sin dependencias externas (solo Web APIs de Deno) y sin acceso a `Deno.env`: la
 *   configuración se inyecta (`AuthenticateOptions`), de modo que las pruebas y las EF
 *   deciden de dónde salen el secreto/verificador.
 *
 * Referencias: `docs/04` §2.1, §3, §4, §8; `docs/05` SEC-04; ADR-005; F1-00
 * (`fn_diag_role`, `custom_access_token_hook`).
 */

import { ApiError, errorResponse } from "./errors.ts";

// ---------------------------------------------------------------------------
// Tipos de rol
// ---------------------------------------------------------------------------

/** Rol del usuario en un diagnóstico (`project_members.role`). */
export type DiagnosticRole =
  | "coordinador"
  | "equipo"
  | "empresa"
  | "organismo_operador"
  | "observador";

/** Rol institucional global (`profiles.global_role`, ADR-005). */
export type GlobalRole =
  | "admin_institucional"
  | "coordinador_srhds"
  | "equipo"
  | "empresa"
  | "observador"
  | "invitado";

export const DIAGNOSTIC_ROLES: readonly DiagnosticRole[] = [
  "coordinador",
  "equipo",
  "empresa",
  "organismo_operador",
  "observador",
];

export const GLOBAL_ROLES: readonly GlobalRole[] = [
  "admin_institucional",
  "coordinador_srhds",
  "equipo",
  "empresa",
  "observador",
  "invitado",
];

// ---------------------------------------------------------------------------
// Claims y contexto
// ---------------------------------------------------------------------------

/** Claims del access token de Supabase más los claims de HIDRIA (hook ADR-005). */
export interface SupabaseJwtClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nbf?: number;
  role?: string;
  email?: string;
  /** Claim contractual de HIDRIA (ADR-005). */
  organization_id?: string;
  /** Alias de compatibilidad usado por `is_tenant_member` y las políticas RLS. */
  tenant_id?: string;
  /** Rol institucional (`profiles.global_role`). */
  global_role?: string;
  [claim: string]: unknown;
}

/** Resultado de autenticar una petición. Inmutable. */
export interface AuthContext {
  /** `sub` del JWT (= `auth.users.id` = `profiles.user_id`). */
  readonly userId: string;
  /** Claim canónico `organization_id` (con `tenant_id` como respaldo). */
  readonly organizationId: string;
  /** Alias de compatibilidad; mismo valor que `organizationId`. */
  readonly tenantId: string;
  /** Claim `global_role` validado contra `GLOBAL_ROLES`. */
  readonly globalRole: GlobalRole;
  /** Claims completos para guardas específicas (nunca se devuelven al cliente). */
  readonly claims: Readonly<SupabaseJwtClaims>;
  /** Bearer original, por si la EF necesita llamar a PostgREST con la identidad del usuario. */
  readonly accessToken: string;
}

export type JwtVerifier = (
  token: string,
  request: Request,
) => Promise<SupabaseJwtClaims>;

export interface AuthenticateOptions {
  /**
   * Secreto HMAC del proyecto (`SUPABASE_JWT_SECRET`). Se inyecta desde la EF; este módulo
   * no lee `Deno.env` para poder probarse sin permisos.
   */
  jwtSecret?: string;
  /**
   * Verificador alternativo (p. ej. JWKS asimétrico o `auth.getUser`). Tiene precedencia
   * sobre `jwtSecret`.
   */
  verify?: JwtVerifier;
  /** Emisor esperado (`{SUPABASE_URL}/auth/v1`); si se define, se valida. */
  expectedIssuer?: string;
  /** Audiencias aceptadas; por defecto `["authenticated"]`. */
  audiences?: readonly string[];
  /** Tolerancia de reloj en segundos; por defecto 30. */
  clockSkewSeconds?: number;
  /**
   * Verificación opcional contra `profiles` (perfil inexistente o `organization_id` del
   * perfil distinto del claim ⇒ `401 AUTH_INVALID`, SEC-04). Devuelve `false` para negar.
   */
  verifyProfile?: (context: AuthContext) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Utilidades base64url / JWT (sin dependencias)
// ---------------------------------------------------------------------------

export function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  claims: SupabaseJwtClaims;
  signingInput: string;
  signature: Uint8Array;
}

/** Decodifica un JWT SIN validar la firma: el resultado no es confiable hasta verificar. */
export function decodeJwt(token: string): DecodedJwt {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw authInvalid({ reason: "formato_token" });
  }
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    if (
      encodedHeader.length === 0 || encodedPayload.length === 0 ||
      encodedSignature.length === 0
    ) {
      throw authInvalid({ reason: "formato_token" });
    }
    const header: unknown = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encodedHeader)),
    );
    const claims: unknown = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encodedPayload)),
    );
    // La firma se decodifica DENTRO del try: una firma base64url malformada (`%%%`)
    // lanza DOMException en `atob` y debe responder 401 AUTH_INVALID, nunca 500.
    const signature = base64UrlDecode(encodedSignature);
    if (!isPlainObject(header) || !isPlainObject(claims)) {
      throw authInvalid({ reason: "formato_token" });
    }
    return {
      header,
      claims: claims as SupabaseJwtClaims,
      signingInput: `${encodedHeader}.${encodedPayload}`,
      signature,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw authInvalid({ reason: "formato_token" });
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/** Verifica la firma HS256 (Supabase legacy) con `crypto.subtle.verify`. */
export async function verifyHs256Signature(
  token: string,
  secret: string,
): Promise<SupabaseJwtClaims> {
  if (secret.length === 0) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "auth: falta el secreto JWT (SUPABASE_JWT_SECRET o verificador inyectado).",
    );
  }
  const decoded = decodeJwt(token);
  if (decoded.header.alg !== "HS256") {
    // `none`, RS256/ES256 sin JWKS configurado u otro algoritmo: no se acepta.
    throw authInvalid({ reason: "algoritmo_no_soportado" });
  }
  const encoder = new TextEncoder();
  const signature = new Uint8Array(decoded.signature);
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signature,
    encoder.encode(decoded.signingInput),
  );
  if (!valid) {
    throw authInvalid({ reason: "firma_invalida" });
  }
  return decoded.claims;
}

// ---------------------------------------------------------------------------
// Autenticación
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function authInvalid(details?: Record<string, unknown>): ApiError {
  return new ApiError("AUTH_INVALID", undefined, details);
}

function forbiddenRole(
  actual: string,
  allowed: readonly string[],
): ApiError {
  return new ApiError("FORBIDDEN_ROLE", undefined, {
    rol_actual: actual,
    roles_permitidos: [...allowed],
  });
}

function forbiddenNotMember(
  details: Record<string, unknown>,
): ApiError {
  return new ApiError("FORBIDDEN_NOT_MEMBER", undefined, details);
}

/** Extrae el bearer token; `null` si el header falta o no es `Bearer <token>`. */
export function extractBearerToken(
  authorizationHeader: string | null,
): string | null {
  if (authorizationHeader === null) return null;
  const match = /^\s*Bearer\s+(\S+)\s*$/i.exec(authorizationHeader);
  return match === null ? null : match[1];
}

function normalizeAudience(audience: SupabaseJwtClaims["aud"]): string[] {
  if (typeof audience === "string") return [audience];
  if (Array.isArray(audience)) {
    return audience.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function assertClaimTimes(
  claims: SupabaseJwtClaims,
  clockSkewSeconds: number,
): void {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    typeof claims.exp !== "number" || claims.exp + clockSkewSeconds < nowSeconds
  ) {
    throw authInvalid({ reason: "token_expirado" });
  }
  if (
    typeof claims.nbf === "number" && claims.nbf - clockSkewSeconds > nowSeconds
  ) {
    throw authInvalid({ reason: "token_no_vigente_aun" });
  }
  if (claims.iat !== undefined && typeof claims.iat !== "number") {
    throw authInvalid({ reason: "iat_invalido" });
  }
}

function buildAuthContext(
  claims: SupabaseJwtClaims,
  accessToken: string,
): AuthContext {
  if (!isUuid(claims.sub)) {
    throw authInvalid({ reason: "sub_ausente_o_invalido" });
  }

  // ADR-005 / F1-01a: `organization_id` es el claim canónico y `tenant_id` su alias de
  // compatibilidad; la BD resuelve `current_org_id()` con esa precedencia (organization_id >
  // tenant_id) y NO rechaza el token si ambos difieren. El middleware alinea esa semántica:
  // se usa el primer valor con formato UUID válido (precedencia + respaldo), y solo se niega
  // (401 AUTH_INVALID, SEC-04) si no queda ningún tenant utilizable.
  const organizationId = [claims.organization_id, claims.tenant_id].find(
    isUuid,
  );
  if (organizationId === undefined) {
    throw authInvalid({ reason: "claim_tenant_ausente" });
  }

  const globalRole = claims.global_role;
  if (typeof globalRole !== "string" || !isGlobalRole(globalRole)) {
    throw authInvalid({ reason: "global_role_ausente_o_invalido" });
  }

  return Object.freeze({
    userId: claims.sub,
    organizationId,
    tenantId: organizationId,
    globalRole,
    claims: Object.freeze({ ...claims }),
    accessToken,
  });
}

export function isGlobalRole(value: string): value is GlobalRole {
  return (GLOBAL_ROLES as readonly string[]).includes(value);
}

export function isDiagnosticRole(value: string): value is DiagnosticRole {
  return (DIAGNOSTIC_ROLES as readonly string[]).includes(value);
}

/**
 * Autentica la petición y devuelve el contexto (claims validados).
 *
 * Orden de verificación: bearer presente → formato JWT → firma (verificador inyectado o
 * HS256 con `jwtSecret`) → tiempos (`exp`/`nbf`/`iat`) → audiencia/emisor → `sub` válido →
 * claims `organization_id`/`tenant_id`/`global_role` → `verifyProfile` opcional.
 *
 * @throws ApiError `AUTH_INVALID` (401) para todo token inválido; `INTERNAL_ERROR` (500)
 *   solo si la EF está mal configurada (sin secreto ni verificador).
 */
export async function authenticate(
  request: Request,
  options: AuthenticateOptions = {},
): Promise<AuthContext> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (token === null) {
    throw authInvalid({ reason: "token_ausente" });
  }

  let claims: SupabaseJwtClaims;
  if (options.verify !== undefined) {
    claims = await options.verify(token, request);
  } else {
    claims = await verifyHs256Signature(token, options.jwtSecret ?? "");
  }
  if (!isPlainObject(claims)) {
    throw authInvalid({ reason: "claims_invalidos" });
  }

  assertClaimTimes(claims, options.clockSkewSeconds ?? 30);

  const audiences = options.audiences ?? ["authenticated"];
  const tokenAudiences = normalizeAudience(claims.aud);
  if (
    tokenAudiences.length === 0 ||
    !tokenAudiences.some((aud) => audiences.includes(aud))
  ) {
    throw authInvalid({ reason: "audiencia_no_autorizada" });
  }
  if (
    options.expectedIssuer !== undefined &&
    claims.iss !== options.expectedIssuer
  ) {
    throw authInvalid({ reason: "emisor_no_autorizado" });
  }

  const context = buildAuthContext(claims, token);

  if (options.verifyProfile !== undefined) {
    const profileIsValid = await options.verifyProfile(context);
    if (!profileIsValid) {
      // Perfil inexistente o `profiles.organization_id` ≠ claim (SEC-04).
      throw authInvalid({ reason: "perfil_o_tenant_inconsistente" });
    }
  }

  return context;
}

// ---------------------------------------------------------------------------
// Guardas de claims
// ---------------------------------------------------------------------------

/** Exige claim de tenant resuelto (`organization_id` con precedencia, ADR-005). */
export function requireTenant(context: AuthContext): string {
  if (!isUuid(context.organizationId)) {
    throw authInvalid({ reason: "claim_tenant_ausente" });
  }
  return context.organizationId;
}

/**
 * Exige un rol institucional concreto (`profiles.global_role`).
 *
 * No eleva privilegios de diagnóstico: `admin_institucional` no sustituye a `coordinador`
 * en las guardas de diagnóstico (least privilege, `docs/04` §2.1).
 */
export function requireGlobalRole(
  context: AuthContext,
  roles: readonly GlobalRole[],
): GlobalRole {
  if (!roles.includes(context.globalRole)) {
    throw forbiddenRole(context.globalRole, roles);
  }
  return context.globalRole;
}

/** Resolución servidor-side del rol de diagnóstico (JWT o `fn_diag_role` con service_role). */
export type ResolveDiagnosticRole = (
  userId: string,
  diagnosticId: string,
) => Promise<DiagnosticRole | null>;

/**
 * Exige un rol de diagnóstico entre los permitidos para el endpoint.
 *
 * @throws `403 FORBIDDEN_NOT_MEMBER` si el usuario no es miembro del diagnóstico;
 *   `403 FORBIDDEN_ROLE` si es miembro con un rol no autorizado.
 */
export async function requireDiagnosticRole(
  context: AuthContext,
  diagnosticId: string,
  allowedRoles: readonly DiagnosticRole[],
  resolveRole: ResolveDiagnosticRole,
): Promise<DiagnosticRole> {
  if (!isUuid(diagnosticId)) {
    throw forbiddenNotMember({ diagnostic_id: diagnosticId });
  }
  const role = await resolveRole(context.userId, diagnosticId);
  if (role === null) {
    throw forbiddenNotMember({ diagnostic_id: diagnosticId });
  }
  if (!allowedRoles.includes(role)) {
    throw forbiddenRole(role, allowedRoles);
  }
  return role;
}

// ---------------------------------------------------------------------------
// Catálogo de endpoints (docs/04 §3 y §4) con su política de rol
// ---------------------------------------------------------------------------

export type ResourceScopeKind =
  | "diagnostic"
  | "logbook_entry"
  | "checklist_item"
  | "balance"
  | "sample"
  | "document";

/** Recurso cuya pertenencia determina el diagnóstico del que se resuelve el rol. */
export interface ResourceScope {
  readonly kind: ResourceScopeKind;
  /** Nombre del parámetro (de ruta, o de body si `inBody`). */
  readonly param: string;
  /** `true` si el identificador viaja en el cuerpo (EF-08 register, EF-09). */
  readonly inBody?: boolean;
}

export type EndpointRolePolicy =
  /** Rol de diagnóstico entre los listados. */
  | { readonly kind: "diagnostic"; readonly roles: readonly DiagnosticRole[] }
  /** Cualquier miembro del diagnóstico, sin importar el rol (EF-08 register). */
  | { readonly kind: "any_member" }
  /** Solo autenticación + tenant (EF-08 presign, EF-11). */
  | { readonly kind: "authenticated" };

export type EndpointId =
  | "EF-01"
  | "EF-02"
  | "EF-03"
  | "EF-04.submit"
  | "EF-04.validate-r2"
  | "EF-05"
  | "EF-06.score"
  | "EF-06.validate-r4"
  | "EF-07"
  | "EF-08.presign"
  | "EF-08.register"
  | "EF-09"
  | "EF-10"
  | "EF-11"
  | "EF-12"
  | "EF-13";

export interface EndpointDefinition {
  readonly id: EndpointId;
  /** Contrato `docs/04` §3/§4. */
  readonly ef: string;
  readonly method: "POST";
  readonly path: string;
  readonly scope: ResourceScope | null;
  readonly policy: EndpointRolePolicy;
  /** Todo endpoint de HIDRIA exige claim de tenant (SEC-04). */
  readonly tenantRequired: true;
  /** Sección de `docs/04` que define el contrato. */
  readonly docRef: string;
}

const COORDINADOR_EQUIPO: readonly DiagnosticRole[] = ["coordinador", "equipo"];

/**
 * Catálogo canónico de endpoints EF-01…EF-13 con la política de rol de `docs/04`.
 *
 * `roles` es el mínimo autorizado del contrato; las reglas más finas por transición
 * (p. ej. TD-2 de EF-03) y los gates metodológicos se aplican dentro de cada EF.
 */
export const ENDPOINTS: readonly EndpointDefinition[] = [
  {
    id: "EF-01",
    ef: "EF-01",
    method: "POST",
    path: "/diagnostics/{diagnostic_id}/advance-phase",
    scope: { kind: "diagnostic", param: "diagnostic_id" },
    policy: { kind: "diagnostic", roles: COORDINADOR_EQUIPO },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-01",
  },
  {
    id: "EF-02",
    ef: "EF-02",
    method: "POST",
    path: "/logbook/{entry_id}/close",
    scope: { kind: "logbook_entry", param: "entry_id" },
    policy: { kind: "diagnostic", roles: COORDINADOR_EQUIPO },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-02",
  },
  {
    id: "EF-03",
    ef: "EF-03",
    method: "POST",
    path: "/checklist/{item_id}/transition",
    scope: { kind: "checklist_item", param: "item_id" },
    // TD-2: la empresa puede mover no_recibido→recibido; coordinador/equipo el resto.
    // La transición concreta se valida en la EF con la tabla TD-2.
    policy: {
      kind: "diagnostic",
      roles: ["empresa", "coordinador", "equipo"],
    },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-03 / TD-2",
  },
  {
    id: "EF-04.submit",
    ef: "EF-04",
    method: "POST",
    path: "/cat/{diagnostic_id}/submit",
    scope: { kind: "diagnostic", param: "diagnostic_id" },
    policy: {
      kind: "diagnostic",
      roles: ["empresa", "coordinador", "equipo"],
    },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-04 (submit)",
  },
  {
    id: "EF-04.validate-r2",
    ef: "EF-04",
    method: "POST",
    path: "/cat/{diagnostic_id}/validate-r2",
    scope: { kind: "diagnostic", param: "diagnostic_id" },
    policy: { kind: "diagnostic", roles: COORDINADOR_EQUIPO },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-04 (validate-r2)",
  },
  {
    id: "EF-05",
    ef: "EF-05",
    method: "POST",
    path: "/balances/{balance_id}/validate-r3",
    scope: { kind: "balance", param: "balance_id" },
    policy: { kind: "diagnostic", roles: COORDINADOR_EQUIPO },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-05",
  },
  {
    id: "EF-06.score",
    ef: "EF-06",
    method: "POST",
    path: "/ivoh/{diagnostic_id}/score",
    scope: { kind: "diagnostic", param: "diagnostic_id" },
    policy: { kind: "diagnostic", roles: COORDINADOR_EQUIPO },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-06 (score)",
  },
  {
    id: "EF-06.validate-r4",
    ef: "EF-06",
    method: "POST",
    path: "/ivoh/{diagnostic_id}/validate-r4",
    scope: { kind: "diagnostic", param: "diagnostic_id" },
    policy: { kind: "diagnostic", roles: COORDINADOR_EQUIPO },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-06 (validate-r4)",
  },
  {
    id: "EF-07",
    ef: "EF-07",
    method: "POST",
    path: "/diagnostics/{diagnostic_id}/emit-report",
    scope: { kind: "diagnostic", param: "diagnostic_id" },
    // Solo coordinador (docs/04 EF-07; docs/05 RPT-03).
    policy: { kind: "diagnostic", roles: ["coordinador"] },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-07",
  },
  {
    id: "EF-08.presign",
    ef: "EF-08",
    method: "POST",
    path: "/documents/presign",
    // `docs/04` §4 exige «miembro del diagnóstico» en presign, pero su cuerpo no incluye
    // `diagnostic_id` (llega en `register`). Decisión pendiente en **task-39** (ADR con el
    // revisor + corrección de `docs/04`) antes de F1-05; mientras tanto la política es
    // autenticado + tenant y la membresía se exige en `EF-08.register`.
    scope: null,
    policy: { kind: "authenticated" },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-08 (presign); M1/Q-08 → task-39",
  },
  {
    id: "EF-08.register",
    ef: "EF-08",
    method: "POST",
    path: "/documents/register",
    scope: { kind: "diagnostic", param: "diagnostic_id", inBody: true },
    policy: { kind: "any_member" },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-08 (register)",
  },
  {
    id: "EF-09",
    ef: "EF-09",
    method: "POST",
    path: "/import/xlsx",
    scope: { kind: "diagnostic", param: "diagnostic_id", inBody: true },
    policy: { kind: "diagnostic", roles: COORDINADOR_EQUIPO },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-09",
  },
  {
    id: "EF-10",
    ef: "EF-10",
    method: "POST",
    path: "/samples/{sample_id}/dictamen",
    scope: { kind: "sample", param: "sample_id" },
    policy: { kind: "diagnostic", roles: COORDINADOR_EQUIPO },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-10",
  },
  {
    id: "EF-11",
    ef: "EF-11",
    method: "POST",
    path: "/quiz/submit",
    scope: null,
    policy: { kind: "authenticated" },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-11",
  },
  {
    id: "EF-12",
    ef: "EF-12",
    method: "POST",
    path: "/diagnostics/{diagnostic_id}/reprogram-milestone",
    scope: { kind: "diagnostic", param: "diagnostic_id" },
    policy: { kind: "diagnostic", roles: ["coordinador"] },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-12",
  },
  {
    id: "EF-13",
    ef: "EF-13",
    method: "POST",
    path: "/reports/{document_id}/sign-nom151",
    scope: { kind: "document", param: "document_id" },
    policy: { kind: "diagnostic", roles: ["coordinador"] },
    tenantRequired: true,
    docRef: "docs/04 §4 EF-13",
  },
];

export function getEndpoint(id: EndpointId): EndpointDefinition {
  const endpoint = ENDPOINTS.find((candidate) => candidate.id === id);
  if (endpoint === undefined) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "auth: endpoint desconocido en el catálogo.",
    );
  }
  return endpoint;
}

export interface EndpointMatch {
  readonly endpoint: EndpointDefinition;
  readonly params: Record<string, string>;
}

function toPathname(input: string): string {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return new URL(input).pathname;
  }
  return input.split("?")[0].split("#")[0];
}

function toSegments(pathname: string): string[] {
  const withoutBase = pathname.replace(/^\/functions\/v1(?=\/|$)/, "");
  return withoutBase.split("/").filter((segment) => segment.length > 0);
}

/** Resuelve método + ruta contra el catálogo (`null` si no hay endpoint). */
export function matchEndpoint(
  method: string,
  pathOrUrl: string,
): EndpointMatch | null {
  const segments = toSegments(toPathname(pathOrUrl));
  const normalizedMethod = method.toUpperCase();
  for (const endpoint of ENDPOINTS) {
    if (endpoint.method !== normalizedMethod) continue;
    const pattern = toSegments(endpoint.path);
    if (pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let index = 0; index < pattern.length; index += 1) {
      const patternSegment = pattern[index];
      const pathSegment = segments[index];
      const isParam = patternSegment.startsWith("{") &&
        patternSegment.endsWith("}");
      if (isParam) {
        params[patternSegment.slice(1, -1)] = decodeURIComponent(pathSegment);
      } else if (patternSegment !== pathSegment) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return { endpoint, params };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Guarda de endpoint
// ---------------------------------------------------------------------------

/** Dependencias inyectables por la EF (DB de F1-00 / task-20). */
export interface GuardDependencies {
  /**
   * Traduce el identificador del recurso de ruta (ficha, balance, muestra, documento) a su
   * diagnóstico. Para `scope.kind === "diagnostic"` no se usa.
   */
  resolveDiagnosticId?: (
    scope: ResourceScope,
    resourceId: string,
  ) => Promise<string | null>;
  /**
   * Resuelve el rol de diagnóstico en servidor: `my_diagnostic_role` (JWT) o
   * `fn_diag_role(user_id, diagnostic_id)` para EF con `service_role` (F1-00 / M-06).
   */
  resolveRole: ResolveDiagnosticRole;
}

export interface EndpointAuthorization {
  readonly diagnosticId?: string;
  readonly diagnosticRole?: DiagnosticRole;
}

/**
 * Aplica la política del endpoint: tenant requerido, resolución del diagnóstico y rol.
 *
 * @throws `403 FORBIDDEN_NOT_MEMBER` si el recurso no existe o el usuario no es miembro;
 *   `403 FORBIDDEN_ROLE` si el rol no está autorizado.
 */
export async function guardEndpoint(
  context: AuthContext,
  endpointId: EndpointId,
  params: Record<string, string | undefined>,
  dependencies: GuardDependencies,
): Promise<EndpointAuthorization> {
  const endpoint = getEndpoint(endpointId);

  if (endpoint.tenantRequired) {
    requireTenant(context);
  }
  if (endpoint.policy.kind === "authenticated") {
    return {};
  }

  const scope = endpoint.scope;
  if (scope === null) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "auth: endpoint con política de miembro sin alcance configurado.",
    );
  }
  const resourceId = params[scope.param];
  if (resourceId === undefined || resourceId.length === 0) {
    // Entrada incompleta del CLIENTE (no un fallo de configuración de la EF): 422
    // `VALIDATION_*`, nunca 500. Los fallos de configuración (dependencias sin inyectar)
    // se siguen reportando como 500 INTERNAL_ERROR.
    throw new ApiError(
      "VALIDATION_PARAMETRO_REQUERIDO",
      `Falta el parámetro obligatorio ${scope.param}.`,
      { param: scope.param },
    );
  }
  if (!isUuid(resourceId)) {
    // Anti-enumeración: un identificador malformado no es un miembro válido.
    throw forbiddenNotMember({ recurso: scope.kind });
  }

  const diagnosticId = scope.kind === "diagnostic"
    ? resourceId
    : await resolveDiagnosticId(dependencies, scope, resourceId);
  if (diagnosticId === null) {
    throw forbiddenNotMember({ recurso: scope.kind });
  }

  const role = await dependencies.resolveRole(context.userId, diagnosticId);
  if (role === null) {
    throw forbiddenNotMember({ diagnostic_id: diagnosticId });
  }
  if (
    endpoint.policy.kind === "diagnostic" &&
    !endpoint.policy.roles.includes(role)
  ) {
    throw forbiddenRole(role, endpoint.policy.roles);
  }
  return { diagnosticId, diagnosticRole: role };
}

async function resolveDiagnosticId(
  dependencies: GuardDependencies,
  scope: ResourceScope,
  resourceId: string,
): Promise<string | null> {
  if (dependencies.resolveDiagnosticId === undefined) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "auth: falta resolveDiagnosticId para el alcance del endpoint.",
    );
  }
  return await dependencies.resolveDiagnosticId(scope, resourceId);
}

// ---------------------------------------------------------------------------
// Pipeline de autorización y middleware
// ---------------------------------------------------------------------------

export interface AuthorizeEndpointOptions {
  readonly auth?: AuthenticateOptions;
  readonly deps: GuardDependencies;
  /** Cuerpo ya parseado, para alcances con `inBody` (EF-08 register, EF-09). */
  readonly body?: Record<string, unknown>;
}

export interface AuthorizedRequest {
  readonly context: AuthContext;
  readonly endpoint: EndpointDefinition;
  readonly params: Record<string, string>;
  readonly authorization: EndpointAuthorization;
}

/**
 * Pipeline completo de autorización: autentica, resuelve el endpoint y aplica su guarda.
 *
 * Devuelve `null` si la ruta no pertenece al catálogo (el router decide el 404); lanza
 * `ApiError` para todo fallo de auth/rol.
 */
export async function authorizeEndpoint(
  request: Request,
  options: AuthorizeEndpointOptions,
): Promise<AuthorizedRequest | null> {
  const context = await authenticate(request, options.auth);
  const match = matchEndpoint(request.method, request.url);
  if (match === null) {
    return null;
  }

  const params: Record<string, string | undefined> = { ...match.params };
  const scope = match.endpoint.scope;
  if (scope !== null && scope.inBody === true) {
    const bodyValue = options.body?.[scope.param];
    params[scope.param] = typeof bodyValue === "string" ? bodyValue : undefined;
  }

  const authorization = await guardEndpoint(
    context,
    match.endpoint.id,
    params,
    options.deps,
  );
  return {
    context,
    endpoint: match.endpoint,
    params: match.params,
    authorization,
  };
}

export type AuthHandler = (
  request: Request,
  context: AuthContext,
) => Promise<Response> | Response;

export interface WithAuthOptions extends AuthenticateOptions {
  /** Headers extra para las respuestas de error (p. ej. CORS de `_shared/cors.ts`). */
  headers?: HeadersInit;
}

/**
 * Middleware de autenticación: envuelve un handler con `authenticate` y mapea `ApiError` al
 * envelope canónico. Cualquier otro error se degrada a `500 INTERNAL_ERROR` sin filtrar
 * detalles (el handler puede auditar antes de relanzar).
 */
export function withAuth(
  handler: AuthHandler,
  options: WithAuthOptions = {},
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    try {
      const context = await authenticate(request, options);
      return await handler(request, context);
    } catch (error) {
      return errorResponse(error, { headers: options.headers });
    }
  };
}
