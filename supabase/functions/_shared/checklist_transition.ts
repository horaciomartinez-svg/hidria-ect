/**
 * HIDRIA — EF-03 `checklist/{item_id}/transition` (M3 · lista de cotejo).
 *
 * Tarea `task-114` (F1-06b). Contrato `docs/04` §4 EF-03 y tabla **TD-2**.
 *
 * Flujo:
 * 1. JWT + claims (`verifyProfile`, `nbf` numérico en middleware) y `p_user_id` del JWT.
 * 2. Ítem por id (404 si no existe) → diagnóstico → tenant/membresía y rol del catálogo
 *    (`coordinador|equipo|empresa`; observador/invitado 403).
 * 3. Validación de la transición TD-2 (rol × origen × destino × extras) y del `document_id`.
 * 4. RPC atómica `fn_transition_checklist_item` (`service_role`): UPDATE + `audit_log` +
 *    idempotencia (`api_idempotency`) en una transacción.
 * 5. Post-commit best-effort: notificación `validacion` a empresa (si aplica) y broadcast
 *    `checklist_updated`/`kanban_refresh`. Respuesta `{ item_id, item_code, estado, document_id }`.
 */

import {
  authenticate,
  type AuthenticateOptions,
  guardEndpoint,
  isUuid,
  type ResolveDiagnosticRole,
} from "./auth.ts";
import { buildCorsHeaders, type CorsConfig, handlePreflight } from "./cors.ts";
import type {
  ChecklistItemRow,
  DiagnosticRow,
  DocumentScopeRow,
  RpcResult,
} from "./db.ts";
import { ApiError, errorResponse } from "./errors.ts";
import { readJsonObject } from "./http.ts";
import {
  broadcastRealtime,
  diagnosticTopic,
  organizationTopic,
  type RealtimeConfig,
} from "./realtime.ts";
import { sha256Hex } from "./r2.ts";

export const CHECKLIST_ENDPOINT = "EF-03";

const TRANSITION_TARGETS: readonly string[] = [
  "recibido",
  "revisado",
  "validado_r1",
];

const SOLICITUD_NOTA_MAX = 2000;

