/**
 * HIDRIA — EF-06 `ivoh/{diagnostic_id}/score` y `…/validate-r4` (M8 · IVOH).
 *
 * Tarea `task-158` (F1-10). Contrato ADR-015 (D4/D6/D15/D16):
 * - `score`: borrador parcial 1–6 factores; RPC `fn_save_ivoh_score`; respuesta
 *   `{diagnostic_id, version_id, estado:'borrador', factores_guardados}` sin total/semáforo.
 * - `validate-r4`: 6/6 + ficha BIT-R4 cerrada; RPC `fn_validate_ivoh_r4`; respuesta con
 *   `total/semaforo/semaforo_label/por_factor`; post-commit `ivoh_validated`.
 * La EF **no calcula** IVOH/semáforo (autoridad: RPC/vista server-side).
 */

import {
  authenticate,
  type AuthenticateOptions,
  guardEndpoint,
  isUuid,
  type ResolveDiagnosticRole,
} from "./auth.ts";
import { buildCorsHeaders, type CorsConfig, handlePreflight } from "./cors.ts";
import type { DiagnosticRow, RpcResult } from "./db.ts";
import { ApiError, errorResponse } from "./errors.ts";
import { readJsonObject } from "./http.ts";
import {
  broadcastRealtime,
  diagnosticTopic,
  type RealtimeConfig,
} from "./realtime.ts";
import { sha256Hex } from "./r2.ts";

export type IvohAction = "score" | "validate-r4";
export const IVOH_EVIDENCE_TYPES = [
  "documento",
  "activo",
  "indicador",
  "ficha",
] as const;
export type IvohEvidenceType = typeof IVOH_EVIDENCE_TYPES[number];

export interface IvohEvidence {
  readonly tipo: IvohEvidenceType;
  readonly ref: string;
  readonly descripcion?: string;
}

export interface IvohScoreInput {
  readonly factor_code: string;
  readonly puntaje: number;
  readonly justificacion: string;
  readonly evidencia: IvohEvidence[];
}

