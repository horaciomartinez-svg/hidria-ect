# PR #12 — Revisión de Seguridad (F1-02a: shell PWA, sesión y guardas)

- **Agente:** `seguridad-privacidad` (08) — autoridad de **veto**
- **Fecha:** 2026-11-07 21:05 (America/Mexico_City)
- **PR:** [#12](https://github.com/horaciomartinez-svg/hidria-ect/pull/12) — `feature/F1-02-shell-pwa` → `main`
  («feat(f1-02): shell PWA — router M1–M13, sesión por claims y tema institucional»)
- **Head revisado:** `5cc56ed8e42f54763da0211076b9c0cf2571a367` (base `main@20b6c50`; CI **4/4
  `success`**; `mergeable_state: clean`; 25 archivos, +2143/−73 según MCP/three-dot). Autor:
  `dev-frontend-pwa`.
- **Re-revisión delta (§10):** código **`32a1da808659491c0be42ac3f100544300a974b6`** (12 archivos,
  +500/−249; CI **5/5**); **head final documental `61aaa21df0e3e08d60d824e76d84ae43119da72e`**
  (delta `32a1da8..61aaa21` = 1 archivo, +13/−7, solo reporte; CI 5/5; clean).
- **Alcance real:** `app/**` (22 archivos), `package.json`/`package-lock.json` (deps del workspace)
  y `reports/F1/F1-02_shell_pwa.md`. **Sin** `supabase/**`, `.github/**`, `docs/**` ni `.env`.
- **Método:** revisión estática de todo el código nuevo y configuración; `git grep` de sinks/sinks
  XSS/tokens/storage/SW; `git diff` secret scan; `npm audit --package-lock-only` (producción y
  completo); contraste con `docs/04`/ADR-005; CI 4/4. No ejecuté el build/E2E del PR (CI y smoke del
  autor); no hay cambios de BD ni llamadas a EF/PostgREST de escritura en esta entrega.

> Nota metodológica: el `git diff 20b6c50..head` directo muestra inversiones de reportes porque la
> rama nació de `424ca01` (merge-base); el diff real del PR es `git diff 20b6c50...5cc56ed`
> (three-dot) = 25 archivos y coincide con MCP `changed_files: 25`. No hay archivos fuera del alcance.

## Veredicto: **APROBADO CON OBSERVACIONES — SIN VETO**

No encontré **BLOQUEANTES**: no hay secretos ni `service_role` real en el diff/repo, no hay RLS ni
cambios de BD, no hay datos reales, no se altera texto legal, no hay sinks de XSS
(`dangerouslySetInnerHTML`/`innerHTML`/`eval`) y no se loguean tokens. Las guardas de ruta son
defensa en profundidad y el código declara correctamente que RLS/EF son la autoridad. Las
observaciones son de endurecimiento y de dependencias; dos deben cerrarse **antes de producción**
(SEC-PR12-01/02).

## 1. Credenciales y configuración

| Verificación | Resultado |
|---|---|
| Sólo claves públicas en cliente (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`) | ✅ `config.ts` sólo lee esas dos; `supabase.ts` crea cliente con anon |
| `service_role` en repo/bundle | **No como credencial**: sólo aparece como literal de la guarda y texto de UI (`config.ts`, `StatePages.tsx`); secret scan del diff **0**; `.env` no versionado (`.gitignore`), `.env.example` solo nombres/placeholders |
| Sin `.env` ni valores reales en el diff | ✅; `.env` existe en el workspace pero está ignorado; no lo abrí ni lo publiqué |
| Falta de env ⇒ falla cerrado | ✅ `isSupabaseConfigured=false` ⇒ `supabase=null` ⇒ `ConfigMissingPage`; el build de CI sin `.env` compila (no exige env) |
| `service_role` inyectado en `VITE_SUPABASE_ANON_KEY` | **Detectado en runtime** y `supabase=null`; **pero la clave ya fue inlineada en el bundle por Vite antes de ejecutar la guarda** → **SEC-PR12-01 (MAYOR)** |
| Claves nuevas de Supabase (`sb_secret_*`) | **No detectadas** por `isServiceRoleKey` (sólo JWT con `role:"service_role"`); si se usa una secret key nueva, `isSupabaseConfigured=true` y se crea el cliente → **SEC-PR12-01** |
| URL/anon con formato inesperado | Sólo se valida presencia (no esquema/allowlist); sin exposición actual; endurecer (SEC-PR12-01) |

**Hallazgo principal (SEC-PR12-01, MAYOR, condición):** la guarda de `config.ts` es **runtime**, no
build-time. Vite sustituye `import.meta.env.VITE_SUPABASE_ANON_KEY` por el valor literal al compilar;
si ese valor contiene una clave de servicio, ésta queda en `dist/assets/*.js` y la guarda sólo evita
`createClient` (y muestra el incidente), **no evita el empaquetado**. El comentario del código
(«en lugar de empaquetar una credencial», L35) es incorrecto. Además, `isServiceRoleKey` no reconoce
las nuevas secret keys (`sb_secret_…`) ni rechaza JWT con rol distinto de `anon`. **No hay secreto en
este PR** (el build actual usa anon), por lo que no es veto; sí es condición antes de producción:
- validar en `vite.config.ts`/script de CI con `loadEnv` antes del build: permitir sólo JWT
  `role:"anon"` o `sb_publishable_*`; fallar si `role:"service_role"`, `sb_secret_*`, o
  `SUPABASE_SERVICE_ROLE_KEY` con prefijo `VITE_`;
- escanear `dist/**` en CI (JWT largos/service_role/`sb_secret_`) y fallar el job;
- mantener el fallback de UI sin env (CI compila), pero validar cuando las variables existan.

## 2. Sesión, claims y logout

| Verificación | Resultado |
|---|---|
| Claims desde el **access token**, no de almacenamiento manipulable para autorización | ✅ `claims.ts` decodifica el JWT localmente (sin verificar firma) sólo para UI; `AuthProvider` usa el token de la sesión Supabase; el código declara que RLS/EF son la autoridad |
| `organization_id` con precedencia sobre `tenant_id` | ✅ `firstNonEmpty(organization_id, tenant_id)` |
| `global_role` contra catálogo de 6 | ✅ `GLOBAL_ROLES` (6) + `isGlobalRole`; sin rol ⇒ `null` y guardas deniegan |
| Sin logs de tokens/JWT | ✅ no hay `console.*` en `app/src`; no se imprime sesión/token |
| Logout | ✅ `signOut()` de Supabase + navegación a `/login`; **pero** si `signOut()` rechaza, `navigate` no se ejecuta (está dentro del `try`) → **SEC-PR12-05 (MENOR)** |
| Persistencia de sesión | `persistSession:true` (localStorage del SDK) + `autoRefreshToken` + PKCE; es el comportamiento estándar, **XSS lo puede leer**; sin CSP todavía → **SEC-PR12-04 (MENOR/condición de despliegue)** |
| Perfil/organización de UI | Consultas `profiles`/`organizations` por PostgREST con RLS; fallos degradan a `null`; sin escrituras |
| Guardas de ruta | `RequireAuth` (sesión) y `RequireGlobalRole` (claim); sólo UI, sin privilegios reales; comentarios correctos ✅ |

**SEC-PR12-04:** localStorage de tokens es el trade-off estándar de Supabase en SPA, pero el shell
no define CSP ni headers de seguridad (se difieren a Cloudflare/F1-16). No hay sink de XSS en este
PR, pero antes de producción hay que desplegar CSP (`script-src 'self'`, `connect-src` sólo al
proyecto Supabase), HSTS, `Referrer-Policy`, `X-Content-Type-Options` y `frame-ancestors`; valorar
almacenamiento no persistente para sesiones de alto riesgo. No es bloqueante del PR.

**SEC-PR12-05:** en `SessionMenu.handleSignOut`, mover `navigate('/login')` a `finally` (o capturar)
para que un fallo de red/servidor no deje la UI autenticada; verificar que el SDK elimina el token
local y que el futuro Dexie/ops_queue se purga al cerrar sesión.

## 3. Rutas y redirecciones

- `RequireAuth` conserva destino en `state.from` y `LoginPage.safeRedirect` exige que empiece por `/`
  y no por `//`; no hay `navigate` a URLs absolutas externas. **Bien.**
- **SEC-PR12-06 (MENOR, ligado a CVE de React Router):** `safeRedirect` no rechaza **backslash**;
  con `react-router-dom@6.30.6` existe el advisory de open redirect por backslash en `<Link>`/
  `useNavigate` (CWE-601, GHSA-wrjc-x8rr-h8h6). En este PR los `to`/`navigate` son estáticos o
  derivados de `location.state` (no de query directa), por lo que no hay exploit evidente; aun así,
  endurecer `safeRedirect` a rutas internas canónicas y rechazar `\`/`%5c` antes de actualizar el
  router (SEC-PR12-02).
- `/` está bajo `RequireAuth`; `/login` pública; `/privacidad` y `/acerca` bajo `RequireAuth`
  (ver §6). No hay endpoints inventados ni llamadas de escritura.

## 4. XSS y dependencias

- **Sin sinks de XSS:** `git grep` no encuentra `dangerouslySetInnerHTML`, `innerHTML`, `eval`,
  `document.write`, `postMessage`, iframes ni `window.open`; React escapa los valores dinámicos
  (email, nombre, organización, contratos de módulo son texto). ✅
- **`RouteErrorPage` muestra `error.message`** directamente (texto, no HTML): puede revelar
  mensajes internos en producción → **SEC-PR12-07 (MENOR)**: mensaje genérico en prod y detalle
  sólo en dev/log interno.
- **Dependencias nuevas:** `@supabase/supabase-js ^2.45` (lock 2.119.0) y
  `react-router-dom ^6.30.1` (lock 6.30.6); raíz añade `@types/node` dev. Todas resueltas desde
  `registry.npmjs.org` con integridad en lock. ✅
- **`npm audit --package-lock-only --omit=dev`:** **2 moderadas, 0 high/critical**;
  ambas por `react-router-dom@6.30.6` (arrastra `react-router`):
  - **GHSA-wrjc-x8rr-h8h6** — open redirect por backslash en `<Link>`/`useNavigate` (CWE-601),
    rango `>=6.0.0 <7.18.0`.
  - **GHSA-337j-9hxr-rhxg** — inyección arbitraria de constructor en `deserializeErrors()` de SSR
    (CWE-470, CVSS 6.1); **no aplica** aquí (cliente sin SSR/hydration).
  - Fix disponible: `react-router-dom@7.18.5` (major). → **SEC-PR12-02 (MAYOR, condición)**:
    actualizar a una versión parcheada (7.18.5 o la que publique el fix para 6.x) antes de
    producción; si el upgrade se difiere, endurecer `safeRedirect`/no usar backslash y documentar
    el riesgo aceptado. El advisory de SSR no aplica.
- **Auditoría completa** (`npm audit` sin `--omit=dev`): **11** (1 high, 10 moderate), todos en
  devDependencies/toolchain (**Vite 5.x, esbuild, minimatch, typescript-eslint**); **no se
  empaquetan en el cliente**, pero afectan al entorno de desarrollo/CI → **SEC-PR12-08
  (proceso, MENOR)**: añadir `npm audit --omit=dev` al CI y actualizar toolchain (Vite parcheado).
  No es un defecto introducido por este PR (vite ya estaba).

## 5. PWA / service worker (F1-02a)

- **No hay manifest, service worker, `vite-plugin-pwa`, `caches` ni precache en el PR** (verificado
  con `git grep`); el shell no cachea nada. Es correcto para F1-02a.
- **Sign-off del diseño F1-02b** (documento `F1-02b_diseno_pwa.md`, sin código aún):
  1. **Sí** a cachear sólo shell público + `NetworkOnly` Supabase/R2 + default passthrough, con
     condición: **la caché HTTP del navegador es independiente del SW**; exigir
     `Cache-Control: no-store/private` en Supabase/EF y en R2 sensible (o `fetch cache:'no-store'`
     en descargas) para que una URL prefirmada/documento `restringido_nda` no quede en la caché
     HTTP tras logout. Sin handler genérico; denylist de navegación para `sw.js`, `assets`,
     `manifest`, `icons`, `screenshots`, `offline.html`.
  2. **Sí** a SW sin `localStorage`/IndexedDB y sólo `SKIP_WAITING`, con condición de validar
     mismo origen/`event.source` y que no transporte tokens/payload.
  3. **Sí** a `GITHUB_SHA` en `/acerca` y nombre de caché (`hidria-shell-vX.Y.Z-<sha>`); no es
     sensible; no volcar otras env.
  4. **Sí, condicionado** a `screenshots` con datos ficticios: sin PII/razón social/nombres/emails/
     sesión/URLs con token; sin chrome con email; **strip EXIF**; si hay duda, omitirlas.
  5. **No exijo purga de CacheStorage** para assets públicos si la caché contiene sólo shell
     público idéntico para todos y logout limpia sesión + datos de usuario (futuro Dexie/ADR-012);
     documentar riesgo de dispositivo compartido. Si algo personalizado/personal entra en caché,
     purga obligatoria.
- **Lighthouse:** desde seguridad no hay objeción a sustituir «PWA ≥ 90» por evidencia CDP
  E1–E5 (instalabilidad/offline) y, si el Revisor quiere el literal, `lighthouse@11.7.1` pinneado
  en F1-16 con nota de obsolescencia. No es criterio de seguridad; PR #12 no se bloquea por eso.
- Condiciones adicionales para F1-02b: `registerType:'prompt'`, **sin** `skipWaiting` automático;
  `hasPendingWork()`; `sw.js` `Cache-Control: no-cache` + `Service-Worker-Allowed: /`; CSP
  `worker-src 'self'`/`manifest-src 'self'`; no `importScripts` remotos; `offline.html` sin
  prometer captura offline hasta que exista Dexie; `npm audit` de Workbox/vite-plugin-pwa.

## 6. Privacidad y datos

- **Sin datos reales**: los únicos datos del shell son claims del JWT y consultas RLS a
  `profiles`/`organizations`; el seed es sintético (`.invalid`, sin passwords) y no se añaden
  credenciales. ✅
- **Texto legal:** `PrivacyPage` **no redacta ni resume** el aviso; dice que se publicará íntegro
  desde `docs/06` Anexo A cuando lo apruebe el Comité. No se altera texto legal. ✅
- **SEC-PR12-03 (MENOR, privacidad/legal):** `/privacidad` está **bajo `RequireAuth`** y el enlace
  del login (`LoginPage` L145-150) apunta a esa ruta; un usuario no autenticado que pulsa «aviso de
  privacidad» es redirigido a `/login`, por lo que el aviso no es accesible antes de aceptar. Antes
  de producción hay que hacer `/privacidad` pública (o accesible desde login) y publicar el texto
  íntegro; el placeholder actual no es suficiente para el consentimiento. No es veto (F1-02a es
  shell; no hay usuarios reales), sí condición de F1-02b/F1-16.
- **PII en UI:** email/nombre/organización se muestran en el menú/panel; es funcional y no se
  loguean. Sin analytics/trackers/terceros; sin cookies propias. ✅
- **`RouteErrorPage`** puede mostrar mensajes internos (SEC-PR12-07) y **`/sincronizacion`** afirma
  que los cambios se conservan en el dispositivo cuando Dexie aún no existe (F1-02a): ajustar el
  texto o condicionarlo; no es seguridad.

## 7. Hallazgos

### BLOQUEANTES

**Ninguno.** No hay secreto ni `service_role` real, no hay cambios de RLS/BD, no hay datos reales,
no hay texto legal alterado, no hay sink XSS y no se loguean tokens.

### MAYORES — condiciones (no veto del PR)

| ID | Hallazgo | Acción |
|---|---|---|
| **SEC-PR12-01** | La guarda de `service_role` es **runtime**: un valor de servicio inyectado en `VITE_SUPABASE_ANON_KEY` **ya está en el bundle** antes de que la guarda lo detecte; además no cubre `sb_secret_*`/roles distintos de `anon`. | Validación **build-time** en `vite.config.ts`/CI (`loadEnv`), allowlist `anon`/`sb_publishable_`, rechazo `sb_secret_`/JWT `service_role`, y escaneo de `dist/**`; test con clave sintética. No hay secreto actual; condición antes de producción. |
| **SEC-PR12-02** | `react-router-dom@6.30.6` arrastra 2 moderadas: open redirect por backslash (CWE-601, **aplicable al cliente**) y SSR constructor injection (**no aplica**). `npm audit` prod: 2 moderadas, 0 high/critical. | Actualizar a `react-router-dom@7.18.5` (o parche 6.x) y verificar build/E2E; si se difiere, endurecer `safeRedirect` (rechazar `\`/`%5c`, destinos canónicos internos) y documentar el riesgo. Añadir `npm audit --omit=dev` al CI. |

### MENORES / observaciones

| ID | Hallazgo | Acción |
|---|---|---|
| **SEC-PR12-03** | `/privacidad` bajo `RequireAuth`; enlace desde login no accesible antes de autenticarse. | Hacer `/privacidad` pública/accesible y publicar el texto íntegro de `docs/06` antes de producción. |
| **SEC-PR12-04** | Tokens en localStorage (SDK) sin CSP/headers definidos aún; riesgo XSS. No hay sinks en este PR. | CSP/HSTS/headers en Cloudflare (F1-16); valorar almacenamiento de sesión; no bloquear el shell. |
| **SEC-PR12-05** | Si `signOut()` rechaza, `navigate('/login')` no se ejecuta. | Mover navegación a `finally`; verificar limpieza local y futura Dexie. |
| **SEC-PR12-06** | `safeRedirect` no rechaza backslash (relevante por CVE de React Router). | Validación estricta de destino interno; test. |
| **SEC-PR12-07** | `RouteErrorPage` muestra `error.message` en producción. | Mensaje genérico; detalle sólo en dev/log interno. |
| **SEC-PR12-08** | Sin `npm audit` en CI; toolchain dev con 1 high (Vite) y 10 moderadas (no empaquetadas). | Añadir audit prod al CI; actualizar Vite/toolchain; Dependabot. |
| **SEC-PR12-09** | Banner/`/sincronizacion` prometen persistencia offline antes de Dexie. | Ajustar texto hasta M4/M6/M10; QA/UX. |
| **SEC-PR12-10** | `invitado` aparece en `TODOS` para M2/M3/M4/M9/M10/M12 (sólo visibilidad de UI). | Confirmar matriz de roles con spec; RLS/EF son la autoridad; sin privilegio real. |

## 8. Conclusión y condiciones

- **El shell no introduce autorización real ni datos**: no hay `service_role`/secreto en el diff, no
  hay RLS/BD, no hay endpoints inventados, no hay XSS sink ni logs de tokens; las guardas de ruta
  son UI y el código lo declara. CI 4/4 y alcance correcto.
- **APROBADO CON OBSERVACIONES, SIN VETO**. El merge puede proceder con las condiciones
  rastreadas; **antes de producción** deben cerrarse SEC-PR12-01 (guard build-time) y SEC-PR12-02
  (react-router parcheado / mitigación documentada); SEC-PR12-03/04/05/06/07/08 son seguimiento
  obligatorio de F1-02b/F1-16.
- **Sign-off F1-02b:** aprobado con las condiciones de §5 (shell público, `NetworkOnly`, no
  localStorage/IDB en SW, `SKIP_WAITING` same-origin, build id público, screenshots ficticios sin
  PII, sin purga de assets públicos pero sí limpieza de sesión/datos de usuario, `Cache-Control:
  no-store` para Supabase/R2). El SW real se revisará con E7/E8 antes de su PR.

## 10. Re-revisión delta `5cc56ed..32a1da8` y head final `61aaa21` — **APROBADO CON OBSERVACIONES se mantiene**

- **Código revisado:** `32a1da808659491c0be42ac3f100544300a974b6` (delta de 12 archivos,
  +500/−249; CI **5/5 `success`**: Cliente, Guardas, Edge Functions Deno; clean). **Head final:**
  `61aaa21df0e3e08d60d824e76d84ae43119da72e` (hijo directo; delta `32a1da8..61aaa21` = **1 archivo,
  +13/−7**, solo `reports/F1/F1-02_shell_pwa.md`; sin cambios de código; CI 5/5; clean). El delta
  no toca `package.json`, migraciones, `supabase/**` ni `.github/**`.
- **Método:** revisión estática del delta completo (auth, rutas, `vite.config`), `git grep` de
  sinks/tokens, secret scan y contraste con `5cc56ed`/CI. No hay tests unitarios/E2E versionados en
  el delta (ver SEC-PR12-12); el smoke 24/24 del reporte es local y no versionado.

### 10.1 B1 (fail-closed de claims) — **CORREGIDO** ✅

- `claims.ts`: `readClaims` exige `sub` **UUID**, al menos un tenant **UUID** (`organization_id`
  canónico con fallback a `tenant_id`) y `global_role` **del enum de 6**; si falta/cualquiera es
  inválido devuelve `null`. `email` queda como presentación.
- `AuthProvider`: nuevo estado **`invalid_claims`**; una sesión con claims inválidos **no pasa a
  `authenticated`**, no monta shell y no dispara las consultas de perfil/organización. `claims` se
  calcula en `applySession` (incluye refresh), no desde el render.
- `guards.tsx`: `RequireAuth` redirige `anonymous`/`invalid_claims` a `/login` con
  `state.error='invalid_claims'`; `LoginPage` **no redirige** con claims inválidos y muestra aviso
  + botón de cerrar sesión. No se muestran valores de claims ni tokens en el aviso.
- **Verificación de no regresión:** el flujo `authenticated` sólo se alcanza con los tres claims
  válidos; el perfil dejó de aportar `global_role` (se eliminó del `SessionProfile`), de modo que la
  UI no usa `profiles.global_role` para navegación. No hay `console.*` en auth ni fuga de token en
  la UI. **Sin tests automatizados** (SEC-PR12-12).

> **Observación de modelo de confianza (no es regresión):** la validación B1 es sintáctica sobre el
> JWT **no verificado en cliente** (como antes). Un usuario puede editar localStorage para mostrar
> un shell con claims verosímiles; el servidor (RLS/EF) rechaza el token y no hay escrituras desde
> el shell. La autorización real sigue siendo RLS/EF; B1 sólo evita montar el shell con claims
> ausentes/inválidos, no sustituye la verificación server-side.

### 10.2 SEC-PR12-05 (`signOut`) — **CORREGIDO en navegación; residual de limpieza local**

- `AppShell`: `navigate('/login', {replace:true})` se movió a `finally`; la sesión no se queda en el
  shell aunque `signOut()` rechace. ✅
- **Residual:** no se comprueba explícitamente que el SDK haya eliminado el token local si
  `signOut()` falla; si el SDK conserva la sesión, `LoginPage` (status `authenticated`) podría
  rebotar al shell. Condición: verificar `getSession()` nulo tras el logout o forzar
  `signOut({scope:'local'})`/limpieza equivalente y añadir E2E de logout con red caída. **MENOR.**

### 10.3 SEC-PR12-06 (`safeRedirect`) — **CORREGIDO** ✅ (con tests pendientes)

- `safeRedirect` valida **raw y decodificado**: exige inicio `/`, rechaza `//`, `\`, `:`, controles
  (incluye `%5c`, `%2f%2f`, `javascript:`, URLs absolutas) y devuelve `/` si no es ruta interna.
  Cubre el vector de open redirect por backslash de GHSA-wrjc-x8rr-h8h6 a nivel de aplicación. ✅
- **Sin tests versionados**: el reporte del autor dice 6 variantes + control positivo (smoke local);
  añadir unit tests de `isSafeInternalPath`/`safeRedirect` (SEC-PR12-12).

### 10.4 SEC-PR12-07 (error page) — **CORREGIDO en UI; residual de consola**

- En producción la UI muestra un mensaje genérico; el detalle sólo se renderiza si
  `import.meta.env.DEV`. ✅
- **Residual:** `RouteErrorPage` ejecuta `console.error('[HIDRIA] Error de ruta:', error)` **también
  en producción**. La UI no filtra el mensaje, pero la consola del navegador conserva el objeto de
  error completo (posible detalle interno; no observé tokens). Condición: limitar el log a `DEV` o
  registrar sólo un mensaje seguro/ruta. **MENOR.**

### 10.5 SEC-PR12-01 (parte app: guard build-time) — **CORREGIDO parcialmente** ✅

- `vite.config.ts` usa `loadEnv(mode, envDir, 'VITE_')` y valida **antes de compilar**
  `VITE_SUPABASE_ANON_KEY`: rechaza `sb_secret_*`, JWT con `role !== 'anon'` (incluye
  `service_role`) y JWT ilegible; acepta `sb_publishable_*` y JWT `anon`. Si no hay variable,
  permite el build (CI sin `.env`) y el runtime queda en `ConfigMissingPage`. **No imprime ni
  registra el valor de la clave**; el mensaje sólo indica la comprobación/rol. ✅
- **Queda para task-50:** escaneo de `dist/**` (no basta validar la variable de anon; otras
  `VITE_*`/chunks) y test automatizado del guard con claves sintéticas; el guard app no sustituye
  la comprobación de CI.
- **Ejemplo sintético en el reporte del autor:** una cadena `sb_secret_…` (texto de prueba, no
  credencial) aparece en `F1-02_shell_pwa.md`; no es un secreto real, pero dispara scanners.
  Recomendación: usar `sb_secret_<redactada>`/placeholder en documentación pública (SEC-PR12-13).

### 10.6 Regresión y alcance

| Verificación | Resultado |
|---|---|
| Sin secretos reales en el delta | ✅ secret scan 0 salvo el ejemplo sintético del reporte; sin `.env` |
| Sin sinks XSS nuevos | ✅ sin `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`postMessage`; detalle de error sólo DEV en UI |
| Sin logs de tokens/JWT | ✅ no hay logs en auth; sólo `console.error` de error de ruta (ver §10.4) |
| Claims/RLS como autoridad | ✅ B1 no introduce autorización cliente; el shell no escribe datos |
| Sin regresión de rutas/contratos | ✅ fases M5=F1/M7=F1 (nota F2) y placeholders corregidos; sin endpoints nuevos |
| Scope/CI | ✅ 12 archivos `app/**` + reporte; CI 5/5; sin `supabase/**`/`.github/**`/deps |

### 10.7 Nuevas condiciones y veredicto

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| **SEC-PR12-12** | MENOR (proceso) | No hay tests unitarios/E2E versionados para B1, `safeRedirect`, logout offline ni guard build-time; el smoke 24/24 es local. | Añadir tests (task-49/task-50) antes de confiar en la regresión de estas condiciones; no es un defecto funcional del delta. |
| **SEC-PR12-13** | OBS | Ejemplo sintético `sb_secret_…` en el reporte público (no credencial) dispara secret scanners. | Sustituir por placeholder `<redactada>` en docs; mantener sintéticos solo en tests. |
| **SEC-PR12-05/07 residual** | MENOR | Limpieza local no verificada si falla `signOut`; `console.error` con error completo en prod. | E2E offline + gatear log a DEV/sanitizar. |

**Veredicto del delta: APROBADO CON OBSERVACIONES, SIN VETO se mantiene** para `32a1da8` y para el
head final documental `61aaa21`. B1 no introduce regresiones de seguridad (no shell con claims
inválidos, sin fugas nuevas), los fixes 05/06/07 están implementados y el guard build-time no
debilita el build ni loguea la clave; faltan tests automatizados y persisten los residuales
SEC-PR12-05/07 y la parte CI de SEC-PR12-01. Condiciones de producción restantes: **SEC-PR12-02**
(react-router 7.18.5/6.x endurecido), **SEC-PR12-03/04/10** (task-51), **SEC-PR12-01/08** (task-50).

## 11. Visto bueno de seguridad — ADR-008 (criterio PWA por CDP)

Revisado `hidria_coding_team/decisions/ADR-008-criterio-pwa-cdp.md` (estado **aceptada con
condiciones**; supervisor, revisor y seguridad). Sustituye «Lighthouse PWA ≥ 90» (categoría eliminada en Lighthouse
v12) por evidencia **CDP** reproducible (manifest, installability, SW controlando, offline),
mantiene `lighthouse@11.7.1` sólo como medición histórica opcional y usa Lighthouse 13.x para
performance/a11y/SEO. **No hay objeción de seguridad**: no cambia producto, datos, RLS, EF ni
texto legal; sólo el criterio de medición.

**Visto bueno condicionado** a que la evidencia CDP:
1. esté **versionada y sea reproducible**, con versión de Chrome/CDP y `__APP_BUILD__` registrados;
2. incluya la verificación de **seguridad de caché/offline** (E4/E5/E7 del diseño F1-02b): sin
   respuestas de Supabase/R2, sin tokens ni URLs de sesión en `CacheStorage`/artefactos;
3. no incluya tokens/PII en scripts, trazas o screenshots (sesiones sintéticas; screenshots
   ficticios sin EXIF);
4. mantenga `lighthouse@11.7.1` como **histórico no-gate** y Lighthouse 13.x como complementario;
5. se refleje en `docs/05` en F1-18 y en F1-16, sin reinterpretar el criterio en silencio.

La aprobación de ADR-008 no sustituye las condiciones de seguridad de F1-02b (§5) ni el futuro
sign-off del service worker con E7/E8.

## Firma

`seguridad-privacidad` (08) — **APROBADO CON OBSERVACIONES** (sin veto) para el PR #12 en el head
final `61aaa21df0e3e08d60d824e76d84ae43119da72e`: código evaluado `32a1da8` (B1 fail-closed,
SEC-PR12-05/06/07 y guard build-time; sin regresiones de seguridad) y delta
`32a1da8..61aaa21` **solo documental**. Condiciones restantes: SEC-PR12-02 (task-51), SEC-PR12-03/04/10
(task-51), SEC-PR12-01/08 parte CI (task-50), SEC-PR12-12 tests y residuales SEC-PR12-05/07; ADR-008
con visto bueno condicionado (§11). Sin fuga de secretos ni datos reales, sin cambios de BD/RLS y
sin texto legal alterado. Sin `git` de escritura, sin merge y sin publicar tokens/secretos.