export interface ChecklistClient {
  readonly resolveRole: ResolveDiagnosticRole;
  readonly verifyProfile: (
    context: import("./auth.ts").AuthContext,
  ) => Promise<boolean>;
  readonly fetchDiagnostic: (
    diagnosticId: string,
  ) => Promise<DiagnosticRow | null>;
  readonly fetchChecklistItemById: (
    itemId: string,
  ) => Promise<ChecklistItemRow | null>;
  readonly fetchDocumentById: (
    documentId: string,
  ) => Promise<DocumentScopeRow | null>;
  readonly listRoleUserIds: (
    diagnosticId: string,
    role: string,
  ) => Promise<string[]>;
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

export interface ChecklistConfig {
  readonly auth: AuthenticateOptions;
  readonly cors: CorsConfig;
  readonly realtime: RealtimeConfig;
}

export interface ChecklistDeps {
  readonly client: ChecklistClient;
  /** Inyectable en pruebas; por defecto el broadcaster real. */
  readonly broadcast?: typeof broadcastRealtime;
}

interface TransitionEvaluationOk {
  readonly ok: true;
  readonly action: "approve" | "update";
  readonly notifyEmpresa: boolean;
}

interface TransitionEvaluationFail {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  readonly details: Record<string, unknown>;
}

export type TransitionEvaluation =
  | TransitionEvaluationOk
  | TransitionEvaluationFail;

function fail(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): TransitionEvaluationFail {
  return { ok: false, code, message, details };
}

function requireNonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Evalúa la transición según TD-2 (rol × origen × destino).
 * `validado_r1` es terminal; solo `coordinador` puede entrar a `validado_r1` (TD-2 #3).
 */
export function evaluateTransition(input: {
  role: string;
  from: string;
  to: string;
  documentId: string | null;
  solicitudNota: string | null;
}): TransitionEvaluation {
  const { role, from, to, documentId, solicitudNota } = input;

  if (from === "validado_r1") {
    return fail(
      "CONFLICT_STATE",
      "La validación R1 es terminal: no admite más transiciones.",
      { estado_actual: from, motivo: "terminal" },
    );
  }
  if (to === from) {
    return fail(
      "CONFLICT_STATE",
      "La transición no cambia el estado del ítem.",
      { estado_actual: from, motivo: "sin_cambio" },
    );
  }

  if (to === "validado_r1") {
    if (role !== "coordinador") {
      return fail(
        "FORBIDDEN_ROLE",
        "Solo el coordinador puede validar el ítem en R1.",
        { rol: role, motivo: "TD-2#3" },
      );
    }
    if (from !== "revisado") {
      return fail(
        "CONFLICT_STATE",
        "Solo un ítem revisado puede validarse en R1.",
        { estado_actual: from, motivo: "TD-2#3" },
      );
    }
    if (documentId === null) {
      return fail(
        "VALIDATION_PARAMETRO_REQUERIDO",
        "La validación R1 exige un documento adjunto.",
        { field: "document_id" },
      );
    }
    return { ok: true, action: "approve", notifyEmpresa: false };
  }

  if (from === "no_recibido" && to === "recibido") {
    if (role === "empresa") {
      if (documentId === null) {
        return fail(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "La empresa debe adjuntar un documento al marcar el ítem como recibido.",
          { field: "document_id" },
        );
      }
      return { ok: true, action: "update", notifyEmpresa: false };
    }
    if (role === "coordinador" || role === "equipo") {
      if (solicitudNota === null) {
        return fail(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "El equipo debe indicar la solicitud (nota) al marcar el ítem como recibido.",
          { field: "solicitud_nota" },
        );
      }
      return { ok: true, action: "update", notifyEmpresa: true };
    }
  }

  if (from === "recibido" && to === "revisado") {
    if (role === "coordinador" || role === "equipo") {
      return {
        ok: true,
        action: "update",
        notifyEmpresa: solicitudNota !== null,
      };
    }
  }

  return fail(
    "CONFLICT_STATE",
    "Transición de lista de cotejo no permitida (TD-2).",
    { estado_actual: from, to, rol: role },
  );
}

/** Ruta de contrato (`/checklist/{id}/transition`) o slug de despliegue. */
export function matchChecklistRoute(
  method: string,
  pathOrUrl: string,
): boolean {
  if (method.toUpperCase() !== "POST") return false;
  const pathname = pathOrUrl.startsWith("http://") ||
      pathOrUrl.startsWith("https://")
    ? new URL(pathOrUrl).pathname
    : pathOrUrl.split("?")[0].split("#")[0];
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  if (segments[segments.length - 1] !== "transition") return false;
  return segments.includes("checklist") || segments.includes("ef-03-checklist");
}

/** `item_id` de la ruta (`/checklist/{uuid}/transition`) o del cuerpo (alias). */
export function extractItemId(
  pathOrUrl: string,
  body: Record<string, unknown>,
): string | null {
  const pathname = pathOrUrl.startsWith("http://") ||
      pathOrUrl.startsWith("https://")
    ? new URL(pathOrUrl).pathname
    : pathOrUrl.split("?")[0].split("#")[0];
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const index = segments.lastIndexOf("checklist");
  if (index >= 0 && index + 2 < segments.length) {
    const candidate = segments[index + 1];
    if (isUuid(candidate)) return candidate;
  }
  const fromBody = body.item_id;
  return typeof fromBody === "string" && isUuid(fromBody) ? fromBody : null;
}

function json(
  request: Request,
  config: ChecklistConfig,
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

function corsHeaders(
  request: Request,
  config: ChecklistConfig,
): Headers {
  const headers = new Headers();
  for (const [name, value] of buildCorsHeaders(request, config.cors)) {
    headers.set(name, value);
  }
  return headers;
}

/** Handler de EF-03 con dependencias inyectables (pruebas sin red). */
export function createChecklistTransitionHandler(
  config: ChecklistConfig,
  deps: ChecklistDeps,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const preflight = handlePreflight(request, config.cors);
    if (preflight !== null) return preflight;

    try {
      if (!matchChecklistRoute(request.method, request.url)) {
        return json(request, config, {
          error: { code: "NOT_FOUND", message: "Ruta no disponible." },
        }, 404);
      }

      const context = await authenticate(request, {
        ...config.auth,
        verifyProfile: (ctx) => deps.client.verifyProfile(ctx),
      });
      const body = await readJsonObject(request);

      const itemId = extractItemId(request.url, body);
      if (itemId === null) {
        throw new ApiError(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "Falta el identificador del ítem (item_id).",
          { param: "item_id" },
        );
      }

      // 404 antes de revelar nada; el ítem de otro tenant se trata como no-miembro (403).
      const item = await deps.client.fetchChecklistItemById(itemId);
      if (item === null) {
        throw new ApiError("NOT_FOUND", "El ítem no existe.");
      }
      const diagnostic = await deps.client.fetchDiagnostic(item.diagnosticId);
      if (
        diagnostic === null ||
        diagnostic.organizationId !== context.organizationId
      ) {
        throw new ApiError("FORBIDDEN_NOT_MEMBER", undefined, {
          diagnostic_id: item.diagnosticId,
        });
      }

      const authorization = await guardEndpoint(
        context,
        CHECKLIST_ENDPOINT,
        { item_id: itemId },
        {
          resolveRole: deps.client.resolveRole,
          resolveDiagnosticId: () => Promise.resolve(item.diagnosticId),
        },
      );
      const role = authorization.diagnosticRole as string;

      const to = body.to;
      if (typeof to !== "string" || !TRANSITION_TARGETS.includes(to)) {
        throw new ApiError(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "El campo to debe ser recibido, revisado o validado_r1.",
          { field: "to", allowed: TRANSITION_TARGETS },
        );
      }
      const documentIdRaw = body.document_id;
      if (
        documentIdRaw !== undefined && documentIdRaw !== null &&
        (typeof documentIdRaw !== "string" || !isUuid(documentIdRaw))
      ) {
        throw new ApiError(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "document_id debe ser un UUID.",
          { field: "document_id" },
        );
      }
      const documentId = typeof documentIdRaw === "string"
        ? documentIdRaw
        : null;

      const rawNota = body.solicitud_nota;
      let solicitudNota: string | null = null;
      if (rawNota !== undefined && rawNota !== null) {
        if (typeof rawNota !== "string") {
          throw new ApiError(
            "VALIDATION_PARAMETRO_REQUERIDO",
            "solicitud_nota debe ser texto.",
            { field: "solicitud_nota" },
          );
        }
        const trimmed = rawNota.trim();
        if (trimmed.length > SOLICITUD_NOTA_MAX) {
          throw new ApiError(
            "VALIDATION_PARAMETRO_REQUERIDO",
            "solicitud_nota supera el máximo permitido.",
            { field: "solicitud_nota", max: SOLICITUD_NOTA_MAX },
          );
        }
        solicitudNota = requireNonEmpty(trimmed);
      }

      const evaluation = evaluateTransition({
        role,
        from: item.estado,
        to,
        documentId,
        solicitudNota,
      });
      if (!evaluation.ok) {
        throw new ApiError(
          evaluation.code,
          evaluation.message,
          evaluation.details,
        );
      }

      // El documento debe existir y ser del mismo diagnóstico/tenant (anti-enumeración).
      if (documentId !== null) {
        const document = await deps.client.fetchDocumentById(documentId);
        if (
          document === null ||
          document.organizationId !== context.organizationId ||
          document.diagnosticId !== item.diagnosticId
        ) {
          throw new ApiError(
            "VALIDATION_PARAMETRO_REQUERIDO",
            "El documento adjunto no es válido para este diagnóstico.",
            { field: "document_id", reason: "documento_no_valido" },
          );
        }
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
        endpoint: CHECKLIST_ENDPOINT,
        item_id: itemId,
        to,
        document_id: documentId,
        solicitud_nota: solicitudNota,
      }));

      const result = await deps.client.callRpc<RpcResult>(
        "fn_transition_checklist_item",
        {
          p_user_id: context.userId,
          p_item_id: itemId,
          p_to: to,
          p_document_id: documentId,
          p_solicitud_nota: solicitudNota,
          p_idempotency_key: idempotencyKey,
          p_request_hash: requestHash,
        },
      );
      if (result.ok !== true) {
        throw new ApiError(
          typeof result.code === "string" ? result.code : "INTERNAL_ERROR",
          typeof result.message === "string" ? result.message : undefined,
          result.details ?? {},
        );
      }

      if (result.replayed !== true) {
        await notifyEmpresa(config, deps, item, {
          to,
          solicitudNota,
          notify: evaluation.notifyEmpresa,
        });
        await broadcastChecklist(config, deps, diagnostic.organizationId, {
          diagnosticId: item.diagnosticId,
          itemCode: item.itemCode,
          estado: to,
        });
      }

      const data = (result.data ?? {}) as Record<string, unknown>;
      return json(request, config, {
        item_id: typeof data.item_id === "string" ? data.item_id : itemId,
        item_code: typeof data.item_code === "string"
          ? data.item_code
          : item.itemCode,
        estado: typeof data.estado === "string" ? data.estado : to,
        document_id: typeof data.document_id === "string"
          ? data.document_id
          : (documentId ?? item.documentId),
      });
    } catch (error) {
      return errorResponse(error, { headers: corsHeaders(request, config) });
    }
  };
}

