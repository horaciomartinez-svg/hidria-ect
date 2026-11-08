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
 *    es `{ type: 'SKIP_WAITING' }` de un cliente del **mismo origen exacto**.
 *  - La actualización se aplica sólo cuando la UI lo pide (nunca `skipWaiting` automático).
 *
 * Caché versionada: `hidria-shell-<vX.Y.Z>-<build>`; al activar se eliminan las cachés de
 * versiones anteriores de HIDRIA para no acumularlas.
 */
import { PrecacheController, PrecacheRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

// Inyectadas por `vite define` también en el build del SW (ver `dist/sw.js`).
declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;

/** Nombre de caché versionado: `hidria-shell-<vX.Y.Z>-<build>`. */
const PRECACHE_NAME = `hidria-shell-${__APP_VERSION__}-${__APP_BUILD__}`;

const precacheController = new PrecacheController({ cacheName: PRECACHE_NAME });
precacheController.addToCacheList(self.__WB_MANIFEST);

self.addEventListener('install', (event) => {
  event.waitUntil(precacheController.install(event));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await precacheController.activate(event);
      // Limpieza de precaches de versiones anteriores de HIDRIA.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('hidria-shell-') && name !== PRECACHE_NAME)
          .map((name) => caches.delete(name)),
      );
    })(),
  );
});

// Navegación SPA: shell precacheado (funciona sin red). Se excluyen documentos y estáticos
// que deben servirse tal cual (no como shell) y el propio SW.
registerRoute(
  new NavigationRoute(precacheController.createHandlerBoundToURL('/index.html'), {
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

// Precaching de assets/iconos solicitados directamente (no sólo por navegación).
registerRoute(new PrecacheRoute(precacheController));

// Nunca cachear Supabase (REST/Functions) ni R2 (documentos y URLs prefirmadas de 15 min).
registerRoute(({ url }) => url.hostname.endsWith('.supabase.co'), new NetworkOnly());
registerRoute(
  ({ url }) =>
    url.hostname.endsWith('.r2.dev') || url.hostname.endsWith('.r2.cloudflarestorage.com'),
  new NetworkOnly(),
);

// Actualización: sólo un cliente del **mismo origen exacto** (no por prefijo: `startsWith`
// aceptaría `https://origen.evil.example`) y con el mensaje exacto, sin payload.
self.addEventListener('message', (event) => {
  const source = event.source;
  const sourceUrl = source && 'url' in source ? source.url : '';
  if (sourceUrl.length === 0) return;

  let sourceOrigin: string;
  try {
    sourceOrigin = new URL(sourceUrl).origin;
  } catch {
    return; // URL de cliente inválida: se descarta el mensaje
  }
  if (sourceOrigin !== self.location.origin) return;

  const data = event.data as { type?: unknown } | null;
  if (typeof data !== 'object' || data === null) return;
  if (Object.keys(data).length !== 1 || data.type !== 'SKIP_WAITING') return;

  void self.skipWaiting();
});