export interface IvohClient {
  readonly resolveRole: ResolveDiagnosticRole;
  readonly verifyProfile: (
    context: import("./auth.ts").AuthContext,
  ) => Promise<boolean>;
  readonly fetchDiagnostic: (
    diagnosticId: string,
  ) => Promise<DiagnosticRow | null>;
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

export interface IvohConfig {
  readonly auth: AuthenticateOptions;
  readonly cors: CorsConfig;
  readonly realtime: RealtimeConfig;
}

export interface IvohDeps {
  readonly client: IvohClient;
  readonly broadcast?: typeof broadcastRealtime;
}

/** `/ivoh/{diagnostic_id}/score|validate-r4` (contrato) o slug `ef-06-ivoh`. */
export function matchIvohRoute(
  method: string,
  pathOrUrl: string,
): { action: IvohAction; diagnosticId: string | null } | null {
  if (method.toUpperCase() !== "POST") return null;
  const pathname = pathOrUrl.startsWith("http://") ||
      pathOrUrl.startsWith("https://")
    ? new URL(pathOrUrl).pathname
    : pathOrUrl.split("?")[0].split("#")[0];
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const action = segments[segments.length - 1];
  if (action !== "score" && action !== "validate-r4") return null;
  if (!segments.includes("ivoh") && !segments.includes("ef-06-ivoh")) {
    return null;
  }
  const index = segments.includes("ivoh")
    ? segments.lastIndexOf("ivoh")
    : segments.lastIndexOf("ef-06-ivoh");
  if (index + 3 !== segments.length) return null;
  const candidate = segments[index + 1];
  return {
    action,
    diagnosticId: isUuid(candidate) ? candidate : null,
  };
}

function evidenceError(field: string, message: string): ApiError {
  return new ApiError("VALIDATION_PARAMETRO_REQUERIDO", message, { field });
}

/**
 * Valida el body de `score`: 1–6 factores únicos, puntaje 0–10 paso 0.5, justificación
 * no vacía y evidencia ≥1 de la allowlist ADR D15.
 */
export function validateScores(raw: unknown): IvohScoreInput[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 6) {
    throw evidenceError(
      "scores",
      "scores debe ser un arreglo de 1 a 6 factores.",
    );
  }
  const seen = new Set<string>();
  const result: IvohScoreInput[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      throw evidenceError("scores", "Cada factor debe ser un objeto.");
    }
    const item = entry as Record<string, unknown>;
    const factor = item.factor_code;
    if (typeof factor !== "string" || !/^F[1-6]$/.test(factor)) {
      throw evidenceError("factor_code", "factor_code debe ser F1..F6.");
    }
    if (seen.has(factor)) {
      throw evidenceError("factor_code", "factor_code duplicado.");
    }
    seen.add(factor);
    const puntaje = item.puntaje;
    if (
      typeof puntaje !== "number" || !Number.isFinite(puntaje) || puntaje < 0 ||
      puntaje > 10 || Math.abs(puntaje * 2 - Math.round(puntaje * 2)) > 1e-9
    ) {
      throw evidenceError(
        "puntaje",
        "puntaje debe ser 0–10 en pasos de 0.5.",
      );
    }
    const justificacion = typeof item.justificacion === "string"
      ? item.justificacion.trim()
      : "";
    if (justificacion.length < 1 || justificacion.length > 2000) {
      throw evidenceError(
        "justificacion",
        "justificacion es obligatoria (1–2000 caracteres).",
      );
    }
    if (!Array.isArray(item.evidencia) || item.evidencia.length < 1) {
      throw evidenceError(
        "evidencia",
        "Cada factor exige al menos una evidencia.",
      );
    }
    if (item.evidencia.length > 10) {
      throw evidenceError("evidencia", "Máximo 10 evidencias por factor.");
    }
    const evidencia: IvohEvidence[] = [];
    for (const evidence of item.evidencia) {
      if (typeof evidence !== "object" || evidence === null) {
        throw evidenceError("evidencia", "Cada evidencia debe ser un objeto.");
      }
      const rawEvidence = evidence as Record<string, unknown>;
      const tipo = rawEvidence.tipo;
      if (
        typeof tipo !== "string" ||
        !(IVOH_EVIDENCE_TYPES as readonly string[]).includes(tipo)
      ) {
        throw evidenceError(
          "evidencia.tipo",
          "tipo de evidencia no permitido (documento|activo|indicador|ficha).",
        );
      }
      const ref = typeof rawEvidence.ref === "string"
        ? rawEvidence.ref.trim()
        : "";
      if (ref.length < 1 || ref.length > 500) {
        throw evidenceError(
          "evidencia.ref",
          "ref de evidencia obligatorio (1–500 caracteres).",
        );
      }
      const descripcion = rawEvidence.descripcion;
      if (
        descripcion !== undefined &&
        (typeof descripcion !== "string" || descripcion.length > 500)
      ) {
        throw evidenceError(
          "evidencia.descripcion",
          "descripcion de evidencia inválida.",
        );
      }
      evidencia.push({
        tipo: tipo as IvohEvidenceType,
        ref,
        ...(typeof descripcion === "string" && descripcion.trim().length > 0
          ? { descripcion: descripcion.trim() }
          : {}),
      });
    }
    result.push({
      factor_code: factor,
      puntaje,
      justificacion,
      evidencia,
    });
  }
  return result.sort((a, b) => a.factor_code.localeCompare(b.factor_code));
}

