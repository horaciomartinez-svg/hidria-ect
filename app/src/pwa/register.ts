import { registerSW } from 'virtual:pwa-register';

/**
 * Registro del service worker y estado de actualización (F1-02b).
 *
 * `registerType: 'prompt'`: el SW nuevo queda en `waiting` y sólo se activa cuando la UI
 * envía `SKIP_WAITING` (nunca automático, para no interrumpir una captura en curso).
 * En `dev` el SW está deshabilitado (no hay cachés fantasma).
 */

export interface PwaState {
  /** Hay una versión nueva esperando activación. */
  needRefresh: boolean;
  /** El shell quedó listo para usarse sin conexión. */
  offlineReady: boolean;
}

const OFFLINE_READY_ACK_KEY = 'hidria:pwa-offline-ready-ack';

let state: PwaState = { needRefresh: false, offlineReady: false };
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribePwa(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPwaSnapshot(): PwaState {
  return state;
}

/** El aviso «listo sin conexión» se muestra una sola vez por dispositivo. */
export function isOfflineReadyAcknowledged(): boolean {
  try {
    return window.localStorage.getItem(OFFLINE_READY_ACK_KEY) === '1';
  } catch {
    return false;
  }
}

export function acknowledgeOfflineReady(): void {
  try {
    window.localStorage.setItem(OFFLINE_READY_ACK_KEY, '1');
  } catch {
    /* almacenamiento no disponible: el aviso se oculta sólo en esta sesión */
  }
  state = { ...state, offlineReady: false };
  emit();
}

/** «Después»: mantiene el aviso hasta el cierre de sesión (sin recargar). */
export function dismissUpdate(): void {
  state = { ...state, needRefresh: false };
  emit();
}

/** «Actualizar ahora»: envía SKIP_WAITING al SW en espera y recarga. */
export async function applyUpdate(): Promise<void> {
  await updateServiceWorker?.(true);
}

/**
 * Invocación única al arrancar la app (main.tsx). `hasPendingWork()` se conectará a la cola
 * `ops_queue` en M4/M6/M10: hasta entonces no hay capturas offline que proteger.
 */
export function initServiceWorker(): void {
  if (initialized) return;
  initialized = true;
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      state = { ...state, needRefresh: true };
      emit();
    },
    onOfflineReady() {
      state = { ...state, offlineReady: true };
      emit();
    },
  });
}
