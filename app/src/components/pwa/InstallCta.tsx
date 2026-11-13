import { useCallback, useState } from 'react';
import { useInstallPrompt } from '../../pwa/useInstallPrompt';

type StorageState = 'idle' | 'granted' | 'denied' | 'unsupported';

/**
 * Instalación de la PWA (F1-02b). En iOS no hay `beforeinstallprompt`: se muestra la
 * instrucción manual. La persistencia de almacenamiento se solicita de forma explícita y
 * best-effort (sin bloquear).
 */
export function InstallCta() {
  const { canInstall, standalone, promptInstall } = useInstallPrompt();
  const [storage, setStorage] = useState<StorageState>('idle');
  const [installError, setInstallError] = useState<string | null>(null);

  const handleInstall = useCallback(async () => {
    setInstallError(null);
    try {
      await promptInstall();
    } catch {
      setInstallError(
        'No se pudo completar la instalación desde este navegador. Usa el menú del navegador («Instalar aplicación»).',
      );
    }
  }, [promptInstall]);

  const requestPersistence = useCallback(async () => {
    if (!('storage' in navigator) || typeof navigator.storage.persist !== 'function') {
      setStorage('unsupported');
      return;
    }
    try {
      const granted = await navigator.storage.persist();
      setStorage(granted ? 'granted' : 'denied');
    } catch {
      setStorage('denied');
    }
  }, []);

  if (standalone) {
    return (
      <p className="text-xs text-slate-600" data-install-state="standalone">
        HIDRIA está instalada en este dispositivo.
      </p>
    );
  }

  return (
    <div className="space-y-2" data-install-state={canInstall ? 'available' : 'manual'}>
      <button
        type="button"
        onClick={() => void handleInstall()}
        disabled={!canInstall}
        className="rounded-md bg-hidria-700 px-3 py-2 text-sm font-semibold text-white hover:bg-hidria-800 disabled:cursor-not-allowed disabled:opacity-50"
        data-install-cta="true"
      >
        Instalar HIDRIA
      </button>
      {installError && (
        <p className="text-xs text-semaforo-warn" role="alert">
          {installError}
        </p>
      )}
      {!canInstall && (
        <p className="text-xs leading-relaxed text-slate-600">
          Si tu navegador no ofrece el botón de instalación, usa el menú del navegador
          («Instalar aplicación») o, en iOS, «Compartir → Añadir a pantalla de inicio».
        </p>
      )}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => void requestPersistence()}
          className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-slate-700"
        >
          Preparar almacenamiento sin conexión
        </button>
        {storage !== 'idle' && (
          <p className="mt-1 text-[11px] text-slate-500" role="status">
            {storage === 'granted'
              ? 'Almacenamiento persistente concedido por el navegador.'
              : storage === 'denied'
                ? 'El navegador no concedió almacenamiento persistente; la app seguirá funcionando con el almacenamiento normal.'
                : 'Este navegador no permite solicitar almacenamiento persistente.'}
          </p>
        )}
      </div>
    </div>
  );
}