function json(
  request: Request,
  config: IvohConfig,
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

function corsHeaders(request: Request, config: IvohConfig): Headers {
  const headers = new Headers();
  for (const [name, value] of buildCorsHeaders(request, config.cors)) {
    headers.set(name, value);
  }
  return headers;
}

/** Handler de EF-06 con dependencias inyectables. */
export function createIvohHandler(
  config: IvohConfig,
  deps: IvohDeps,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const preflight = handlePreflight(request, config.cors);
    if (preflight !== null) return preflight;

    try {
      const matched = matchIvohRoute(request.method, request.url);
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
      if (diagnosticId === null || !isUuid(diagnosticId)) {
        throw new ApiError(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "Falta diagnostic_id (UUID) en la ruta.",
          { field: "diagnostic_id" },
        );
      }

      const diagnostic = await deps.client.fetchDiagnostic(diagnosticId);
      if (
        diagnostic === null ||
        diagnostic.organizationId !== context.organizationId
      ) {
        throw new ApiError("FORBIDDEN_NOT_MEMBER", undefined, {
          diagnostic_id: diagnosticId,
        });
      }
      const endpoint = matched.action === "score"
        ? "EF-06.score"
        : "EF-06.validate-r4";
      const authorization = await guardEndpoint(
        context,
        endpoint,
        { diagnostic_id: diagnosticId },
        { resolveRole: deps.client.resolveRole },
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

      if (matched.action === "score") {
        const scores = validateScores(body.scores);
        const requestHash = await sha256Hex(JSON.stringify({
          endpoint,
          diagnostic_id: diagnosticId,
          scores,
        }));
        const result = await deps.client.callRpc<RpcResult>(
          "fn_save_ivoh_score",
          {
            p_user_id: context.userId,
            p_diagnostic_id: diagnosticId,
            p_scores: scores,
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
        const data = (result.data ?? {}) as Record<string, unknown>;
        return json(request, config, {
          diagnostic_id: diagnosticId,
          version_id: typeof data.version_id === "string"
            ? data.version_id
            : null,
          estado: typeof data.estado === "string" ? data.estado : "borrador",
          factores_guardados: typeof data.factores_guardados === "number"
            ? data.factores_guardados
            : scores.length,
        });
      }

      const rawFicha = body.r4_logbook_id;
      if (typeof rawFicha !== "string" || !isUuid(rawFicha)) {
        throw new ApiError(
          "VALIDATION_PARAMETRO_REQUERIDO",
          "r4_logbook_id debe ser un UUID.",
          { field: "r4_logbook_id" },
        );
      }
      const fichaR4Id = rawFicha;
      const ficha = await deps.client.fetchLogbookEntryById(fichaR4Id);
      if (
        ficha === null || ficha.diagnosticId !== diagnosticId ||
        ficha.clave !== "R4" || ficha.estado !== "cerrada"
      ) {
        throw new ApiError(
          "GATE_R4_FICHA",
          "validate-r4 exige una ficha BIT-R4 cerrada del diagnóstico.",
          { reason: "ficha_r4_no_valida" },
        );
      }
      const requestHash = await sha256Hex(JSON.stringify({
        endpoint,
        diagnostic_id: diagnosticId,
        r4_logbook_id: fichaR4Id,
      }));
      const result = await deps.client.callRpc<RpcResult>(
        "fn_validate_ivoh_r4",
        {
          p_user_id: context.userId,
          p_diagnostic_id: diagnosticId,
          p_r4_logbook_id: fichaR4Id,
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
      const data = (result.data ?? {}) as Record<string, unknown>;
      if (result.replayed !== true) {
        await notifyMembers(deps, diagnosticId, {
          total: typeof data.total === "number" ? data.total : null,
          semaforo: typeof data.semaforo === "string" ? data.semaforo : null,
          semaforoLabel: typeof data.semaforo_label === "string"
            ? data.semaforo_label
            : null,
        });
        await broadcastValidated(config, deps, diagnosticId, {
          total: typeof data.total === "number" ? data.total : null,
          semaforo: typeof data.semaforo === "string" ? data.semaforo : null,
          semaforoLabel: typeof data.semaforo_label === "string"
            ? data.semaforo_label
            : null,
        });
      }
      return json(request, config, {
        diagnostic_id: diagnosticId,
        total: typeof data.total === "number" ? data.total : null,
        semaforo: typeof data.semaforo === "string" ? data.semaforo : null,
        semaforo_label: typeof data.semaforo_label === "string"
          ? data.semaforo_label
          : null,
        por_factor: Array.isArray(data.por_factor) ? data.por_factor : [],
      });
    } catch (error) {
      return errorResponse(error, {
        headers: corsHeaders(request, config),
      });
    }
  };
}

async function notifyMembers(
  deps: IvohDeps,
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
          ivoh_validated: true,
          ...info,
        },
      })),
    );
  } catch {
    // Post-commit best-effort.
  }
}

async function broadcastValidated(
  config: IvohConfig,
  deps: IvohDeps,
  diagnosticId: string,
  info: Record<string, unknown>,
): Promise<void> {
  const broadcast = deps.broadcast ?? broadcastRealtime;
  await broadcast(config.realtime, [
    {
      topic: diagnosticTopic(diagnosticId),
      event: "ivoh_validated",
      payload: { ...info },
    },
  ]);
}
