# PR #21 — QA: F1-02b (A/2) PWA instalable — manifest, iconos, offline y SW

- **Agente:** `qa-tester` (05)
- **Fecha:** 2026-11-08 13:20 (America/Mexico_City)
- **Tarea:** `task-62` — F1 · QA PR #21 (F1-02b A/2)
- **PR:** [#21](https://github.com/horaciomartinez-svg/hidria-ect/pull/21) — `feature/F1-02b-pwa` → `main`
- **Head evaluado:** `4b41f7e7c2462b3edd0b8451c2c9e5a0cc5772c2` · **Base:** `main` `47659869673a475aadc8bf3d467b3806f76e17ff` (merge-base `7ca0639`)
- **Diff:** 20 archivos, +7173/−2252 (código/config `app/**`, reportes F1-02/02b, `package-lock.json`; binarios de iconos). Sin `supabase/**`, `.github/**`, `docs/**` ni `tests/**`.
- **Entorno:** Windows / PowerShell 5.1 · Node 24.21.0 / npm 11.19.0 (CI Node 22) · build **sin `.env`**

## Resultado: **VERDE** (A/2) — con 2 observaciones P2 no bloqueantes

> **Sí es VERDE para la unidad A/2**: `npm ci`, `lint`, `typecheck` y `build` reproducidos sin
> `.env`; el build genera `sw.js` (`injectManifest`, 11 entradas de precache), `manifest.webmanifest`,
> `offline.html` e iconos en `dist/`; la política de caché es correcta (solo shell, `NetworkOnly`
> Supabase/R2, sin tokens/IDB, `SKIP_WAITING` same-origin, SW deshabilitado en dev); manifest
> instalable; offline accesible; CI **7/7 check runs** verde (incluye pgTAP); `docs/02` intacto,
> sin secretos y alcance correcto.
> **No se exige aquí** la evidencia de instalabilidad/Lighthouse: corresponde a **F1-16/ADR-008**
> (y a la parte B/2, PR #22), tal como indicó el supervisor. No se declaran verdes funcionales
> de instalabilidad en la matriz.

## 1. Comandos reproducidos (sin `.env`)

| # | Comando | Resultado |
|---|---|---|
| 1 | `npm ci` | exit 0 |
| 2 | `npm run lint` | **exit 0** |
| 3 | `npm run typecheck` (`tsc --noEmit` + `tsc -p tsconfig.sw.json --noEmit`) | **exit 0** |
| 4 | `npm run build` (`tsc` + SW + `vite build` + PWA) | **exit 0** |

Salida del build:

```text
dist/index.html                                    1.02 kB
dist/assets/index-BYC000_c.css                    17.63 kB (4.15 kB gzip)
dist/assets/workbox-window.prod.es5-BqEJf4Xk.js    5.71 kB (2.34 kB gzip)
dist/assets/index-C_5d7sew.js                    477.19 kB (138.37 kB gzip)

PWA v2.0.0 · injectManifest · precache 11 entries (539.51 KiB)
files generated: dist/sw.js (18,335 B)
```

`.env` no existe en el árbol; no se necesitó. Coincide con el reporte del autor (SW 18.3 kB,
JS 482 kB/139.6 kB gzip aproximadamente; la diferencia de bytes es por el commit exacto).

## 2. Artefactos PWA generados en `dist/`

| Artefacto | Comprobación |
|---|---|
| `dist/sw.js` | Generado por `injectManifest`; 18,335 B; precache **11 entradas** (index/assets con hash/iconos/manifest/offline); `SKIP_WAITING` presente |
| `dist/manifest.webmanifest` | 1,137 B; `name`/`short_name`, `lang es-MX`, `start_url=/?source=pwa`, `scope=/`, `display=standalone`, `theme_color=#0d5c63`, `background_color=#f7fafb`, 3 iconos |
| `dist/offline.html` | 3,039 B; estático, sin datos; `main`, `h1`, `button` y `:focus-visible` |
| `dist/icons/*` | `icon-192.png` 192×192, `icon-512.png` 512×512, `icon-512-maskable.png` 512×512, `apple-touch-icon-180.png` 180×180, `hidria-icon.svg`; todos presentes |
| Registro | `main.tsx` → `initServiceWorker()`; `registerType:'prompt'`; `injectRegister:false`; manifest propio en `public/` |

## 3. Política de caché/seguridad (revisión estática + SW generado)

| Requisito | Estado |
|---|---|
| Precache **solo shell público** (no datos de usuario) | ✓ `precacheAndRoute(self.__WB_MANIFEST)`; `globPatterns` shell/assets/iconos/manifest/offline; 11 entradas |
| `NetworkOnly` para **Supabase** | ✓ `url.hostname.endsWith('.supabase.co')` → `NetworkOnly` (presente en `sw.js`) |
| `NetworkOnly` para **R2** | ✓ `.r2.dev` y `.r2.cloudflarestorage.com` → `NetworkOnly` (presente en `sw.js`) |
| Sin caché genérica de runtime | ✓ no hay `registerRoute` con `CacheFirst`/`StaleWhileRevalidate`; default passthrough |
| Sin tokens ni `localStorage`/IndexedDB en el **SW** | ✓ `sw.js` no contiene `localStorage`/`indexedDB`; no transporta tokens |
| `SKIP_WAITING` solo same-origin y sin payload | ✓ `event.source.url.startsWith(self.location.origin)`; exige objeto con exactamente `{type:'SKIP_WAITING'}` |
| Actualización no automática | ✓ `registerType:'prompt'`; `skipWaiting` solo por mensaje de la UI |
| `cleanupOutdatedCaches` | ✓ presente |
| `NavigationRoute` con denylist (`offline.html`, `sw.js`, manifest, assets, iconos, screenshots) | ✓ en `sw.ts`; fallback `/index.html` precacheado |
| SW apagado en **dev** | ✓ `VitePWA({ devOptions:{ enabled:false } })`; registro explícito vía `virtual:pwa-register` |
| Guard build-time de clave pública (F1-02a) conservado | ✓ `assertPublicClientKey` sigue en `vite.config.ts` |

Nota: `register.ts` usa `localStorage` solo para el flag de «offline ready ya visto»
(`hidria:pwa-offline-ready-ack`, sin token ni PII); el SW no lee `localStorage`. No es una
violación de la política de caché.

## 4. Manifest e instalabilidad estática

- `id: "/"`, `name`/`short_name`, `description`, `lang: es-MX`, `dir: ltr`.
- `start_url: "/?source=pwa"`, `scope: "/"`, `display: standalone`,
  `display_override: [window-controls-overlay, standalone]`, `orientation: any`.
- `theme_color: "#0d5c63"`, `background_color: "#f7fafb"`.
- Iconos: 192 any, 512 any, **512 maskable** (los tres con `type: image/png`).
- Shortcuts a `/kanban`, `/aula`, `/sincronizacion`.
- `index.html`: `link rel="manifest"`, `theme-color`, apple-touch-icon.

**P2-01 (no bloqueante):** `icon-512-maskable.png` es **byte-idéntico** a `icon-512.png`
(mismo SHA-256 `B67E4569…`); no se observa zona segura de padding maskable. El propósito
`maskable` está declarado y la instalabilidad no se exige en A/2 (F1-16/ADR-008), pero conviene
que diseño entregue un maskable con safe-zone antes de la auditoría de instalabilidad.

## 5. Accesibilidad básica del `offline.html`

`<main role="main">`, `<h1>Sin conexión</h1>`, lista de condiciones, botón «Reintentar» con
`min-height:44px`, `:focus-visible` con outline de 2 px, `color-scheme: light`, colores
institucionales de alto contraste (texto `#334155`/`#072f33` sobre blanco; botón blanco sobre
`#0a4a50`). No muestra datos ni promete captura offline (dice que llegará con M4/M6/M10). Sin
imágenes dependientes de red.

## 6. CI, regresión y alcance

| Comprobación | Resultado |
|---|---|
| CI en `4b41f7e` | **7/7 check runs success**: run `42513693754` (Guardas, Cliente, Deno, **pgTAP**) y run `42513668283` (Guardas, Cliente, Deno); incluye `pgTAP (Supabase local)` success |
| `docs/02` | Blob idéntico `a2394bce…` a la migración base |
| Alcance | 20 archivos: `app/**` + reportes F1-02/02b + `package-lock.json`; **sin** `supabase/**`, `.github/**`, `docs/**`, `tests/**` |
| Secretos | Secret scan del árbol sin coincidencias; `.env` ausente; `service_role` solo en guardas/comentarios/UI de F1-02a (no credencial) |
| Bundle | `workbox-window` 5.71 kB en cliente; sin `SUPABASE_SERVICE_ROLE_KEY`; el SW no incluye tokens |
| Lockfile | +~260 paquetes de toolchain dev (Workbox/vite-plugin-pwa); esperado por el PR |

## 7. Observaciones P2 (no bloquean el merge de A/2)

- **P2-01 — icono maskable idéntico al normal** (§4): falta safe-zone; revisar antes de la
  evidencia de instalabilidad F1-16/ADR-008.
- **P2-02 — `npm run pwa:audit` falla en este head:** `app/package.json` declara
  `"pwa:audit": "node scripts/pwa-audit.mjs"`, pero `app/scripts/pwa-audit.mjs` **no existe** en
  `4b41f7e` (`npm run pwa:audit` → exit 1). El reporte del autor dice que la auditoría CDP se
  entrega en B/2; por tanto, o se retira el script de A/2 o se incluye el archivo en B/2. No
  afecta build/CI/runtime de esta PR.

## 8. Diferidos explícitos (no exigidos en A/2)

- Instalabilidad real/Lighthouse y evidencia CDP → **F1-16/ADR-008** y PR **#22 (B/2)**.
- `Cache-Control: no-store/private` en Supabase/EF/R2 sensible → Dev EF/DevOps (el SW no
  controla cabeceras HTTP).
- Captura offline (`ops_queue`) → M4/M6/M10.

## Dictamen

**VERDE** para F1-02b **A/2** en `4b41f7e`: unidad de PWA instalable base verificada por build
reproducido, artefactos en `dist/`, política de caché y manifest correctos, offline accesible,
CI 7/7 (incl. pgTAP), sin cambios fuera de alcance ni secretos. **Merge permitido** con las dos
observaciones P2 (no bloqueantes) y con la evidencia de instalabilidad/Lighthouse diferida a
F1-16/ADR-008/B/2. QA no mergea; no se ejecutó git de escritura.

## Firma

QA `qa-tester`. Solo este reporte y `qa/trazabilidad.md`; sin modificar `app/**`,
`supabase/**`, `.github/**` ni `docs/**`. Sin secretos.

## Re-QA delta `4b41f7e..73df49b` — head final (task-62, reabierta)

**Head final:** `73df49b5a4362590497c64b59f4fa71a3f53e037` · **Base:** `main` `8e4e258`
(merge de main + lock regenerado; 3 commits). **Spec APROBADO** y **seguridad APROBADA sin
veto**. CI **10/10** (2 runs × 5 checks: Guardas, Cliente, Deno, pgTAP y E2E Playwright).

### Cambios del delta (solo lo que cambia en A/2)

| Corrección | Evidencia |
|---|---|
| **B1 same-origin exacto** | `sw.ts` usa `new URL(sourceUrl).origin` y compara `sourceOrigin !== self.location.origin`; `try/catch` para URL inválida; mensaje exacto `{type:'SKIP_WAITING'}` sin payload. `app/scripts/check-sw-origin.mjs` valida 6 vectores y corre en **build** (`[HIDRIA] Guarda SW mismo origen OK (6 vectores, sw.ts)`) |
| **M1 reporte** | `F1-02b_diseno_pwa.md` difiere las etiquetas M5/M7 a **B/2/#22** y declara que A/2 no cambia `registry.tsx`; el PR no toca `app/src/routes/registry.tsx` |
| **m1 `pwa:audit`** | Retirado de `app/package.json` en A/2 (script B/2); ya no hay comando roto |
| **m2 `offline.html`** | Reintentar es `<a class="accion" href="/">`; **sin `onclick` inline** |
| **`cacheName`/`APP_BUILD`** | No se usan en A/2; documentados como diferidos a B/2/F1-16 |
| **Build/typecheck** | `build` incluye `tsc` cliente + `tsc -p tsconfig.sw.json` + `check-sw-origin` + `vite build`; `typecheck` compila también el SW |

### Comandos reproducidos (sin `.env`)

```text
npm ci                    exit 0
npm run lint              exit 0
npm run typecheck         exit 0 (cliente + SW)
npm run build             exit 0
  [HIDRIA] Guarda SW mismo origen OK (6 vectores, sw.ts).
  PWA v2.0.0 · injectManifest · precache 11 entries (539.73 KiB) · dist/sw.js 18,392 B
  JS 477.19 kB / 138.37 kB gzip · CSS 17.63 kB / 4.15 kB gzip · offline.html 3,263 B
```

`dist/`: `sw.js`, `manifest.webmanifest`, `offline.html` e iconos 192/512/maskable/180
presentes; precache 11 entradas. Sin regresión frente a `4b41f7e`.

### CI y alcance

- **CI 10/10 success** en `73df49b`: runs `42515175830` (pull_request) y `42515171348`
  (push), ambos con Guardas/Cliente/Deno/**pgTAP**/**E2E Playwright** success (pgTAP sin
  cambios de BD en este PR; base 129/129).
- `docs/02` blob `a2394bce…` intacto; PR = 20 archivos (`app/**`, reportes F1-02/02b,
  `package-lock.json`), **sin** `supabase/**`, `.github/**`, `docs/**` ni `tests/**`;
  secret scan limpio; `.env` ausente.
- **P2-02 resuelto** (`pwa:audit` retirado). **P2-01** (icono maskable byte-idéntico) sigue
  como observación no bloqueante para B/2/F1-16.

### Dictamen final

**VERDE — merge permitido** para F1-02b **A/2** en `73df49b`: B1 same-origin exacto,
M1 solo reporte/diferido, menores resueltos, build/lint/typecheck reproducidos y CI 10/10.
Sin verdes funcionales de instalabilidad (Lighthouse/instalación real → F1-16/ADR-008 y
B/2/#22). QA no mergea; sin git de escritura.
