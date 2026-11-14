/**
 * HIDRIA — EF-04 `cat/{diagnostic_id}/submit` y `…/validate-r2` (M4 · CAT).
 *
 * Tarea `task-126` (F1-07b). Contrato `docs/04` §4 EF-04; banco A1-v1 (47 preguntas) en
 * `cat_items` (docs/03 §7).
 *
 * `submit` (empresa/coordinador/equipo): valida que todas las preguntas aplicables del banco
 * tengan respuesta (valor, `no_se` o `na`) y que las resueltas en campo con evidencia tengan
 * `document_id`; cambia `cat_estado: en_captura → en_revision` con RPC atómica (auditoría +
 * idempotencia).
 * `validate-r2` (coordinador/equipo): exige ficha `BIT-R2-*` **cerrada** del mismo diagnóstico y
 * `cat_estado='en_revision'`; cambia a `validado_r2` (gate F3) con auditoría `approve`.
 *
 * Post-commit: notificación a empresa y evento `cat_validated` (validate-r2) + `kanban_refresh`.
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
  CatItemRow,
  CatResponseRow,
  DiagnosticRow,
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

export const CAT_VERSION = "A1-v1";
export const SUBMIT_ENDPOINT = "EF-04.submit";
export const VALIDATE_R2_ENDPOINT = "EF-04.validate-r2";

export type CatRoute = "submit" | "validate-r2";

export interface CatClient {
  readonly resolveRole: ResolveDiagnosticRole;
  readonly verifyProfile: (
    context: import("./auth.ts").AuthContext,
  ) => Promise<boolean>;
  readonly fetchDiagnostic: (
    diagnosticId: string,
  ) => Promise<DiagnosticRow | null>;
  readonly fetchCatItems: (version: string) => Promise<CatItemRow[]>;
  readonly fetchCatResponses: (
    diagnosticId: string,
  ) => Promise<CatResponseRow[]>;
  readonly fetchLogbookEntryById: (entryId: string) => Promise<
    | { id: string; diagnosticId: string; clave: string; estado: string }
    | null
  >;
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

export interface CatConfig {
  readonly auth: AuthenticateOptions;
  readonly cors: CorsConfig;
  readonly realtime: RealtimeConfig;
}

export interface CatDeps {
  readonly client: CatClient;
  readonly broadcast?: typeof broadcastRealtime;
}

export interface CatCompletenessOk {
  readonly ok: true;
}
export interface CatCompletenessFail {
  readonly ok: false;
  readonly faltantes: string[];
  readonly pendientes: number;
}
export type CatCompleteness = CatCompletenessOk | CatCompletenessFail;

function responseValueHas(valor: unknown, contains: unknown): boolean {
  if (valor === null || valor === undefined) return false;
  if (Array.isArray(valor)) {
    return valor.some((entry) =>
      entry === contains || JSON.stringify(entry) === JSON.stringify(contains)
    );
  }
  if (typeof valor === "string") {
    return valor === contains || valor.includes(String(contains));
  }
  return JSON.stringify(valor).includes(String(contains));
}

/** Condición `{depends_on, contains}`: el ítem aplica si la respuesta dependiente contiene el valor. */
export function conditionApplies(
  condition: Record<string, unknown> | null,
  itemByCode: Map<string, CatItemRow>,
  responseByItemId: Map<string, CatResponseRow>,
): boolean {
  if (condition === null) return true;
  const dependsOn = condition.depends_on;
  const contains = condition.contains;
  if (typeof dependsOn !== "string" || contains === undefined) return true;
  const dependency = itemByCode.get(dependsOn);
  if (dependency === undefined) return true;
  const response = responseByItemId.get(dependency.id);
  if (response === undefined) return true; // sin dato ⇒ se exige (fail-safe)
  if (response.noSe === true || response.na === true) return false;
  return responseValueHas(response.valor, contains);
}

/**
 * Completitud del CAT contra el banco A1-v1: toda pregunta aplicable debe tener respuesta
 * (`valor` no nulo, `no_se` o `na`) y, si `admite_evidencia` y se resolvió en campo, `document_id`.
 */
