/**
 * HIDRIA — EF-01 `advance-phase` (M2/M11 · gate de fase + Kanban).
 *
 * Tarea `task-95` (F1-04). Contrato `docs/04` §4 EF-01 y TD-1 (docs/04 §5).
 *
 * Flujo:
 * 1. JWT + claims (`nbf` numérico/`verifyProfile` en middleware).
 * 2. Rol de contrato `coordinador|equipo` y membresía (catálogo `_shared/auth.ts`).
 * 3. Tenant fail-closed + `estado='activo'` + `to_phase = fase_actual+1` (fase 6 ⇒ 409).
 * 4. Replicación del gate TD-1 (filas 1–5) + ficha de respaldo cerrada; `p_gate` lo calcula
 *    SOLO la EF (nunca el cliente).
 * 5. RPC transaccional `fn_advance_phase` (service_role) que actualiza + audita + idempotencia
 *    atómicamente; el trigger `diagnostics_phase_gate` es la autoridad final (`P0001`).
 * 6. Post-commit: notificaciones `hito` y broadcast `phase_changed`/`kanban_refresh`
 *    (best-effort: un fallo de Realtime no revierte el avance).
 */

import {
  authenticate,
  type AuthenticateOptions,
  guardEndpoint,
  isUuid,
} from "./auth.ts";
import type { CorsConfig } from "./cors.ts";
import { handlePreflight } from "./cors.ts";
import type { RpcResult, ServiceClient } from "./db.ts";
import { ApiError, errorResponse } from "./errors.ts";
import type { GateResult } from "./guards.ts";
import {
  evaluatePhaseGate,
  fichaClaveForPhase,
  formatProximoHito,
  NEXT_MILESTONE_BY_PHASE,
} from "./guards.ts";
import { readJsonObject } from "./http.ts";
import {
  broadcastRealtime,
  diagnosticTopic,
  organizationTopic,
  type RealtimeConfig,
} from "./realtime.ts";
import { sha256Hex } from "./r2.ts";

export const ADVANCE_PHASE_ENDPOINT = "EF-01";

export interface AdvancePhaseConfig {
  readonly auth: AuthenticateOptions;
  readonly cors: CorsConfig;
  readonly realtime: RealtimeConfig;
}

export interface AdvancePhaseDeps {
  readonly client: ServiceClient;
  /** Inyectable en pruebas; por defecto, el broadcaster real. */
  readonly broadcast?: typeof broadcastRealtime;
}

function json(
  request: Request,
  config: AdvancePhaseConfig,
  body: unknown,
  status = 200,
): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  for (const [name, value] of buildCors(request, config)) {
    headers.set(name, value);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function buildCors(request: Request, config: AdvancePhaseConfig): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (origin !== null && config.cors.allowedOrigins.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set(
      "access-control-allow-headers",
      "authorization, content-type, idempotency-key",
    );
  }
  return headers;
}

/** Ruta de contrato (`/diagnostics/{id}/advance-phase`) o slug de despliegue. */
export function matchAdvancePhaseRoute(
  method: string,
  pathOrUrl: string,
): boolean {
  if (method.toUpperCase() !== "POST") return false;
  const pathname = pathOrUrl.startsWith("http://") ||
      pathOrUrl.startsWith("https://")
    ? new URL(pathOrUrl).pathname
    : pathOrUrl.split("?")[0].split("#")[0];
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const last = segments[segments.length - 1];
  return last === "advance-phase" || segments.includes("ef-01-advance-phase");
}

function requireToPhase(body: Record<string, unknown>): number {
  const value = body.to_phase;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ApiError(
      "VALIDATION_PHASE_TRANSICION",
      "El campo to_phase debe ser un entero.",
      { field: "to_phase" },
    );
  }
  if (value < 2 || value > 6) {
    throw new ApiError(
      "VALIDATION_PHASE_TRANSICION",
      "to_phase debe estar entre 2 y 6.",
      { field: "to_phase", min: 2, max: 6 },
    );
  }
  return value;
}

