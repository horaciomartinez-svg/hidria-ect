/// <reference lib="webworker" />
/**
 * HIDRIA â€” service worker (F1-02b).
 *
 * PolÃ­tica de cachÃ© (sign-off de seguridad):
 *  - SÃ³lo se precachea el **shell pÃºblico** (index.html, assets con hash, iconos, manifest,
 *    offline.html). La cachÃ© NO contiene datos de usuario.
 *  - Default = passthrough de red (Workbox sÃ³lo intercepta rutas registradas).
 *  - `NetworkOnly` explÃ­cito para Supabase (REST/Functions) y R2: respuestas autenticadas,
 *    tokens y URLs prefirmadas de documentos `restringido_nda` jamÃ¡s se almacenan.
 *  - El SW no lee `localStorage`/IndexedDB y no transporta tokens; el Ãºnico mensaje aceptado
 *    es `{ type: 'SKIP_WAITING' }` de un cliente del mismo origen.
 *  - La actualizaciÃ³n se aplica sÃ³lo cuando la UI lo pide (nunca `skipWaiting` automÃ¡tico).
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// NavegaciÃ³n SPA: shell precacheado (funciona sin red). Se excluyen documentos y estÃ¡ticos
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

// ActualizaciÃ³n: sÃ³lo un cliente del **mismo origen exacto** (no por prefijo: `startsWith`
// aceptarÃ­a `https://origen.evil.example`) y con el mensaje exacto, sin payload.
self.addEventListener('message', (event) => {
  const source = event.source;
  const sourceUrl = source && 'url' in source ? source.url : '';
  if (sourceUrl.length === 0) return;

  let sourceOrigin: string;
  try {
    sourceOrigin = new URL(sourceUrl).origin;
  } catch {
    return; // URL de cliente invÃ¡lida: se descarta el mensaje
  }
  if (sourceOrigin !== self.location.origin) return;

  const data = event.data as { type?: unknown } | null;
  if (typeof data !== 'object' || data === null) return;
  if (Object.keys(data).length !== 1 || data.type !== 'SKIP_WAITING') return;

  void self.skipWaiting();
});
