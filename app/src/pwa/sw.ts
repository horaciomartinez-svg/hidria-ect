/// <reference lib="webworker" />
/**
 * HIDRIA — service worker (F1-02b).
 *
 * Política de caché (sign-off de seguridad):
 *  - Sólo se precachea el **shell público** (index.html, assets con hash, iconos, manifest,
 *    offline.html). La caché NO contiene datos de usuario.
 *  - Default = passthrough de red (Workbox sólo intercepta rutas registradas).
 *  - `NetworkOnly` explícito para Supabase (REST/Functions) y R2: respuestas autenticadas,
 *    tokens y URLs prefirmadas de documentos `restringido_nda` jamás se almacenan.
 *  - El SW no lee `localStorage`/IndexedDB y no transporta tokens; el único mensaje aceptado
 *    es `{ type: 'SKIP_WAITING' }` de un cliente del mismo origen.
 *  - La actualización se aplica sólo cuando la UI lo pide (nunca `skipWaiting` automático).
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navegación SPA: shell precacheado (funciona sin red). Se excluyen documentos y estáticos
// que deben servirse tal cual (no como shell) y el propio SW.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [
      /^\/offline\.html$/,
      /^\/sw\.js$/,
      /^\/manifest\.webmanifest$/,
      /^\/assets\//,
      /^\/icons\//,
      /^\/screenshots\//,
    ],
  }),
);

// Nunca cachear Supabase (REST/Functions) ni R2 (documentos y URLs prefirmadas de 15 min).
registerRoute(({ url }) => url.hostname.endsWith('.supabase.co'), new NetworkOnly());
registerRoute(
  ({ url }) =>
    url.hostname.endsWith('.r2.dev') || url.hostname.endsWith('.r2.cloudflarestorage.com'),
  new NetworkOnly(),
);

// Actualización: sólo un cliente del mismo origen y con el mensaje exacto, sin payload.
self.addEventListener('message', (event) => {
  const source = event.source;
  const sourceUrl = source && 'url' in source ? source.url : '';
  if (!sourceUrl.startsWith(self.location.origin)) return;

  const data = event.data as { type?: unknown } | null;
  if (typeof data !== 'object' || data === null) return;
  if (Object.keys(data).length !== 1 || data.type !== 'SKIP_WAITING') return;

  void self.skipWaiting();
});
