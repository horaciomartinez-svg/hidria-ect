/**
 * HIDRIA — Cloudflare R2 (S3-compatible): URL `PUT` prefirmada (SigV4 query) y validación
 * de metadatos de documentos.
 *
 * Tarea `task-39` (F1 · EF-08 presign/Q-08). ADR-012.
 *
 * Decisiones:
 * - Firma **AWS Signature V4 en query string** (`X-Amz-*`): no se usa SDK; solo WebCrypto.
 * - La clave de objeto la genera SIEMPRE el servidor (`docs/01` §1):
 *   `org/{organization_id}/diag/{diagnostic_id}/{document_id}.{ext}`.
 * - TTL de subida **300 s** (`docs/01` §1: vigencia ≤ 5 min; `docs/04` §4 #37/#41: máximo duro
 *   300 s, no configurable por el cliente; la descarga futura usa 900 s).
 * - El módulo no lee `Deno.env`: la configuración se inyecta (probable sin permisos).
 * - Nunca se devuelven `R2_SECRET_ACCESS_KEY` ni credenciales de R2 en errores; el `X-Amz-Credential`
 *   de la URL contiene solo el **access key id** (público por diseño de S3 presign).
 */

import { ApiError } from "./errors.ts";
import { isUuid } from "./auth.ts";

/** TTL de la URL prefirmada de subida (300 s). */
export const PRESIGN_TTL_SECONDS = 300;
/** Máximo duro: 300 s (`docs/04` §4, PR #41). La descarga futura usa 900 s aparte. */
export const MAX_PRESIGN_TTL_SECONDS = 300;
export const MIN_UPLOAD_BYTES = 1;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Valores posibles de `documents.doc_type` (DDL `docs/02`; `docs/04` lista un subconjunto). */
export const ALLOWED_DOC_TYPES: readonly string[] = [
  "layout",
  "planos_hidrosanitarios",
  "parametros_calidad",
  "balance_basico",
  "concesion",
  "permiso_descarga",
  "recibos",
  "lab_previo",
  "informe_laboratorio",
  "reporte",
  "plan_accion",
  "bitacora_firmada",
  "otro",
];

/** Valores posibles de `documents.exposure_level`. */
export const ALLOWED_EXPOSURE_LEVELS: readonly string[] = [
  "publico",
  "anonimizado",
  "sintetico",
  "restringido_nda",
];

/**
 * Lista blanca de MIME → extensiones permitidas (`docs/04` EF-08: pdf, imágenes, xlsx, dwg, ofx).
 */
export const DOCUMENT_MIME_EXTENSIONS: Readonly<
  Record<string, readonly string[]>
> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "image/tiff": ["tif", "tiff"],
  "image/heic": ["heic"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.ms-excel": ["xls"],
  "image/vnd.dwg": ["dwg"],
  "application/dwg": ["dwg"],
  "application/acad": ["dwg"],
  "application/x-ofx": ["ofx"],
  "application/ofx": ["ofx"],
};

/** Configuración de R2 inyectada por la EF (nunca se expone al cliente). */
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Región de firma; R2 usa `auto`. `us-east-1` solo para vectores de prueba AWS. */
  region?: string;
  /** Endpoint S3 (por defecto `https://{accountId}.r2.cloudflarestorage.com`). */
  endpoint?: string;
  /** `true` (R2) ⇒ `/{bucket}/{key}`; `false` ⇒ virtual-hosted (vector AWS). */
  pathStyle?: boolean;
}

