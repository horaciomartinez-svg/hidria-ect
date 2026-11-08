/**
 * HIDRIA — catálogo canónico de errores de las Edge Functions.
 *
 * Fuente de verdad: `docs/04-Contratos-API-y-Tablas-de-Decision-HIDRIA-MD-OHI.md` §2.4 y §8.
 * Tarea F1-01b (task-21): helper mínimo para que `_shared/auth.ts` emita los errores
 * canónicos (`401 AUTH_INVALID`, `403 FORBIDDEN_ROLE`, `403 FORBIDDEN_NOT_MEMBER`) con el
 * envelope exacto del contrato, sin stack traces ni mensajes internos.
 *
 * Sin dependencias externas: solo APIs estándar de Deno/Web (Response, JSON, HeadersInit).
 *
 * Incluye `GATE_R2_FICHA` y `GATE_R3_FICHA`, usados por los contratos EF-04/EF-05 y por
 * `docs/05` (CAT-03/BHE-04) aunque **no** figuren en la tabla de `docs/04` §8: se catalogan
 * aquí con HTTP 409 y se documentan como hueco de `docs/04` para la tarea de docs (F1-18).
 */

/** Códigos con HTTP fijo del catálogo §8 (`VALIDATION_*` se resuelve por prefijo: 422). */
export const HTTP_STATUS_BY_ERROR_CODE = {
  AUTH_INVALID: 401,
  FORBIDDEN_ROLE: 403,
  FORBIDDEN_NOT_MEMBER: 403,
  CONFLICT_PHASE: 409,
  CONFLICT_STATE: 409,
  CONFLICT_IVOH_VERSION: 409,
  GATE_CHECKLIST_R1: 409,
  GATE_CAT_R2: 409,
  GATE_R2_FICHA: 409,
  GATE_IIH_V1: 409,
  GATE_BHE_R3: 409,
  GATE_R3_FICHA: 409,
  GATE_IVOH_R4: 409,
  GATE_BHE_BRECHA: 409,
  GATE_CUSTODIA: 409,
  GATE_REPORTE_INCOMPLETO: 409,
  RATE_LIMIT: 429,
  EXT_PSC: 502,
  NOT_IMPLEMENTED_PHASE: 501,
  INTERNAL_ERROR: 500,
} as const;

export type CanonicalErrorCode = keyof typeof HTTP_STATUS_BY_ERROR_CODE;

/** Mensajes canónicos por código (español institucional, sin datos internos). */
export const DEFAULT_ERROR_MESSAGES: Record<CanonicalErrorCode, string> = {
  AUTH_INVALID: "Token de acceso ausente, inválido o expirado.",
  FORBIDDEN_ROLE: "El rol del usuario no autoriza esta operación.",
  FORBIDDEN_NOT_MEMBER: "El usuario no es miembro de este diagnóstico.",
  CONFLICT_PHASE:
    "Transición de fase no permitida: solo se avanza una fase a la vez.",
  CONFLICT_STATE: "Transición de estado no permitida para el recurso.",
  CONFLICT_IVOH_VERSION:
    "La versión del índice IVOH está vigente y es inmutable.",
  GATE_CHECKLIST_R1: "La lista de cotejo no está validada en R1.",
  GATE_CAT_R2: "El CAT no está validado en R2.",
  GATE_R2_FICHA:
    "La ficha de bitácora R2 no está cerrada o no registra el plan de resolución de los «No sé».",
  GATE_IIH_V1: "El IIH tiene activos sin verificar en V1.",
  GATE_BHE_R3: "El balance hídrico no está validado en R3.",
  GATE_R3_FICHA:
    "La ficha de bitácora R3 no está cerrada o no corresponde al balance.",
  GATE_IVOH_R4: "El IVOH no está validado en R4 (se requieren 6/6 factores).",
  GATE_BHE_BRECHA:
    "Un balance que no cierra no es un dato, es una tarea pendiente.",
  GATE_CUSTODIA:
    "El dictamen requiere 3 transferencias firmadas de cadena de custodia.",
  GATE_REPORTE_INCOMPLETO: "La matriz de completitud 10/10 no está satisfecha.",
  RATE_LIMIT: "Se excedió el límite de solicitudes por usuario.",
  EXT_PSC: "El proveedor de firma NOM-151 no respondió correctamente.",
  NOT_IMPLEMENTED_PHASE: "Función no habilitada en la fase actual.",
  INTERNAL_ERROR: "Error interno no controlado.",
};

/** Envelope de error de `docs/04` §2.4: `{ error: { code, message, details?, ref? } }`. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    ref?: string;
  };
}

/** `VALIDATION_*` ⇒ 422; código no catalogado ⇒ 500 (nunca se expone al cliente tal cual). */
export function statusForErrorCode(code: string): number {
  if (code in HTTP_STATUS_BY_ERROR_CODE) {
    return HTTP_STATUS_BY_ERROR_CODE[code as CanonicalErrorCode];
  }
  if (code.startsWith("VALIDATION_")) {
    return 422;
  }
  return HTTP_STATUS_BY_ERROR_CODE.INTERNAL_ERROR;
}

/** Mensaje por defecto para códigos de validación dinámicos. */
function defaultMessageFor(code: string): string {
  if (code in DEFAULT_ERROR_MESSAGES) {
    return DEFAULT_ERROR_MESSAGES[code as CanonicalErrorCode];
  }
  if (code.startsWith("VALIDATION_")) {
    return "Error de validación del payload.";
  }
  return DEFAULT_ERROR_MESSAGES.INTERNAL_ERROR;
}

/**
 * Error de negocio/autenticación con código canónico.
 *
 * `message` es opcional: si se omite se usa el mensaje canónico del código. Nunca debe
 * contener stack ni detalles de Postgres (regla de `docs/04` §2.4 y agents/03 §4.5).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message?: string,
    details?: Record<string, unknown>,
  ) {
    super(message ?? defaultMessageFor(code));
    this.name = "ApiError";
    this.code = code;
    this.status = statusForErrorCode(code);
    this.details = details;
  }

  /** Envelope canónico, opcionalmente con la referencia de auditoría (`audit:<hash>`). */
  toEnvelope(ref?: string): ErrorEnvelope {
    const envelope: ErrorEnvelope = {
      error: {
        code: this.code,
        message: this.message,
      },
    };
    if (this.details !== undefined) {
      envelope.error.details = this.details;
    }
    if (ref !== undefined) {
      envelope.error.ref = ref;
    }
    return envelope;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export interface ErrorResponseOptions {
  /** Hash de `audit_log` de la transacción (`ref: "audit:<hash>"`). */
  ref?: string;
  headers?: HeadersInit;
}

/**
 * Respuesta HTTP de error con el envelope canónico.
 *
 * Cualquier error no controlado se degrada a `500 INTERNAL_ERROR` con mensaje genérico:
 * nunca se filtra stack, mensaje de Postgres ni nombre de tabla.
 */
export function errorResponse(
  error: unknown,
  options: ErrorResponseOptions = {},
): Response {
  const apiError = isApiError(error) ? error : new ApiError("INTERNAL_ERROR");

  const headers = new Headers(options.headers ?? {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");

  return new Response(
    JSON.stringify(apiError.toEnvelope(options.ref)),
    { status: apiError.status, headers },
  );
}
