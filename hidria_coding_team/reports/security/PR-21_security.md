# PR #21 — Revisión de Seguridad (F1-02b A/2: PWA instalable, SW y caché)

- **Agente:** `seguridad-privacidad` (08) — autoridad de **veto**
- **Fecha:** 2026-11-08 13:15 (America/Mexico_City)
- **PR:** [#21](https://github.com/horaciomartinez-svg/hidria-ect/pull/21) — `feature/F1-02b-pwa` → `main`
  («feat(f1-02b) A/2: PWA instalable — manifest, iconos, offline y service worker»)
- **Head revisado:** `4b41f7e7c2462b3edd0b8451c2c9e5a0cc5772c2`; base `main@4765986`; 1 commit,
  **20 archivos, +7173/−2252** (incluye iconos y lock); `mergeable_state: clean`; CI **4/4 success**
  (Guardas, Cliente, Edge Functions Deno, pgTAP Supabase local). Autor: `dev-frontend-pwa`.
- **Alcance real:** `app/**` + `reports/F1/F1-02_shell_pwa.md`, `reports/F1/F1-02b_diseno_pwa.md` y
  `package-lock.json`; **sin** `supabase/**`, `.github/**` ni `.env`. (El diff directo
  `4765986..head` muestra inversiones de docs por la base antigua de la rama; el diff real es
  `4765986...4b41f7e` = 20 archivos, coincide con MCP `changed_files: 20`.)
- **Método:** revisión estática del SW/registro/manifest/offline/vite config; `git grep` de
  localStorage/IDB/tokens/sinks; secret scan del diff; `npm audit --package-lock-only --omit=dev`;
  contraste con el sign-off de F1-02b y ADR-008; CI. No ejecuté build/E2E en mi entorno (CI 4/4 y
  build del autor); no hay cambios de BD/EF.

## Veredicto: **APROBADO CON OBSERVACIONES — SIN VETO**

La implementación cumple el sign-off de caché/SW: precache **sólo shell público**, `NetworkOnly`
explícito para Supabase/R2, sin handler genérico, SW **sin localStorage/IndexedDB**, único mensaje
`SKIP_WAITING` con comprobación de origen (mejorable), `registerType:'prompt'` sin activación
automática, SW desactivado en dev, manifest/offline/iconos sin datos, `__APP_BUILD__` sin secretos
y guard build-time intacto. No hay secretos ni claves reales en el diff; Workbox 7.4.1 no añade
advisories high/critical en producción. Las condiciones restantes son el control exacto de origen
del mensaje, `Cache-Control: no-store/private` en Supabase/EF/R2 sensible (task-50/51, fuera del
SW) y la verificación CDP/QA del PR B/2.

## 1. Service worker — política de caché

| Verificación | Resultado |
|---|---|
| Precache **sólo shell público** (`index.html`, assets, iconos, manifest, `offline.html`) | ✅ `injectManifest` con `globPatterns` de estáticos; `globIgnores` screenshots/`.map`; reporte del autor: 11 entradas |
| Default **passthrough** (sin handler genérico de caché) | ✅ sólo rutas registradas; no hay `CacheFirst`/`StaleWhileRevalidate` genérico |
| `NetworkOnly` para Supabase (Auth/REST/Functions) | ✅ `url.hostname.endsWith('.supabase.co')` |
| `NetworkOnly` para R2 (`.r2.dev`, `.r2.cloudflarestorage.com`) | ✅; dominios R2 personalizados caen en default passthrough (tampoco se cachean) |
| Respuestas autenticadas/tokens/URLs prefirmadas en `CacheStorage` | ✅ no hay rutas que las cubran; la caché es de assets públicos |
| `NavigationRoute` | ✅ sirve shell precacheado; denylist `/offline.html`, `/sw.js`, manifest, `/assets/`, `/icons/`, `/screenshots/` |
| Sin `localStorage`/IndexedDB en el SW | ✅ el único `localStorage` del diff está en `register.ts` (app, flag `hidria:pwa-offline-ready-ack`, sin tokens/PII) |
| `skipWaiting` automático | ✅ **no**; sólo se llama tras mensaje validado |
| `cleanupOutdatedCaches` | ✅ |
| SW desactivado en dev | ✅ `devOptions.enabled:false`; registro explícito en `main.tsx` |
| SW sirve sólo same-origin | ✅ scope `/`; no `importScripts` remotos |

**Observación SEC-PR21-01 (MENOR):** el handler de `message` valida
`sourceUrl.startsWith(self.location.origin)`. Es un chequeo de **prefijo**, no de origen exacto:
una URL como `https://app.example.com.evil.com` también hace match. En la práctica un cliente
cross-origin no puede hablar con este SW, pero la comprobación debe ser exacta:
`new URL(sourceUrl).origin === self.location.origin` (y mantener `Object.keys(data)`/payload
exactos). No es un bypass explotable conocido, sí endurecimiento.

**Observación SEC-PR21-02 (condición, no bloqueante):** `NetworkOnly` **no controla la caché HTTP
del navegador**. Para que una respuesta autenticada, un documento `restringido_nda` o una URL
prefirmada de R2 no quede en la caché del navegador, Supabase/EF y R2 sensible deben enviar
`Cache-Control: no-store/private` (o usarse `fetch(...,{cache:'no-store'})` en descargas). Es
condición ya registrada del sign-off y queda como follow-up **task-50/51** (Dev EF/DevOps); el SW
no puede resolverla por sí solo. No hay datos reales en esta entrega.

## 2. Actualización y registro

- `registerType:'prompt'`, `injectRegister:false`, `registerSW({immediate:true})`; el SW nuevo
  queda en `waiting` y sólo se activa con `applyUpdate()` → `updateServiceWorker(true)` (botón de
  UI en B/2). **No hay auto-skip ni auto-reload.** ✅
- `dismissUpdate()` sólo oculta el aviso; no cambia el SW. `hasPendingWork()` queda para
  M4/M6/M10; en F1-02b no hay cola. ✅
- `initServiceWorker()` se invoca al arrancar (también en `/login`) para instalabilidad; en dev el
  SW está deshabilitado por `devOptions`. No transporta tokens ni credenciales. ✅
- **Observación SEC-PR21-03 (OBS):** el diseño aprobado mencionaba nombre de caché
  `hidria-shell-<vX.Y.Z>-<sha>`; `vite.config` define `__APP_BUILD__` pero no configura
  `cacheId`/nombre de caché de Workbox. No es un riesgo de seguridad (la caché es pública y
  `cleanupOutdatedCaches` gestiona versiones), pero conviene alinearlo en B/2 si se quiere la
  trazabilidad de caché acordada.
- **Observación SEC-PR21-04 (OBS):** `package.json` añade `pwa:audit` (`node scripts/pwa-audit.mjs`)
  pero el script no está en este PR; se anuncia para B/2. No es seguridad; QA debe evitar declarar
  la auditoría ejecutada hasta que exista el archivo.

## 3. Manifest, iconos y `offline.html`

- `manifest.webmanifest`: `id/start_url/scope/display`, iconos 192/512/maskable, `theme_color`
  `#0d5c63`; **sin `screenshots`** (por tanto sin riesgo de PII/EXIF en capturas); shortcuts a rutas
  internas; `start_url` con query inocuo `?source=pwa`. ✅
- Iconos SVG/PNG generados; sin datos de usuarios/empresas; `apple-touch-icon` presente. ✅
- `offline.html`: estático, sin JS de datos (sólo `location.reload()` inline), sin PII, sin promesa
  de captura offline (aclara que llega con M4/M6/M10); `noindex`. ✅
- `index.html` sólo añade manifest/iconos; sin claves ni valores de entorno. ✅

## 4. Build, secretos y dependencias

| Verificación | Resultado |
|---|---|
| Guard build-time de `VITE_SUPABASE_ANON_KEY` | ✅ intacto (`loadEnv` + rechazo `sb_secret_*`, JWT no-`anon`, ilegible) |
| `__APP_BUILD__` | ✅ `GITHUB_SHA`/`BUILD_ID` recortado a 12 chars, público, sin secretos; `APP_BUILD` exportado |
| Claves reales en diff/bundle | ✅ secret scan del diff **0**; sin `.env`; sólo literales de guarda/UI |
| Config del cliente | ✅ sigue leyendo sólo `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; `SERVICE_ROLE` nunca en cliente |
| Nuevas deps Workbox/vite-plugin-pwa | ✅ `vite-plugin-pwa@2.0.0`, `workbox-*@7.4.1`; lock íntegro desde registry; al cliente sólo `workbox-window` |
| `npm audit --package-lock-only --omit=dev` | ✅ **0 high/critical**; 2 moderate preexistentes de `react-router-dom` (GHSA-wrjc-x8rr-h8h6/337j-9hxr-rhxg), ya rastreados en task-50/51; **Workbox no aparece** |
| XSS | ✅ sin `dangerouslySetInnerHTML`/`innerHTML`/`eval` nuevos; SW no toca DOM; `offline.html` estático |
| Alcance | ✅ 20 archivos `app/**`+reportes+lock; sin `supabase/**`/`.github/**` |

## 5. Cache HTTP, logout y dispositivo compartido

- El SW no lee/escribe `localStorage` ni IndexedDB; el flag de «offline listo» es UI no sensible.
- No se exige purga de `CacheStorage` al logout para assets públicos (sign-off); sí sigue vigente
  que logout limpie sesión/datos de usuario y que cualquier futuro espejo Dexie/ops_queue tenga
  purga/ADR-012. El riesgo residual de dispositivo compartido no está en esta caché.
- **SEC-PR21-02** (arriba) es la condición pendiente para que la caché HTTP no retenga datos
  autenticados/R2; no hay datos reales en F1-02b A/2.

## 6. Observaciones / condiciones

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| **SEC-PR21-01** | MENOR | Validación de origen por prefijo (`startsWith`) en el mensaje `SKIP_WAITING`. | Usar `new URL(sourceUrl).origin === self.location.origin`; mantener payload exacto. |
| **SEC-PR21-02** | MAYOR (condición de producción) | `NetworkOnly` no evita la caché HTTP de respuestas autenticadas/R2. | `Cache-Control: no-store/private` en Supabase/EF y R2 sensible (task-50/51); documentar. No hay datos reales aún. |
| **SEC-PR21-03** | OBS | No se configura el nombre de caché `hidria-shell-<vX.Y.Z>-<sha>` del diseño (sólo `__APP_BUILD__`). | Alinear en B/2 si se quiere trazabilidad; sin impacto de seguridad. |
| **SEC-PR21-04** | OBS (QA) | `pwa:audit` se anuncia pero el script no está en A/2. | Verificar que exista en B/2 antes de declarar la auditoría CDP. |
| **SEC-PR21-05** | OBS | Audit prod: 2 moderate preexistentes de react-router; full dev tiene el high de Vite preexistente. | No introducido por A/2; task-50/51/audit CI. |

No hay hallazgos nuevos de caché de datos, tokens, secretos, XSS ni `service_role`.

## 7. Conclusión

**APROBADO CON OBSERVACIONES, SIN VETO** para `4b41f7e` (F1-02b A/2): la política implementada
coincide con el sign-off (shell público, `NetworkOnly` Supabase/R2, sin localStorage/IDB en SW,
`SKIP_WAITING` same-origin, prompt sin auto-activación, dev off, manifest/offline sin datos,
`__APP_BUILD__` público, guard build-time intacto, Workbox sin high/critical). Antes de producción
deben cerrarse SEC-PR21-01 (origen exacto), SEC-PR21-02 (no-store HTTP, task-50/51) y las
observaciones de trazabilidad/CDP; el PR B/2 (#22) se revisará tras el merge de #21. CI 4/4 y
`mergeable_state: clean`; sin secretos, sin cambios de BD/EF.

## Firma

`seguridad-privacidad` (08) — **APROBADO CON OBSERVACIONES** (sin veto) para
`4b41f7e7c2462b3edd0b8451c2c9e5a0cc5772c2` del PR #21. Sin fuga de secretos/datos reales, sin
cambios de BD/EF ni relajación del guard build-time; condiciones SEC-PR21-01/02 y observaciones
registradas. Sin `git` de escritura, sin merge y sin publicar tokens/secretos.
