/**
 * Configuración pública del cliente HIDRIA (F1-02).
 *
 * Sólo se admiten variables `VITE_*` (quedan en el bundle). **Nunca** se usa
 * `service_role` en el cliente (TEAM.md §4 y §15; agente 04 §4.5).
 */

/** Versión de `app/package.json` inyectada en build por `vite define`. */
export const APP_VERSION: string = __APP_VERSION__;

/** SHA de build (CI) o `dev`; visible en `/acerca` y en el nombre de caché. No es sensible. */
export const APP_BUILD: string = __APP_BUILD__;

const rawUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const rawAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/** Decodifica el payload de un JWT sin verificar la firma (sólo lectura local de claims). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Guarda de seguridad: la clave pública del cliente debe ser `anon`. Si alguien
 * inyecta una clave con `role: "service_role"` en `VITE_SUPABASE_ANON_KEY`, el
 * cliente **falla cerrado** (no crea el cliente de Supabase) en lugar de
 * empaquetar una credencial de servicio.
 */
function isServiceRoleKey(key: string): boolean {
  const payload = decodeJwtPayload(key);
  return typeof payload?.role === 'string' && payload.role === 'service_role';
}

export const SERVICE_ROLE_LEAK_DETECTED =
  rawAnonKey.length > 0 && isServiceRoleKey(rawAnonKey);

export const SUPABASE_URL = rawUrl;
export const SUPABASE_ANON_KEY = rawAnonKey;

/** `true` sólo con URL + clave anon válidas y sin fuga de clave de servicio. */
export const isSupabaseConfigured =
  SUPABASE_URL.length > 0 &&
  SUPABASE_ANON_KEY.length > 0 &&
  !SERVICE_ROLE_LEAK_DETECTED;

/** `true` cuando faltan variables de entorno (build de CI, primer arranque local). */
export const isSupabaseMissingEnv =
  !SERVICE_ROLE_LEAK_DETECTED &&
  (SUPABASE_URL.length === 0 || SUPABASE_ANON_KEY.length === 0);
