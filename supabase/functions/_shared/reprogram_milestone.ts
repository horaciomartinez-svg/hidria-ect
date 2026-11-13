/**
 * HIDRIA — EF-12 `reprogram-milestone` (M2/M10).
 *
 * Tarea `task-95` (F1-04). Contrato `docs/04` §4 EF-12 y nota TD-1 (semáforo).
 *
 * Decisiones del revisor (2026-11-12): `fecha_original` se declara la primera vez y en las
 * siguientes debe coincidir con la `fecha_nueva` previa (lo valida la RPC con el historial
 * `milestone_reprogramming`); `fecha_nueva` dentro de las 6 semanas; ficha más reciente del
 * hito o `VALIDATION_HITO_SIN_FICHA`; semáforo: 1.ª reprogramación con `causa='empresa'` ⇒
 * `amarillo`, `≥2` ⇒ `rojo`; «vencido sin cerrar» es tarea aparte.
 */

import {
  authenticate,
  type AuthenticateOptions,
  guardEndpoint,
} from "./auth.ts";
import type { CorsConfig } from "./cors.ts";
import { handlePreflight } from "./cors.ts";
import type { RpcResult, ServiceClient } from "./db.ts";
import { ApiError, errorResponse } from "./errors.ts";
import { readJsonObject } from "./http.ts";
import {
  broadcastRealtime,
  organizationTopic,
  type RealtimeConfig,
} from "./realtime.ts";
import { sha256Hex } from "./r2.ts";

export const REPROGRAM_MILESTONE_ENDPOINT = "EF-12";

export const MILESTONES: readonly string[] = [
  "V1",
  "V2",
  "V3",
  "R1",
  "R2",
  "R3",
  "R4",
  "R5",
];

export const CAUSAS: readonly string[] = ["empresa", "equipo", "externa"];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_JUSTIFICACION = 20;
const SIX_WEEKS_DAYS = 42;

export interface ReprogramConfig {
  readonly auth: AuthenticateOptions;
  readonly cors: CorsConfig;
  readonly realtime: RealtimeConfig;
}

export interface ReprogramDeps {
  readonly client: ServiceClient;
  /** Inyectable en pruebas; por defecto, el broadcaster real. */
  readonly broadcast?: typeof broadcastRealtime;
}

export interface ReprogramBody {
  hito: string;
  fechaOriginal: string;
  fechaNueva: string;
  justificacion: string;
  causa: string;
}

