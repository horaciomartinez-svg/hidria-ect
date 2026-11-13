/**
 * HIDRIA — acceso a datos desde Edge Functions con `service_role` (PostgREST/RPC).
 *
 * Tarea `task-95` (F1-04). Todo es inyectable (`env`, `fetchImpl`) para probarse sin red:
 * - `fn_diag_role` (RPC M-06, solo `service_role`) ⇒ rol de diagnóstico.
 * - `profiles` ⇒ `verifyProfile` (SEC-PR8-01: perfil inexistente o tenant distinto ⇒ 401).
 * - lecturas de gates TD-1 (checklist, CAT, IIH, BHE, IVOH y ficha de respaldo).
 * - `project_members` ⇒ destinatarios de notificaciones `kind='hito'`.
 * - RPC transaccionales `fn_advance_phase`/`fn_reprogram_milestone` (task-94).
 *
 * `service_role` solo vive aquí; nunca se devuelve en respuestas ni errores.
 */

import type { AuthContext, DiagnosticRole } from "./auth.ts";
import { DIAGNOSTIC_ROLES } from "./auth.ts";
import { ApiError } from "./errors.ts";
import { GATE_MESSAGES, type GateCode } from "./guards.ts";

export type RuntimeEnv = Record<string, string | undefined>;

export interface DiagnosticRow {
  id: string;
  organizationId: string;
  companyId: string | null;
  folio: string;
  faseActual: number;
  estado: string;
  catEstado: string;
  proximoHito: string | null;
  semaforoAtraso: string;
  avancePct: number | null;
  fechaInicio: string;
}

export interface FichaRow {
  id: string;
  clave: string;
  estado: string;
  folio: string | null;
}

export interface BalanceGateRow {
  estado: string;
  maxBrechaPct: number | null;
}

export interface IihStats {
  total: number;
  unverified: number;
}

/** Resultado de las RPC transaccionales (task-94). */
export interface RpcResult {
  ok: boolean;
  replayed?: boolean;
  code?: string;
  details?: Record<string, unknown>;
  data?: Record<string, unknown>;
  audit_ref?: string;
}

