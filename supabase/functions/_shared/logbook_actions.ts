/**
 * HIDRIA — EF-02 Bitácora: `submit-review`, `sign` y `close` (M10).
 *
 * Tarea `task-173` (F1-11). Contrato ADR-016 (D1–D13):
 * - `submit-review`: `abierta → en_revision` (solo transición; sin validar cierre).
 * - `sign`: registra la firma de un participante por nombre (coord/equipo en
 *   representación; `firma_ts` server-side).
 * - `close`: solo desde `en_revision`; la RPC valida firmas/agenda/evidencia y la
 *   regla 24 h (razón ≥20 si es tardío). La EF **no calcula 24 h**.
 *
 * La autoridad de estado/validaciones es la RPC `service_role`; la EF autentica,
 * verifica tenant/rol/anti-enumeración, valida cuerpos, aplica idempotencia y hace
 * post-commit best-effort (`logbook_closed`/notificación).
 */

import {
  authenticate,
  type AuthenticateOptions,
  guardEndpoint,
  isUuid,
  type ResolveDiagnosticRole,
} from "./auth.ts";
import { buildCorsHeaders, type CorsConfig, handlePreflight } from "./cors.ts";
import type { LogbookEntryRow, RpcResult } from "./db.ts";
import { ApiError, errorResponse } from "./errors.ts";
import { readJsonObject } from "./http.ts";
import {
  broadcastRealtime,
  diagnosticTopic,
  type RealtimeConfig,
} from "./realtime.ts";
import { sha256Hex } from "./r2.ts";

export type LogbookAction = "submit-review" | "sign" | "close";

const ACTION_ENDPOINTS: Record<
  LogbookAction,
  "EF-02.submit-review" | "EF-02.sign" | "EF-02.close"
> = {
  "submit-review": "EF-02.submit-review",
  sign: "EF-02.sign",
  close: "EF-02.close",
};