export function evaluateCatCompleteness(
  items: readonly CatItemRow[],
  responses: readonly CatResponseRow[],
): CatCompleteness {
  const itemByCode = new Map(items.map((item) => [item.codigo, item]));
  const responseByItemId = new Map(
    responses.map((response) => [response.itemId, response]),
  );
  const faltantes: string[] = [];
  for (const item of items) {
    if (!conditionApplies(item.condicion, itemByCode, responseByItemId)) {
      continue;
    }
    const response = responseByItemId.get(item.id);
    if (response === undefined) {
      faltantes.push(item.codigo);
      continue;
    }
    const answered = response.na === true || response.noSe === true ||
      (response.valor !== null && response.valor !== undefined &&
        !(typeof response.valor === "string" && response.valor.trim() === ""));
    if (!answered) {
      faltantes.push(item.codigo);
      continue;
    }
    if (
      item.admiteEvidencia && response.resueltaEnCampo &&
      response.documentId === null
    ) {
      faltantes.push(item.codigo);
    }
  }
  return faltantes.length === 0
    ? { ok: true }
    : { ok: false, faltantes, pendientes: faltantes.length };
}

/** Ruta `/cat/{id}/submit|validate-r2` (contrato) o slug `/ef-04-cat/...`. */
export function matchCatRoute(
  method: string,
  pathOrUrl: string,
): { route: CatRoute; diagnosticId: string | null } | null {
  if (method.toUpperCase() !== "POST") return null;
  const pathname = pathOrUrl.startsWith("http://") ||
      pathOrUrl.startsWith("https://")
    ? new URL(pathOrUrl).pathname
    : pathOrUrl.split("?")[0].split("#")[0];
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const action = segments[segments.length - 1];
  if (action !== "submit" && action !== "validate-r2") return null;
  if (!segments.includes("cat") && !segments.includes("ef-04-cat")) return null;
  const categoryIndex = segments.includes("cat")
    ? segments.lastIndexOf("cat")
    : segments.lastIndexOf("ef-04-cat");
  if (categoryIndex < 0 || categoryIndex + 3 !== segments.length) return null;
  const candidate = segments[categoryIndex + 1];
  return {
    route: action,
    diagnosticId: isUuid(candidate) ? candidate : null,
  };
}

