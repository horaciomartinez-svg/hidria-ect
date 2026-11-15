/**
 * HIDRIA — EF-05 `balances/{balance_id}/validate-r3` (M6 · BHE).
 *
 * Tarea `task-143` (F1-09). Contrato ADR-014 D3/D5/D9/D10:
 * auth/claims, rol coord/equipo, tenant/membresía (403 anti-enumeración), ficha
 * `BIT-R3` cerrada del mismo diagnóstico, RPC atómica `fn_validate_bhe_r3`
 * (brecha >10 % ⇒ `GATE_BHE_BRECHA` 409 con mensaje canónico y `details.meses`).
 * Post-commit: notificación a miembros y evento `bhe_validated` (best-effort).
 */

import {
  authenticate,
  type AuthenticateOptions,
  guardEndpoint,
  isUuid,
  type ResolveDiagnosticRole,
} from "./auth.ts";
import { buildCorsHeaders, type CorsConfig, handlePreflight } from "./cors.ts";
import type { RpcResult, WaterBalanceRow } from "./db.ts";
import { ApiError, errorResponse } from "./errors.ts";
import { readJsonObject } from "./http.ts";
import {
  broadcastRealtime,
  diagnosticTopic,
  type RealtimeConfig,
} from "./realtime.ts";
import { sha256Hex } from "./r2.ts";

export const VALIDATE_ENDPOINT = "EF-05";
export const CANONICAL_BRECHA_MESSAGE =
  "Un balance que no cierra no es un dato, es una tarea pendiente.";

