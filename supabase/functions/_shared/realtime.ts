/**
 * HIDRIA — emisión de eventos Realtime desde Edge Functions (post-commit, best-effort).
 *
 * Tarea `task-95` (F1-04). Canales privados de `docs/04` §7: `diagnostic:{uuid}` y
 * `org:{uuid}` (políticas M-05 ya en DB, migración `20261108010300`). Se usa el endpoint
 * HTTP de Realtime con `service_role`; un fallo **no revierte** la transacción ya confirmada
 * (se ignora y queda la notificación/estado persistente).
 */

export interface RealtimeConfig {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
}

export interface RealtimeMessage {
  readonly topic: string;
  readonly event: string;
  readonly payload: Record<string, unknown>;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Emite uno o varios eventos a canales privados. Nunca lanza: devuelve `false` si falló
 * (el llamador no debe revertir el negocio por un fallo de Realtime).
 */
export async function broadcastRealtime(
  config: RealtimeConfig,
  messages: readonly RealtimeMessage[],
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (messages.length === 0) return true;
  try {
    const response = await fetchImpl(
      `${trimTrailingSlashes(config.supabaseUrl)}/realtime/v1/api/broadcast`,
      {
        method: "POST",
        headers: {
          apikey: config.serviceRoleKey,
          authorization: `Bearer ${config.serviceRoleKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: messages.map((message) => ({
            topic: message.topic,
            event: message.event,
            payload: message.payload,
          })),
        }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

/** Topic privado del expediente y del Kanban (docs/04 §7). */
export function diagnosticTopic(diagnosticId: string): string {
  return `diagnostic:${diagnosticId}`;
}

export function organizationTopic(organizationId: string): string {
  return `org:${organizationId}`;
}