function json(
  request: Request,
  config: CatConfig,
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

function corsHeaders(request: Request, config: CatConfig): Headers {
  const headers = new Headers();
  for (const [name, value] of buildCorsHeaders(request, config.cors)) {
    headers.set(name, value);
  }
  return headers;
}

/** Handler de EF-04 con dependencias inyectables (pruebas sin red). */
export function createCatHandler(
  config: CatConfig,
  deps: CatDeps,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const preflight = handlePreflight(request, config.cors);
    if (preflight !== null) return preflight;

    try {
      const matched = matchCatRoute(request.method, request.url);
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
      const diagnosticId = matched.diagnosticId ??
        (typeof body.diagnostic_id === "string" ? body.diagnostic_id : null);
      if (diagnosticId === null) {
        throw new ApiError(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "Falta diagnostic_id.",
          { param: "diagnostic_id" },
        );
      }

      const endpoint = matched.route === "submit"
        ? SUBMIT_ENDPOINT
        : VALIDATE_R2_ENDPOINT;
      const authorization = await guardEndpoint(
        context,
        endpoint,
        { diagnostic_id: diagnosticId },
        { resolveRole: deps.client.resolveRole },
      );
      void authorization;

      const diagnostic = await deps.client.fetchDiagnostic(diagnosticId);
      if (
        diagnostic === null ||
        diagnostic.organizationId !== context.organizationId
      ) {
        throw new ApiError("FORBIDDEN_NOT_MEMBER", undefined, {
          diagnostic_id: diagnosticId,
        });
      }

      if (matched.route === "submit") {
        if (diagnostic.catEstado !== "en_captura") {
          throw new ApiError("CONFLICT_STATE", undefined, {
            cat_estado: diagnostic.catEstado,
            motivo: "submit_solo_desde_en_captura",
          });
        }
      } else if (diagnostic.catEstado !== "en_revision") {
        throw new ApiError("CONFLICT_STATE", undefined, {
          cat_estado: diagnostic.catEstado,
          motivo: "validate_solo_desde_en_revision",
        });
      }

      const items = await deps.client.fetchCatItems(CAT_VERSION);
      const responses = await deps.client.fetchCatResponses(diagnosticId);
      const completeness = evaluateCatCompleteness(items, responses);
      if (!completeness.ok) {
        throw new ApiError(
          "VALIDATION_CAT_INCOMPLETO",
          "El CAT tiene preguntas obligatorias sin respuesta.",
          {
            faltantes: completeness.faltantes,
            pendientes: completeness.pendientes,
          },
        );
      }

      let fichaR2Id: string | null = null;
      if (matched.route === "validate-r2") {
        const rawFicha = body.r2_logbook_id ?? body.ficha_r2_id;
        if (typeof rawFicha !== "string" || !isUuid(rawFicha)) {
          throw new ApiError(
            "VALIDATION_PARAMETRO_REQUERIDO",
            "validate-r2 exige r2_logbook_id (ficha BIT-R2).",
            { field: "r2_logbook_id" },
          );
        }
        fichaR2Id = rawFicha;
        const ficha = await deps.client.fetchLogbookEntryById(fichaR2Id);
        if (
          ficha === null || ficha.diagnosticId !== diagnosticId ||
          ficha.clave !== "R2" || ficha.estado !== "cerrada"
        ) {
          throw new ApiError(
            "GATE_R2_FICHA",
            "validate-r2 exige una ficha BIT-R2 cerrada del diagnóstico.",
            { reason: "ficha_r2_no_valida" },
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
        endpoint,
        diagnostic_id: diagnosticId,
        cat_version: CAT_VERSION,
        ficha_r2_id: fichaR2Id,
      }));

      const result = matched.route === "submit"
        ? await deps.client.callRpc<RpcResult>("fn_submit_cat", {
          p_user_id: context.userId,
          p_diagnostic_id: diagnosticId,
          p_idempotency_key: idempotencyKey,
          p_request_hash: requestHash,
        })
        : await deps.client.callRpc<RpcResult>("fn_validate_cat_r2", {
          p_user_id: context.userId,
          p_diagnostic_id: diagnosticId,
          p_ficha_r2_id: fichaR2Id,
          p_idempotency_key: idempotencyKey,
          p_request_hash: requestHash,
        });
      if (result.ok !== true) {
        throw new ApiError(
          typeof result.code === "string" ? result.code : "INTERNAL_ERROR",
          typeof result.message === "string" ? result.message : undefined,
          result.details ?? {},
        );
      }

      if (matched.route === "validate-r2" && result.replayed !== true) {
        await notifyEmpresa(deps, diagnosticId, {
          diagnosticId,
          fichaR2Id,
        });
        await broadcastCat(config, deps, diagnostic.organizationId, {
          diagnosticId,
          catEstado: "validado_r2",
        });
      }

      const data = (result.data ?? {}) as Record<string, unknown>;
      return json(request, config, {
        diagnostic_id: diagnosticId,
        cat_estado: typeof data.cat_estado === "string"
          ? data.cat_estado
          : (matched.route === "submit" ? "en_revision" : "validado_r2"),
        pendientes: typeof data.pendientes === "number" ? data.pendientes : 0,
      });
    } catch (error) {
      return errorResponse(error, {
        headers: corsHeaders(request, config),
      });
    }
  };
}

async function notifyEmpresa(
  deps: CatDeps,
  diagnosticId: string,
  info: { diagnosticId: string; fichaR2Id: string | null },
): Promise<void> {
  try {
    const users = await deps.client.listRoleUserIds(diagnosticId, "empresa");
    if (users.length === 0) return;
    await deps.client.insertNotifications(
      users.map((userId) => ({
        userId,
        kind: "validacion",
        payload: {
          diagnostic_id: info.diagnosticId,
          cat_estado: "validado_r2",
          ficha_r2_id: info.fichaR2Id,
        },
      })),
    );
  } catch {
    // Post-commit best-effort.
  }
}

async function broadcastCat(
  config: CatConfig,
  deps: CatDeps,
  organizationId: string,
  info: { diagnosticId: string; catEstado: string },
): Promise<void> {
  const broadcast = deps.broadcast ?? broadcastRealtime;
  await broadcast(config.realtime, [
    {
      topic: diagnosticTopic(info.diagnosticId),
      event: "cat_validated",
      payload: { cat_estado: info.catEstado },
    },
    {
      topic: organizationTopic(organizationId),
      event: "kanban_refresh",
      payload: { diagnostic_id: info.diagnosticId },
    },
  ]);
}
