import { useCallback, useEffect, useState } from 'react';

/** Evento no estándar de Chrome para la instalación de PWA. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallPromptState {
  canInstall: boolean;
  standalone: boolean;
  promptInstall: () => Promise<void>;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standaloneMedia || iosStandalone;
}

/**
 * Estado de instalación (F1-02b).
 *
 * `beforeinstallprompt` se captura y se difiere: la app decide cuándo ofrecer la instalación
 * (no se muestra el prompt nativo automáticamente). En iOS no existe el evento: la UI muestra
 * la instrucción «Compartir → Añadir a pantalla de inicio».
 */
export function useInstallPrompt(): InstallPromptState {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState<boolean>(detectStandalone);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredEvent(null);
      setStandalone(true);
    };
    const media = window.matchMedia('(display-mode: standalone)');
    const onDisplayModeChange = () => setStandalone(detectStandalone());

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    media.addEventListener('change', onDisplayModeChange);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      media.removeEventListener('change', onDisplayModeChange);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    await deferredEvent.userChoice;
    setDeferredEvent(null);
  }, [deferredEvent]);

  return { canInstall: deferredEvent !== null, standalone, promptInstall };
}