export interface LogbookClient {
  readonly resolveRole: ResolveDiagnosticRole;
  readonly verifyProfile: (
    context: import("./auth.ts").AuthContext,
  ) => Promise<boolean>;
  readonly fetchLogbookEntryForEf02: (
    entryId: string,
  ) => Promise<LogbookEntryRow | null>;
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

export interface LogbookConfig {
  readonly auth: AuthenticateOptions;
  readonly cors: CorsConfig;
  readonly realtime: RealtimeConfig;
}

export interface LogbookDeps {
  readonly client: LogbookClient;
  readonly broadcast?: typeof broadcastRealtime;
}

/** `/logbook/{entry_id}/submit-review|sign|close` o slug `ef-02-logbook`. */
export function matchLogbookRoute(
  method: string,
  pathOrUrl: string,
): { action: LogbookAction; entryId: string | null } | null {
  if (method.toUpperCase() !== "POST") return null;
  const pathname = pathOrUrl.startsWith("http://") ||
      pathOrUrl.startsWith("https://")
    ? new URL(pathOrUrl).pathname
    : pathOrUrl.split("?")[0].split("#")[0];
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const last = segments[segments.length - 1];
  if (last !== "submit-review" && last !== "sign" && last !== "close") {
    return null;
  }
  if (!segments.includes("logbook") && !segments.includes("ef-02-logbook")) {
    return null;
  }
  const index = segments.includes("logbook")
    ? segments.lastIndexOf("logbook")
    : segments.lastIndexOf("ef-02-logbook");
  if (index + 3 !== segments.length) return null;
  const candidate = segments[index + 1];
  return {
    action: last as LogbookAction,
    entryId: isUuid(candidate) ? candidate : null,
  };
}

function json(
  request: Request,
  config: LogbookConfig,
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

function corsHeaders(request: Request, config: LogbookConfig): Headers {
  const headers = new Headers();
  for (const [name, value] of buildCorsHeaders(request, config.cors)) {
    headers.set(name, value);
  }
  return headers;
}

function optionalReason(body: Record<string, unknown>): string | null {
  const raw = body.cierre_razon;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    throw new ApiError(
      "VALIDATION_PARAMETRO_REQUERIDO",
      "cierre_razon debe ser texto.",
      { field: "cierre_razon" },
    );
  }
  const reason = raw.trim();
  if (reason.length > 2000) {
    throw new ApiError(
      "VALIDATION_PARAMETRO_REQUERIDO",
      "cierre_razon excede 2000 caracteres.",
      { field: "cierre_razon" },
    );
  }
  return reason.length === 0 ? null : reason;
}

function participantName(body: Record<string, unknown>): string {
  const raw = body.participante;
  if (typeof raw !== "string") {
    throw new ApiError(
      "VALIDATION_PARAMETRO_REQUERIDO",
      "participante es obligatorio (nombre exacto del asistente).",
      { field: "participante" },
    );
  }
  const name = raw.trim();
  if (name.length < 1 || name.length > 200) {
    throw new ApiError(
      "VALIDATION_PARAMETRO_REQUERIDO",
      "participante debe tener 1–200 caracteres.",
      { field: "participante" },
    );
  }
  return name;
}

/** Handler de EF-02 con dependencias inyectables. */
export function createLogbookHandler(
  config: LogbookConfig,
  deps: LogbookDeps,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const preflight = handlePreflight(request, config.cors);
    if (preflight !== null) return preflight;

    try {
      const matched = matchLogbookRoute(request.method, request.url);
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
      const entryId = matched.entryId ??
        (typeof body.entry_id === "string" ? body.entry_id : null);
      if (entryId === null || !isUuid(entryId)) {
        throw new ApiError(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "Falta entry_id (UUID) en la ruta.",
          { field: "entry_id" },
        );
      }
      const entry = await deps.client.fetchLogbookEntryForEf02(entryId);
      if (
        entry === null || entry.organizationId !== context.organizationId
      ) {
        // Anti-enumeración: ficha inexistente y otro tenant comparten 403.
        throw new ApiError("FORBIDDEN_NOT_MEMBER", undefined, {
          motivo: "entry_inexistente_o_sin_acceso",
        });
      }
      const endpoint = ACTION_ENDPOINTS[matched.action];
      const authorization = await guardEndpoint(
        context,
        endpoint,
        { entry_id: entryId },
        {
          resolveRole: deps.client.resolveRole,
          resolveDiagnosticId: () => Promise.resolve(entry.diagnosticId),
        },
      );
      void authorization;

      const idempotencyKey = request.headers.get("idempotency-key");
      if (idempotencyKey !== null && !isUuid(idempotencyKey)) {
        throw new ApiError(
          "VALIDATION_IDEMPOTENCY_KEY",
          "La cabecera Idempotency-Key debe ser un UUID.",
          { header: "Idempotency-Key" },
        );
      }

      if (matched.action === "submit-review") {
        const requestHash = await sha256Hex(JSON.stringify({
          endpoint,
          entry_id: entryId,
        }));
        const result = await deps.client.callRpc<RpcResult>(
          "fn_submit_logbook_review",
          {
            p_user_id: context.userId,
            p_entry_id: entryId,
            p_idempotency_key: idempotencyKey,
            p_request_hash: requestHash,
          },
        );
        if (result.ok !== true) throw fromRpc(result);
        const data = (result.data ?? {}) as Record<string, unknown>;
        return json(request, config, {
          entry_id: entryId,
          folio: typeof data.folio === "string" ? data.folio : entry.folio,
          clave: typeof data.clave === "string" ? data.clave : entry.clave,
          estado: typeof data.estado === "string" ? data.estado : "en_revision",
        });
      }

      if (matched.action === "sign") {
        const participante = participantName(body);
        const requestHash = await sha256Hex(JSON.stringify({
          endpoint,
          entry_id: entryId,
          participante,
        }));
        const result = await deps.client.callRpc<RpcResult>(
          "fn_sign_logbook_participant",
          {
            p_user_id: context.userId,
            p_entry_id: entryId,
            p_participante_nombre: participante,
            p_idempotency_key: idempotencyKey,
            p_request_hash: requestHash,
          },
        );
        if (result.ok !== true) throw fromRpc(result);
        const data = (result.data ?? {}) as Record<string, unknown>;
        return json(request, config, {
          entry_id: entryId,
          folio: typeof data.folio === "string" ? data.folio : entry.folio,
          participante,
          firma_ts: typeof data.firma_ts === "string" ? data.firma_ts : null,
          estado: typeof data.estado === "string" ? data.estado : entry.estado,
        });
      }

      const reason = optionalReason(body);
      const requestHash = await sha256Hex(JSON.stringify({
        endpoint,
        entry_id: entryId,
        cierre_razon: reason,
      }));
      const result = await deps.client.callRpc<RpcResult>(
        "fn_close_logbook",
        {
          p_user_id: context.userId,
          p_entry_id: entryId,
          p_cierre_razon: reason,
          p_idempotency_key: idempotencyKey,
          p_request_hash: requestHash,
        },
      );
      if (result.ok !== true) throw fromRpc(result);
      const data = (result.data ?? {}) as Record<string, unknown>;
      if (result.replayed !== true) {
        await notifyMembers(deps, entry.diagnosticId, {
          entry_id: entryId,
          folio: typeof data.folio === "string" ? data.folio : entry.folio,
          clave: typeof data.clave === "string" ? data.clave : entry.clave,
        });
        await broadcastClosed(config, deps, entry.diagnosticId, {
          entry_id: entryId,
          folio: typeof data.folio === "string" ? data.folio : entry.folio,
          clave: typeof data.clave === "string" ? data.clave : entry.clave,
        });
      }
      return json(request, config, {
        entry_id: entryId,
        folio: typeof data.folio === "string" ? data.folio : entry.folio,
        clave: typeof data.clave === "string" ? data.clave : entry.clave,
        cerrada_en: typeof data.cerrada_en === "string"
          ? data.cerrada_en
          : null,
        version: typeof data.version === "number"
          ? data.version
          : entry.version,
        cierre_tardio: data.cierre_tardio === true,
      });
    } catch (error) {
      return errorResponse(error, {
        headers: corsHeaders(request, config),
      });
    }
  };
}

function fromRpc(result: RpcResult): ApiError {
  return new ApiError(
    typeof result.code === "string" ? result.code : "INTERNAL_ERROR",
    typeof result.message === "string" ? result.message : undefined,
    result.details ?? {},
  );
}

async function notifyMembers(
  deps: LogbookDeps,
  diagnosticId: string,
  info: Record<string, unknown>,
): Promise<void> {
  try {
    const members = await deps.client.listMemberUserIds(diagnosticId);
    if (members.length === 0) return;
    await deps.client.insertNotifications(
      members.map((userId) => ({
        userId,
        kind: "validacion",
        payload: { diagnostic_id: diagnosticId, logbook_closed: true, ...info },
      })),
    );
  } catch {
    // Best-effort post-commit.
  }
}

async function broadcastClosed(
  config: LogbookConfig,
  deps: LogbookDeps,
  diagnosticId: string,
  info: Record<string, unknown>,
): Promise<void> {
  const broadcast = deps.broadcast ?? broadcastRealtime;
  await broadcast(config.realtime, [
    {
      topic: diagnosticTopic(diagnosticId),
      event: "logbook_closed",
      payload: { ...info },
    },
  ]);
}
