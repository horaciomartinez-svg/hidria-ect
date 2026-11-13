/**
 * F1-04 — fixtures/fakes compartidos por las pruebas de EF-01/EF-12.
 * Sin red, sin Supabase, sin secretos reales (JWT y service key sintéticos).
 */

import { type AuthContext, base64UrlEncode } from "../auth.ts";
import type { RpcResult, ServiceClient } from "../db.ts";

export const TEST_SECRET = "jwt-secret-sintetico-f1-04";
export const ISSUER = "https://test.supabase.co/auth/v1";
export const URL_BASE = "https://test.supabase.co/functions/v1";
export const ORG_ID = "00000000-0000-4000-8000-000000000001";
export const OTHER_ORG_ID = "00000000-0000-4000-8000-000000000002";
export const DIAG_ID = "c1000000-0000-4000-8000-000000000001";
export const USER_EQUIPO = "a1000000-0000-4000-8000-000000000002";
export const USER_EMPRESA = "a1000000-0000-4000-8000-000000000003";
export const USER_COORDINADOR = "a1000000-0000-4000-8000-000000000001";
export const SERVICE_KEY = "service-role-sintetico-f1-04";

const encoder = new TextEncoder();

export async function signToken(options: {
  sub?: string;
  organizationId?: string;
  globalRole?: string;
  extraClaims?: Record<string, unknown>;
} = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(
    encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const payload = base64UrlEncode(encoder.encode(JSON.stringify({
    iss: ISSUER,
    sub: options.sub ?? USER_EQUIPO,
    aud: "authenticated",
    role: "authenticated",
    iat: now,
    exp: now + 3600,
    organization_id: options.organizationId ?? ORG_ID,
    tenant_id: options.organizationId ?? ORG_ID,
    global_role: options.globalRole ?? "equipo",
    ...options.extraClaims,
  })));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(TEST_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput)),
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export interface RequestOptions {
  token?: string | null;
  idempotencyKey?: string;
  origin?: string;
  path?: string;
  method?: string;
}

export async function makeRequest(
  body: unknown,
  options: RequestOptions = {},
  basePath = "/diagnostics/" + DIAG_ID + "/advance-phase",
): Promise<Request> {
  const {
    token = await signToken(),
    idempotencyKey,
    origin,
    path,
    method = "POST",
  } = options;
  const headers = new Headers({ "content-type": "application/json" });
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  if (idempotencyKey !== undefined) {
    headers.set("idempotency-key", idempotencyKey);
  }
  if (origin !== undefined) headers.set("origin", origin);
  return new Request(`${URL_BASE}${path ?? basePath}`, {
    method,
    headers,
    body: method === "GET" || method === "OPTIONS"
      ? undefined
      : JSON.stringify(body),
  });
}

export interface RecordedNotifications {
  rows: Array<{
    userId: string;
    kind: string;
    payload: Record<string, unknown>;
  }>;
}

export interface RecordedRpc {
  functionName: string;
  args: Record<string, unknown>;
}

export interface FakeClientResult {
  client: ServiceClient;
  rpcCalls: RecordedRpc[];
  notifications: RecordedNotifications;
}

export interface ClientOverrides {
  role?: string | null;
  verifyProfile?: boolean;
  diagnostic?:
    | Partial<Awaited<ReturnType<ServiceClient["fetchDiagnostic"]>>>
    | null;
  checklist?: { estado: string } | null;
  iih?: { total: number; unverified: number } | null;
  balance?: { estado: string; maxBrechaPct: number | null } | null;
  ivohValidatedCount?: number;
  ficha?: Awaited<ReturnType<ServiceClient["fetchLatestFicha"]>>;
  members?: string[];
  rpcResult?: RpcResult;
  rpcError?: Error;
  notificationsError?: boolean;
}

/** Cliente `ServiceClient` falso con valores por defecto de un diagnóstico en fase 1. */
export function makeFakeClient(
  overrides: ClientOverrides = {},
): FakeClientResult {
  const rpcCalls: RecordedRpc[] = [];
  const notifications: RecordedNotifications = { rows: [] };
  const diagnostic = overrides.diagnostic === null ? null : {
    id: DIAG_ID,
    organizationId: ORG_ID,
    companyId: "b1000000-0000-4000-8000-000000000001",
    folio: "MDOHI-2026-001",
    faseActual: 1,
    estado: "activo",
    catEstado: "no_enviado",
    proximoHito: null,
    semaforoAtraso: "verde",
    avancePct: 16.7,
    fechaInicio: "2026-11-01",
    ...(overrides.diagnostic ?? {}),
  };

  const client: ServiceClient = {
    resolveRole: () =>
      Promise.resolve(
        (overrides.role !== undefined ? overrides.role : "equipo") as never,
      ),
    verifyProfile: () => Promise.resolve(overrides.verifyProfile ?? true),
    fetchDiagnostic: () => Promise.resolve(diagnostic as never),
    fetchChecklistItem: () =>
      Promise.resolve(overrides.checklist ?? { estado: "validado_r1" }),
    fetchIihStats: () =>
      Promise.resolve(overrides.iih ?? { total: 3, unverified: 0 }),
    fetchBalance: () =>
      Promise.resolve(
        overrides.balance ?? { estado: "validado_r3", maxBrechaPct: 8.5 },
      ),
    fetchIvohValidatedCount: () =>
      Promise.resolve(overrides.ivohValidatedCount ?? 6),
    fetchLatestFicha: () =>
      Promise.resolve(
        overrides.ficha !== undefined ? overrides.ficha : {
          id: "d1000000-0000-4000-8000-000000000001",
          clave: "R1",
          estado: "cerrada",
          folio: "BIT-R1-01",
        },
      ),
    listMemberUserIds: () =>
      Promise.resolve(overrides.members ?? [USER_EQUIPO]),
    insertNotifications: (rows) => {
      if (overrides.notificationsError === true) {
        return Promise.reject(new Error("notifications down"));
      }
      notifications.rows = rows;
      return Promise.resolve();
    },
    callRpc: <T extends RpcResult>(
      functionName: string,
      args: Record<string, unknown>,
    ): Promise<T> => {
      rpcCalls.push({ functionName, args });
      if (overrides.rpcError !== undefined) {
        return Promise.reject(overrides.rpcError);
      }
      return Promise.resolve(
        (overrides.rpcResult ?? { ok: true, replayed: false, data: {} }) as T,
      );
    },
  };
  return { client, rpcCalls, notifications };
}

/** Contexto de autenticación "manual" para pruebas que no pasan por JWT. */
export function fakeContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return Object.freeze({
    userId: USER_EQUIPO,
    organizationId: ORG_ID,
    tenantId: ORG_ID,
    globalRole: "equipo",
    claims: Object.freeze({ sub: USER_EQUIPO }),
    accessToken: "token-sintetico",
    ...overrides,
  });
}
