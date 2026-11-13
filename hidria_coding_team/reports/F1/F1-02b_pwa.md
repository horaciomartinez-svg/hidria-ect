# F1-02b — PWA instalable, service worker y aviso de versión

| Campo | Valor |
|---|---|
| **Tarea** | `task-45` — F1-02b (secuencia de `task-43`/F1-02a) |
| **Agente** | `dev-frontend-pwa` (04) |
| **Base** | `main` = `7ca0639` (F1-02a mergeada; ADR-008 y cierre de #12 incluidos) |
| **Ramas** | **A** `feature/F1-02b-pwa` (PWA instalable base) · **B** `feature/F1-02b-pwa-ui` (UI de actualización/instalación + evidencia) |
| **Heads** | A: `4b41f7e` · B: _pendiente al publicar_ (§10) |
| **Secuencia** | El diff total (~900 líneas de código/config) supera el umbral de ~400: se entrega en **2 PRs** encadenados (A base → B UI/evidencia), sin reescribir historia |
| **Conclusión** | **VERDE** — PWA instalable verificada con evidencia CDP (11/11), sin secretos en artefactos y con la política de caché del sign-off de seguridad |

---

## 1. Resumen para el Lead

- **App instalable y offline:** manifest es-MX + iconos 192/512/maskable/180 + service worker
  (Workbox `injectManifest`) con precache del shell público y `NetworkOnly` para Supabase/R2.
- **Evidencia CDP (ADR-008):** `npm run pwa:audit` → **12/12 OK** (Chrome 157, perfil temporal):
  manifest servido y completo, `Page.getInstallabilityErrors` **vacío**, SW registrado/activo y
  controlando, caché versionada `hidria-shell-<v>-<build>`, 11 entradas **todas same-origin** (sin
  Supabase/R2), arranque offline con banner, `offline.html` sin red y accesible, versión/build
  visibles y **E8** sin secretos en `dist/`. El script sólo acepta hosts locales (SEC-PR22-01).
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
| Evidencia reproducible | `app/scripts/pwa-audit.mjs` (`npm run pwa:audit`) | Auditoría CDP (E1, E1b, E2, E3, E3b, E4, E5, E7, E9) conforme a ADR-008; registra versión de Chrome/CDP |

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

Ejecutado contra `vite preview` del build de producción. El script **lanza su propio Chrome con
perfil temporal** (SEC-PR22-01), que elimina al terminar, y exige `APP_URL`/`CDP_URL` locales:

```
Chrome/CDP: Chrome/157.0.8103.51 (http://127.0.0.1:<puerto efímero>)
App: http://localhost:4173
Perfil: temporal (se elimina al terminar)

OK   E8 sin secretos en artefactos de dist/ — 6 artefactos revisados
OK   E3 service worker registrado y activo
OK   E1 manifest servido con campos e iconos requeridos — 200 manifest.webmanifest · display=standalone · 192x192/512x512 · maskable=true
OK   E1b Page.getAppManifest sin errores de parseo
OK   E2 Page.getInstallabilityErrors vacío
OK   E3 service worker controlando la página
OK   E3b caché versionada hidria-shell-<version>-<build> — hidria-shell-0.1.0-f1-02b-fixes
OK   E7 caché sólo shell público same-origin — 11 entradas, 0 ajenas
OK   E10 offline.html accesible, es-MX y sin datos/handlers inline — 3,243 bytes
OK   E4 shell arranca sin red y muestra banner offline — banner=true
OK   E5 offline.html se sirve sin red
OK   E9 versión y build visibles en /acerca
NOTA E6 aviso de versión nueva: verificación manual/QA (task-49); no se automatiza en este script.

RESUMEN: 12/12 comprobaciones OK
```

**Mapa de comprobaciones (coherente con la cabecera del script):** E1/E1b manifest, **E2**
instalabilidad (con **fallback ADR-008** manifest+SW+offline si `Page.getInstallabilityErrors` no
existe), E3/E3b service worker y caché versionada, E4 offline, E5 `offline.html`, **E6 aviso de
versión = manual/QA (task-49, PWA-05)**, E7 caché same-origin, **E8 escaneo de secretos en
`dist/`**, E9 versión/build, **E10 `offline.html` accesible y sin datos**.

**Aviso de versión (E6):** con `BUILD_ID` distinto y `registration.update()` se verificó
`SW en waiting=true` y `[data-pwa-update]` presente en la UI. La **aplicación** del update
(click «Actualizar ahora» → `SKIP_WAITING` → recarga con el nuevo build) no se pudo medir de forma
determinista en headless por el estado del SW entre corridas; queda cubierta por la suite E2E
versionada (**task-49**, QA) y por la validación manual en staging (F1-16).

---

## 5. Build y verificación estática

```
npm run lint       → eslint src ..................................... EXIT 0
npm run typecheck  → tsc --noEmit && tsc -p tsconfig.sw.json --noEmit  EXIT 0
npm run build      → tsc … && node scripts/check-sw-origin.mjs && vite build  EXIT 0
                     ✓ 91 modules transformed · JS ≈ 482 kB │ gzip ≈ 139.6 kB
                     PWA v2.0.0 · injectManifest · precache 11 entries (≈ 545 KiB)
                     dist/sw.js generado (≈ 18 kB)
```

- Build **sin `.env`** (equivalente a CI): verde (la app arranca en modo «configuración incompleta»).
- **E8 (automático, en la auditoría):** escaneo de `dist/` (`sw.js`, manifest, JS, HTML) → sin
  `sb_secret_*`, sin `SUPABASE_SERVICE_ROLE_KEY` con valor y sin JWT con `role=service_role`.
  `service_role` sólo aparece como constante de comparación de la guarda de runtime.
- Guard build-time de clave pública intacto (probado en F1-02a; no se relajó).
- **SEC-PR22-01 probado en negativo:** `APP_URL=https://hidria.pages.dev` y
  `CDP_URL=https://example.com` **abortan** con mensaje explícito (la auditoría nunca apunta a
  staging/producción).

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
| PWA-06b | Caché versionada `hidria-shell-<v>-<build>` | OK (E3b: `hidria-shell-0.1.0-<build>`) |
| PWA-07 | Sin secretos en artefactos | OK (E8 automático: `dist/` escaneado) |
| PWA-08 | Versión + build en `/acerca` | OK (E9) |
| PWA-09 | a11y de banners/offline (320 px, contraste) | Revisión manual: `role=status`, `aria-live`, contraste AA, sin scroll horizontal |
| PWA-10 | `offline.html` accesible y sin datos | OK (E10: es-MX, landmark, sin handlers inline, sin tokens) |

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

- **PR-A (mergeada):** `feature/F1-02b-pwa` @ `73df49b` → `main` por squash
  **`7cc84a2`** (head final revisado `73df49b`; CI 10/10 incl. pgTAP y E2E Playwright).
- **PR-B (este):** `feature/F1-02b-pwa-ui`, rebasado/mergeado sobre `main` = `057ad79`. Incluye la
  UI de actualización/instalación, las fases híbridas M5→F2 / M7 F1 (con `phaseNote`), la evidencia
  CDP y las piezas que A/2 difirió:
  - **`__APP_BUILD__`** restaurado (`vite define` + `APP_BUILD` en `config.ts` + declaración de
    tipos) y visible en `/acerca` junto con la versión.
  - **Caché versionada** `hidria-shell-<vX.Y.Z>-<build>` implementada con
    `PrecacheController({ cacheName })` y limpieza de cachés `hidria-shell-*` antiguas en
    `activate` (sin acumulación entre builds).
  - **`npm run pwa:audit`** (`app/scripts/pwa-audit.mjs`) publicado.
- **Head de B/2, CI y veredictos:** ver §10.1 (se completa al publicar el head final).
- Revisión solicitada: spec (alcance B/2 y fases), seguridad (SW/caché/secretos/APP_BUILD) y
  QA (auditoría CDP E1–E10 + offline).

### 10.1 Verificación del head de B/2

- Base: `main` = `a6cc7e6` (A/2 mergeada en `7cc84a2`; #26/#27/#28 incluidos). Rama
  `feature/F1-02b-pwa-ui` actualizada por merge (sin reescritura de historia).
- `npm ci`: **OK** (conserva `@playwright/test` y Workbox).
- `lint` **0**; `typecheck` (cliente + SW) **0**; `build` **0**; `check:sw` ejecutado en build.
- **Auditoría CDP local: 12/12** (Chrome 157.0.8103.51, perfil temporal) — E8 (secretos), E3b
  (caché versionada `hidria-shell-0.1.0-<build>`) y E10 (`offline.html` a11y) incluidos; build id
  visible en `/acerca`.
- `tests/e2e`: **11 passed** (Chrome local) con la aserción híbrida M5 F2 / M7 F1.
- **Head de B/2 y CI:** ver §10.2.

### 10.2 Head y CI del PR de B/2

- **Heads verificados:** `e1d01d1` (CI **10/10**: Guardas, Cliente, Deno, pgTAP 133 y
  E2E Playwright 11/11) y `2cf6cc4` (merge de `main@a6cc7e6` + cierre documental; E2E en rojo
  **por el runner** `ubuntu-latest` 26.04 con Playwright 1.55, no por el código — hotfix de CI en
  #29/DevOps).
- **Fix de la revisión incluido:** `tests/e2e/shell.spec.ts` alineado con la decisión híbrida
  (M5 `/iih` → «Fase prevista F2»; M7 `/muestreo` → F1 con `phaseNote` «F1 mínimo / F2 completo»),
  sin cambiar producto ni el resto de casos.
- **Batch de re-revisión aplicado (spec + seguridad):**
  - **SEC-PR22-01 (MAYOR):** `pwa:audit` **sólo acepta hosts locales** (`localhost`/`127.0.0.1`/
    `[::1]`) en `APP_URL`/`CDP_URL` — probado en negativo con `hidria.pages.dev` y `example.com`
    (aborta con mensaje); lanza **Chrome propio con perfil temporal** y lo elimina al terminar
    (verificado: 0 perfiles `hidria-pwa-audit-*` tras la ejecución).
  - **SEC-PR22-02 / M1:** **E8 implementado** (escaneo de `dist/`) y **E10 implementado**
    (`offline.html` a11y); **E6 mapeado explícitamente como manual/QA** (task-49, PWA-05).
  - **M2:** fallback ADR-008 si `Page.getInstallabilityErrors` no existe (manifest + SW + offline),
    en lugar de fallar.
  - **M3:** storageKey sintética documentada — se deriva del host de `AUDIT_SUPABASE_URL`
    (`sb-127-auth-token` en local), no es la clave del proyecto real; sesión `auditoria@ejemplo.invalid`.
  - **m1:** limpieza de la caché heredada `workbox-precache-*` (A/2) en `activate`.
  - **m2:** `promptInstall` con `catch` y mensaje accesible en la UI.
  - **B2:** este §10 con base/head/CI y conteo CDP unificado (12/12 comprobaciones; IDs
    E1/E1b/E2/E3/E3b/E4/E5/E7/E8/E9/E10 + E6 manual).
- **Head final del PR y CI:** se actualiza tras el merge del hotfix de CI (#29) y la re-ejecución
  de los 5 checks (Guardas, Cliente, Deno, pgTAP, E2E).

*Reporte de `dev-frontend-pwa` para F1-02b.*