export interface BheValidateClient {
  readonly resolveRole: ResolveDiagnosticRole;
  readonly verifyProfile: (
    context: import("./auth.ts").AuthContext,
  ) => Promise<boolean>;
  readonly fetchWaterBalance: (
    balanceId: string,
  ) => Promise<WaterBalanceRow | null>;
  readonly fetchLogbookEntryById: (entryId: string) => Promise<
    | { id: string; diagnosticId: string; clave: string; estado: string }
    | null
  >;
  readonly listMemberUserIds: (diagnosticId: string) => Promise<string[]>;
  readonly insertNotifications: (
    rows: Array<{
      userId: string;
      kind: string;
      payload: Record<string, unknown>;
    }>,
  ) => Promise<void>;
  readonly callRpc: <T extends RpcResult>(
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<T>;
}

export interface BheValidateConfig {
  readonly auth: AuthenticateOptions;
  readonly cors: CorsConfig;
  readonly realtime: RealtimeConfig;
}

export interface BheValidateDeps {
  readonly client: BheValidateClient;
  readonly broadcast?: typeof broadcastRealtime;
}

/** Ruta `/balances/{id}/validate-r3` o `/ef-05-balances/balances/{id}/validate-r3`. */
export function matchBheValidateRoute(
  method: string,
  pathOrUrl: string,
): { balanceId: string | null } | null {
  if (method.toUpperCase() !== "POST") return null;
  const pathname = pathOrUrl.startsWith("http://") ||
      pathOrUrl.startsWith("https://")
    ? new URL(pathOrUrl).pathname
    : pathOrUrl.split("?")[0].split("#")[0];
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const last = segments[segments.length - 1];
  if (last !== "validate-r3") return null;
  if (!segments.includes("balances") && !segments.includes("ef-05-balances")) {
    return null;
  }
  const index = segments.includes("balances")
    ? segments.lastIndexOf("balances")
    : segments.lastIndexOf("ef-05-balances");
  if (index + 3 !== segments.length) return null;
  const candidate = segments[index + 1];
  return { balanceId: isUuid(candidate) ? candidate : null };
}

function json(
  request: Request,
  config: BheValidateConfig,
  body: unknown,
  status = 200,
): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  for (const [name, value] of buildCorsHeaders(request, config.cors)) {
    headers.set(name, value);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function corsHeaders(request: Request, config: BheValidateConfig): Headers {
  const headers = new Headers();
  for (const [name, value] of buildCorsHeaders(request, config.cors)) {
    headers.set(name, value);
  }
  return headers;
}

/** Handler de EF-05 con dependencias inyectables. */
export function createBheValidateHandler(
  config: BheValidateConfig,
  deps: BheValidateDeps,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const preflight = handlePreflight(request, config.cors);
    if (preflight !== null) return preflight;

    try {
      const matched = matchBheValidateRoute(request.method, request.url);
      if (matched === null) {
        return json(request, config, {
          error: { code: "NOT_FOUND", message: "Ruta no disponible." },
        }, 404);
      }
      const context = await authenticate(request, {
        ...config.auth,
        verifyProfile: (ctx) => deps.client.verifyProfile(ctx),
      });
      const body = await readJsonObject(request);
      const balanceId = matched.balanceId ??
        (typeof body.balance_id === "string" ? body.balance_id : null);
      if (balanceId === null || !isUuid(balanceId)) {
        throw new ApiError(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "Falta balance_id (UUID) en la ruta.",
          { field: "balance_id" },
        );
      }
      const rawFicha = body.r3_logbook_id;
      if (typeof rawFicha !== "string" || !isUuid(rawFicha)) {
        throw new ApiError(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "r3_logbook_id debe ser un UUID.",
          { field: "r3_logbook_id" },
        );
      }
      const fichaR3Id = rawFicha;

      const balance = await deps.client.fetchWaterBalance(balanceId);
      if (balance === null) {
        // Anti-enumeración: balance inexistente y otro tenant comparten 403.
        throw new ApiError("FORBIDDEN_NOT_MEMBER", undefined, {
          motivo: "balance_inexistente_o_sin_acceso",
        });
      }
      if (balance.organizationId !== context.organizationId) {
        throw new ApiError("FORBIDDEN_NOT_MEMBER", undefined, {
          motivo: "balance_inexistente_o_sin_acceso",
        });
      }
      const authorization = await guardEndpoint(
        context,
        VALIDATE_ENDPOINT,
        { balance_id: balanceId },
        {
          resolveRole: deps.client.resolveRole,
          resolveDiagnosticId: () => Promise.resolve(balance.diagnosticId),
        },
      );
      void authorization;

      const ficha = await deps.client.fetchLogbookEntryById(fichaR3Id);
      if (
        ficha === null || ficha.diagnosticId !== balance.diagnosticId ||
        ficha.clave !== "R3" || ficha.estado !== "cerrada"
      ) {
        throw new ApiError(
          "GATE_R3_FICHA",
          "validate-r3 exige una ficha BIT-R3 cerrada del diagnóstico.",
          { reason: "ficha_r3_no_valida" },
        );
      }

      const idempotencyKey = request.headers.get("idempotency-key");
      if (idempotencyKey !== null && !isUuid(idempotencyKey)) {
        throw new ApiError(
          "VALIDATION_IDEMPOTENCY_KEY",
          "La cabecera Idempotency-Key debe ser un UUID.",
          { header: "Idempotency-Key" },
        );
      }
      const requestHash = await sha256Hex(JSON.stringify({
        endpoint: VALIDATE_ENDPOINT,
        balance_id: balanceId,
        r3_logbook_id: fichaR3Id,
      }));

      const result = await deps.client.callRpc<RpcResult>(
        "fn_validate_bhe_r3",
        {
          p_user_id: context.userId,
          p_balance_id: balanceId,
          p_r3_logbook_id: fichaR3Id,
          p_idempotency_key: idempotencyKey,
          p_request_hash: requestHash,
        },
      );
      if (result.ok !== true) {
        const code = typeof result.code === "string"
          ? result.code
          : "INTERNAL_ERROR";
        const message = code === "GATE_BHE_BRECHA"
          ? CANONICAL_BRECHA_MESSAGE
          : (typeof result.message === "string" ? result.message : undefined);
        throw new ApiError(code, message, result.details ?? {});
      }

      const data = (result.data ?? {}) as Record<string, unknown>;
      if (result.replayed !== true) {
        await notifyMembers(deps, balance.diagnosticId, {
          balanceId,
          brechaAnualPct: typeof data.brecha_anual_pct === "number"
            ? data.brecha_anual_pct
            : null,
          brechaMaxMesPct: typeof data.brecha_max_mes_pct === "number"
            ? data.brecha_max_mes_pct
            : null,
          mesesSobreUmbral: typeof data.meses_sobre_umbral === "number"
            ? data.meses_sobre_umbral
            : 0,
        });
        await broadcastValidated(config, deps, balance.diagnosticId, {
          balanceId,
          brechaAnualPct: typeof data.brecha_anual_pct === "number"
            ? data.brecha_anual_pct
            : null,
          brechaMaxMesPct: typeof data.brecha_max_mes_pct === "number"
            ? data.brecha_max_mes_pct
            : null,
          mesesSobreUmbral: typeof data.meses_sobre_umbral === "number"
            ? data.meses_sobre_umbral
            : 0,
        });
      }

      return json(request, config, {
        balance_id: balanceId,
        estado: typeof data.estado === "string" ? data.estado : "validado_r3",
        brecha_anual_pct: typeof data.brecha_anual_pct === "number"
          ? data.brecha_anual_pct
          : null,
        brecha_max_mes_pct: typeof data.brecha_max_mes_pct === "number"
          ? data.brecha_max_mes_pct
          : null,
        meses_sobre_umbral: typeof data.meses_sobre_umbral === "number"
          ? data.meses_sobre_umbral
          : 0,
      });
    } catch (error) {
      return errorResponse(error, {
        headers: corsHeaders(request, config),
      });
    }
  };
}

async function notifyMembers(
  deps: BheValidateDeps,
  diagnosticId: string,
  info: Record<string, unknown>,
): Promise<void> {
  try {
    const members = await deps.client.listMemberUserIds(diagnosticId);
    if (members.length === 0) return;
    await deps.client.insertNotifications(
      members.map((userId) => ({
        userId,
        kind: "hito",
        payload: {
          diagnostic_id: diagnosticId,
          bhe_validated: true,
          ...info,
        },
      })),
    );
  } catch {
    // Post-commit best-effort.
  }
}

async function broadcastValidated(
  config: BheValidateConfig,
  deps: BheValidateDeps,
  diagnosticId: string,
  info: Record<string, unknown>,
): Promise<void> {
  const broadcast = deps.broadcast ?? broadcastRealtime;
  await broadcast(config.realtime, [
    {
      topic: diagnosticTopic(diagnosticId),
      event: "bhe_validated",
      payload: { ...info },
    },
  ]);
}