export interface ServiceClient {
  resolveRole(
    userId: string,
    diagnosticId: string,
  ): Promise<DiagnosticRole | null>;
  verifyProfile(context: AuthContext): Promise<boolean>;
  fetchDiagnostic(diagnosticId: string): Promise<DiagnosticRow | null>;
  fetchChecklistItem(
    diagnosticId: string,
    itemCode: string,
  ): Promise<{ estado: string } | null>;
  fetchIihStats(diagnosticId: string): Promise<IihStats>;
  fetchBalance(diagnosticId: string): Promise<BalanceGateRow | null>;
  fetchIvohValidatedCount(diagnosticId: string): Promise<number>;
  fetchLatestFicha(
    diagnosticId: string,
    clave: string,
  ): Promise<FichaRow | null>;
  listMemberUserIds(diagnosticId: string): Promise<string[]>;
  insertNotifications(
    rows: Array<
      { userId: string; kind: string; payload: Record<string, unknown> }
    >,
  ): Promise<void>;
  callRpc<T extends RpcResult>(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<T>;
}

interface ClientConfig {
  supabaseUrl: string;
  serviceKey: string;
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

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Mapea `P0001 Gate Fx…` del trigger a su código canónico `GATE_*`. */
export function mapTriggerGateError(
  message: string,
): { code: GateCode; message: string } | null {
  const match = /^Gate F([2-6]):/.exec(message);
  if (match === null) return null;
  const codeByPhase: Record<string, GateCode> = {
    "2": "GATE_CHECKLIST_R1",
    "3": "GATE_CAT_R2",
    "4": "GATE_IIH_V1",
    "5": "GATE_BHE_R3",
    "6": "GATE_IVOH_R4",
  };
  const code = codeByPhase[match[1]];
  if (code === undefined) return null;
  return { code, message: GATE_MESSAGES[code] };
}

/**
 * Crea el cliente de servicio. Falla cerrado (500) sin `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`.
 */
export function createServiceClient(
  env: RuntimeEnv,
  fetchImpl: typeof fetch = fetch,
): ServiceClient {
  const config: ClientConfig = {
    supabaseUrl: trimTrailingSlashes(requireEnv(env, "SUPABASE_URL")),
    serviceKey: requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY"),
  };
  const headers = (): Record<string, string> => ({
    apikey: config.serviceKey,
    authorization: `Bearer ${config.serviceKey}`,
    "content-type": "application/json",
  });

  const request = async (
    pathAndQuery: string,
    init: RequestInit,
  ): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchImpl(`${config.supabaseUrl}${pathAndQuery}`, {
        ...init,
        headers: { ...headers(), ...(init.headers ?? {}) },
      });
    } catch {
      throw new ApiError(
        "INTERNAL_ERROR",
        "No se pudo consultar la base de datos.",
      );
    }
    if (!response.ok) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const record =
        (typeof body === "object" && body !== null ? body : {}) as Record<
          string,
          unknown
        >;
      const dbMessage = typeof record.message === "string"
        ? record.message
        : "";
      const triggerGate = mapTriggerGateError(dbMessage);
      if (triggerGate !== null) {
        throw new ApiError(triggerGate.code, triggerGate.message, {
          trigger: true,
        });
      }
      throw new ApiError(
        "INTERNAL_ERROR",
        "No se pudo consultar la base de datos.",
      );
    }
    try {
      return await response.json();
    } catch {
      return null;
    }
  };

  const select = async <T>(pathAndQuery: string): Promise<T[]> => {
    const payload = await request(pathAndQuery, { method: "GET" });
    return Array.isArray(payload) ? payload as T[] : [];
  };

  const resolveRole = async (
    userId: string,
    diagnosticId: string,
  ): Promise<DiagnosticRole | null> => {
    const payload = await request("/rest/v1/rpc/fn_diag_role", {
      method: "POST",
      body: JSON.stringify({
        p_user_id: userId,
        p_diagnostic_id: diagnosticId,
      }),
    });
    if (
      typeof payload === "string" &&
      (DIAGNOSTIC_ROLES as readonly string[]).includes(payload)
    ) {
      return payload as DiagnosticRole;
    }
    return null;
  };

  const verifyProfile = async (context: AuthContext): Promise<boolean> => {
    const rows = await select<{ organization_id: string }>(
      `/rest/v1/profiles?user_id=eq.${encodeURIComponent(context.userId)}` +
        `&select=organization_id&limit=1`,
    );
    if (rows.length === 0) return false;
    return rows[0].organization_id === context.organizationId;
  };

  const fetchDiagnostic = async (
    diagnosticId: string,
  ): Promise<DiagnosticRow | null> => {
    const rows = await select<Record<string, unknown>>(
      `/rest/v1/diagnostics?id=eq.${encodeURIComponent(diagnosticId)}` +
        "&select=id,organization_id,company_id,folio,fase_actual,estado," +
        "cat_estado,proximo_hito,semaforo_atraso,avance_pct,fecha_inicio&limit=1",
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    if (
      typeof row.id !== "string" || typeof row.organization_id !== "string" ||
      typeof row.folio !== "string" || typeof row.fase_actual !== "number" ||
      typeof row.estado !== "string"
    ) {
      return null;
    }
    return {
      id: row.id,
      organizationId: row.organization_id,
      companyId: typeof row.company_id === "string" ? row.company_id : null,
      folio: row.folio,
      faseActual: row.fase_actual,
      estado: row.estado,
      catEstado: typeof row.cat_estado === "string"
        ? row.cat_estado
        : "no_enviado",
      proximoHito: typeof row.proximo_hito === "string"
        ? row.proximo_hito
        : null,
      semaforoAtraso: typeof row.semaforo_atraso === "string"
        ? row.semaforo_atraso
        : "verde",
      avancePct: typeof row.avance_pct === "number" ? row.avance_pct : null,
      fechaInicio: typeof row.fecha_inicio === "string" ? row.fecha_inicio : "",
    };
  };

  const fetchChecklistItem = async (
    diagnosticId: string,
    itemCode: string,
  ): Promise<{ estado: string } | null> => {
    const rows = await select<{ estado: string }>(
      `/rest/v1/document_checklist_items?diagnostic_id=eq.${
        encodeURIComponent(diagnosticId)
      }&item_code=eq.${encodeURIComponent(itemCode)}&select=estado&limit=1`,
    );
    return rows.length === 0 ? null : { estado: rows[0].estado };
  };

  const fetchIihStats = async (diagnosticId: string): Promise<IihStats> => {
    const rows = await select<{ verificado_v1: boolean }>(
      `/rest/v1/iih_assets?diagnostic_id=eq.${
        encodeURIComponent(diagnosticId)
      }&select=verificado_v1`,
    );
    return {
      total: rows.length,
      unverified: rows.filter((row) => row.verificado_v1 !== true).length,
    };
  };

  const fetchBalance = async (
    diagnosticId: string,
  ): Promise<BalanceGateRow | null> => {
    const balances = await select<{ id: string; estado: string }>(
      `/rest/v1/water_balances?diagnostic_id=eq.${
        encodeURIComponent(diagnosticId)
      }&select=id,estado&order=version.desc&limit=1`,
    );
    if (balances.length === 0) return null;
    const months = await select<{ brecha_pct: number | null }>(
      `/rest/v1/v_bhe_monthly?diagnostic_id=eq.${
        encodeURIComponent(diagnosticId)
      }&select=brecha_pct`,
    );
    const values = months
      .map((row) => row.brecha_pct)
      .filter((value): value is number => typeof value === "number");
    return {
      estado: balances[0].estado,
      maxBrechaPct: values.length === 0 ? null : Math.max(...values),
    };
  };

  const fetchIvohValidatedCount = async (
    diagnosticId: string,
  ): Promise<number> => {
    const rows = await select<{ factor_code: string }>(
      `/rest/v1/ivoh_evaluations?diagnostic_id=eq.${
        encodeURIComponent(diagnosticId)
      }&estado=eq.validado_r4&select=factor_code`,
    );
    return rows.length;
  };

  const fetchLatestFicha = async (
    diagnosticId: string,
    clave: string,
  ): Promise<FichaRow | null> => {
    const rows = await select<Record<string, unknown>>(
      `/rest/v1/logbook_entries?diagnostic_id=eq.${
        encodeURIComponent(diagnosticId)
      }&clave=eq.${encodeURIComponent(clave)}` +
        "&select=id,clave,estado,folio&order=fecha.desc,horario_inicio.desc&limit=1",
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    if (typeof row.id !== "string" || typeof row.estado !== "string") {
      return null;
    }
    return {
      id: row.id,
      clave: typeof row.clave === "string" ? row.clave : clave,
      estado: row.estado,
      folio: typeof row.folio === "string" ? row.folio : null,
    };
  };

  const listMemberUserIds = async (
    diagnosticId: string,
  ): Promise<string[]> => {
    const rows = await select<{ user_id: string }>(
      `/rest/v1/project_members?diagnostic_id=eq.${
        encodeURIComponent(diagnosticId)
      }&select=user_id`,
    );
    return rows
      .map((row) => row.user_id)
      .filter((value): value is string => typeof value === "string");
  };

  const insertNotifications = async (
    rows: Array<{
      userId: string;
      kind: string;
      payload: Record<string, unknown>;
    }>,
  ): Promise<void> => {
    if (rows.length === 0) return;
    await request("/rest/v1/notifications", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(
        rows.map((row) => ({
          user_id: row.userId,
          kind: row.kind,
          payload: row.payload,
        })),
      ),
    });
  };

  const callRpc = async <T extends RpcResult>(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<T> => {
    const payload = await request(`/rest/v1/rpc/${functionName}`, {
      method: "POST",
      body: JSON.stringify(args),
    });
    if (typeof payload !== "object" || payload === null) {
      throw new ApiError(
        "INTERNAL_ERROR",
        "Respuesta inválida de la base de datos.",
      );
    }
    return payload as T;
  };

  return {
    resolveRole,
    verifyProfile,
    fetchDiagnostic,
    fetchChecklistItem,
    fetchIihStats,
    fetchBalance,
    fetchIvohValidatedCount,
    fetchLatestFicha,
    listMemberUserIds,
    insertNotifications,
    callRpc,
  };
}