async function collectGate(
  client: ServiceClient,
  diagnosticId: string,
  faseOrigen: number,
  catEstado: string,
): Promise<GateResult> {
  const fichaClave = fichaClaveForPhase(faseOrigen);
  const [checklistLayout, iih, balance, ivohValidatedCount, ficha] =
    await Promise.all([
      faseOrigen === 1
        ? client.fetchChecklistItem(diagnosticId, "layout")
        : Promise.resolve(null),
      faseOrigen === 3
        ? client.fetchIihStats(diagnosticId)
        : Promise.resolve(null),
      faseOrigen === 4
        ? client.fetchBalance(diagnosticId)
        : Promise.resolve(null),
      faseOrigen === 5
        ? client.fetchIvohValidatedCount(diagnosticId)
        : Promise.resolve(0),
      fichaClave === null
        ? Promise.resolve(null)
        : client.fetchLatestFicha(diagnosticId, fichaClave),
    ]);
  return evaluatePhaseGate(faseOrigen, {
    checklistLayout,
    catEstado,
    iih,
    balance,
    ivohValidatedCount,
    ficha: ficha === null
      ? null
      : { clave: ficha.clave, estado: ficha.estado, folio: ficha.folio },
  });
}

/** Handler de EF-01 con dependencias inyectables (pruebas sin Supabase). */
export function createAdvancePhaseHandler(
  config: AdvancePhaseConfig,
  deps: AdvancePhaseDeps,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const preflight = handlePreflight(request, config.cors);
    if (preflight !== null) return preflight;

    try {
      if (!matchAdvancePhaseRoute(request.method, request.url)) {
        return json(request, config, {
          error: { code: "NOT_FOUND", message: "Ruta no disponible." },
        }, 404);
      }

      const context = await authenticate(request, {
        ...config.auth,
        verifyProfile: (ctx) => deps.client.verifyProfile(ctx),
      });
      const body = await readJsonObject(request);

      const authorization = await guardEndpoint(
        context,
        ADVANCE_PHASE_ENDPOINT,
        {
          diagnostic_id: typeof body.diagnostic_id === "string"
            ? body.diagnostic_id
            : undefined,
        },
        { resolveRole: deps.client.resolveRole },
      );
      const diagnosticId = authorization.diagnosticId as string;

      const diagnostic = await deps.client.fetchDiagnostic(diagnosticId);
      if (
        diagnostic === null ||
        diagnostic.organizationId !== context.organizationId
      ) {
        throw new ApiError("FORBIDDEN_NOT_MEMBER", undefined, {
          diagnostic_id: diagnosticId,
        });
      }
      if (diagnostic.estado !== "activo") {
        throw new ApiError("CONFLICT_STATE", undefined, {
          estado_actual: diagnostic.estado,
        });
      }
      if (diagnostic.faseActual >= 6) {
        // TD-1 fila 6 (`estado→reportado`) es de EF-07, no de EF-01.
        throw new ApiError("CONFLICT_PHASE", undefined, {
          fase_actual: diagnostic.faseActual,
          motivo: "fase_final",
        });
      }
      const toPhase = requireToPhase(body);
      if (toPhase !== diagnostic.faseActual + 1) {
        throw new ApiError("CONFLICT_PHASE", undefined, {
          fase_actual: diagnostic.faseActual,
          to_phase: toPhase,
        });
      }

      const gate = await collectGate(
        deps.client,
        diagnosticId,
        diagnostic.faseActual,
        diagnostic.catEstado,
      );
      if (!gate.ok) {
        throw new ApiError(gate.code, gate.message, gate.details);
      }

      const pGate = {
        fase_origen: diagnostic.faseActual,
        entregable: gate.entregable,
        folio_respaldo: gate.folioRespaldo,
        ficha_clave: gate.fichaClave,
      };
      const idempotencyKey = request.headers.get("idempotency-key");
      if (idempotencyKey !== null && !isUuid(idempotencyKey)) {
        throw new ApiError(
          "VALIDATION_IDEMPOTENCY_KEY",
          "La cabecera Idempotency-Key debe ser un UUID.",
          { header: "Idempotency-Key" },
        );
      }
      const requestHash = await sha256Hex(JSON.stringify({
        endpoint: ADVANCE_PHASE_ENDPOINT,
        diagnostic_id: diagnosticId,
        to_phase: toPhase,
        gate: pGate,
      }));

      const result = await deps.client.callRpc<RpcResult>(
        "fn_advance_phase",
        {
          p_user_id: context.userId,
          p_diagnostic_id: diagnosticId,
          p_to_phase: toPhase,
          p_gate: pGate,
          p_idempotency_key: idempotencyKey,
          p_request_hash: requestHash,
        },
      );
      if (result.ok !== true) {
        throw new ApiError(
          typeof result.code === "string" ? result.code : "INTERNAL_ERROR",
          undefined,
          result.details ?? {},
        );
      }
      if (result.replayed !== true) {
        await notifyAndBroadcast(config, deps, context.organizationId, {
          diagnosticId,
          folio: diagnostic.folio,
          faseAnterior: diagnostic.faseActual,
          faseActual: toPhase,
          proximoHito: formatProximoHito(
            NEXT_MILESTONE_BY_PHASE[toPhase] ?? null,
          ),
          semaforoAtraso: diagnostic.semaforoAtraso,
        });
      }

      const data = (result.data ?? {}) as Record<string, unknown>;
      return json(request, config, {
        diagnostic_id: diagnosticId,
        folio: typeof data.folio === "string" ? data.folio : diagnostic.folio,
        fase_actual: toPhase,
        proximo_hito: typeof data.proximo_hito === "string"
          ? data.proximo_hito
          : formatProximoHito(NEXT_MILESTONE_BY_PHASE[toPhase] ?? null),
        avance_pct: typeof data.avance_pct === "number"
          ? data.avance_pct
          : Math.round((toPhase * 100) / 6 * 10) / 10,
        gate: {
          fase_origen: diagnostic.faseActual,
          entregable: gate.entregable,
          folio_respaldo: gate.folioRespaldo,
        },
      });
    } catch (error) {
      return errorResponse(error, {
        headers: buildCors(request, config),
      });
    }
  };
}

