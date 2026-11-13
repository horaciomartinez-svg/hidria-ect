# F1-02b — Diseño técnico: PWA instalable, service worker y aviso de versión

| Campo | Valor |
|---|---|
| **Tarea** | `task-45` (F1-02b, secuencia de `task-43`) |
| **Agente** | `dev-frontend-pwa` (04) |
| **Fecha** | 2026-11-07 21:0x (America/Mexico_City) |
| **Estado** | **Implementado** — A/2 `feature/F1-02b-pwa` (manifest, iconos, offline, SW) y B/2 `feature/F1-02b-pwa-ui` (UI de actualización/instalación, fases y evidencia CDP) |
| **Base** | `main` = `7ca0639` (F1-02a mergeada) |
| **Ubicación de este documento** | `hidria_coding_team/reports/F1/F1-02b_diseno_pwa.md`, versionado en la rama A/2 (PR #21) |
| **Revisores destino** | `supervisor-hidria` (decisión), `revisor-especificaciones` (criterio Lighthouse), `seguridad-privacidad` (política de caché/SW), `qa-tester` (E2E/offline) |

---

## 1. Objetivo y alcance

**Objetivo.** Cerrar el criterio «app instalable» de F1-02 sobre el shell ya entregado en F1-02a,
sin cambiar comportamiento funcional ni añadir datos: manifest, iconos, `offline.html`, service
worker con precache del shell, aviso de versión nueva con flujo de actualización controlado y estado
de instalación. PR de secuencia desde `main` (después del merge de #12), ~360 líneas.

**Dentro de alcance**

- `public/manifest.webmanifest` + iconos 192/512/512-maskable/180.
- `public/offline.html` (estático, accesible, sin datos).
- Service worker propio (`injectManifest`) con precache del shell y política de caché explícita.
- Aviso de actualización (`registerType: 'prompt'`, sin `skipWaiting` automático) y de «listo
  offline».
- Identificador de build (`__APP_BUILD__`) y versión en `/acerca` — **se entrega en B/2** (en A/2 sólo
  se usa `__APP_VERSION__`, ya existente).
- Instalación: captura de `beforeinstallprompt`, indicación para iOS, `navigator.storage.persist()`.

**Fuera de alcance (y dónde vive)**

| Tema | Dónde |
|---|---|
| Cola `ops_queue`, espejo Dexie, LWW por campo | Tareas de captura offline M4/M6/M10 (decisión de escritura de cola aún abierta con Dev EF/Arquitecto) |
| Lighthouse ≥ 90 formal en staging y HTTPS | **F1-16** (staging) |
| Headers de despliegue (`Service-Worker-Allowed`, `Cache-Control`, CSP) | DevOps (Cloudflare Pages), al desplegar staging |
| E2E de instalación/offline en CI | QA (`tests/e2e`), con los hooks que este diseño deja |

---

## 2. Decisiones de diseño (y su porqué)

| # | Decisión | Rationale |
|---|---|---|
| D1 | SW propio con **Workbox `injectManifest`** (no `generateSW`) | Permite controlar el flujo de actualización (`SKIP_WAITING` por mensaje), la política de no-caché y la limpieza por versión; `generateSW` no permite lógica propia en el SW |
| D2 | **Sólo se precachea el shell público**; ningún dato de usuario | El shell SPA es idéntico para todos los usuarios; no hay HTML personalizado en servidor. Refuerza D3 |
| D3 | **Política de no-caché para datos autenticados**: `NetworkOnly` explícito para `*.supabase.co` (REST/Functions/Realtime) y URLs de R2; el default del SW es *passthrough* (red), así que la allowlist es el único camino a la caché | No exponer respuestas con datos de negocio/PII, ni tokens, ni URLs prefirmadas de 15 min en el almacenamiento del navegador; el espejo offline será Dexie con su propia política |
| D4 | `registerType: 'prompt'` + aviso en UI; **nunca** `skipWaiting` automático | Un despliegue no debe recargar a mitad de captura; en F1-02b no hay cola, pero el hook `hasPendingWork()` queda listo para que M4/M6/M10 lo conecten |
| D5 | `manifest: false` en el plugin y manifest propio en `public/` | El fichero queda versionado y revisable; el plugin no lo regenera (evita sorpresas entre build y repo) |
| D6 | Navegación offline = **shell precacheado** (`/index.html`), no página estática | El requisito es offline-first: la app debe arrancar, mostrar el banner offline y (cuando exista) el espejo Dexie. `offline.html` es el fallback cuando el shell no está disponible (primer arranque sin red, cache eviction) |
| D7 | SW **deshabilitado en `dev`** (`devOptions.enabled: false`) | Evitar cachés fantasma en desarrollo; pruebas con `vite build && vite preview` (localhost cuenta como contexto seguro) |
| D8 | **Caché versionada `hidria-shell-<vX.Y.Z>-<build>`** con `PrecacheController({ cacheName })` + limpieza propia de cachés `hidria-shell-*` antiguas al activar | Cumple lo prometido en el sign-off de seguridad sin acumular cachés: cada build tiene nombre propio y el `activate` borra las versiones anteriores. `__APP_VERSION__`/`__APP_BUILD__` se inyectan también en el build del SW |

---

## 3. Manifest

`app/public/manifest.webmanifest` (valores propuestos; `theme_color`/`background_color` desde tokens
de `tailwind.config.js`: `hidria-600` = `#0d5c63`, `surface` = `#f7fafb`):

```json
{
  "id": "/",
  "name": "HIDRIA — Optimización Hídrica Industrial",
  "short_name": "HIDRIA",
  "description": "Plataforma MD-OHI del Programa Empresas Hídricamente Responsables (SDFI–SRHDS, Gobierno del Estado de Tamaulipas)",
  "lang": "es-MX",
  "dir": "ltr",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "display_override": ["window-controls-overlay", "standalone"],
  "orientation": "any",
  "theme_color": "#0d5c63",
  "background_color": "#f7fafb",
  "categories": ["business", "productivity", "education"],
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "Tablero de diagnósticos", "short_name": "Tablero", "url": "/kanban" },
    { "name": "Aula MD-OHI", "short_name": "Aula", "url": "/aula" },
    { "name": "Sincronización", "short_name": "Cola", "url": "/sincronizacion" }
  ],
  "screenshots": [
    { "src": "/screenshots/panel-wide.png", "sizes": "1280x720", "type": "image/png", "form_factor": "wide", "label": "Panel de inicio con módulos por rol" },
    { "src": "/screenshots/panel-narrow.png", "sizes": "720x1280", "type": "image/png", "form_factor": "narrow", "label": "Navegación móvil de HIDRIA" }
  ]
}
```

Notas:

- `start_url: "/?source=pwa"` permite medir instalaciones por origen sin PII (sólo un query param).
- `screenshots` **no** son requisito de instalabilidad; mejoran la hoja de instalación en escritorio.
  Se capturarán con **datos ficticios** (sin nombres de empresas ni PII) y se revisarán con
  `seguridad-privacidad`. Si no hay tiempo, se omiten sin afectar la instalabilidad.
- `index.html` añade `<link rel="manifest" href="/manifest.webmanifest" />`,
  `<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />` y mantiene
  `theme-color` ya existente.

### 3.1 Iconos

- Fuente vectorial versionada: `app/public/icons/hidria-icon.svg` (marca institucional: gota/ola
  estilizada sobre `#0d5c63`, sin texto pequeño que se pierda a 48 px).
- Derivados PNG (una sola generación, commiteados; **sin dependencia de runtime**):
  `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (fondo a sangre completa, marca centrada
  dentro del 80 % de zona segura), `apple-touch-icon-180.png` (sin transparencia).
- Generación reproducible con Python/Pillow del entorno de trabajo (no se añade dependencia a
  `app/package.json`); el comando queda documentado en el reporte de F1-02b.

---

## 4. `offline.html`

Estático, autocontenido (sin JS ni peticiones), accesible y **sin datos**:

- `<html lang="es-MX">`, `<title>Sin conexión · HIDRIA</title>`, `meta theme-color`, CSS inline con
  los tokens institucionales.
- Mensaje institucional: «Sin conexión. HIDRIA guarda los cambios en este dispositivo y los
  sincroniza al recuperar la red. Las validaciones que requieren conexión permanecen
  deshabilitadas (docs/04 §6.4).»
- Botón «Reintentar» = recarga (`onclick="location.reload()"`), y aviso de que si es el primer
  arranque sin red hay que conectarse una vez para instalar la app.
- `role="main"`, contraste AA, sin fuentes externas (usa la pila del sistema) → render inmediato
  offline; Lighthouse a11y no aplica aún, pero se verifica a mano.

---

## 5. Service worker (`app/src/pwa/sw.ts`)

```ts
/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

// 1) Shell público precacheado (workbox inyecta el manifest con hashes por build).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// 2) Navegación SPA: sirve el shell precacheado (funciona offline).
//    /offline.html se sirve como documento propio y no cae en esta ruta.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/offline\.html$/, /^\/assets\//, /^\/manifest\.webmanifest$/, /^\/icons\//],
  }),
);