async function notifyEmpresa(
  _config: ChecklistConfig,
  deps: ChecklistDeps,
  item: ChecklistItemRow,
  input: { to: string; solicitudNota: string | null; notify: boolean },
): Promise<void> {
  if (!input.notify) return;
  try {
    const users = await deps.client.listRoleUserIds(
      item.diagnosticId,
      "empresa",
    );
    if (users.length === 0) return;
    const payload = {
      item_id: item.id,
      item_code: item.itemCode,
      estado: input.to,
      solicitud_nota: input.solicitudNota,
    };
    await deps.client.insertNotifications(
      users.map((userId) => ({
        userId,
        kind: "validacion",
        payload,
      })),
    );
  } catch {
    // Efecto post-commit best-effort: no revierte la transición ya auditada.
  }
}

async function broadcastChecklist(
  config: ChecklistConfig,
  deps: ChecklistDeps,
  organizationId: string,
  info: { diagnosticId: string; itemCode: string; estado: string },
): Promise<void> {
  const broadcast = deps.broadcast ?? broadcastRealtime;
  await broadcast(config.realtime, [
    {
      topic: diagnosticTopic(info.diagnosticId),
      event: "checklist_updated",
      payload: { item_code: info.itemCode, estado: info.estado },
    },
    {
      topic: organizationTopic(organizationId),
      event: "kanban_refresh",
      payload: { diagnostic_id: info.diagnosticId },
    },
  ]);
}
