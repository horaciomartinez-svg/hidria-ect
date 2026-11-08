import { useEffect, useState } from 'react';
import {
  acknowledgeOfflineReady,
  applyUpdate,
  dismissUpdate,
  isOfflineReadyAcknowledged,
} from '../../pwa/register';
import { usePwaState } from '../../pwa/usePwaState';

/**
 * Avisos de PWA (F1-02b):
 *  - Versión nueva disponible: **nunca** se recarga sola; el usuario decide.
 *  - Shell listo para usarse sin conexión (se muestra una vez).
 */
export function UpdateBanner() {
  const { needRefresh, offlineReady } = usePwaState();
  const [offlineAck, setOfflineAck] = useState(() => isOfflineReadyAcknowledged());

  useEffect(() => {
    setOfflineAck(isOfflineReadyAcknowledged());
  }, [offlineReady]);

  if (needRefresh) {
    return (
      <div
        className="flex flex-wrap items-center gap-3 border-b border-hidria-200 bg-hidria-50 px-4 py-2 text-xs text-hidria-800"
        role="status"
        aria-live="polite"
        data-pwa-update="true"
      >
        <p className="flex-1 font-medium">
          Hay una versión nueva de HIDRIA. Actualiza cuando termines lo que estás haciendo.
        </p>
        <button
          type="button"
          onClick={() => void applyUpdate()}
          className="rounded-md bg-hidria-700 px-3 py-1.5 font-semibold text-white hover:bg-hidria-800"
        >
          Actualizar ahora
        </button>
        <button
          type="button"
          onClick={() => dismissUpdate()}
          className="rounded-md border border-hidria-200 px-3 py-1.5 font-semibold text-hidria-800"
        >
          Después
        </button>
      </div>
    );
  }

  if (offlineReady && !offlineAck) {
    return (
      <div
        className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-4 py-2 text-xs text-slate-700"
        role="status"
        aria-live="polite"
        data-pwa-offline-ready="true"
      >
        <p className="flex-1">
          HIDRIA quedó lista para abrirse sin conexión en este dispositivo. La captura offline
          se habilitará con los módulos de campo (M4/M6/M10).
        </p>
        <button
          type="button"
          onClick={() => {
            acknowledgeOfflineReady();
            setOfflineAck(true);
          }}
          className="rounded-md border border-line px-3 py-1.5 font-semibold"
        >
          Entendido
        </button>
      </div>
    );
  }

  return null;
}