// 3) Política explícita de NO caché para datos autenticados y binarios privados.
registerRoute(({ url }) => url.hostname.endsWith('.supabase.co'), new NetworkOnly());
registerRoute(({ url }) => url.hostname.endsWith('.r2.dev') || url.hostname.endsWith('.r2.cloudflarestorage.com'), new NetworkOnly());

// 4) La actualización se aplica sólo cuando la UI lo pide (nunca automática).
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
```

Cualquier petición que no case con (1) o (2) **no pasa por caché**: Workbox sólo intercepta rutas
registradas; el resto va a red por defecto. No hay handler genérico «caché todo».

### 5.1 Configuración Vite

```ts
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src/pwa',
  filename: 'sw.ts',
  registerType: 'prompt',
  injectRegister: false,       // registro explícito con virtual:pwa-register
  manifest: false,             // manifest propio en public/
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
    globIgnores: ['**/screenshots/**'],
  },
  devOptions: { enabled: false },
})
```

Dependencias nuevas (`app/package.json`, devDependencies): `vite-plugin-pwa@^2.0.0`
(peer `vite ^5` ✔ verificado), `workbox-precaching`, `workbox-routing`, `workbox-strategies`,
`workbox-window` (todas `^7.4.1`). Sin dependencias de runtime nuevas para el bundle del cliente
salvo `workbox-window` (≈ 3 kB gzip).

### 5.2 Typecheck del SW sin contaminar el del cliente

`sw.ts` usa tipos de *web worker*; mezclarlos con `lib: ["DOM"]` en el mismo proyecto rompe la
compilación. Plan:

- `app/tsconfig.json`: `"exclude": ["src/pwa/sw.ts"]`.
- `app/tsconfig.sw.json`: `extends ./tsconfig.json`, `compilerOptions.lib: ["ES2022","WebWorker"]`,
  `types: []`, `include: ["src/pwa/sw.ts"]`.
- `app/package.json` → `"build": "tsc --noEmit && tsc -p tsconfig.sw.json --noEmit && vite build"`
  (el job de CI no cambia; sigue ejecutando `npm run build`).

---

## 6. Política de caché y datos (para sign-off de `seguridad-privacidad`)

**Regla marco:** *la caché del service worker sólo contiene el shell público de la aplicación.*

| Contenido | ¿Se cachea? | Motivo |
|---|---|---|
| `index.html`, JS/CSS con hash, iconos, manifest, `offline.html` | **Sí** (precache) | Públicos, idénticos para todo usuario; necesarios para arrancar offline |
| Respuestas de PostgREST (`/rest/v1/**`) | **No** (`NetworkOnly` explícito + default passthrough) | Pueden contener datos de negocio y PII; su caché persistiría tras el logout |
| Edge Functions (`/functions/v1/**`) | **No** | Idem; además son operaciones con efectos |
| Realtime (`wss`) | **No** (no pasa por SW; además no se cachea WebSocket) | Estado efímero |
| URLs prefirmadas de R2 / documentos (`restringido_nda`) | **No** | Enlace firmado de 15 min + contenido clasificado; jamás debe quedar en `CacheStorage` |
| Token de sesión (Supabase Auth en `localStorage`) | **No** lo toca el SW | El SW no lee `localStorage`/IndexedDB; el único uso de `localStorage` es la sesión del SDK y un *ack* de UI sin PII (`hidria:pwa-offline-ready-ack`), nunca dentro del SW |
| Caché HTTP del navegador | Fuera del alcance del SW | `NetworkOnly` no impide la caché HTTP; se requiere `Cache-Control: no-store/private` en Supabase/EF/R2 sensible (coordinación Dev EF/DevOps) |
| Respuestas con cabecera `Set-Cookie`/`Authorization` | **No** | No hay rutas de caché que las cubran |

**Consecuencias de diseño**

1. Al **cerrar sesión** no hace falta purgar la caché de assets (es pública), pero sí se limpia el
   `CacheStorage` cuando cambia la versión del SW (`cleanupOutdatedCaches`). El estado de sesión lo
   gestiona el SDK como hoy.
2. **No hay datos de usuario en la caché** → usuario A y usuario B en el mismo dispositivo no se
   filtran vía cache. El riesgo residual de dispositivo compartido es el espejo Dexie (futuro,
   ADR-012), no esta entrega.
3. El SW **nunca** registra en caché URLs con query de sesión (`?code=`, `#access_token=`): la
   denylist de navegación no cubre esos parámetros, pero `NavigationRoute` sirve el shell precacheado
   y no almacena la URL solicitada; aun así, `detectSessionInUrl` limpia el hash al procesar PKCE.
4. Mensajes del SW: sólo se acepta `{type:'SKIP_WAITING'}` desde el propio cliente (mismo origen).

**Preguntas para `seguridad-privacidad`** (ver §11).

---

## 7. Flujo de actualización y aviso de versión

```
build (CI) ──► SW nuevo en estado "waiting"
                     │
                     ▼
  registerSW({ onNeedRefresh }) ──► <UpdateBanner> "Hay una versión nueva de HIDRIA"
                     │
        ┌────────────┴─────────────┐
   "Actualizar ahora"          "Después"
        │                          │
 hasPendingWork()? ── sí ──► dialogo: "tienes capturas sin sincronizar"
        │ no                       └─ banner persiste (recordatorio, no bloquea)
        ▼
 mensaje SKIP_WAITING ──► sw activa ──► recarga controlada
```

- `app/src/pwa/register.ts` (A/2): `registerSW({ immediate: true, onNeedRefresh, onOfflineReady })`
  desde `virtual:pwa-register`; expone `updateServiceWorker(true)`. **No** se usa `onRegisteredSW`.
- `app/src/pwa/usePwaState.ts` (B/2): hook `useSyncExternalStore` con estado
  `{ needRefresh, offlineReady }`.
- `app/src/components/pwa/UpdateBanner.tsx` (B/2): banner accesible (`role="status"`,
  `aria-live="polite"`, `data-pwa-update="true"`), botones «Actualizar ahora» y «Después»; el segundo
  mantiene el aviso hasta el cierre de sesión.
- Aviso «listo para usarse sin conexión» una sola vez: el **ack se persiste en `localStorage` de la
  UI** (`hidria:pwa-offline-ready-ack`, sin PII); el **service worker no accede a `localStorage`** ni a
  IndexedDB.
- **Versión:** `__APP_VERSION__` (ya existe, de `app/package.json`) en A/2. `__APP_BUILD__`
  (`GITHUB_SHA ?? BUILD_ID ?? 'dev'`) y su visualización en `/acerca` **se entregan en B/2**; sin
  secretos (`GITHUB_SHA` no es sensible).
- Registro: `injectRegister: false` + `registerSW` en `main.tsx` (sólo producción; en `dev` no hay SW).

---

## 8. Instalación

- `app/src/pwa/useInstallPrompt.ts`: captura `beforeinstallprompt` (`preventDefault()` para no
  mostrar el prompt nativo automáticamente), expone `canInstall` y `promptInstall()`.
- Botón «Instalar HIDRIA» en el menú de sesión (junto a «Acerca de») y en `/acerca`, visible sólo si
  `canInstall` y `display-mode !== 'standalone'`.
- Detección `matchMedia('(display-mode: standalone)')` + `navigator.standalone` (iOS) para ocultar el
  CTA.
- iOS (sin `beforeinstallprompt`): instrucción textual «Compartir → Añadir a pantalla de inicio» en
  `/acerca` y en el banner de instalación.
- `navigator.storage.persist()` solicitado tras la primera señal de uso (p. ej. al abrir
  `/sincronizacion`), sin bloquear; `estimate()` sólo se muestra cuando exista la cola (M4+).

---

## 9. Criterios de instalabilidad y evidencia local

**Requisitos (Chrome/Edge):** manifest con `name`/`short_name`, `start_url`, `display` standalone,
iconos 192 y 512 (y maskable), `theme_color`/`background_color`, service worker con handler de
`fetch` controlando la página, y **contexto seguro** (HTTPS o `localhost`).

**Evidencia que se puede capturar localmente (antes de staging), con Chrome 156 + CDP:**

| # | Comprobación | Método |
|---|---|---|
| E1 | Manifest se sirve y parsea sin errores | CDP `Page.getAppManifest` → `errors` vacío, `parsed` con los campos esperados |
| E2 | Instalable, sin motivos de rechazo | CDP `Page.getInstallabilityErrors` → `[]` |
| E3 | SW registrado y **controlando** la página | `navigator.serviceWorker.controller !== null` tras recarga |
| E4 | Shell arranca **offline** | CDP `Network.emulateNetworkConditions {offline:true}` → navegar a `/kanban` → renderiza shell + `data-offline-banner` |
| E5 | `offline.html` se sirve sin red | navegar a `/offline.html` con red emulada offline → documento estático |
| E6 | Actualización: hay SW en `waiting` y el banner aparece | segundo build en el mismo perfil + recarga → `data-pwa-update="true"`; pulsar «Actualizar» recarga con nueva versión |
| E7 | **Nada de datos autenticados en caché** | `caches.keys()` + `cache.keys()` de cada caché → ninguna URL `supabase.co`/`r2`/`token`; sólo estáticos same-origin |
| E8 | Sin secretos en el SW ni en el manifest | búsqueda de `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, JWT largos en `dist/sw.js` y `dist/manifest.webmanifest` |
| E9 | Versión/build visibles | `/acerca` muestra `v0.1.0 · build <sha>` |
| E10 | a11y del shell sin red | banner offline con `role=status`, foco visible, contraste AA |

**Sobre Lighthouse y el criterio «PWA ≥ 90»:** Lighthouse **v12 (2024) eliminó la categoría PWA**
(sus auditorías de instalabilidad se retiraron del reporte; ver
[release v12.0.0](https://github.com/GoogleChrome/lighthouse/releases/tag/v12.0.0)). Con
`lighthouse@13.6.0` (actual) **no existe** `--only-categories=pwa`. Propuesta para no reinterpretar
el criterio en silencio:

1. **Evidencia moderna (principal):** E1–E5 de esta tabla (CDP installability + manifest + SW +
   offline), que es el equivalente oficial actual.
2. **Evidencia literal del criterio (opcional, reproducible):** fijar `lighthouse@11.7.1` en el job
   de F1-16 y ejecutar `--only-categories=pwa` (última versión con la categoría) documentando el
   pin y su obsolescencia.
3. **Lighthouse actual (complementario):** performance/a11y/best-practices/SEO en staging, sin PWA.

Esto requiere una **nota del Revisor de Especificaciones** en F1-16 (no cambia el producto, cambia
la herramienta de medición); se propone como observación, sin tocar `docs/05`.

---

## 10. Matriz de pruebas de F1-02b (para QA y para el reporte)

| ID | Pre | Acción | Esperado |
|---|---|---|---|
| PWA-01 | build + preview | cargar `/` | SW registra y controla; `manifest` 200 |
| PWA-02 | idem | `Page.getInstallabilityErrors` | `[]` |
| PWA-03 | idem | offline emulado + recarga `/` | shell visible; banner offline; sin errores de consola no controlados |
| PWA-04 | idem | offline + `/offline.html` | página estática institucional |
| PWA-05 | SW en waiting | recargar | banner «versión nueva»; «Después» no recarga; «Actualizar» recarga al build nuevo |
| PWA-06 | idem | inspeccionar `caches` | sólo estáticos same-origin |
| PWA-07 | build | grep en `dist/sw.js`, `dist/manifest.webmanifest`, `dist/assets/*.js` | sin `service_role` real, sin `SUPABASE_SERVICE_ROLE_KEY`, sin tokens |
| PWA-08 | `/acerca` | abrir | versión + build |
| PWA-09 | 320 px / zoom 200 % | `offline.html` y banner | sin scroll horizontal, texto legible |

Hooks estables para QA (se añaden en F1-02b): `data-pwa-update`, `data-sw-status`,
`data-install-cta`. Ya existen `data-offline-banner` y `data-connection` (F1-02a).

---

## 11. Preguntas abiertas / coordinación

**Para `seguridad-privacidad` (sign-off de la política de §6):**

1. ¿Se aprueba que la caché del SW contenga **sólo** shell público (sin ninguna respuesta de
   Supabase/R2), con `NetworkOnly` explícito y default passthrough?
2. ¿Se aprueba que el SW **no** lea `localStorage`/IndexedDB y que su único mensaje aceptado sea
   `SKIP_WAITING` (mismo origen)?
3. ¿Se aprueba el identificador de build (`GITHUB_SHA`) en `/acerca` y en el nombre de caché?
4. ¿Alguna objeción a incluir `screenshots` del manifest capturadas con datos ficticios? (Si hay
   duda, se omiten: no son requisito de instalabilidad.)
5. ¿Se requiere purga adicional de `CacheStorage` al cerrar sesión, aun siendo assets públicos?

**Para `revisor-especificaciones`:**

6. Nota sobre Lighthouse: PWA ya no se mide con `lighthouse` ≥ 12; se propone evidencia CDP (moderna)
   + `lighthouse@11.7.1` pinneado para el criterio literal en F1-16 (§9).

**Para `supervisor-hidria` / DevOps (al desplegar staging):**

7. Headers recomendados en Cloudflare Pages: `sw.js` → `Cache-Control: no-cache`,
   `Service-Worker-Allowed: /`; `manifest.webmanifest` → `Cache-Control: public, max-age=3600`.
   Si se añade CSP: `worker-src 'self'`, `manifest-src 'self'`.

**Dependencia funcional futura:** `hasPendingWork()` se conectará a `ops_queue` en M4/M6/M10; hasta
entonces devuelve `false` (documentado, no oculta un riesgo: hoy no hay capturas offline).

---

## 12. Plan de ejecución al mergear #12

1. `git fetch origin`, `main` actualizado (supervisor confirmó base `20b6c50`), rama
   `feature/F1-02b-pwa` (worktree nuevo para no interferir con otros agentes).
2. Commit 1: este documento copiado a `hidria_coding_team/reports/F1/F1-02b_diseno_pwa.md` +
   dependencias/config (si revisión lo pide separado, se separa en commits atómicos).
3. Commit 2: activos (`manifest`, iconos, `offline.html`) + SW + `tsconfig.sw.json`.
4. Commit 3: UI de actualización/instalación (`UpdateBanner`, `useInstallPrompt`), `/acerca`,
   `__APP_BUILD__`.
5. Verificación local: `lint`, `typecheck`, `build`, smoke CDP E1–E10 (script fuera del repo, como en
   F1-02a), auditoría de caché y de bundle.
6. Reporte `reports/F1/F1-02b_pwa.md` (VERDE) + PR de secuencia con CI 4/4; avisar a supervisor,
   seguridad y QA. **Sin merge propio** (solo supervisor).

**Estimación:** ~360–420 líneas de código/config (sin lock, sin imágenes) y ~150 líneas de reporte.
Si excede ~400, se avisa y se propone secuencia (activos+SW / UI de actualización) como en F1-02a.

---

*Documento de diseño de `dev-frontend-pwa` para F1-02b. Materializado en el repo en el primer
commit de `feature/F1-02b-pwa` (PR #12 ya mergeado, `main` = `7ca0639`).*

---

## 13. Actualización de estado al implementar (2026-11-08)

### 13.1 Decisiones ya aprobadas (sustituyen los «pendientes» de §9 y §11)

- **ADR-008 aceptada con condiciones** (`decisions/ADR-008-criterio-pwa-cdp.md`): el criterio
  «Lighthouse PWA ≥ 90» se sustituye por **evidencia CDP** (manifest válido, `getInstallabilityErrors`
  vacío, SW controlando, navegación offline, registro de versión Chrome/CDP y `__APP_BUILD__`).
  `lighthouse@11.7.1` queda sólo como medición histórica no-gate; Lighthouse 13.x es
  complementario. El script reproducible `app/scripts/pwa-audit.mjs` (`npm run pwa:audit`) se
  entrega en **B/2**; en A/2 no existe todavía.
- **Sign-off de seguridad (`APROBADO CON CONDICIONES`)** incorporado al código:
  - sólo shell público precacheado; **sin handler genérico** de caché (default passthrough);
  - `NetworkOnly` para `*.supabase.co` y R2 (`*.r2.dev`, `*.r2.cloudflarestorage.com`);
  - el SW **no** lee `localStorage`/IndexedDB ni transporta tokens;
  - `SKIP_WAITING` sólo desde un cliente del **mismo origen** y con mensaje exacto sin payload;
  - denylist de navegación ampliada (`/offline.html`, `/sw.js`, `/manifest.webmanifest`,
    `/assets/`, `/icons/`, `/screenshots/`); `globIgnores` de screenshots y `.map`;
  - `offline.html` **no promete** persistencia offline antes de Dexie; el aviso de versión nueva
    nunca recarga solo;
  - screenshots: **no se incluyen** en esta entrega (no son requisito de instalabilidad y así se
    evita cualquier riesgo de PII/EXIF); quedan para cuando existan pantallas con datos ficticios
    aprobadas.
- **Condición pendiente de coordinación (no bloquea el PR):** `Cache-Control: no-store/private` en
  Supabase/EF y en objetos R2 sensibles, o `fetch(..., { cache: 'no-store' })` en descargas: el SW
  no controla la caché HTTP del navegador. Se traslada a Dev EF/DevOps (ver §13.3).

### 13.2 Correcciones de coherencia y su ubicación

- **Fases (decisión híbrida del usuario, sin ADR nuevo; `BACKLOG.md` PR #16):** en `registry.tsx`
  **M5 (IIH) → F2** y **M7 (Muestreo) → F1** con `phaseNote` «F1 mínimo / F2 completo». No cambian
  rutas ni contratos. **Esta corrección se entrega en B/2 (#22)**, no en A/2 (#21): A/2 no modifica
  `registry.tsx`.
- **§11 del reporte F1-02a** (`reports/F1/F1-02_shell_pwa.md`) actualizado al head final real
  `61aaa21`, squash `6c1372b` y CI 5/5 (el commit documental de cierre no cambió código).

### 13.3 Seguimiento

| Tema | Dónde |
|---|---|
| `Cache-Control: no-store/private` en Supabase/EF/R2 sensible | Dev EF + DevOps (F1-02b/F1-16), enlazado en el reporte |
| Escaneo `dist/**` + `npm audit --omit=dev` en CI | **task-50** (DevOps) |
| `/privacidad` pública con texto íntegro de `docs/06` | **task-51** |
| E2E Playwright versionado (sustituye al script local) | **task-49** (QA) |
| `lighthouse@11.7.1` histórico en staging | **F1-16** |
| `npm run pwa:audit` (script CDP) y `__APP_BUILD__` en `/acerca` | **Implementados en B/2 (#22)** — no existen en A/2 |
| Caché versionada `hidria-shell-<v>-<build>` | **Implementada en B/2 (#22)**: `PrecacheController({cacheName})` + limpieza de cachés antiguas en `activate` |
| Prueba de dos orígenes para el mensaje `SKIP_WAITING` | **task-49** (requiere segundo host); en A/2 hay guarda estática `scripts/check-sw-origin.mjs` |

### 13.4 Correcciones de la revisión de PR #21 (commits nuevos sobre `4b41f7e`)

- **B1 — origen exacto en `SKIP_WAITING`:** `sw.ts` compara ahora
  `new URL(sourceUrl).origin !== self.location.origin` (con `try/catch`), en lugar de
  `startsWith`. Se añade la guarda de regresión `app/scripts/check-sw-origin.mjs`, ejecutada en
  `npm run build` (y por tanto en CI), que falla si vuelve el patrón por prefijo y documenta los
  vectores (`https://origen.evil.example` → rechazado). La prueba funcional con dos orígenes reales
  requiere un segundo host y queda en **task-49**.
- **m1 — `pwa:audit`:** se retira de `package.json` en A/2 (el script llega en B/2); en su lugar
  A/2 declara `check:sw`.
- **m2 — caché versionada:** en A/2 el versionado era por revisiones de Workbox; **en B/2 se
  implementa el nombre de caché prometido** `hidria-shell-<vX.Y.Z>-<build>` con
  `PrecacheController({ cacheName })` y limpieza de cachés `hidria-shell-*` antiguas en el evento
  `activate` (D8 actualizada).
- **m3 — `offline.html`:** se elimina el `onclick` inline; el botón pasa a enlace `<a href="/">`
  (compatible con CSP `script-src 'self'` futura).
- **m4 — estado del documento:** actualizado a «Implementado (A/2 + B/2)».
- **m5 — `onRegisteredSW`:** eliminado de la descripción; el código no lo usa.
- **m6 — `localStorage`:** aclarado que el *ack* «offline listo» es estado de UI sin PII y que el SW
  no accede a `localStorage`/IndexedDB.

*Fin de la actualización.*