/** Construye la configuración desde variables de entorno (EF). Falla cerrado si falta algo. */
export function buildR2Config(
  env: Record<string, string | undefined>,
): R2Config {
  const accountId = env.R2_ACCOUNT_ID ?? env.CLOUDFLARE_ACCOUNT_ID ?? "";
  const accessKeyId = env.R2_ACCESS_KEY_ID ?? "";
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY ?? env.R2_SECRET ?? "";
  const bucket = env.R2_BUCKET_DOCS ?? "hidria-docs";
  if (
    accountId.length === 0 || accessKeyId.length === 0 ||
    secretAccessKey.length === 0
  ) {
    // Mensaje genérico: no se enumeran valores ni se filtran secretos al cliente.
    throw new ApiError(
      "INTERNAL_ERROR",
      "Almacenamiento de documentos no configurado.",
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export interface PresignPutOptions {
  config: R2Config;
  key: string;
  /** Header `Content-Type` que el cliente deberá enviar en el PUT (se firma). */
  contentType: string;
  expiresInSeconds?: number;
  /** Inyectable para pruebas deterministas. */
  now?: Date;
}

export interface PresignedPut {
  /** URL de subida (capacidad bearer SigV4); el servidor no devuelve la clave por separado. */
  url: string;
  expiresInSeconds: number;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Utilidades criptográficas (exportadas para pruebas y para register en F1-05)
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

export function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return toHex(new Uint8Array(digest));
}

export async function hmacSha256(
  secret: string | Uint8Array,
  data: string,
): Promise<Uint8Array> {
  const keyData =
    (typeof secret === "string"
      ? encoder.encode(secret)
      : secret) as unknown as BufferSource;
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(data)),
  );
}

// ---------------------------------------------------------------------------
// AWS Signature V4 (query string) — compatible con Cloudflare R2
// ---------------------------------------------------------------------------

const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "s3";

/** Codificación RFC 3986 exigida por SigV4 (encodeURIComponent deja `!'()*` sin codificar). */
export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function resolveEndpoint(config: R2Config): {
  host: string;
  baseUrl: string;
} {
  if (config.endpoint !== undefined) {
    const url = new URL(config.endpoint);
    return { host: url.host, baseUrl: `${url.protocol}//${url.host}` };
  }
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  return { host, baseUrl: `https://${host}` };
}

function canonicalUriFor(config: R2Config, key: string): string {
  const segments = key.split("/").filter((segment) => segment.length > 0)
    .map(encodeRfc3986);
  const pathStyle = config.pathStyle ?? true;
  const prefix = pathStyle ? `/${encodeRfc3986(config.bucket)}` : "";
  return `${prefix}/${segments.join("/")}`;
}

function clampTtl(expiresInSeconds: number | undefined): number {
  const requested = Math.trunc(expiresInSeconds ?? PRESIGN_TTL_SECONDS);
  if (!Number.isFinite(requested) || requested < 1) {
    return PRESIGN_TTL_SECONDS;
  }
  return Math.min(requested, MAX_PRESIGN_TTL_SECONDS);
}

export interface SigV4QueryInput {
  method: string;
  host: string;
  canonicalUri: string;
  /** Header `Content-Type` a firmar; si se omite, `X-Amz-SignedHeaders=host`. */
  contentType?: string;
  region: string;
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  amzDate: string;
  expiresInSeconds: number;
  payloadHash?: string;
}

export interface SigV4QuerySignature {
  canonicalRequest: string;
  stringToSign: string;
  queryString: string;
  signature: string;
  signedHeaders: string;
}

/**
 * Firma AWS SigV4 en query string (nivel bajo). Exportada para poder contrastarla con el
 * vector documentado de AWS (TTL 86400, región us-east-1) sin el tope de 300 s del presign.
 */
export async function signAwsV4Query(
  input: SigV4QueryInput,
): Promise<SigV4QuerySignature> {
  const service = input.service ?? SERVICE;
  const dateStamp = input.amzDate.slice(0, 8);
  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const contentType = input.contentType?.trim();
  const signedHeaders = contentType !== undefined && contentType.length > 0
    ? "content-type;host"
    : "host";

  const queryString = [
    ["X-Amz-Algorithm", ALGORITHM],
    ["X-Amz-Credential", `${input.accessKeyId}/${scope}`],
    ["X-Amz-Date", input.amzDate],
    ["X-Amz-Expires", String(input.expiresInSeconds)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ] as Array<[string, string]>;
  const canonicalQueryString = queryString
    .slice()
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
    .join("&");

  const canonicalHeaders = contentType !== undefined && contentType.length > 0
    ? `content-type:${contentType}\nhost:${input.host}\n`
    : `host:${input.host}\n`;
  const canonicalRequest = [
    input.method.toUpperCase(),
    input.canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash ?? "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    ALGORITHM,
    input.amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const dateKey = await hmacSha256(`AWS4${input.secretAccessKey}`, dateStamp);
  const regionKey = await hmacSha256(dateKey, input.region);
  const serviceKey = await hmacSha256(regionKey, service);
  const signingKey = await hmacSha256(serviceKey, "aws4_request");
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  return {
    canonicalRequest,
    stringToSign,
    queryString: canonicalQueryString,
    signature,
    signedHeaders,
  };
}

/**
 * Genera una URL `PUT` prefirmada (SigV4 query string) para un objeto de R2.
 *
 * Se firma `Content-Type` (`X-Amz-SignedHeaders=content-type;host`) para que el cliente deba
 * enviar exactamente el MIME validado. El payload va como `UNSIGNED-PAYLOAD` (estándar en
 * URL prefirmadas) y el TTL es 300 s fijos (tope duro). La respuesta del endpoint NO incluye
 * la clave de objeto: solo la URL.
 */
export async function presignPutObject(
  options: PresignPutOptions,
): Promise<PresignedPut> {
  const { config } = options;
  const key = options.key.replace(/^\/+/, "");
  if (key.length === 0 || key.includes("..")) {
    throw new ApiError("INTERNAL_ERROR", "Clave de objeto no válida.");
  }
  const contentType = options.contentType.trim();
  if (contentType.length === 0) {
    throw new ApiError("INTERNAL_ERROR", "Content-Type requerido para firmar.");
  }
  const ttl = clampTtl(options.expiresInSeconds);
  const now = options.now ?? new Date();
  const amzDate = toAmzDate(now);
  const region = config.region ?? "auto";
  const canonicalUri = canonicalUriFor(config, key);
  const { host, baseUrl } = resolveEndpoint(config);

  const signature = await signAwsV4Query({
    method: "PUT",
    host,
    canonicalUri,
    contentType,
    region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    amzDate,
    expiresInSeconds: ttl,
  });

  return {
    url: `${baseUrl}${canonicalUri}?${signature.queryString}` +
      `&X-Amz-Signature=${signature.signature}`,
    expiresInSeconds: ttl,
    expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Clave de objeto y validación de metadatos
// ---------------------------------------------------------------------------

export interface DocumentKeyInput {
  organizationId: string;
  diagnosticId: string;
  documentId: string;
  extension: string;
}

/** Clave server-side `org/{org}/diag/{diag}/{document_id}.{ext}` (docs/01 §1). */
export function buildDocumentObjectKey(input: DocumentKeyInput): string {
  if (
    !isUuid(input.organizationId) || !isUuid(input.diagnosticId) ||
    !isUuid(input.documentId)
  ) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "No se pudo construir la clave del objeto.",
    );
  }
  const extension = input.extension.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (extension.length === 0) {
    throw new ApiError("INTERNAL_ERROR", "Extensión de objeto no válida.");
  }
  return `org/${input.organizationId}/diag/${input.diagnosticId}/${input.documentId}.${extension}`;
}

/**
 * UUID determinista (forma v5) a partir de sha256(seed): permite que reintentos con la misma
 * `Idempotency-Key` reutilicen el mismo objeto sin estado persistente.
 */
export async function deterministicUuid(seed: string): Promise<string> {
  const hex = (await sha256Hex(seed)).slice(0, 32).split("");
  // Versión 5 (name-based) y variante RFC 4122 (10xx).
  hex[12] = "5";
  const variantNibble = (parseInt(hex[16], 16) & 0x3) | 0x8;
  hex[16] = variantNibble.toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}` +
    `-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

export interface UploadMetadataInput {
  filename: unknown;
  mime: unknown;
  sizeBytes: unknown;
  docType: unknown;
  exposureLevel: unknown;
}

export interface UploadMetadata {
  filename: string;
  extension: string;
  mime: string;
  sizeBytes: number;
  docType: string;
  exposureLevel: string;
}

function requireString(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(
      "VALIDATION_PARAMETRO_REQUERIDO",
      `Falta el campo obligatorio ${field}.`,
      { field },
    );
  }
  return value.trim();
}

/** Detecta caracteres de control sin usar regex con rangos de control (deno lint). */
function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Valida y normaliza los metadatos de subida (`docs/04` EF-08 presign). */
export function validateUploadMetadata(
  input: UploadMetadataInput,
): UploadMetadata {
  const filename = requireString(input.filename, "filename");
  if (
    filename.length > 255 ||
    hasControlCharacters(filename) ||
    /[\\/]/.test(filename) ||
    filename.includes("..")
  ) {
    throw new ApiError(
      "VALIDATION_FILE",
      "Nombre de archivo no válido.",
      { reason: "filename_invalido" },
    );
  }

  const mime = requireString(input.mime, "mime");
  const allowedExtensions = DOCUMENT_MIME_EXTENSIONS[mime];
  if (allowedExtensions === undefined) {
    throw new ApiError(
      "VALIDATION_FILE",
      "Tipo de archivo no permitido.",
      { reason: "mime_no_permitido" },
    );
  }

  if (
    typeof input.sizeBytes !== "number" || !Number.isInteger(input.sizeBytes)
  ) {
    throw new ApiError(
      "VALIDATION_PARAMETRO_REQUERIDO",
      "Falta el campo obligatorio size_bytes (entero).",
      { field: "size_bytes" },
    );
  }
  if (
    input.sizeBytes < MIN_UPLOAD_BYTES || input.sizeBytes > MAX_UPLOAD_BYTES
  ) {
    throw new ApiError(
      "VALIDATION_FILE",
      "El tamaño del archivo está fuera del rango permitido.",
      {
        reason: "tamano_fuera_de_rango",
        min_bytes: MIN_UPLOAD_BYTES,
        max_bytes: MAX_UPLOAD_BYTES,
      },
    );
  }

  const dotIndex = filename.lastIndexOf(".");
  const requestedExtension = dotIndex > 0
    ? filename.slice(dotIndex + 1).toLowerCase()
    : "";
  if (
    requestedExtension.length > 0 &&
    !allowedExtensions.includes(requestedExtension)
  ) {
    throw new ApiError(
      "VALIDATION_FILE",
      "La extensión del archivo no corresponde al tipo declarado.",
      { reason: "extension_incompatible", mime },
    );
  }
  const extension = requestedExtension.length > 0
    ? requestedExtension
    : allowedExtensions[0];

  const docType = requireString(input.docType, "doc_type");
  if (!ALLOWED_DOC_TYPES.includes(docType)) {
    throw new ApiError(
      "VALIDATION_DOC_TYPE",
      "Tipo de documento no válido.",
      { allowed: ALLOWED_DOC_TYPES },
    );
  }

  const exposureValue = input.exposureLevel;
  const exposureLevel = exposureValue === undefined || exposureValue === null
    ? "restringido_nda"
    : requireString(exposureValue, "exposure_level");
  if (!ALLOWED_EXPOSURE_LEVELS.includes(exposureLevel)) {
    throw new ApiError(
      "VALIDATION_EXPOSURE_LEVEL",
      "Nivel de exposición no válido.",
      { allowed: ALLOWED_EXPOSURE_LEVELS },
    );
  }

  return {
    filename,
    extension,
    mime,
    sizeBytes: input.sizeBytes,
    docType,
    exposureLevel,
  };
}