function buildCors(request: Request, config: ReprogramConfig): Headers {
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

function json(
  request: Request,
  config: ReprogramConfig,
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

/** Ruta de contrato (`/diagnostics/{id}/reprogram-milestone`) o slug de despliegue. */
export function matchReprogramRoute(
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
  return last === "reprogram-milestone" ||
    segments.includes("ef-12-reprogram-milestone");
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

function validationFailure(
  field: string,
  reason: string,
  extra: Record<string, unknown> = {},
): never {
  throw new ApiError("VALIDATION_REPROGRAMACION", undefined, {
    field,
    reason,
    ...extra,
  });
}

/** Valida y normaliza el cuerpo (errores `422 VALIDATION_REPROGRAMACION`). */
export function validateReprogramBody(
  body: Record<string, unknown>,
): ReprogramBody {
  const hito = body.hito;
  if (typeof hito !== "string" || !MILESTONES.includes(hito)) {
    validationFailure("hito", "hito_invalido", { allowed: MILESTONES });
  }
  const fechaOriginal = body.fecha_original;
  if (typeof fechaOriginal !== "string" || !isValidDate(fechaOriginal)) {
    validationFailure("fecha_original", "fecha_invalida");
  }
  const fechaNueva = body.fecha_nueva;
  if (typeof fechaNueva !== "string" || !isValidDate(fechaNueva)) {
    validationFailure("fecha_nueva", "fecha_invalida");
  }
  if (fechaNueva < fechaOriginal) {
    validationFailure("fecha_nueva", "anterior_a_original", {
      fecha_original: fechaOriginal,
    });
  }
  const justificacion = typeof body.justificacion === "string"
    ? body.justificacion.trim()
    : "";
  if (justificacion.length < MIN_JUSTIFICACION) {
    validationFailure("justificacion", "justificacion_corta", {
      minimo_caracteres: MIN_JUSTIFICACION,
    });
  }
  const causa = body.causa;
  if (typeof causa !== "string" || !CAUSAS.includes(causa)) {
    validationFailure("causa", "causa_invalida", { allowed: CAUSAS });
  }
  return { hito, fechaOriginal, fechaNueva, justificacion, causa };
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Handler de EF-12 con dependencias inyectables. */
export function createReprogramMilestoneHandler(
  config: ReprogramConfig,
  deps: ReprogramDeps,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const preflight = handlePreflight(request, config.cors);
    if (preflight !== null) return preflight;

    try {
      if (!matchReprogramRoute(request.method, request.url)) {
        return json(request, config, {
          error: { code: "NOT_FOUND", message: "Ruta no disponible." },
        }, 404);
      }

      const context = await authenticate(request, {
        ...config.auth,
        verifyProfile: (ctx) => deps.client.verifyProfile(ctx),
      });
      const parsed = await readJsonObject(request);
      const body = validateReprogramBody(parsed);

      const authorization = await guardEndpoint(
        context,
        REPROGRAM_MILESTONE_ENDPOINT,
        {
          diagnostic_id: typeof parsed.diagnostic_id === "string"
            ? parsed.diagnostic_id
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
      const windowEnd = addDays(diagnostic.fechaInicio, SIX_WEEKS_DAYS);
      if (body.fechaNueva > windowEnd) {
        validationFailure("fecha_nueva", "fuera_de_ventana_6_semanas", {
          fecha_maxima: windowEnd,
        });
      }

      const ficha = await deps.client.fetchLatestFicha(
        diagnosticId,
        body.hito,
      );
      if (ficha === null) {
        throw new ApiError(
          "VALIDATION_HITO_SIN_FICHA",
          "No existe ficha de bitácora para el hito a reprogramar.",
          { hito: body.hito },
        );
      }

      const idempotencyKey = request.headers.get("idempotency-key");
      if (idempotencyKey !== null && !isUuidLike(idempotencyKey)) {
        throw new ApiError(
          "VALIDATION_IDEMPOTENCY_KEY",
          "La cabecera Idempotency-Key debe ser un UUID.",
          { header: "Idempotency-Key" },
        );
      }
      const requestHash = await sha256Hex(JSON.stringify({
        endpoint: REPROGRAM_MILESTONE_ENDPOINT,
        diagnostic_id: diagnosticId,
        hito: body.hito,
        fecha_original: body.fechaOriginal,
        fecha_nueva: body.fechaNueva,
        justificacion: body.justificacion,
        causa: body.causa,
      }));

      const result = await deps.client.callRpc<RpcResult>(
        "fn_reprogram_milestone",
        {
          p_user_id: context.userId,
          p_diagnostic_id: diagnosticId,
          p_hito: body.hito,
          p_fecha_original: body.fechaOriginal,
          p_fecha_nueva: body.fechaNueva,
          p_justificacion: body.justificacion,
          p_causa: body.causa,
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
        // Post-commit best-effort: señal de relectura del Kanban (docs/04 §7, todas las EF).
        const broadcast = deps.broadcast ?? broadcastRealtime;
        await broadcast(config.realtime, [
          {
            topic: organizationTopic(diagnostic.organizationId),
            event: "kanban_refresh",
            payload: { diagnostic_id: diagnosticId },
          },
        ]);
      }

      const data = (result.data ?? {}) as Record<string, unknown>;
      return json(request, config, {
        hito: typeof data.hito === "string" ? data.hito : body.hito,
        fecha_nueva: typeof data.fecha_nueva === "string"
          ? data.fecha_nueva
          : body.fechaNueva,
        semaforo_atraso: typeof data.semaforo_atraso === "string"
          ? data.semaforo_atraso
          : "verde",
      });
    } catch (error) {
      return errorResponse(error, {
        headers: buildCors(request, config),
      });
    }
  };
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(value);
}
