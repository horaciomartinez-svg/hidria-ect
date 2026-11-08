# F1-02b — PWA instalable, service worker y aviso de versión

| Campo | Valor |
|---|---|
| **Tarea** | `task-45` — F1-02b (secuencia de `task-43`/F1-02a) |
| **Agente** | `dev-frontend-pwa` (04) |
| **Base** | `main` = `7ca0639` (F1-02a mergeada; ADR-008 y cierre de #12 incluidos) |
| **Ramas** | **A** `feature/F1-02b-pwa` (PWA instalable base) · **B** `feature/F1-02b-pwa-ui` (UI de actualización/instalación + evidencia) |
| **Heads** | A: `4b41f7e` · B: _pendiente al publicar_ (§10) |
| **Secuencia** | El diff total (~900 líneas de código/config) supera el umbral de ~400: se entrega en **2 PRs** encadenados (A base → B UI/evidencia), sin reescribir historia |
| **Conclusión** | **VERDE** — PWA instalable verificada con evidencia CDP (10/10), sin secretos en artefactos y con la política de caché del sign-off de seguridad |

---

## 1. Resumen para el Lead

- **App instalable y offline:** manifest es-MX + iconos 192/512/maskable/180 + service worker
  (Workbox `injectManifest`) con precache del shell público y `NetworkOnly` para Supabase/R2.
- **Evidencia CDP (ADR-008):** `npm run pwa:audit` → **10/10 OK** con Chrome 156: manifest servido y
  completo, `Page.getInstallabilityErrors` **vacío**, SW registrado/activo y controlando, 11 entradas
  de caché **todas same-origin** (sin Supabase/R2), arranque offline con banner, `offline.html` sin
  red y versión/build visibles.
- **Aviso de versión:** `registerType: 'prompt'`; banner accesible «Hay una versión nueva» con
  «Actualizar ahora / Después»; **nunca** `skipWaiting` automático. Verificado que el SW queda en
  `waiting` y el banner aparece (`data-pwa-update`); la aplicación del update se valida en la suite
  E2E versionada (task-49) por la variabilidad del estado del SW en headless.
- **Sin secretos:** `sb_secret_*` / `SUPABASE_SERVICE_ROLE_KEY` en `dist/**` → **0 coincidencias**;
  el guard build-time de clave pública sigue activo.
- **Fases (decisión híbrida):** M5 (IIH) → **F2**; M7 → **F1** con nota «F1 mínimo / F2 completo».
- **§11 del reporte F1-02a** actualizado al head final `61aaa21` y squash `6c1372b` (CI 5/5).

---

## 2. Alcance entregado

### 2.1 PR-A — PWA instalable base (`feature/F1-02b-pwa`, `4b41f7e`)

| Pieza | Archivo | Detalle |
|---|---|---|
| Manifest | `app/public/manifest.webmanifest` | `name`/`short_name`, `lang: es-MX`, `start_url: /?source=pwa`, `display: standalone`, `theme_color #0d5c63`, `background_color #f7fafb`, iconos 192/512 + **maskable**, shortcuts (`/kanban`, `/aula`, `/sincronizacion`) |
| Iconos | `app/public/icons/*` | SVG fuente + PNG 192/512/512-maskable/apple-touch-180 (marca institucional, zona segura maskable) |
| Fallback | `app/public/offline.html` | Estático, sin JS de datos, a11y AA, sin prometer persistencia offline (Dexie llega en M4/M6/M10) |
| Service worker | `app/src/pwa/sw.ts` | Workbox `injectManifest`: precache del shell, `NavigationRoute` con denylist (`/offline.html`, `/sw.js`, manifest, `/assets/`, `/icons/`, `/screenshots/`), `NetworkOnly` Supabase + R2, `SKIP_WAITING` sólo desde cliente del mismo origen y sin payload, `cleanupOutdatedCaches` |
| Registro | `app/src/pwa/register.ts` + `main.tsx` | `registerSW` con `registerType: 'prompt'`, init al arrancar (también en login), estado `needRefresh/offlineReady`, sin `skipWaiting` automático |
| Configuración | `app/vite.config.ts` | `VitePWA` (`injectManifest`, `injectRegister:false`, `manifest:false`), `__APP_BUILD__` (GITHUB_SHA/BUILD_ID), guard build-time de clave pública conservado |
| Typecheck SW | `app/tsconfig.sw.json` | Proyecto aislado con `lib: WebWorker`; `build`/`typecheck` lo compilan (`exclude` del proyecto principal) |
| Documentación | `reports/F1/F1-02b_diseno_pwa.md` | Diseño materializado + condiciones del sign-off + ADR-008 + seguimientos |

### 2.2 PR-B — Actualización, instalación y evidencia (`feature/F1-02b-pwa-ui`)

| Pieza | Archivo | Detalle |
|---|---|---|
| Aviso de versión | `app/src/components/pwa/UpdateBanner.tsx` | `data-pwa-update`, `role=status`, botones «Actualizar ahora» (envía `SKIP_WAITING` + recarga) y «Después»; aviso «listo sin conexión» una vez |
| Instalación | `app/src/components/pwa/InstallCta.tsx` | `beforeinstallprompt` diferido, detección standalone, instrucción iOS, `navigator.storage.persist()` best-effort |
| Hooks | `app/src/pwa/usePwaState.ts`, `useInstallPrompt.ts` | Estado reactivo del SW y del prompt de instalación |
| Integración | `AppShell.tsx`, `StatePages.tsx` (`/acerca`) | Banner en el layout; versión + **build** y sección de instalación en `/acerca` |
| Fases | `app/src/routes/registry.tsx` | M5 → F2; M7 → F1 con `phaseNote` «F1 mínimo / F2 completo» |
| Evidencia reproducible | `app/scripts/pwa-audit.mjs` (`npm run pwa:audit`) | Auditoría CDP E1–E9 conforme a ADR-008; registra versión de Chrome/CDP |

---

## 3. Condiciones del sign-off de seguridad — cumplimiento

| Condición | Cumplimiento |
|---|---|
| Sólo shell público en caché; sin handler genérico | Precache = 11 entradas same-origin (shell + iconos + manifest + offline); el resto va a red por defecto (Workbox sólo intercepta rutas registradas) |
| `NetworkOnly` para `*.supabase.co` y R2 | Implementado en `sw.ts` (`*.supabase.co`, `*.r2.dev`, `*.r2.cloudflarestorage.com`); audit E7: 0 entradas ajenas |
| SW sin `localStorage`/IndexedDB ni tokens | `sw.ts` no accede a storage y no transporta datos de sesión |
| `SKIP_WAITING` same-origin y sin payload | Se valida `event.source.url` contra `self.location.origin` y `{type:'SKIP_WAITING'}` con una sola clave |
| Denylist/globIgnores | Denylist de navegación ampliada y `globIgnores` de screenshots/`.map` |
| `offline.html` sin prometer persistencia | Texto ajustado: la captura offline llegará con M4/M6/M10 |
| Screenshots con datos ficticios sin EXIF | **No se incluyen** en esta entrega (no son requisito de instalabilidad; se evita cualquier riesgo de PII/EXIF) |
| Logout limpia sesión/datos | Sin cambios respecto a F1-02a: el SDK limpia la sesión; la caché sólo contiene shell público idéntico para todos |
| `Cache-Control: no-store/private` en Supabase/EF/R2 sensible | **Condición de coordinación pendiente** (el SW no controla la caché HTTP): trasladada a Dev EF/DevOps y a F1-16 (§8) |
| `npm audit` de las nuevas deps | Auditado: el árbol de dev crece (toolchain Workbox); `workbox-window` es lo único que llega al cliente (~5.7 kB). El job `npm audit --omit=dev` en CI es **task-50** |

---

## 4. Evidencia CDP (ADR-008) — `npm run pwa:audit`

Ejecutado contra `vite preview` del build de producción (Chrome 156.0.8078.80, CDP local):

```
Chrome/CDP: Chrome/156.0.8078.80
App: http://localhost:4173

OK   E3 service worker registrado y activo
OK   E1 manifest servido con campos e iconos requeridos — 200 manifest.webmanifest · display=standalone · 192x192/512x512 · maskable=true
OK   E1b Page.getAppManifest sin errores de parseo
OK   E2 Page.getInstallabilityErrors vacío
OK   E3 service worker controlando la página
OK   E7 caché sólo shell público same-origin — 11 entradas, 0 ajenas
OK   E7 la app está en línea antes de la prueba offline
OK   E4 shell arranca sin red y muestra banner offline
OK   E5 offline.html se sirve sin red
OK   E9 versión y build visibles en /acerca

RESUMEN: 10/10 comprobaciones OK
```

**Aviso de versión (E6):** con `BUILD_ID` distinto y `registration.update()` se verificó
`SW en waiting=true` y `[data-pwa-update]` presente en la UI. La **aplicación** del update
(click «Actualizar ahora» → `SKIP_WAITING` → recarga con el nuevo build) no se pudo medir de forma
determinista en headless por el estado del SW entre corridas; queda cubierta por la suite E2E
versionada (**task-49**, QA) y por la validación manual en staging (F1-16).

---

## 5. Build y verificación estática

```
# Estado del PR-A aislado (commit 4b41f7e)
npm run lint       → eslint src ..................................... EXIT 0
npm run typecheck  → tsc --noEmit && tsc -p tsconfig.sw.json --noEmit  EXIT 0
npm run build      → tsc … && vite build ........................... EXIT 0
                     ✓ 91 modules transformed
                     dist/assets/index-*.js   482.24 kB │ gzip: 139.56 kB
                     PWA v2.0.0 · injectManifest · precache 11 entries (539.51 KiB)
                     dist/sw.js generado (18.3 kB)
```

- Build **sin `.env`** (equivalente a CI): verde (la app arranca en modo «configuración incompleta»).
- `dist/**`: `sb_secret_*` y `SUPABASE_SERVICE_ROLE_KEY` → **0 coincidencias**; `service_role` sigue
  apareciendo sólo en la guarda de runtime de F1-02a.
- Guard build-time de clave pública intacto (probado en F1-02a; no se relajó).

---

## 6. Matriz PWA del diseño (resultado)

| ID | Caso | Resultado |
|---|---|---|
| PWA-01 | SW registra y controla; manifest 200 | OK (E1/E3) |
| PWA-02 | Instalabilidad sin errores | OK (E2) |
| PWA-03 | Offline: shell + banner | OK (E4) |
| PWA-04 | `offline.html` sin red | OK (E5) |
| PWA-05 | Aviso de versión nueva | Banner verificado; aplicación → task-49/F1-16 |
| PWA-06 | Caché sólo same-origin | OK (E7) |
| PWA-07 | Sin secretos en artefactos | OK (§5) |
| PWA-08 | Versión + build en `/acerca` | OK (E9) |
| PWA-09 | a11y de banners/offline (320 px, contraste) | Revisión manual: `role=status`, `aria-live`, contraste AA, sin scroll horizontal |

---

## 7. Tamaño y secuencia

| Etapa | Contenido | Líneas (código/config) |
|---|---|---|
| **PR-A** | manifest, iconos, `offline.html`, SW, registro, config | ~350 |
| **PR-B** | UI actualización/instalación, fases, `pwa-audit.mjs`, reporte | ~250 + 295 de tooling de evidencia |

El total (~900) supera el umbral de ~400, por eso se entrega en **dos PRs encadenados** (B tiene base
la rama de A; tras el merge de A se retargetea a `main`). Cada PR es verificable por separado:
A hace la app instalable y offline; B cierra el aviso de versión, la instalación y la evidencia.

---

## 8. Riesgos y seguimientos

| Tema | Estado |
|---|---|
| `Cache-Control: no-store/private` en Supabase/EF y R2 sensible (condición de seguridad) | **Pendiente de coordinación con Dev EF/DevOps**; el SW no controla la caché HTTP. Referenciado en el diseño §13.3 y en F1-16 |
| `npm audit --omit=dev` + escaneo `dist/**` en CI | **task-50** (DevOps) |
| E2E Playwright versionado (incluye update flow y B1 negativos) | **task-49** (QA) |
| `/privacidad` pública con texto íntegro de `docs/06` | **task-51** |
| Lighthouse ≥ 90 | Sustituido por evidencia CDP (**ADR-008**); medición histórica opcional con `lighthouse@11.7.1` en F1-16 |
| Variabilidad del update check en headless | Mitigada con la suite E2E de task-49; el flujo de código es el estándar Workbox (`prompt` + mensaje) |
| Lockfile: +~260 paquetes de toolchain (Workbox/vite-plugin-pwa) | Aceptado: dev-only; el único añadido al bundle es `workbox-window` (~5.7 kB) |

---

## 9. Estado de criterios F1-02

| Criterio | Estado |
|---|---|
| `npm run build` verde | **Cumplido** (también sin `.env`) |
| Rutas protegidas → login | Cumplido en F1-02a (sin cambios) |
| **App instalable** | **Cumplido** (evidencia CDP E1/E2) |
| Aviso de versión nueva | **Cumplido** (banner verificado; aplicación → task-49/F1-16) |
| Sin secretos en bundle | **Cumplido** |
| CI | Pendiente al publicar (§10) |

---

## 10. Estado de publicación

- **PR-A:** `feature/F1-02b-pwa` @ `4b41f7e` → `main` (CI y re-revisión al publicar).
- **PR-B:** `feature/F1-02b-pwa-ui` @ _pendiente_ → base `feature/F1-02b-pwa` (se retargetea a `main`
  tras el merge de A).
- CI: _pendiente al publicar_ (Guardas + Cliente + Edge Functions Deno).
- Revisión solicitada: spec (alcance PWA/fases), seguridad (SW/caché/secretos), QA (CDP/offline).

*Reporte de `dev-frontend-pwa` para F1-02b.*