/** Efectos post-commit: notificación `hito` a miembros + eventos Realtime (best-effort). */
async function notifyAndBroadcast(
  config: AdvancePhaseConfig,
  deps: AdvancePhaseDeps,
  organizationId: string,
  info: {
    diagnosticId: string;
    folio: string;
    faseAnterior: number;
    faseActual: number;
    proximoHito: string | null;
    semaforoAtraso: string;
  },
): Promise<void> {
  try {
    const members = await deps.client.listMemberUserIds(info.diagnosticId);
    const payload = {
      diagnostic_id: info.diagnosticId,
      folio: info.folio,
      fase_anterior: info.faseAnterior,
      fase_actual: info.faseActual,
      proximo_hito: info.proximoHito,
    };
    await deps.client.insertNotifications(
      members.map((userId) => ({ userId, kind: "hito", payload })),
    );
  } catch {
    // La notificación es un efecto post-commit: no revierte el avance ya auditado.
  }
  const broadcast = deps.broadcast ?? broadcastRealtime;
  await broadcast(config.realtime, [
    {
      topic: diagnosticTopic(info.diagnosticId),
      event: "phase_changed",
      payload: {
        fase_actual: info.faseActual,
        proximo_hito: info.proximoHito,
        semaforo_atraso: info.semaforoAtraso,
      },
    },
    {
      topic: organizationTopic(organizationId),
      event: "kanban_refresh",
      payload: { diagnostic_id: info.diagnosticId },
    },
  ]);
}
